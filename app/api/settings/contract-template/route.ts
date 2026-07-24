import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSameOriginRequest, noStoreJson } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "contract-templates";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type TemplateKind = { extension: "pdf" | "docx"; mime: typeof PDF_MIME | typeof DOCX_MIME };

function templateKind(file: File): TemplateKind | null {
  const lowerName = file.name.toLowerCase();
  if (file.type === PDF_MIME || lowerName.endsWith(".pdf")) {
    return { extension: "pdf", mime: PDF_MIME };
  }
  if (file.type === DOCX_MIME || lowerName.endsWith(".docx")) {
    return { extension: "docx", mime: DOCX_MIME };
  }
  return null;
}

function safeOriginalName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
}

async function authorizedClients() {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) {
    return { response: noStoreJson({ error: "Serviço temporariamente indisponível." }, { status: 503 }) };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user || user.is_anonymous) {
    return { response: noStoreJson({ error: "Sessão inválida." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("active, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.active || profile.role !== "ADMIN") {
    return { response: noStoreJson({ error: "Somente administradores podem gerenciar o contrato base." }, { status: 403 }) };
  }

  return { supabase, admin, user };
}

export async function GET() {
  const access = await authorizedClients();
  if ("response" in access) return access.response;

  const { data: settings, error: settingsError } = await access.admin
    .from("app_settings")
    .select("contract_template_path, contract_template_name")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (settingsError) {
    return noStoreJson({ error: "Não foi possível consultar o contrato base." }, { status: 500 });
  }
  if (!settings?.contract_template_path) {
    return noStoreJson({ error: "Nenhum contrato base foi anexado." }, { status: 404 });
  }

  const { data, error } = await access.admin.storage
    .from(BUCKET)
    .createSignedUrl(settings.contract_template_path, 120, {
      download: settings.contract_template_name || "contrato-base",
    });

  if (error || !data?.signedUrl) {
    return noStoreJson({ error: "Não foi possível abrir o contrato base." }, { status: 500 });
  }

  return noStoreJson({ url: data.signedUrl });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return noStoreJson({ error: "Requisição não autorizada." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE + 512 * 1024) {
    return noStoreJson({ error: "O contrato base deve ter no máximo 4 MB." }, { status: 413 });
  }

  const access = await authorizedClients();
  if ("response" in access) return access.response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return noStoreJson({ error: "Selecione um arquivo PDF ou DOCX." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return noStoreJson({ error: "O contrato base deve ter entre 1 byte e 4 MB." }, { status: 400 });
  }

  const kind = templateKind(file);
  if (!kind) {
    return noStoreJson({ error: "Formato não permitido. Envie um arquivo PDF ou DOCX." }, { status: 415 });
  }

  const originalName = safeOriginalName(file.name) || `contrato-base.${kind.extension}`;
  const newPath = `base/${crypto.randomUUID()}.${kind.extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { data: previous } = await access.admin
    .from("app_settings")
    .select("contract_template_path")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const { error: uploadError } = await access.admin.storage.from(BUCKET).upload(newPath, bytes, {
    cacheControl: "3600",
    contentType: kind.mime,
    upsert: false,
  });

  if (uploadError) {
    console.error("contract template upload failed", { message: uploadError.message });
    return noStoreJson({ error: "Não foi possível armazenar o contrato base." }, { status: 500 });
  }

  const { error: metadataError } = await access.supabase.rpc("set_contract_template_metadata_secure", {
    p_request_id: crypto.randomUUID(),
    p_path: newPath,
    p_name: originalName,
    p_mime: kind.mime,
    p_size: file.size,
  });

  if (metadataError) {
    await access.admin.storage.from(BUCKET).remove([newPath]);
    console.error("contract template metadata failed", { code: metadataError.code });
    return noStoreJson({ error: "O arquivo foi recusado ao registrar a parametrização." }, { status: 500 });
  }

  if (previous?.contract_template_path && previous.contract_template_path !== newPath) {
    const { error: cleanupError } = await access.admin.storage
      .from(BUCKET)
      .remove([previous.contract_template_path]);
    if (cleanupError) {
      console.warn("old contract template cleanup failed", { message: cleanupError.message });
    }
  }

  return noStoreJson(
    {
      ok: true,
      template: {
        name: originalName,
        mime: kind.mime,
        size: file.size,
      },
    },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return noStoreJson({ error: "Requisição não autorizada." }, { status: 403 });
  }

  const access = await authorizedClients();
  if ("response" in access) return access.response;

  const { data: settings, error: settingsError } = await access.admin
    .from("app_settings")
    .select("contract_template_path")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (settingsError) {
    return noStoreJson({ error: "Não foi possível consultar o contrato base." }, { status: 500 });
  }
  if (!settings?.contract_template_path) {
    return noStoreJson({ ok: true });
  }

  const { error: metadataError } = await access.supabase.rpc("clear_contract_template_metadata_secure", {
    p_request_id: crypto.randomUUID(),
  });
  if (metadataError) {
    return noStoreJson({ error: "Não foi possível remover a parametrização do contrato." }, { status: 500 });
  }

  const { error: storageError } = await access.admin.storage
    .from(BUCKET)
    .remove([settings.contract_template_path]);
  if (storageError) {
    console.warn("contract template storage cleanup failed", { message: storageError.message });
  }

  return noStoreJson({ ok: true });
}

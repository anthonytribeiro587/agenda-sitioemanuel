import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  allowedBootstrapEmails,
  isSameOriginRequest,
  normalizeEmail,
  noStoreJson,
} from "@/lib/security/http";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return noStoreJson({ error: "Requisição não autorizada." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  if (!supabase || !admin) {
    return noStoreJson({ error: "Serviço temporariamente indisponível." }, { status: 503 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  const email = normalizeEmail(user?.email);

  if (
    authError ||
    !user ||
    !email ||
    !user.email_confirmed_at ||
    user.is_anonymous
  ) {
    return noStoreJson({ error: "Sessão inválida." }, { status: 401 });
  }

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id, active, role")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("profile bootstrap lookup failed", {
      code: existingError.code,
      userId: user.id,
    });
    return noStoreJson({ error: "Não foi possível validar o acesso." }, { status: 500 });
  }

  if (existing) {
    if (!existing.active) {
      return noStoreJson({ error: "Usuário administrativo desativado." }, { status: 403 });
    }
    return noStoreJson({ ok: true, role: existing.role });
  }

  // Fail closed: new authenticated users never become staff automatically.
  // Only a pre-authorized email may create the very first ADMIN profile.
  const bootstrapEmails = allowedBootstrapEmails();
  if (!bootstrapEmails.has(email)) {
    console.warn("unauthorized profile bootstrap attempt", {
      userId: user.id,
    });
    return noStoreJson(
      { error: "Seu usuário ainda não foi autorizado pelo administrador." },
      { status: 403 }
    );
  }

  const metadataName =
    typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  const fallbackName = email.split("@")[0] || "Administrador";

  const { data: bootstrapped, error: bootstrapError } = await admin.rpc(
    "bootstrap_first_admin",
    {
      p_user_id: user.id,
      p_email: email,
      p_name: (metadataName || fallbackName).slice(0, 120),
    }
  );

  if (bootstrapError) {
    const alreadyCompleted = bootstrapError.message.includes("BOOTSTRAP_ALREADY_COMPLETED");
    console.warn("profile bootstrap refused", {
      code: bootstrapError.code,
      userId: user.id,
      alreadyCompleted,
    });
    return noStoreJson(
      {
        error: alreadyCompleted
          ? "O primeiro administrador já foi definido. Solicite acesso a ele."
          : "Não foi possível concluir a autorização.",
      },
      { status: alreadyCompleted ? 403 : 500 }
    );
  }

  const profile = Array.isArray(bootstrapped) ? bootstrapped[0] : bootstrapped;
  if (!profile || profile.role !== "ADMIN") {
    return noStoreJson({ error: "Não foi possível concluir a autorização." }, { status: 500 });
  }

  return noStoreJson({ ok: true, role: "ADMIN" }, { status: 201 });
}

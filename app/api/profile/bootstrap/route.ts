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

  // Fail closed: authenticated users never receive access unless their e-mail
  // is explicitly present in the server-only ADMIN_BOOTSTRAP_EMAILS allowlist.
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
  const profileName = (metadataName || fallbackName).slice(0, 120);

  // Preserve the atomic database bootstrap for the first administrator.
  const { data: bootstrapped, error: bootstrapError } = await admin.rpc(
    "bootstrap_first_admin",
    {
      p_user_id: user.id,
      p_email: email,
      p_name: profileName,
    }
  );

  if (!bootstrapError) {
    const profile = Array.isArray(bootstrapped) ? bootstrapped[0] : bootstrapped;
    if (!profile || profile.role !== "ADMIN" || !profile.active) {
      return noStoreJson({ error: "Não foi possível concluir a autorização." }, { status: 500 });
    }
    return noStoreJson({ ok: true, role: "ADMIN" }, { status: 201 });
  }

  const alreadyCompleted = bootstrapError.message.includes("BOOTSTRAP_ALREADY_COMPLETED");
  if (!alreadyCompleted) {
    console.warn("profile bootstrap refused", {
      code: bootstrapError.code,
      userId: user.id,
      alreadyCompleted: false,
    });
    return noStoreJson({ error: "Não foi possível concluir a autorização." }, { status: 500 });
  }

  // The first administrator already exists. An e-mail explicitly kept in the
  // allowlist may still provision its own ADMIN profile on its first login.
  // The service role is used only on this protected, same-origin server route.
  const { data: created, error: createError } = await admin
    .from("profiles")
    .insert({
      id: user.id,
      name: profileName,
      email,
      role: "ADMIN",
      active: true,
    })
    .select("id, active, role")
    .single();

  if (createError) {
    // A repeated or simultaneous request may have created the profile first.
    if (createError.code === "23505") {
      const { data: concurrentProfile, error: concurrentError } = await admin
        .from("profiles")
        .select("id, active, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!concurrentError && concurrentProfile?.active && concurrentProfile.role === "ADMIN") {
        return noStoreJson({ ok: true, role: "ADMIN" });
      }
    }

    console.error("allowlisted admin profile creation failed", {
      code: createError.code,
      userId: user.id,
    });
    return noStoreJson({ error: "Não foi possível concluir a autorização." }, { status: 500 });
  }

  if (!created?.active || created.role !== "ADMIN") {
    return noStoreJson({ error: "Não foi possível concluir a autorização." }, { status: 500 });
  }

  return noStoreJson({ ok: true, role: "ADMIN" }, { status: 201 });
}

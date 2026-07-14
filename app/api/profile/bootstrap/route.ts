import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id, active, role")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    if (!existing.active) {
      return NextResponse.json({ error: "Usuário administrativo desativado." }, { status: 403 });
    }
    return NextResponse.json({ ok: true, role: existing.role });
  }

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const email = user.email ?? "";
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
  const fallbackName = email.split("@")[0] || "Responsável";

  const { error: insertError } = await admin.from("profiles").insert({
    id: user.id,
    name: metadataName.trim() || fallbackName,
    email,
    role: (count ?? 0) === 0 ? "ADMIN" : "GESTOR",
    active: true,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

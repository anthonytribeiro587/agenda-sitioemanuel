import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

function validBearer(value: string | null, expected: string) {
  if (!value?.startsWith("Bearer ")) return false;
  const received = Buffer.from(value.slice(7));
  const secret = Buffer.from(expected);
  return received.length === secret.length && timingSafeEqual(received, secret);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || secret.length < 32 || !validBearer(authorization, secret)) {
    return noStoreJson({ ok: false }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return noStoreJson({ ok: false }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("agenda_healthcheck");

  if (error || data !== true) {
    console.error("Supabase keepalive failed", { code: error?.code ?? "INVALID_RESPONSE" });
    return noStoreJson({ ok: false }, { status: 500 });
  }

  return noStoreJson({ ok: true });
}

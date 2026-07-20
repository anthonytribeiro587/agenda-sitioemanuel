import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("parametrizações usam tabela singleton e RPC administrativa", () => {
  const migration = read("supabase/migrations/202607200004_app_settings.sql");
  assert.match(migration, /create table if not exists public\.app_settings/i);
  assert.match(migration, /constraint app_settings_singleton/i);
  assert.match(migration, /revoke all on table public\.app_settings from public, anon, authenticated/i);
  assert.match(migration, /create or replace function public\.get_app_settings_secure/i);
  assert.match(migration, /create or replace function public\.update_app_settings_secure/i);
  assert.match(migration, /public\.current_app_role\(\) <> 'ADMIN'/i);
  assert.match(migration, /insert into public\.audit_log/i);
});

test("tela de parametrizações permanece restrita ao administrador", () => {
  const page = read("app/(protected)/configuracoes/page.tsx");
  const shell = read("components/AppShell.tsx");
  assert.match(page, /role !== "ADMIN"/);
  assert.match(page, /updateSettings\(form\)/);
  assert.match(shell, /label: "Parametrizações"/);
  assert.match(shell, /adminOnly: true/);
});

test("novas reservas recebem os padrões parametrizados", () => {
  const workspace = read("components/CalendarWorkspace.tsx");
  assert.match(workspace, /useSettings\(\)/);
  assert.match(workspace, /settings\.default_guests_estimated/);
  assert.match(workspace, /settings\.default_package_name/);
  assert.match(workspace, /settings\.default_payment_method/);
  assert.match(workspace, /settings\.default_deposit_note/);
  assert.match(workspace, /settings\.whatsapp_template/);
});

test("mensagem de WhatsApp substitui somente campos autorizados", () => {
  const format = read("lib/format.ts");
  assert.match(format, /renderWhatsappTemplate/);
  assert.match(format, /responsavel\|igreja\|periodo\|pessoas\|pacote\|valor\|saldo/);
  assert.match(format, /encodeURIComponent\(message\)/);
});

test("keepalive não consulta tabelas administrativas", () => {
  const route = read("app/api/cron/supabase-keepalive/route.ts");
  assert.match(route, /rpc\("agenda_healthcheck"\)/);
  assert.doesNotMatch(route, /from\("profiles"\)/);
  assert.match(route, /timingSafeEqual/);
});

test("cabeçalhos essenciais de segurança estão ativos", () => {
  const config = read("next.config.ts");
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /Strict-Transport-Security/);
});

test("totais financeiros ignoram pagamentos anulados", () => {
  const format = read("lib/format.ts");
  assert.match(format, /filter\(\(payment\) => !payment\.voided_at\)/);
});

test("datas inválidas e períodos invertidos continuam bloqueados", () => {
  const validation = read("lib/validation.ts");
  assert.match(validation, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.match(validation, /value\.end_date < value\.start_date/);
  const migration = read("supabase/migrations/202607140001_initial_schema.sql");
  assert.match(migration, /reservations_no_active_overlap/i);
  assert.match(migration, /prevent_reservation_block_conflict/i);
});

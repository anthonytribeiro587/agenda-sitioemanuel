import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("parametrizações possuem navegação interna clara", () => {
  const page = read("app/(protected)/configuracoes/page.tsx");
  assert.match(page, /Padrões da reserva/);
  assert.match(page, /Financeiro/);
  assert.match(page, /WhatsApp/);
  assert.match(page, /Contrato base/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-selected/);
});

test("contrato base passa por rota server-side protegida", () => {
  const route = read("app/api/settings/contract-template/route.ts");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /profile\.role !== "ADMIN"/);
  assert.match(route, /MAX_FILE_SIZE = 4 \* 1024 \* 1024/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /openxmlformats-officedocument/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /set_contract_template_metadata_secure/);
});

test("bucket do contrato é privado e metadados são auditados", () => {
  const migration = read("supabase/migrations/202607240006_contract_template_storage.sql");
  assert.match(migration, /'contract-templates'/);
  assert.match(migration, /false,/);
  assert.match(migration, /current_app_role\(\) <> 'ADMIN'/);
  assert.match(migration, /CONTRACT_TEMPLATE_ATTACHED/);
  assert.match(migration, /CONTRACT_TEMPLATE_REMOVED/);
  assert.match(migration, /'UPDATE'/);
  assert.doesNotMatch(migration, /create policy/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("login reutiliza a mesma marca visual do painel", () => {
  const loginPage = read("app/login/page.tsx");

  assert.match(loginPage, /sitio-brand-logo login-sitio-brand-logo/);
  assert.match(loginPage, /aria-label="Sítio Emanuel"/);
  assert.doesNotMatch(loginPage, /className="brand-mark">SE</);
});

test("login impede autenticações concorrentes e limpa senha após falhas", () => {
  const loginPage = read("app/login/page.tsx");

  assert.match(loginPage, /if \(loading\) return;/);
  assert.match(loginPage, /disabled=\{loading\}/);
  assert.match(loginPage, /aria-busy=\{loading\}/);
  assert.match(loginPage, /setPassword\(""\)/);
  assert.match(loginPage, /credentials: "same-origin"/);
  assert.match(loginPage, /await supabase\.auth\.signOut\(\)\.catch/);
});

test("estilos do login preservam a marca compartilhada e estados bloqueados", () => {
  const securityCss = read("app/security.css");

  assert.match(securityCss, /\.login-sitio-brand-logo/);
  assert.match(securityCss, /\.login-single-column-form\[aria-busy="true"\]/);
  assert.match(securityCss, /input:disabled/);
});

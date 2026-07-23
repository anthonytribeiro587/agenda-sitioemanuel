import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("cadastro do cliente e reserva guardam localização do grupo", () => {
  const types = read("lib/types.ts");
  const validation = read("lib/validation.ts");
  assert.match(types, /address: string/);
  assert.match(types, /group_address: string/);
  assert.match(validation, /address: safeText\(5, 240\)/);
  assert.match(validation, /group_city: safeText\(2, 120\)/);
  assert.match(validation, /group_state: z\.string\(\).*\^\[A-Z\]\{2\}\$/s);
});

test("migration cria localização, RPCs seguras e edição de bloqueios", () => {
  const migration = read("supabase/migrations/202607230005_group_location_crud.sql");
  assert.match(migration, /alter table public\.customers[\s\S]*add column if not exists address text/i);
  assert.match(migration, /alter table public\.reservations[\s\S]*add column if not exists group_address text/i);
  assert.match(migration, /security definer[\s\S]*create function public\.update_reservation_details_secure|create function public\.update_reservation_details_secure[\s\S]*security definer/i);
  assert.match(migration, /create or replace function public\.update_blocked_period_secure/i);
  assert.match(migration, /revoke execute on function public\.update_blocked_period_secure[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.update_blocked_period_secure[\s\S]*to authenticated/i);
});

test("calendário mobile prioriza o fim de semana e exibe dados operacionais", () => {
  const calendar = read("components/MonthCalendar.tsx");
  const css = read("app/agenda-crud-v5.css");
  assert.match(calendar, /calendar\.scrollLeft = maxScroll/);
  assert.match(calendar, /Resp\.: \{reservation\.contact_name\}/);
  assert.match(calendar, /reservation\.group_city/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prototype-booking-bar[\s\S]*height: 70px/);
});

test("CRUD operacional está disponível pelo app com auditoria", () => {
  const workspace = read("components/CalendarWorkspace.tsx");
  const provider = read("components/AgendaProvider.tsx");
  const customerPage = read("app/(protected)/clientes/page.tsx");
  const reservationPage = read("app/(protected)/reservas/[id]/page.tsx");

  assert.match(workspace, /saveStatus/);
  assert.match(workspace, /updateBlockedPeriod/);
  assert.match(workspace, /deleteReservation/);
  assert.match(provider, /update_blocked_period_secure/);
  assert.match(customerPage, /createCustomer/);
  assert.match(customerPage, /updateCustomer/);
  assert.match(customerPage, /deleteCustomer/);
  assert.match(reservationPage, /updateReservation/);
  assert.match(reservationPage, /deleteReservation/);
});

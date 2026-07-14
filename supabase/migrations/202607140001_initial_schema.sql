begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'ADMIN' check (role in ('ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_unique on public.profiles (lower(email));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  organization text not null check (char_length(trim(organization)) between 2 and 160),
  phone text not null check (char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 10 and 20),
  email text not null default '',
  notes text not null default '' check (char_length(notes) <= 1500),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  church_name text not null check (char_length(trim(church_name)) between 2 and 160),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 10 and 20),
  email text not null default '',
  start_date date not null,
  end_date date not null,
  guests_estimated integer not null default 1 check (guests_estimated between 1 and 500),
  guests_confirmed integer check (guests_confirmed between 1 and 500),
  package_name text not null default 'A definir' check (char_length(package_name) <= 120),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status text not null default 'PRE_RESERVA'
    check (status in ('PRE_RESERVA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA')),
  notes text not null default '' check (char_length(notes) <= 3000),
  google_event_id text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_valid_period check (end_date >= start_date)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'PIX'
    check (method in ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO')),
  notes text not null default '' check (char_length(notes) <= 500),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(trim(reason)) between 2 and 500),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint blocked_periods_valid_period check (end_date >= start_date)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists reservations_start_date_idx on public.reservations(start_date);
create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists payments_reservation_idx on public.payments(reservation_id, payment_date desc);
create index if not exists customers_organization_idx on public.customers(lower(organization));

alter table public.reservations
  drop constraint if exists reservations_no_active_overlap;
alter table public.reservations
  add constraint reservations_no_active_overlap
  exclude using gist (daterange(start_date, end_date, '[]') with &&)
  where (status in ('PRE_RESERVA', 'CONFIRMADA'));

create or replace function public.is_active_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.active = true
  );
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.role = 'ADMIN'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_block_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.reservations r
    where r.status in ('PRE_RESERVA', 'CONFIRMADA')
      and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'BLOCK_CONFLICTS_WITH_RESERVATION';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_reservation_block_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('PRE_RESERVA', 'CONFIRMADA') and exists (
    select 1 from public.blocked_periods b
    where daterange(b.start_date, b.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'RESERVATION_CONFLICTS_WITH_BLOCK';
  end if;
  return new;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log(table_name, record_id, action, old_data, new_data)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at before update on public.reservations
for each row execute function public.set_updated_at();

drop trigger if exists blocked_period_conflict on public.blocked_periods;
create trigger blocked_period_conflict before insert or update on public.blocked_periods
for each row execute function public.prevent_block_conflict();

drop trigger if exists reservation_block_conflict on public.reservations;
create trigger reservation_block_conflict before insert or update on public.reservations
for each row execute function public.prevent_reservation_block_conflict();

drop trigger if exists reservations_audit on public.reservations;
create trigger reservations_audit after insert or update or delete on public.reservations
for each row execute function public.write_audit_log();

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments
for each row execute function public.write_audit_log();

drop trigger if exists blocked_periods_audit on public.blocked_periods;
create trigger blocked_periods_audit after insert or update or delete on public.blocked_periods
for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "staff can read profiles" on public.profiles;
create policy "staff can read profiles" on public.profiles for select to authenticated
using (public.is_active_staff());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff manage customers" on public.customers;
create policy "staff manage customers" on public.customers for all to authenticated
using (public.is_active_staff()) with check (public.is_active_staff());

drop policy if exists "staff manage reservations" on public.reservations;
create policy "staff manage reservations" on public.reservations for all to authenticated
using (public.is_active_staff()) with check (public.is_active_staff());

drop policy if exists "staff manage payments" on public.payments;
create policy "staff manage payments" on public.payments for all to authenticated
using (public.is_active_staff()) with check (public.is_active_staff());

drop policy if exists "staff manage blocked periods" on public.blocked_periods;
create policy "staff manage blocked periods" on public.blocked_periods for all to authenticated
using (public.is_active_staff()) with check (public.is_active_staff());

drop policy if exists "admins read audit" on public.audit_log;
create policy "admins read audit" on public.audit_log for select to authenticated
using (public.is_admin());

revoke all on public.profiles, public.customers, public.reservations, public.payments, public.blocked_periods, public.audit_log from anon;
grant select, insert, update, delete on public.customers, public.reservations, public.payments, public.blocked_periods to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.is_active_staff(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_active_staff(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

commit;

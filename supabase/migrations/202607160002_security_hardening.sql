begin;

-- Security hardening: least privilege, immutable financial ledger, audited RPC writes.

alter table public.payments
  add column if not exists request_key uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

update public.payments
set request_key = gen_random_uuid()
where request_key is null;

alter table public.payments
  alter column request_key set default gen_random_uuid(),
  alter column request_key set not null;

create unique index if not exists payments_request_key_unique
  on public.payments(request_key);

alter table public.reservations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.audit_log
  add column if not exists reason text,
  add column if not exists request_id uuid;

alter table public.customers
  drop constraint if exists customers_email_valid,
  add constraint customers_email_valid
    check (
      char_length(email) <= 254
      and (email = '' or email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
    ) not valid;

alter table public.reservations
  drop constraint if exists reservations_email_valid,
  add constraint reservations_email_valid
    check (
      char_length(email) <= 254
      and (email = '' or email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
    ) not valid,
  drop constraint if exists reservations_total_reasonable,
  add constraint reservations_total_reasonable
    check (total_amount between 0 and 1000000) not valid,
  drop constraint if exists reservations_cancel_metadata,
  add constraint reservations_cancel_metadata
    check (
      (status <> 'CANCELADA' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
      or
      (status = 'CANCELADA' and cancelled_at is not null and char_length(trim(cancel_reason)) between 5 and 500)
    ) not valid;

alter table public.payments
  drop constraint if exists payments_amount_reasonable,
  add constraint payments_amount_reasonable
    check (amount > 0 and amount <= 1000000) not valid,
  drop constraint if exists payments_void_metadata,
  add constraint payments_void_metadata
    check (
      (voided_at is null and voided_by is null and void_reason is null)
      or
      (voided_at is not null and voided_by is not null and char_length(trim(void_reason)) between 5 and 500)
    ) not valid;

alter table public.customers validate constraint customers_email_valid;
alter table public.reservations validate constraint reservations_email_valid;
alter table public.reservations validate constraint reservations_total_reasonable;
alter table public.payments validate constraint payments_amount_reasonable;
alter table public.payments validate constraint payments_void_metadata;

-- Existing cancelled rows receive explicit audit metadata before validation.
update public.reservations
set cancelled_at = coalesce(cancelled_at, updated_at, now()),
    cancelled_by = coalesce(cancelled_by, created_by, (select id from public.profiles where active = true and role = 'ADMIN' order by created_at limit 1)),
    cancel_reason = coalesce(nullif(trim(cancel_reason), ''), 'Cancelamento registrado antes do reforço de segurança')
where status = 'CANCELADA';

alter table public.reservations validate constraint reservations_cancel_metadata;

-- Prevent overlapping blocked periods as well as reservation overlaps.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'blocked_periods_no_overlap'
      and conrelid = 'public.blocked_periods'::regclass
  ) then
    alter table public.blocked_periods
      add constraint blocked_periods_no_overlap
      exclude using gist (daterange(start_date, end_date, '[]') with &&);
  end if;
end;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
  limit 1;
$$;

create or replace function public.has_app_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select coalesce(public.current_app_role() = any(p_roles), false);
$$;

create or replace function public.is_active_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.active = true
    );
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p_user_id = (select auth.uid())
    and public.has_app_role(array['ADMIN']);
$$;

create or replace function public.active_payment_total(p_reservation_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select coalesce(sum(p.amount), 0)::numeric
  from public.payments p
  where p.reservation_id = p_reservation_id
    and p.voided_at is null;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_request_id uuid;
  v_request_text text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old) - 'phone' - 'email';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new) - 'phone' - 'email';
  end if;

  v_request_text := nullif(current_setting('app.audit_request_id', true), '');
  if v_request_text is not null then
    begin
      v_request_id := v_request_text::uuid;
    exception when others then
      v_request_id := null;
    end;
  end if;

  insert into public.audit_log(
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    request_id,
    changed_by
  ) values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    v_old,
    v_new,
    nullif(current_setting('app.audit_reason', true), ''),
    v_request_id,
    (select auth.uid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Preserve immutability while allowing ON DELETE SET NULL on the actor FK.
  if tg_op = 'UPDATE'
     and old.changed_by is not null
     and new.changed_by is null
     and (to_jsonb(new) - 'changed_by') = (to_jsonb(old) - 'changed_by') then
    return new;
  end if;

  raise exception 'AUDIT_LOG_IMMUTABLE' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
before update or delete on public.audit_log
for each row execute function public.prevent_audit_log_mutation();


create or replace function public.protect_admin_profiles()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_admin_count integer;
begin
  if tg_op = 'UPDATE' and new.id <> old.id then
    raise exception 'PROFILE_ID_IMMUTABLE' using errcode = '42501';
  end if;

  if old.role = 'ADMIN' and old.active = true and (
    tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and (new.role <> 'ADMIN' or new.active = false))
  ) then
    select count(*) into v_admin_count
    from public.profiles
    where role = 'ADMIN' and active = true;

    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN_PROTECTED' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_last_admin_guard on public.profiles;
create trigger profiles_last_admin_guard
before update or delete on public.profiles
for each row execute function public.protect_admin_profiles();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.write_audit_log();

create or replace function public.enforce_reservation_mutation_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('app.allow_reservation_create', true) <> 'true' then
      raise exception 'RESERVATION_INSERT_REQUIRES_RPC' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if current_setting('app.allow_reservation_delete', true) <> 'true' then
      raise exception 'RESERVATION_DELETE_REQUIRES_RPC' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id <> old.id
     or new.created_at <> old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'RESERVATION_IMMUTABLE_FIELDS' using errcode = '42501';
  end if;

  if (
    new.total_amount is distinct from old.total_amount
    or new.status is distinct from old.status
    or new.cancelled_at is distinct from old.cancelled_at
    or new.cancelled_by is distinct from old.cancelled_by
    or new.cancel_reason is distinct from old.cancel_reason
  ) and current_setting('app.allow_reservation_financial', true) <> 'true' then
    raise exception 'RESERVATION_FINANCIAL_CHANGE_REQUIRES_RPC' using errcode = '42501';
  end if;

  if (
    new.customer_id is distinct from old.customer_id
    or new.church_name is distinct from old.church_name
    or new.contact_name is distinct from old.contact_name
    or new.phone is distinct from old.phone
    or new.email is distinct from old.email
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.guests_estimated is distinct from old.guests_estimated
    or new.guests_confirmed is distinct from old.guests_confirmed
    or new.package_name is distinct from old.package_name
    or new.notes is distinct from old.notes
    or new.google_event_id is distinct from old.google_event_id
  ) and current_setting('app.allow_reservation_details', true) <> 'true' then
    raise exception 'RESERVATION_DETAIL_CHANGE_REQUIRES_RPC' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists reservation_mutation_gate on public.reservations;
create trigger reservation_mutation_gate
before insert or update or delete on public.reservations
for each row execute function public.enforce_reservation_mutation_gate();

create or replace function public.enforce_payment_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('app.allow_payment_insert', true) <> 'true' then
      raise exception 'PAYMENT_INSERT_REQUIRES_RPC' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'PAYMENT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  if current_setting('app.allow_payment_void', true) <> 'true' then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '42501';
  end if;

  if new.id <> old.id
     or new.reservation_id <> old.reservation_id
     or new.amount <> old.amount
     or new.payment_date <> old.payment_date
     or new.method <> old.method
     or new.notes <> old.notes
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
     or new.request_key <> old.request_key then
    raise exception 'PAYMENT_FIELDS_IMMUTABLE' using errcode = '42501';
  end if;

  if old.voided_at is not null
     or new.voided_at is null
     or new.voided_by is null
     or char_length(trim(coalesce(new.void_reason, ''))) < 5 then
    raise exception 'INVALID_PAYMENT_VOID' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_immutable on public.payments;
create trigger payments_immutable
before insert or update or delete on public.payments
for each row execute function public.enforce_payment_immutability();

-- Include customers in the immutable audit trail.
drop trigger if exists customers_audit on public.customers;
create trigger customers_audit
after insert or update or delete on public.customers
for each row execute function public.write_audit_log();

-- Atomic first-admin bootstrap. Only the server-side service role can execute it.
create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_email text,
  p_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user auth.users;
  v_row public.profiles;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda-sitio-emanuel:first-admin', 0));

  if exists (select 1 from public.profiles) then
    raise exception 'BOOTSTRAP_ALREADY_COMPLETED' using errcode = '42501';
  end if;

  select * into v_user
  from auth.users
  where id = p_user_id
    and lower(email) = lower(trim(p_email))
    and email_confirmed_at is not null
    and coalesce(is_anonymous, false) = false
  for update;

  if not found then
    raise exception 'BOOTSTRAP_USER_INVALID' using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', 'Criação segura do primeiro administrador', true);
  perform set_config('app.audit_request_id', gen_random_uuid()::text, true);

  insert into public.profiles(id, name, email, role, active)
  values (
    p_user_id,
    left(trim(coalesce(nullif(p_name, ''), split_part(lower(trim(p_email)), '@', 1))), 120),
    lower(trim(p_email)),
    'ADMIN',
    true
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_staff_profile_secure(
  p_request_id uuid,
  p_user_id uuid,
  p_name text,
  p_role text,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_email text;
  v_row public.profiles;
begin
  if not public.has_app_role(array['ADMIN']) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_role not in ('ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA') then
    raise exception 'INVALID_PROFILE_ROLE' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'PROFILE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = p_user_id
    and email_confirmed_at is not null
    and coalesce(is_anonymous, false) = false
  for update;

  if not found or v_email is null then
    raise exception 'PROFILE_USER_INVALID' using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  insert into public.profiles(id, name, email, role, active)
  values (p_user_id, left(trim(p_name), 120), v_email, p_role, true)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_staff_profile_secure(
  p_request_id uuid,
  p_id uuid,
  p_name text,
  p_role text,
  p_active boolean,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_row public.profiles;
begin
  if not public.has_app_role(array['ADMIN']) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_role not in ('ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA') then
    raise exception 'INVALID_PROFILE_ROLE' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'PROFILE_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.profiles
  set name = left(trim(p_name), 120),
      role = p_role,
      active = p_active
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Secure write functions. The browser receives only EXECUTE permission on these RPCs.
create or replace function public.create_customer_secure(
  p_request_id uuid,
  p_name text,
  p_organization text,
  p_phone text,
  p_email text default '',
  p_notes text default ''
)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_row public.customers;
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'CUSTOMER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', 'Cadastro de cliente', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  insert into public.customers(name, organization, phone, email, notes, created_by)
  values (
    trim(p_name),
    trim(p_organization),
    regexp_replace(p_phone, '[^0-9]', '', 'g'),
    lower(trim(coalesce(p_email, ''))),
    trim(coalesce(p_notes, '')),
    (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_customer_secure(
  p_request_id uuid,
  p_id uuid,
  p_name text,
  p_organization text,
  p_phone text,
  p_email text default '',
  p_notes text default ''
)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_row public.customers;
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'CUSTOMER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.customers where id = p_id for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', 'Atualização de cliente', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.customers
  set name = trim(p_name),
      organization = trim(p_organization),
      phone = regexp_replace(p_phone, '[^0-9]', '', 'g'),
      email = lower(trim(coalesce(p_email, ''))),
      notes = trim(coalesce(p_notes, ''))
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_customer_secure(
  p_request_id uuid,
  p_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if not public.has_app_role(array['ADMIN']) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;
  if exists (select 1 from public.reservations where customer_id = p_id) then
    raise exception 'CUSTOMER_HAS_RESERVATIONS' using errcode = '23503';
  end if;

  perform set_config('app.audit_reason', trim(p_reason), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  delete from public.customers where id = p_id;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.create_reservation_secure(
  p_request_id uuid,
  p_customer_id uuid,
  p_church_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_start_date date,
  p_end_date date,
  p_guests_estimated integer,
  p_guests_confirmed integer,
  p_package_name text,
  p_total_amount numeric,
  p_status text,
  p_notes text
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_row public.reservations;
  v_role text := public.current_app_role();
begin
  if v_role not in ('ADMIN', 'GESTOR') then
    raise exception 'RESERVATION_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_start_date < current_date - 730 or p_end_date > current_date + 3650 then
    raise exception 'RESERVATION_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if coalesce(p_total_amount, 0) <> 0 and v_role <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED_FOR_INITIAL_VALUE' using errcode = '42501';
  end if;
  if p_status not in ('PRE_RESERVA', 'CONFIRMADA') then
    raise exception 'INVALID_INITIAL_STATUS' using errcode = '22023';
  end if;

  perform set_config('app.allow_reservation_create', 'true', true);
  perform set_config('app.audit_reason', 'Criação de reserva', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  insert into public.reservations(
    customer_id, church_name, contact_name, phone, email,
    start_date, end_date, guests_estimated, guests_confirmed,
    package_name, total_amount, status, notes, created_by
  ) values (
    p_customer_id,
    trim(p_church_name),
    trim(p_contact_name),
    regexp_replace(p_phone, '[^0-9]', '', 'g'),
    lower(trim(coalesce(p_email, ''))),
    p_start_date,
    p_end_date,
    p_guests_estimated,
    p_guests_confirmed,
    trim(coalesce(nullif(p_package_name, ''), 'A definir')),
    coalesce(p_total_amount, 0),
    p_status,
    trim(coalesce(p_notes, '')),
    (select auth.uid())
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_reservation_details_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_customer_id uuid,
  p_church_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_start_date date,
  p_end_date date,
  p_guests_estimated integer,
  p_guests_confirmed integer,
  p_package_name text,
  p_notes text
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_current public.reservations;
  v_row public.reservations;
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'RESERVATION_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_current from public.reservations where id = p_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_current.updated_at <> p_expected_updated_at then
    raise exception 'STALE_RESERVATION' using errcode = '40001';
  end if;
  if p_start_date < current_date - 730 or p_end_date > current_date + 3650 then
    raise exception 'RESERVATION_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  perform set_config('app.allow_reservation_details', 'true', true);
  perform set_config('app.audit_reason', 'Atualização dos dados da reserva', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.reservations
  set customer_id = p_customer_id,
      church_name = trim(p_church_name),
      contact_name = trim(p_contact_name),
      phone = regexp_replace(p_phone, '[^0-9]', '', 'g'),
      email = lower(trim(coalesce(p_email, ''))),
      start_date = p_start_date,
      end_date = p_end_date,
      guests_estimated = p_guests_estimated,
      guests_confirmed = p_guests_confirmed,
      package_name = trim(coalesce(nullif(p_package_name, ''), 'A definir')),
      notes = trim(coalesce(p_notes, ''))
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_reservation_total_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_total_amount numeric,
  p_reason text default 'Atualização do valor combinado'
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_current public.reservations;
  v_paid numeric;
  v_row public.reservations;
begin
  if not public.has_app_role(array['ADMIN', 'FINANCEIRO']) then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_current from public.reservations where id = p_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_current.updated_at <> p_expected_updated_at then
    raise exception 'STALE_RESERVATION' using errcode = '40001';
  end if;

  v_paid := public.active_payment_total(p_id);
  if p_total_amount < v_paid then
    raise exception 'TOTAL_BELOW_RECEIVED' using errcode = '23514';
  end if;

  perform set_config('app.allow_reservation_financial', 'true', true);
  perform set_config('app.audit_reason', left(trim(coalesce(p_reason, 'Atualização do valor combinado')), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.reservations
  set total_amount = p_total_amount
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.change_reservation_status_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_current public.reservations;
  v_role text := public.current_app_role();
  v_allowed boolean := false;
  v_row public.reservations;
begin
  if v_role not in ('ADMIN', 'GESTOR') then
    raise exception 'STATUS_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('PRE_RESERVA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select * into v_current from public.reservations where id = p_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_current.updated_at <> p_expected_updated_at then
    raise exception 'STALE_RESERVATION' using errcode = '40001';
  end if;

  if p_status = v_current.status then
    return v_current;
  end if;

  v_allowed :=
    (v_current.status = 'PRE_RESERVA' and p_status in ('CONFIRMADA', 'CANCELADA'))
    or (v_current.status = 'CONFIRMADA' and p_status in ('REALIZADA', 'CANCELADA'))
    or (v_role = 'ADMIN' and v_current.status in ('CONFIRMADA', 'REALIZADA', 'CANCELADA'));

  if not v_allowed then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if p_status = 'CANCELADA' and char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'CANCEL_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('app.allow_reservation_financial', 'true', true);
  perform set_config(
    'app.audit_reason',
    case when p_status = 'CANCELADA' then left(trim(p_reason), 500) else 'Alteração de situação para ' || p_status end,
    true
  );
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.reservations
  set status = p_status,
      cancelled_at = case when p_status = 'CANCELADA' then now() else null end,
      cancelled_by = case when p_status = 'CANCELADA' then (select auth.uid()) else null end,
      cancel_reason = case when p_status = 'CANCELADA' then left(trim(p_reason), 500) else null end
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_reservation_secure(
  p_request_id uuid,
  p_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_current public.reservations;
begin
  if not public.has_app_role(array['ADMIN']) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_current from public.reservations where id = p_id for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.status <> 'PRE_RESERVA' or v_current.created_at < now() - interval '24 hours' then
    raise exception 'RESERVATION_DELETE_WINDOW_CLOSED' using errcode = '42501';
  end if;
  if exists (select 1 from public.payments where reservation_id = p_id) then
    raise exception 'RESERVATION_HAS_FINANCIAL_HISTORY' using errcode = '23503';
  end if;

  perform set_config('app.allow_reservation_delete', 'true', true);
  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  delete from public.reservations where id = p_id;
end;
$$;

create or replace function public.record_payment_secure(
  p_request_key uuid,
  p_reservation_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_notes text default ''
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_reservation public.reservations;
  v_existing public.payments;
  v_paid numeric;
  v_row public.payments;
begin
  if not public.has_app_role(array['ADMIN', 'FINANCEIRO']) then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_existing
  from public.payments
  where request_key = p_request_key;
  if found then
    if v_existing.created_by = (select auth.uid()) then
      return v_existing;
    end if;
    raise exception 'REQUEST_KEY_CONFLICT' using errcode = '23505';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_reservation.status = 'CANCELADA' then
    raise exception 'CANCELLED_RESERVATION_PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_reservation.total_amount <= 0 then
    raise exception 'RESERVATION_TOTAL_REQUIRED' using errcode = '23514';
  end if;
  if p_payment_date > current_date or p_payment_date < current_date - 1825 then
    raise exception 'PAYMENT_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_method not in ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  v_paid := public.active_payment_total(p_reservation_id);
  if p_amount <= 0 or p_amount > (v_reservation.total_amount - v_paid) then
    raise exception 'PAYMENT_EXCEEDS_BALANCE' using errcode = '23514';
  end if;

  perform set_config('app.allow_payment_insert', 'true', true);
  perform set_config('app.audit_reason', 'Registro de pagamento', true);
  perform set_config('app.audit_request_id', p_request_key::text, true);

  insert into public.payments(
    reservation_id, amount, payment_date, method, notes, created_by, request_key
  ) values (
    p_reservation_id,
    p_amount,
    p_payment_date,
    p_method,
    trim(coalesce(p_notes, '')),
    (select auth.uid()),
    p_request_key
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.void_payment_secure(
  p_request_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_role text := public.current_app_role();
  v_current public.payments;
  v_row public.payments;
begin
  if v_role not in ('ADMIN', 'FINANCEIRO') then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'VOID_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_current from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.voided_at is not null then
    return v_current;
  end if;
  if v_role = 'FINANCEIRO' and v_current.created_at < now() - interval '24 hours' then
    raise exception 'ADMIN_REQUIRED_FOR_OLD_PAYMENT_VOID' using errcode = '42501';
  end if;

  perform set_config('app.allow_payment_void', 'true', true);
  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.payments
  set voided_at = now(),
      voided_by = (select auth.uid()),
      void_reason = left(trim(p_reason), 500)
  where id = p_payment_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_blocked_period_secure(
  p_request_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns public.blocked_periods
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_row public.blocked_periods;
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'BLOCK_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_start_date < current_date - 30 or p_end_date > current_date + 3650 then
    raise exception 'BLOCK_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', 'Bloqueio de período: ' || left(trim(p_reason), 450), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  insert into public.blocked_periods(start_date, end_date, reason, created_by)
  values (p_start_date, p_end_date, trim(p_reason), (select auth.uid()))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_blocked_period_secure(
  p_request_id uuid,
  p_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'BLOCK_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  delete from public.blocked_periods where id = p_id;
  if not found then
    raise exception 'BLOCK_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;


-- Financial ledger actors cannot be deleted while referenced.
alter table public.payments drop constraint if exists payments_created_by_fkey;
alter table public.payments
  add constraint payments_created_by_fkey foreign key (created_by)
  references public.profiles(id) on delete restrict;

alter table public.payments drop constraint if exists payments_voided_by_fkey;
alter table public.payments
  add constraint payments_voided_by_fkey foreign key (voided_by)
  references auth.users(id) on delete restrict;

-- Replace broad write policies with select-only, role-aware policies.
drop policy if exists "staff can read profiles" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "staff manage customers" on public.customers;
drop policy if exists "staff manage reservations" on public.reservations;
drop policy if exists "staff manage payments" on public.payments;
drop policy if exists "staff manage blocked periods" on public.blocked_periods;
drop policy if exists "admins read audit" on public.audit_log;

create policy "profile self or admin read"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.has_app_role(array['ADMIN'])
);

create policy "active staff read customers"
on public.customers for select to authenticated
using (public.has_app_role(array['ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA']));

create policy "active staff read reservations"
on public.reservations for select to authenticated
using (public.has_app_role(array['ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA']));

create policy "active staff read payments"
on public.payments for select to authenticated
using (public.has_app_role(array['ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA']));

create policy "active staff read blocked periods"
on public.blocked_periods for select to authenticated
using (public.has_app_role(array['ADMIN', 'GESTOR', 'FINANCEIRO', 'LEITURA']));

create policy "admin reads audit"
on public.audit_log for select to authenticated
using (public.has_app_role(array['ADMIN']));

revoke all on public.profiles, public.customers, public.reservations, public.payments, public.blocked_periods, public.audit_log from anon;
revoke insert, update, delete on public.customers, public.reservations, public.payments, public.blocked_periods from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

grant select on public.profiles, public.customers, public.reservations, public.payments, public.blocked_periods, public.audit_log to authenticated;
revoke insert, update, delete on public.profiles from authenticated;

revoke all on function public.bootstrap_first_admin(uuid,text,text) from public, anon, authenticated;
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.has_app_role(text[]) from public, anon;
revoke all on function public.active_payment_total(uuid) from public, anon, authenticated;
revoke all on function public.is_active_staff(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;

revoke all on function public.create_staff_profile_secure(uuid,uuid,text,text,text) from public, anon;
revoke all on function public.update_staff_profile_secure(uuid,uuid,text,text,boolean,text) from public, anon;
revoke all on function public.create_customer_secure(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.update_customer_secure(uuid,uuid,text,text,text,text,text) from public, anon;
revoke all on function public.delete_customer_secure(uuid,uuid,text) from public, anon;
revoke all on function public.create_reservation_secure(uuid,uuid,text,text,text,text,date,date,integer,integer,text,numeric,text,text) from public, anon;
revoke all on function public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,date,date,integer,integer,text,text) from public, anon;
revoke all on function public.set_reservation_total_secure(uuid,uuid,timestamptz,numeric,text) from public, anon;
revoke all on function public.change_reservation_status_secure(uuid,uuid,timestamptz,text,text) from public, anon;
revoke all on function public.delete_reservation_secure(uuid,uuid,text) from public, anon;
revoke all on function public.record_payment_secure(uuid,uuid,numeric,date,text,text) from public, anon;
revoke all on function public.void_payment_secure(uuid,uuid,text) from public, anon;
revoke all on function public.create_blocked_period_secure(uuid,date,date,text) from public, anon;
revoke all on function public.delete_blocked_period_secure(uuid,uuid,text) from public, anon;

grant execute on function public.bootstrap_first_admin(uuid,text,text) to service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_active_staff(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

grant execute on function public.create_staff_profile_secure(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.update_staff_profile_secure(uuid,uuid,text,text,boolean,text) to authenticated;
grant execute on function public.create_customer_secure(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.update_customer_secure(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.delete_customer_secure(uuid,uuid,text) to authenticated;
grant execute on function public.create_reservation_secure(uuid,uuid,text,text,text,text,date,date,integer,integer,text,numeric,text,text) to authenticated;
grant execute on function public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,date,date,integer,integer,text,text) to authenticated;
grant execute on function public.set_reservation_total_secure(uuid,uuid,timestamptz,numeric,text) to authenticated;
grant execute on function public.change_reservation_status_secure(uuid,uuid,timestamptz,text,text) to authenticated;
grant execute on function public.delete_reservation_secure(uuid,uuid,text) to authenticated;
grant execute on function public.record_payment_secure(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.void_payment_secure(uuid,uuid,text) to authenticated;
grant execute on function public.create_blocked_period_secure(uuid,date,date,text) to authenticated;
grant execute on function public.delete_blocked_period_secure(uuid,uuid,text) to authenticated;

commit;

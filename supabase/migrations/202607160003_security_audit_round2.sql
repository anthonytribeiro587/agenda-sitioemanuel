begin;

-- Segunda rodada de hardening: idempotência, atomicidade financeira,
-- transições de status restritas e privilégios explícitos.

alter table public.customers
  add column if not exists request_key uuid;

alter table public.reservations
  add column if not exists request_key uuid;

alter table public.blocked_periods
  add column if not exists request_key uuid;

update public.customers set request_key = gen_random_uuid() where request_key is null;
update public.reservations set request_key = gen_random_uuid() where request_key is null;
update public.blocked_periods set request_key = gen_random_uuid() where request_key is null;

alter table public.customers
  alter column request_key set default gen_random_uuid(),
  alter column request_key set not null;

alter table public.reservations
  alter column request_key set default gen_random_uuid(),
  alter column request_key set not null;

alter table public.blocked_periods
  alter column request_key set default gen_random_uuid(),
  alter column request_key set not null;

create unique index if not exists customers_request_key_unique
  on public.customers(request_key);
create unique index if not exists reservations_request_key_unique
  on public.reservations(request_key);
create unique index if not exists blocked_periods_request_key_unique
  on public.blocked_periods(request_key);

-- Impede que uma atualização comum altere a chave que identifica a criação.
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
     or new.created_by is distinct from old.created_by
     or new.request_key <> old.request_key then
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

-- Serializa alterações que poderiam remover o último administrador.
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
    perform pg_advisory_xact_lock(hashtext('agenda_sitio_last_admin_guard'));

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

-- Criação de cliente idempotente: repetir a mesma chave retorna a mesma linha;
-- reutilizar a chave com outro conteúdo é bloqueado.
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
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_notes text := trim(coalesce(p_notes, ''));
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'CUSTOMER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_row from public.customers where request_key = p_request_id;
  if found then
    if v_row.created_by is distinct from (select auth.uid()) then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '23505';
    end if;
    if v_row.name is distinct from trim(p_name)
       or v_row.organization is distinct from trim(p_organization)
       or v_row.phone is distinct from v_phone
       or v_row.email is distinct from v_email
       or v_row.notes is distinct from v_notes then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    return v_row;
  end if;

  perform set_config('app.audit_reason', 'Cadastro de cliente', true);
  perform set_config('app.audit_request_id', p_request_id::text, true);

  insert into public.customers(
    name, organization, phone, email, notes, created_by, request_key
  ) values (
    trim(p_name), trim(p_organization), v_phone, v_email, v_notes,
    (select auth.uid()), p_request_id
  ) returning * into v_row;

  return v_row;
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
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_package text := trim(coalesce(nullif(p_package_name, ''), 'A definir'));
  v_notes text := trim(coalesce(p_notes, ''));
  v_total numeric := coalesce(p_total_amount, 0);
begin
  if v_role not in ('ADMIN', 'GESTOR') then
    raise exception 'RESERVATION_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_start_date < current_date - 730 or p_end_date > current_date + 3650 then
    raise exception 'RESERVATION_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if v_total <> 0 and v_role <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED_FOR_INITIAL_VALUE' using errcode = '42501';
  end if;
  if p_status not in ('PRE_RESERVA', 'CONFIRMADA') then
    raise exception 'INVALID_INITIAL_STATUS' using errcode = '22023';
  end if;

  select * into v_row from public.reservations where request_key = p_request_id;
  if found then
    if v_row.created_by is distinct from (select auth.uid()) then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '23505';
    end if;
    if v_row.customer_id is distinct from p_customer_id
       or v_row.church_name is distinct from trim(p_church_name)
       or v_row.contact_name is distinct from trim(p_contact_name)
       or v_row.phone is distinct from v_phone
       or v_row.email is distinct from v_email
       or v_row.start_date is distinct from p_start_date
       or v_row.end_date is distinct from p_end_date
       or v_row.guests_estimated is distinct from p_guests_estimated
       or v_row.guests_confirmed is distinct from p_guests_confirmed
       or v_row.package_name is distinct from v_package
       or v_row.total_amount is distinct from v_total
       or v_row.status is distinct from p_status
       or v_row.notes is distinct from v_notes then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    return v_row;
  end if;

  perform set_config('app.allow_reservation_create', 'true', true);
  perform set_config('app.audit_reason', 'Criação de reserva', true);
  perform set_config('app.audit_request_id', p_request_id::text, true);

  insert into public.reservations(
    customer_id, church_name, contact_name, phone, email,
    start_date, end_date, guests_estimated, guests_confirmed,
    package_name, total_amount, status, notes, created_by, request_key
  ) values (
    p_customer_id, trim(p_church_name), trim(p_contact_name), v_phone, v_email,
    p_start_date, p_end_date, p_guests_estimated, p_guests_confirmed,
    v_package, v_total, p_status, v_notes, (select auth.uid()), p_request_id
  ) returning * into v_row;

  return v_row;
end;
$$;

-- A função anterior possuía valor DEFAULT em p_reason. O PostgreSQL não permite
-- remover DEFAULT com CREATE OR REPLACE; por isso ela é recriada dentro da mesma
-- transação, preservando a exigência de motivo explícito nesta versão.
drop function if exists public.set_reservation_total_secure(uuid, uuid, timestamptz, numeric, text);

create or replace function public.set_reservation_total_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_total_amount numeric,
  p_reason text
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
  if char_length(trim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'FINANCIAL_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_total_amount is null or p_total_amount < 0 or p_total_amount > 1000000 then
    raise exception 'INVALID_TOTAL_AMOUNT' using errcode = '22023';
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

  if v_current.total_amount = p_total_amount then
    return v_current;
  end if;

  perform set_config('app.allow_reservation_financial', 'true', true);
  perform set_config('app.audit_reason', left(trim(p_reason), 500), true);
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
  v_forward boolean := false;
  v_admin_correction boolean := false;
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

  v_forward :=
    (v_current.status = 'PRE_RESERVA' and p_status in ('CONFIRMADA', 'CANCELADA'))
    or (v_current.status = 'CONFIRMADA' and p_status in ('REALIZADA', 'CANCELADA'));

  v_admin_correction := v_role = 'ADMIN' and (
    (v_current.status = 'CONFIRMADA' and p_status = 'PRE_RESERVA')
    or (v_current.status = 'REALIZADA' and p_status in ('CONFIRMADA', 'CANCELADA'))
    or (v_current.status = 'CANCELADA' and p_status in ('PRE_RESERVA', 'CONFIRMADA'))
  );

  if not v_forward and not v_admin_correction then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if (p_status = 'CANCELADA' or v_admin_correction)
     and char_length(trim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'STATUS_CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('app.allow_reservation_financial', 'true', true);
  perform set_config(
    'app.audit_reason',
    case
      when char_length(trim(coalesce(p_reason, ''))) >= 5 then left(trim(p_reason), 500)
      else 'Alteração de situação para ' || p_status
    end,
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
  v_notes text := trim(coalesce(p_notes, ''));
begin
  if not public.has_app_role(array['ADMIN', 'FINANCEIRO']) then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_existing from public.payments where request_key = p_request_key;
  if found then
    if v_existing.created_by is distinct from (select auth.uid()) then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '23505';
    end if;
    if v_existing.reservation_id is distinct from p_reservation_id
       or v_existing.amount is distinct from p_amount
       or v_existing.payment_date is distinct from p_payment_date
       or v_existing.method is distinct from p_method
       or v_existing.notes is distinct from v_notes then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    return v_existing;
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
    p_reservation_id, p_amount, p_payment_date, p_method, v_notes,
    (select auth.uid()), p_request_key
  ) returning * into v_row;

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
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.has_app_role(array['ADMIN', 'GESTOR']) then
    raise exception 'BLOCK_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_start_date < current_date - 30 or p_end_date > current_date + 3650 then
    raise exception 'BLOCK_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'BLOCK_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_row from public.blocked_periods where request_key = p_request_id;
  if found then
    if v_row.created_by is distinct from (select auth.uid()) then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '23505';
    end if;
    if v_row.start_date is distinct from p_start_date
       or v_row.end_date is distinct from p_end_date
       or v_row.reason is distinct from v_reason then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    return v_row;
  end if;

  perform set_config('app.audit_reason', 'Bloqueio de período: ' || left(v_reason, 450), true);
  perform set_config('app.audit_request_id', p_request_id::text, true);

  insert into public.blocked_periods(start_date, end_date, reason, created_by, request_key)
  values (p_start_date, p_end_date, v_reason, (select auth.uid()), p_request_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- Criação de reserva e sinal na mesma transação. Qualquer falha reverte tudo.
create or replace function public.create_reservation_with_payment_secure(
  p_request_key uuid,
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
  p_notes text,
  p_payment_amount numeric default null,
  p_payment_date date default null,
  p_payment_method text default null,
  p_payment_notes text default '',
  p_payment_request_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_reservation public.reservations;
  v_payment public.payments;
  v_has_payment boolean := false;
begin
  v_reservation := public.create_reservation_secure(
    p_request_key, p_customer_id, p_church_name, p_contact_name, p_phone, p_email,
    p_start_date, p_end_date, p_guests_estimated, p_guests_confirmed,
    p_package_name, p_total_amount, p_status, p_notes
  );

  if coalesce(p_payment_amount, 0) > 0 then
    if p_payment_request_key is null then
      raise exception 'PAYMENT_REQUEST_KEY_REQUIRED' using errcode = '22023';
    end if;
    v_payment := public.record_payment_secure(
      p_payment_request_key,
      v_reservation.id,
      p_payment_amount,
      coalesce(p_payment_date, current_date),
      coalesce(p_payment_method, 'PIX'),
      coalesce(p_payment_notes, '')
    );
    v_has_payment := true;
  end if;

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'payment', case when v_has_payment then to_jsonb(v_payment) else null end
  );
end;
$$;

-- Alteração do valor e recebimento em uma única transação.
create or replace function public.update_reservation_financial_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_total_amount numeric default null,
  p_total_reason text default null,
  p_payment_amount numeric default null,
  p_payment_date date default null,
  p_payment_method text default null,
  p_payment_notes text default '',
  p_payment_request_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_current public.reservations;
  v_reservation public.reservations;
  v_payment public.payments;
  v_has_payment boolean := false;
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

  v_reservation := v_current;
  if p_total_amount is not null and p_total_amount is distinct from v_current.total_amount then
    v_reservation := public.set_reservation_total_secure(
      p_request_id,
      p_id,
      v_current.updated_at,
      p_total_amount,
      p_total_reason
    );
  end if;

  if coalesce(p_payment_amount, 0) > 0 then
    if p_payment_request_key is null then
      raise exception 'PAYMENT_REQUEST_KEY_REQUIRED' using errcode = '22023';
    end if;
    v_payment := public.record_payment_secure(
      p_payment_request_key,
      p_id,
      p_payment_amount,
      coalesce(p_payment_date, current_date),
      coalesce(p_payment_method, 'PIX'),
      coalesce(p_payment_notes, '')
    );
    v_has_payment := true;
  end if;

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'payment', case when v_has_payment then to_jsonb(v_payment) else null end
  );
end;
$$;

-- Privilégio mínimo: nada é executável por PUBLIC/anon por padrão.
revoke all on schema public from public;
grant usage on schema public to authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.customers, public.reservations,
  public.payments, public.blocked_periods to authenticated;
grant select on public.audit_log to authenticated;

revoke all on all sequences in schema public from anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Somente funções estritamente necessárias ao navegador.
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
grant execute on function public.create_reservation_with_payment_secure(uuid,uuid,text,text,text,text,date,date,integer,integer,text,numeric,text,text,numeric,date,text,text,uuid) to authenticated;
grant execute on function public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,date,date,integer,integer,text,text) to authenticated;
grant execute on function public.set_reservation_total_secure(uuid,uuid,timestamptz,numeric,text) to authenticated;
grant execute on function public.update_reservation_financial_secure(uuid,uuid,timestamptz,numeric,text,numeric,date,text,text,uuid) to authenticated;
grant execute on function public.change_reservation_status_secure(uuid,uuid,timestamptz,text,text) to authenticated;
grant execute on function public.delete_reservation_secure(uuid,uuid,text) to authenticated;
grant execute on function public.record_payment_secure(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.void_payment_secure(uuid,uuid,text) to authenticated;
grant execute on function public.create_blocked_period_secure(uuid,date,date,text) to authenticated;
grant execute on function public.delete_blocked_period_secure(uuid,uuid,text) to authenticated;

grant execute on function public.bootstrap_first_admin(uuid,text,text) to service_role;

commit;

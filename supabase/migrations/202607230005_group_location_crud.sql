begin;

-- Endereço do grupo fica no cadastro do cliente e também como fotografia histórica da reserva.
alter table public.customers
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text;

update public.customers
set address = coalesce(nullif(trim(address), ''), 'Endereço não informado'),
    city = coalesce(nullif(trim(city), ''), 'Cidade não informada'),
    state = upper(coalesce(nullif(trim(state), ''), 'RS'));

alter table public.customers
  alter column address set not null,
  alter column city set not null,
  alter column state set not null;

alter table public.customers
  drop constraint if exists customers_address_length,
  add constraint customers_address_length check (char_length(trim(address)) between 5 and 240),
  drop constraint if exists customers_city_length,
  add constraint customers_city_length check (char_length(trim(city)) between 2 and 120),
  drop constraint if exists customers_state_format,
  add constraint customers_state_format check (state ~ '^[A-Z]{2}$');

alter table public.reservations
  add column if not exists group_address text,
  add column if not exists group_city text,
  add column if not exists group_state text;

update public.reservations r
set group_address = coalesce(nullif(trim(r.group_address), ''), nullif(trim(c.address), ''), 'Endereço não informado'),
    group_city = coalesce(nullif(trim(r.group_city), ''), nullif(trim(c.city), ''), 'Cidade não informada'),
    group_state = upper(coalesce(nullif(trim(r.group_state), ''), nullif(trim(c.state), ''), 'RS'))
from public.customers c
where r.customer_id = c.id;

update public.reservations
set group_address = coalesce(nullif(trim(group_address), ''), 'Endereço não informado'),
    group_city = coalesce(nullif(trim(group_city), ''), 'Cidade não informada'),
    group_state = upper(coalesce(nullif(trim(group_state), ''), 'RS'));

alter table public.reservations
  alter column group_address set not null,
  alter column group_city set not null,
  alter column group_state set not null;

alter table public.reservations
  drop constraint if exists reservations_group_address_length,
  add constraint reservations_group_address_length check (char_length(trim(group_address)) between 5 and 240),
  drop constraint if exists reservations_group_city_length,
  add constraint reservations_group_city_length check (char_length(trim(group_city)) between 2 and 120),
  drop constraint if exists reservations_group_state_format,
  add constraint reservations_group_state_format check (group_state ~ '^[A-Z]{2}$');

-- Recria as RPCs com os novos campos. Primeiro removemos dependências de assinatura antiga.
drop function if exists public.create_reservation_with_payment_secure(uuid,uuid,text,text,text,text,date,date,integer,integer,text,numeric,text,text,numeric,date,text,text,uuid);
drop function if exists public.create_reservation_secure(uuid,uuid,text,text,text,text,date,date,integer,integer,text,numeric,text,text);
drop function if exists public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,date,date,integer,integer,text,text);
drop function if exists public.create_customer_secure(uuid,text,text,text,text,text);
drop function if exists public.update_customer_secure(uuid,uuid,text,text,text,text,text);

create function public.create_customer_secure(
  p_request_id uuid,
  p_name text,
  p_organization text,
  p_phone text,
  p_email text,
  p_address text,
  p_city text,
  p_state text,
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
  v_address text := trim(coalesce(p_address, ''));
  v_city text := trim(coalesce(p_city, ''));
  v_state text := upper(trim(coalesce(p_state, '')));
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
       or v_row.address is distinct from v_address
       or v_row.city is distinct from v_city
       or v_row.state is distinct from v_state
       or v_row.notes is distinct from v_notes then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    return v_row;
  end if;

  perform set_config('app.audit_reason', 'Cadastro de cliente', true);
  perform set_config('app.audit_request_id', p_request_id::text, true);

  insert into public.customers(
    name, organization, phone, email, address, city, state, notes, created_by, request_key
  ) values (
    trim(p_name), trim(p_organization), v_phone, v_email, v_address, v_city, v_state,
    v_notes, (select auth.uid()), p_request_id
  ) returning * into v_row;

  return v_row;
end;
$$;

create function public.update_customer_secure(
  p_request_id uuid,
  p_id uuid,
  p_name text,
  p_organization text,
  p_phone text,
  p_email text,
  p_address text,
  p_city text,
  p_state text,
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

  perform set_config('app.audit_reason', 'Atualização de cliente e localização', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.customers
  set name = trim(p_name),
      organization = trim(p_organization),
      phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'),
      email = lower(trim(coalesce(p_email, ''))),
      address = trim(coalesce(p_address, '')),
      city = trim(coalesce(p_city, '')),
      state = upper(trim(coalesce(p_state, ''))),
      notes = trim(coalesce(p_notes, ''))
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create function public.create_reservation_secure(
  p_request_id uuid,
  p_customer_id uuid,
  p_church_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_group_address text,
  p_group_city text,
  p_group_state text,
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
  v_address text := trim(coalesce(p_group_address, ''));
  v_city text := trim(coalesce(p_group_city, ''));
  v_state text := upper(trim(coalesce(p_group_state, '')));
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
       or v_row.group_address is distinct from v_address
       or v_row.group_city is distinct from v_city
       or v_row.group_state is distinct from v_state
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
    group_address, group_city, group_state,
    start_date, end_date, guests_estimated, guests_confirmed,
    package_name, total_amount, status, notes, created_by, request_key
  ) values (
    p_customer_id, trim(p_church_name), trim(p_contact_name), v_phone, v_email,
    v_address, v_city, v_state,
    p_start_date, p_end_date, p_guests_estimated, p_guests_confirmed,
    v_package, v_total, p_status, v_notes, (select auth.uid()), p_request_id
  ) returning * into v_row;

  return v_row;
end;
$$;

create function public.create_reservation_with_payment_secure(
  p_request_key uuid,
  p_customer_id uuid,
  p_church_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_group_address text,
  p_group_city text,
  p_group_state text,
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
    p_group_address, p_group_city, p_group_state,
    p_start_date, p_end_date, p_guests_estimated, p_guests_confirmed,
    p_package_name, p_total_amount, p_status, p_notes
  );

  if coalesce(p_payment_amount, 0) > 0 then
    if p_payment_request_key is null then
      raise exception 'PAYMENT_REQUEST_KEY_REQUIRED' using errcode = '22023';
    end if;
    v_payment := public.record_payment_secure(
      p_payment_request_key, v_reservation.id, p_payment_amount,
      coalesce(p_payment_date, current_date), coalesce(p_payment_method, 'PIX'),
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

create function public.update_reservation_details_secure(
  p_request_id uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_customer_id uuid,
  p_church_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_group_address text,
  p_group_city text,
  p_group_state text,
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
  perform set_config('app.audit_reason', 'Atualização dos dados e localização da reserva', true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.reservations
  set customer_id = p_customer_id,
      church_name = trim(p_church_name),
      contact_name = trim(p_contact_name),
      phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'),
      email = lower(trim(coalesce(p_email, ''))),
      group_address = trim(coalesce(p_group_address, '')),
      group_city = trim(coalesce(p_group_city, '')),
      group_state = upper(trim(coalesce(p_group_state, ''))),
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

-- Inclui as novas colunas na barreira contra alterações diretas.
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

  if new.id <> old.id or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
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
    or new.group_address is distinct from old.group_address
    or new.group_city is distinct from old.group_city
    or new.group_state is distinct from old.group_state
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

create or replace function public.update_blocked_period_secure(
  p_request_id uuid,
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_block_reason text,
  p_audit_reason text
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
  if p_start_date > p_end_date then
    raise exception 'INVALID_BLOCK_PERIOD' using errcode = '22023';
  end if;
  if p_start_date < current_date - 30 or p_end_date > current_date + 3650 then
    raise exception 'BLOCK_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_block_reason, ''))) not between 5 and 500 then
    raise exception 'BLOCK_REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_audit_reason, ''))) not between 5 and 500 then
    raise exception 'AUDIT_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform 1 from public.blocked_periods where id = p_id for update;
  if not found then
    raise exception 'BLOCK_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', left(trim(p_audit_reason), 500), true);
  perform set_config('app.audit_request_id', coalesce(p_request_id, gen_random_uuid())::text, true);

  update public.blocked_periods
  set start_date = p_start_date,
      end_date = p_end_date,
      reason = trim(p_block_reason)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_customer_secure(uuid,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.update_customer_secure(uuid,uuid,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.create_reservation_secure(uuid,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,numeric,text,text) from public, anon;
revoke execute on function public.create_reservation_with_payment_secure(uuid,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,numeric,text,text,numeric,date,text,text,uuid) from public, anon;
revoke execute on function public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,text) from public, anon;
revoke execute on function public.update_blocked_period_secure(uuid,uuid,date,date,text,text) from public, anon;

grant execute on function public.create_customer_secure(uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.update_customer_secure(uuid,uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_reservation_secure(uuid,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,numeric,text,text) to authenticated;
grant execute on function public.create_reservation_with_payment_secure(uuid,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,numeric,text,text,numeric,date,text,text,uuid) to authenticated;
grant execute on function public.update_reservation_details_secure(uuid,uuid,timestamptz,uuid,text,text,text,text,text,text,text,date,date,integer,integer,text,text) to authenticated;
grant execute on function public.update_blocked_period_secure(uuid,uuid,date,date,text,text) to authenticated;

commit;

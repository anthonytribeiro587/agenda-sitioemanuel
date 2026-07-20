begin;

-- Parametrizações singleton do Agenda Sítio Emanuel.
create table if not exists public.app_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  default_package_name text not null default 'A definir'
    check (char_length(trim(default_package_name)) between 1 and 120),
  default_guests_estimated integer not null default 30
    check (default_guests_estimated between 1 and 500),
  default_status text not null default 'PRE_RESERVA'
    check (default_status in ('PRE_RESERVA', 'CONFIRMADA')),
  default_payment_method text not null default 'PIX'
    check (default_payment_method in ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO')),
  default_deposit_note text not null default 'Sinal da reserva'
    check (char_length(trim(default_deposit_note)) between 1 and 500),
  whatsapp_template text not null default
    'Olá, {responsavel}! Sobre a reserva de {periodo} no Sítio Emanuel para {igreja}. Qualquer dúvida, estamos à disposição.'
    check (char_length(trim(whatsapp_template)) between 10 and 1200),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

insert into public.app_settings(id)
values ('00000000-0000-0000-0000-000000000001'::uuid)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from public, anon, authenticated;

create or replace function public.get_app_settings_secure()
returns public.app_settings
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_settings public.app_settings;
begin
  if not public.is_active_staff((select auth.uid())) then
    raise exception 'STAFF_REQUIRED' using errcode = '42501';
  end if;

  select * into v_settings
  from public.app_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid;

  if not found then
    raise exception 'APP_SETTINGS_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_settings;
end;
$$;

create or replace function public.update_app_settings_secure(
  p_request_id uuid,
  p_default_package_name text,
  p_default_guests_estimated integer,
  p_default_status text,
  p_default_payment_method text,
  p_default_deposit_note text,
  p_whatsapp_template text
)
returns public.app_settings
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_old public.app_settings;
  v_new public.app_settings;
  v_user uuid := (select auth.uid());
begin
  if public.current_app_role() <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_default_package_name, ''))) not between 1 and 120 then
    raise exception 'INVALID_DEFAULT_PACKAGE' using errcode = '22023';
  end if;
  if p_default_guests_estimated not between 1 and 500 then
    raise exception 'INVALID_DEFAULT_GUESTS' using errcode = '22023';
  end if;
  if p_default_status not in ('PRE_RESERVA', 'CONFIRMADA') then
    raise exception 'INVALID_DEFAULT_STATUS' using errcode = '22023';
  end if;
  if p_default_payment_method not in ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO') then
    raise exception 'INVALID_DEFAULT_PAYMENT_METHOD' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_default_deposit_note, ''))) not between 1 and 500 then
    raise exception 'INVALID_DEFAULT_DEPOSIT_NOTE' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_whatsapp_template, ''))) not between 10 and 1200 then
    raise exception 'INVALID_WHATSAPP_TEMPLATE' using errcode = '22023';
  end if;

  select * into v_old
  from public.app_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  for update;

  update public.app_settings
  set
    default_package_name = trim(p_default_package_name),
    default_guests_estimated = p_default_guests_estimated,
    default_status = p_default_status,
    default_payment_method = p_default_payment_method,
    default_deposit_note = trim(p_default_deposit_note),
    whatsapp_template = trim(p_whatsapp_template),
    updated_by = v_user,
    updated_at = now()
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  returning * into v_new;

  insert into public.audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  values ('app_settings', v_new.id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), v_user);

  return v_new;
end;
$$;

-- Healthcheck mínimo: não consulta tabelas administrativas nem dados de negócio.
create or replace function public.agenda_healthcheck()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function public.get_app_settings_secure() from public, anon;
revoke execute on function public.update_app_settings_secure(uuid,text,integer,text,text,text,text) from public, anon;
revoke execute on function public.agenda_healthcheck() from public, anon, authenticated;

grant execute on function public.get_app_settings_secure() to authenticated;
grant execute on function public.update_app_settings_secure(uuid,text,integer,text,text,text,text) to authenticated;
grant execute on function public.agenda_healthcheck() to service_role;

commit;

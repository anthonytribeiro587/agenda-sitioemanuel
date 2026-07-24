begin;

-- Metadados do contrato base. O arquivo permanece em bucket privado e nunca recebe URL pública.
alter table public.app_settings
  add column if not exists contract_template_path text,
  add column if not exists contract_template_name text,
  add column if not exists contract_template_mime text,
  add column if not exists contract_template_size bigint,
  add column if not exists contract_template_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-templates',
  'contract-templates',
  false,
  4194304,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nenhuma policy de storage é criada: o navegador não acessa o bucket diretamente.
-- Upload, leitura temporária e remoção passam exclusivamente pela rota server-side.

create or replace function public.set_contract_template_metadata_secure(
  p_request_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
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
  if coalesce(p_path, '') !~ '^base/[0-9a-f-]+\.(pdf|docx)$' then
    raise exception 'INVALID_CONTRACT_TEMPLATE_PATH' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 180 then
    raise exception 'INVALID_CONTRACT_TEMPLATE_NAME' using errcode = '22023';
  end if;
  if p_mime is null or p_mime not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'INVALID_CONTRACT_TEMPLATE_MIME' using errcode = '22023';
  end if;
  if p_size is null or p_size not between 1 and 4194304 then
    raise exception 'INVALID_CONTRACT_TEMPLATE_SIZE' using errcode = '22023';
  end if;

  select * into v_old
  from public.app_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  for update;

  update public.app_settings
  set
    contract_template_path = p_path,
    contract_template_name = trim(p_name),
    contract_template_mime = p_mime,
    contract_template_size = p_size,
    contract_template_updated_at = now(),
    updated_by = v_user,
    updated_at = now()
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  returning * into v_new;

  insert into public.audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  values ('app_settings', v_new.id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new) || jsonb_build_object('_event', 'CONTRACT_TEMPLATE_ATTACHED'), v_user);

  return v_new;
end;
$$;

create or replace function public.clear_contract_template_metadata_secure(
  p_request_id uuid
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

  select * into v_old
  from public.app_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  for update;

  update public.app_settings
  set
    contract_template_path = null,
    contract_template_name = null,
    contract_template_mime = null,
    contract_template_size = null,
    contract_template_updated_at = null,
    updated_by = v_user,
    updated_at = now()
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  returning * into v_new;

  insert into public.audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  values ('app_settings', v_new.id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new) || jsonb_build_object('_event', 'CONTRACT_TEMPLATE_REMOVED'), v_user);

  return v_new;
end;
$$;

revoke execute on function public.set_contract_template_metadata_secure(uuid,text,text,text,bigint) from public, anon;
revoke execute on function public.clear_contract_template_metadata_secure(uuid) from public, anon;
grant execute on function public.set_contract_template_metadata_secure(uuid,text,text,text,bigint) to authenticated;
grant execute on function public.clear_contract_template_metadata_secure(uuid) to authenticated;

commit;

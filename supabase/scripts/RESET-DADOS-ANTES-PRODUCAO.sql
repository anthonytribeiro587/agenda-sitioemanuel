-- RESET ÚNICO DOS DADOS DE TESTE ANTES DA ENTRADA EM PRODUÇÃO
--
-- Execute manualmente no SQL Editor do Supabase.
-- Este script APAGA permanentemente os dados operacionais abaixo:
--   - pagamentos
--   - reservas
--   - clientes
--   - períodos bloqueados
--   - logs de auditoria gerados durante os testes
--
-- Este script PRESERVA:
--   - auth.users
--   - public.profiles
--   - public.app_settings
--   - estrutura do banco, RLS, funções, triggers e permissões
--
-- Não transforme este arquivo em migration automática. Ele deve ser executado
-- apenas uma vez, manualmente, imediatamente antes do uso real em produção.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Impede novas gravações nessas tabelas enquanto a limpeza é realizada.
lock table
  public.payments,
  public.reservations,
  public.customers,
  public.blocked_periods,
  public.audit_log
in access exclusive mode;

-- Todas as tabelas relacionadas são informadas explicitamente.
-- Não utilizamos CASCADE para evitar apagar qualquer tabela não prevista.
-- TRUNCATE também evita que os triggers de auditoria criem novos registros
-- durante esta limpeza administrativa.
truncate table
  public.payments,
  public.reservations,
  public.customers,
  public.blocked_periods,
  public.audit_log
restart identity;

-- A transação é cancelada se alguma tabela não tiver sido completamente limpa.
do $$
begin
  if exists (select 1 from public.payments limit 1)
     or exists (select 1 from public.reservations limit 1)
     or exists (select 1 from public.customers limit 1)
     or exists (select 1 from public.blocked_periods limit 1)
     or exists (select 1 from public.audit_log limit 1) then
    raise exception 'RESET_INCOMPLETO: a transação foi cancelada.';
  end if;
end;
$$;

commit;

-- Resultado esperado: todos os valores abaixo devem ser zero.
select
  (select count(*) from public.customers)       as clientes,
  (select count(*) from public.reservations)    as reservas,
  (select count(*) from public.payments)        as pagamentos,
  (select count(*) from public.blocked_periods) as periodos_bloqueados,
  (select count(*) from public.audit_log)       as registros_auditoria,
  (select count(*) from public.profiles)        as perfis_preservados,
  (select count(*) from public.app_settings)    as configuracoes_preservadas;

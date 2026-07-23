# Agenda Sítio Emanuel

Sistema interno para organizar reservas, clientes, pagamentos e disponibilidade do Sítio Emanuel.

## Fluxo principal

- a visão geral apresenta próximas reservas, pendências financeiras e datas bloqueadas;
- o calendário mensal destaca os fins de semana e mostra cada reserva por situação;
- ao clicar em qualquer data livre, o sistema sugere o período e abre o cadastro;
- o cadastro pode reutilizar um cliente existente ou receber um novo contato;
- a pré-reserva pode começar apenas com o sinal;
- o valor total pode ser preenchido depois da negociação;
- pagamentos posteriores atualizam o saldo automaticamente;
- períodos podem ser cadastrados, editados e removidos para manutenção ou uso interno;
- relatórios podem ser filtrados e exportados em CSV.

## Funcionalidades

- login privado com Supabase Auth;
- bootstrap controlado do primeiro administrador por e-mail previamente autorizado;
- dashboard compacto com indicadores operacionais;
- calendário mensal começando na segunda-feira e, no celular, abrindo no fim da semana;
- pré-reservas, reservas confirmadas, realizadas e períodos bloqueados;
- cadastro e reutilização de responsáveis, igrejas e clientes, incluindo endereço, cidade e UF;
- registro de sinal e demais pagamentos;
- valor total opcional até a negociação ser concluída;
- financeiro sem criar saldo artificial para reservas sem total definido;
- detalhes da reserva com resumo, financeiro, edição, histórico e impressão em PDF;
- relatórios por período e situação, com exportação CSV;
- prevenção de conflito de datas no Supabase e também no modo demonstração;
- RLS, auditoria e estrutura preparada para integração futura com Google Agenda.

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

O modo demonstração só funciona fora de produção e quando `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`. Em produção, a ausência do Supabase bloqueia o sistema em vez de abrir dados locais.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Execute, nesta ordem, as migrations:
   - `supabase/migrations/202607140001_initial_schema.sql`
   - `supabase/migrations/202607160002_security_hardening.sql`
   - `supabase/migrations/202607160003_security_audit_round2.sql`
   - `supabase/migrations/202607200004_app_settings.sql`
   - `supabase/migrations/202607230005_group_location_crud.sql`
3. Desative o cadastro público no Supabase Auth e crie a primeira usuária em **Authentication > Users**.
4. Cadastre na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
ADMIN_BOOTSTRAP_EMAILS=admin@exemplo.com
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
```

Na primeira entrada, somente um e-mail listado em `ADMIN_BOOTSTRAP_EMAILS` pode criar o primeiro perfil `ADMIN`. Depois disso, nenhum novo usuário autenticado recebe acesso automaticamente; ele precisa ser autorizado por um administrador.

## Segurança

As tabelas não aceitam acesso anônimo e as escritas do navegador foram removidas. Alterações passam por funções RPC com separação de funções, validação, concorrência e auditoria. Pagamentos não são apagados: lançamentos incorretos são anulados com motivo, mantendo a trilha financeira. Consulte `SECURITY-HARDENING.md`, `AUDITORIA-SEGURANCA-V5.md` e `ENTREGA-PRODUCAO-CRUD.md` antes de implantar.

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```

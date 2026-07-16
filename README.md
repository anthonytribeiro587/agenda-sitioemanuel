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
- períodos podem ser bloqueados para manutenção ou uso interno;
- relatórios podem ser filtrados e exportados em CSV.

## Funcionalidades

- login privado com Supabase Auth;
- criação automática do perfil administrativo do primeiro usuário autenticado;
- dashboard compacto com indicadores operacionais;
- calendário mensal começando na segunda-feira;
- pré-reservas, reservas confirmadas, realizadas e períodos bloqueados;
- cadastro e reutilização de responsáveis, igrejas e clientes;
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

Sem as variáveis do Supabase, o sistema utiliza o modo demonstração e salva os dados no navegador.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/202607140001_initial_schema.sql` no SQL Editor.
3. Crie a usuária em **Authentication > Users**.
4. Cadastre na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Na primeira entrada, a aplicação cria o vínculo da usuária autenticada em `profiles`. O primeiro perfil recebe a função `ADMIN`; perfis seguintes recebem `GESTOR`. Um perfil desativado não é reativado automaticamente.

## Segurança

As tabelas não aceitam acesso anônimo. Usuários autenticados só acessam os dados quando possuem um perfil ativo. A rota de criação do perfil valida a sessão e usa a `service_role` exclusivamente no servidor.

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```

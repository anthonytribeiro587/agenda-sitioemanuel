# Agenda Sítio Emanuel

Sistema interno para substituir o controle manual de reservas, clientes e pagamentos do Sítio Emanuel.

## Funcionalidades da primeira versão

- login privado com Supabase Auth;
- dashboard com pré-reservas, próximas reservas e saldo a receber;
- calendário mensal começando na segunda-feira;
- cadastro de reservas, responsáveis e igrejas;
- bloqueio de períodos;
- histórico de clientes;
- registro de sinal e demais pagamentos;
- cálculo automático de total pago e saldo;
- estrutura preparada para integração com Google Agenda;
- RLS, auditoria e prevenção de conflito de datas;
- modo demonstração quando o Supabase ainda não está conectado.

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem as variáveis do Supabase, use o botão **Entrar na demonstração**. Os dados de demonstração ficam no `localStorage` do navegador.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/202607140001_initial_schema.sql` no SQL Editor.
3. Crie a usuária em **Authentication > Users**.
4. Copie o UUID da usuária e execute:

```sql
insert into public.profiles (id, name, email, role)
values ('UUID_DA_USUARIA', 'Nome da responsável', 'email@exemplo.com', 'ADMIN');
```

5. Cadastre na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

## Segurança

As tabelas não aceitam acesso anônimo. Usuários autenticados só acessam os dados se estiverem ativos em `profiles`. A `service_role` nunca deve ser exposta no navegador.

## Validação

Antes do envio desta primeira versão foram executados:

```bash
npm run typecheck
npm run lint
npm run build
```

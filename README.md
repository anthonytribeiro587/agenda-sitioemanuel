# Agenda Sítio Emanuel

Sistema interno para substituir o calendário e o caderno usados no controle de reservas do Sítio Emanuel.

## Fluxo principal

- a agenda mensal é a tela inicial;
- sextas, sábados e domingos ficam destacados;
- ao selecionar um fim de semana livre, o formulário de pré-reserva abre ao lado;
- ao selecionar um período ocupado, aparecem contato, pessoas, cardápio, pagamentos e ações;
- a pré-reserva pode começar apenas com o sinal;
- o valor total confirmado pode ser preenchido depois da negociação;
- pagamentos posteriores atualizam o saldo automaticamente;
- períodos também podem ser bloqueados para manutenção ou uso interno.

## Funcionalidades

- login privado com Supabase Auth;
- criação automática do perfil administrativo do primeiro usuário autenticado;
- calendário mensal começando na segunda-feira;
- pré-reservas e reservas confirmadas dentro dos próprios dias;
- cadastro de responsáveis, igrejas e clientes;
- registro de sinal e demais pagamentos;
- valor total opcional até a negociação ser concluída;
- financeiro sem criar saldo artificial para reservas ainda sem total definido;
- bloqueio de períodos;
- RLS, auditoria e prevenção de conflito de datas;
- estrutura preparada para integração futura com Google Agenda.

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

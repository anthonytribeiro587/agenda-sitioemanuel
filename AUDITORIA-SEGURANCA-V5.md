# Auditoria de segurança — Agenda Sítio Emanuel V5

## Escopo revisado

- autenticação e bootstrap de perfis;
- permissões por função (`ADMIN`, `GESTOR`, `FINANCEIRO`, `LEITURA`);
- operações de clientes, reservas, pagamentos e bloqueios;
- proteção contra escrita direta pelo navegador;
- conflitos de datas e concorrência;
- exclusões e preservação de histórico;
- auditoria de alterações;
- validação de entrada;
- cabeçalhos HTTP e configuração de produção.

## Controles preservados

1. **Acesso anônimo bloqueado** nas tabelas operacionais.
2. **Escritas do navegador passam por RPCs `security definer`**, com `search_path` fixo e validação de perfil.
3. **RLS permanece ativa** e o usuário autenticado recebe apenas leitura direta das tabelas necessárias.
4. **Reservas ativas não podem se sobrepor** e reservas não podem ocupar períodos bloqueados.
5. **Concorrência otimista** usa `updated_at` para impedir que uma tela antiga sobrescreva uma alteração mais recente.
6. **Idempotência** protege operações de criação e pagamentos contra repetição acidental.
7. **Auditoria** registra inserções, alterações, exclusões, mudanças de situação e motivos administrativos.
8. **Pagamentos não são apagados**, apenas anulados com motivo.
9. **Exclusão de reserva é limitada** a duplicidade de pré-reserva recente, sem histórico financeiro e por administrador.
10. **Campos de localização** possuem validação no cliente e restrições no banco.

## Alterações desta entrega

- novas colunas de endereço, cidade e UF em clientes;
- fotografia histórica da localização em cada reserva;
- RPCs de clientes e reservas recriadas com os novos campos;
- nova RPC segura para edição de bloqueios;
- barreira de mutação de reservas atualizada para impedir alteração direta dos campos novos;
- privilégios das novas RPCs revogados de `public`/`anon` e concedidos somente a `authenticated`;
- mudança rápida de situação no calendário respeitando as transições permitidas por perfil;
- motivos obrigatórios para cancelamentos, correções administrativas, exclusões e edição de bloqueios.

## Matriz operacional

| Operação | ADMIN | GESTOR | FINANCEIRO | LEITURA |
|---|---:|---:|---:|---:|
| Consultar agenda e cadastros | Sim | Sim | Sim | Sim |
| Criar/editar cliente | Sim | Sim | Não | Não |
| Excluir cliente sem reservas | Sim | Não | Não | Não |
| Criar/editar reserva | Sim | Sim | Não | Não |
| Alterar situação no fluxo normal | Sim | Sim | Não | Não |
| Corrigir situação anterior | Sim, com motivo | Não | Não | Não |
| Excluir pré-reserva duplicada | Sim, com restrições | Não | Não | Não |
| Criar/editar/remover bloqueio | Sim | Sim | Não | Não |
| Alterar valores e pagamentos | Sim | Não | Sim | Não |

## Verificações antes da produção

- aplicar `202607230005_group_location_crud.sql` antes do novo front-end;
- confirmar cadastro público desativado no Supabase Auth;
- confirmar `NEXT_PUBLIC_ENABLE_DEMO_MODE=false`;
- revisar `ADMIN_BOOTSTRAP_EMAILS` e remover e-mails que não devam administrar;
- usar um `CRON_SECRET` longo e exclusivo;
- testar cada perfil com uma conta separada;
- executar `npm run check` em ambiente com acesso ao registro npm;
- conferir logs da Vercel e do Supabase após o primeiro teste de criação, edição, cancelamento e bloqueio.

## Limite desta revisão

A revisão foi feita sobre o código e as migrations entregues. Ela não substitui teste de invasão externo, varredura dinâmica contra a URL publicada ou conferência manual das configurações reais do projeto Supabase/Vercel.

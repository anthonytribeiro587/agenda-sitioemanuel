# Segurança — Agenda Sítio Emanuel

## Ordem obrigatória de implantação

1. Configure na Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` e `ADMIN_BOOTSTRAP_EMAILS`.
2. Execute no Supabase a migration `supabase/migrations/202607160002_security_hardening.sql` **antes** de publicar o novo front-end. O front-end passa a usar RPCs seguras criadas por essa migration.
3. No Supabase Auth, desative cadastro público e use convite/criação administrativa para novos usuários.
4. Ative MFA para contas `ADMIN` e `FINANCEIRO`.
5. Mantenha `NEXT_PUBLIC_ENABLE_DEMO_MODE=false` na produção.
6. Depois da migration, teste a matriz de perfis abaixo.

## Perfis e permissões

| Ação | ADMIN | GESTOR | FINANCEIRO | LEITURA |
|---|---:|---:|---:|---:|
| Consultar dados | Sim | Sim | Sim | Sim |
| Criar/editar clientes | Sim | Sim | Não | Não |
| Criar/editar/cancelar reservas | Sim | Sim | Não | Não |
| Alterar valor e registrar pagamento | Sim | Não | Sim | Não |
| Anular pagamento até 24h | Sim | Não | Sim | Não |
| Anular pagamento antigo | Sim | Não | Não | Não |
| Excluir pré-reserva duplicada recente e sem pagamento | Sim | Não | Não | Não |
| Administrar usuários | Sim | Não | Não | Não |
| Ler auditoria | Sim | Não | Não | Não |

## Controles implementados

- RLS com negação por padrão e leitura somente para perfis ativos.
- Escritas diretas removidas do navegador; alterações passam por RPCs com validação de função e perfil.
- Pagamentos formam um livro-razão imutável: não podem ser editados ou apagados; apenas anulados com motivo e responsável.
- Idempotência no registro de pagamentos para impedir duplicação por clique duplo/reenvio.
- Bloqueio de linha e conferência de saldo para impedir pagamentos concorrentes acima do total.
- Concorrência otimista em reservas por `updated_at`, evitando sobrescrever alteração feita em outra tela.
- Motivo obrigatório para cancelamento, exclusão e anulação.
- Auditoria imutável de perfis, clientes, reservas, pagamentos e bloqueios, com telefone/e-mail removidos do JSON de auditoria.
- Proteção do último administrador ativo.
- Bootstrap do primeiro administrador atômico e restrito a e-mail previamente autorizado.
- Produção falha fechada quando Supabase não está configurado; modo demo exige flag explícita e ambiente não produtivo.
- CSP, HSTS, anti-framing, `nosniff`, política de permissões e cache privado.
- Validação de entrada no cliente e novamente no banco.

## Testes mínimos após publicar

- Usuário sem perfil deve ser recusado mesmo que consiga autenticar no Supabase.
- `LEITURA` não consegue escrever usando a interface nem chamadas REST manuais.
- `GESTOR` não consegue alterar total ou pagamentos.
- `FINANCEIRO` não consegue editar dados/status de reserva.
- Pagamento duplicado com a mesma chave retorna o lançamento original.
- Dois pagamentos concorrentes não podem ultrapassar o saldo.
- Pagamento nunca desaparece fisicamente após anulação.
- Cancelamento sem motivo é recusado.
- Exclusão de reserva com pagamento ou mais de 24 horas é recusada.
- `/configuracoes`, `/relatorios` e demais páginas exigem sessão e perfil ativo.

## Operação segura

- Não compartilhe logins. Cada pessoa deve ter seu usuário.
- Revogue imediatamente usuários que saírem da operação.
- Rotacione `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` se houver suspeita de exposição.
- Revise a tabela `audit_log` periodicamente e antes de fechar o caixa.
- Não coloque segredos em código, screenshots, mensagens ou variáveis `NEXT_PUBLIC_*`.

# Entrega para produção — Agenda Sítio Emanuel

## O que foi concluído

- calendário mobile abre deslocado para o fim da semana, priorizando quinta a domingo;
- cada reserva mostra grupo, responsável e cidade/UF no calendário;
- formulário de reserva exige endereço, cidade e UF do grupo;
- a localização fica no cadastro do cliente e também gravada na reserva como histórico;
- ao tocar na reserva, é possível consultar dados, alterar a situação, abrir o WhatsApp, editar o cadastro e, quando permitido, excluir uma duplicidade;
- CRUD de clientes: cadastrar, consultar, editar e excluir pelo aplicativo;
- CRUD de reservas: cadastrar, consultar, editar e exclusão segura pelo aplicativo;
- CRUD de bloqueios: cadastrar, consultar, editar e remover pelo aplicativo;
- pagamentos continuam com inclusão e anulação auditada, sem exclusão destrutiva do histórico financeiro;
- busca de reservas e exportação CSV incluem cidade e endereço do grupo.

## Regra de exclusão segura

Uma reserva operacional não deve desaparecer do histórico. Por isso:

- pré-reserva duplicada pode ser excluída pelo administrador em até 24 horas, sem pagamentos e com motivo;
- demais reservas devem ser alteradas para **Cancelada**, preservando auditoria e histórico;
- clientes com reservas vinculadas não podem ser excluídos;
- pagamentos não são apagados: são anulados com motivo.

Isso mantém o CRUD no aplicativo sem permitir perda silenciosa de dados importantes.

## Publicação obrigatória

1. Faça backup do banco Supabase.
2. Execute todas as migrations que ainda não foram aplicadas, em ordem de nome.
3. A migration nova desta entrega é:
   - `supabase/migrations/202607230005_group_location_crud.sql`
4. Publique o código na Vercel somente depois de a migration concluir com sucesso.
5. Confirme que `NEXT_PUBLIC_ENABLE_DEMO_MODE=false` em produção.
6. Teste com cada perfil: `ADMIN`, `GESTOR`, `FINANCEIRO` e `LEITURA`.

## Checklist rápido de aceite

- criar cliente com endereço, cidade e UF;
- editar o cliente e confirmar que a ficha foi atualizada;
- criar pré-reserva pela agenda;
- confirmar que grupo, responsável e cidade aparecem no calendário;
- mudar Pré-reserva → Confirmada → Realizada;
- cancelar uma reserva informando o motivo;
- editar datas, contato e localização pela página da reserva;
- criar, editar e remover bloqueio de período;
- tentar criar reserva sobreposta e confirmar o bloqueio;
- conferir visual em iPhone/Android nas larguras 320, 375, 390 e 430 px;
- exportar o CSV e conferir endereço, cidade e UF.

## Comandos de validação

```bash
npm ci
npm run check
```

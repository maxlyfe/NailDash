-- ============================================================================
-- Limpeza única dos adiantamentos já gravados errado no banco.
--
-- O código antigo só fazia INSERT: editar o sinal, reconfirmar, cancelar ou
-- excluir o agendamento deixava linhas duplicadas/órfãs em `transactions`, que
-- continuavam somando no Fechamento para sempre.
--
-- O código novo (src/lib/advances.ts) já mantém a linha 1:1 com o agendamento.
-- Este script conserta o que ficou para trás.
--
-- COMO USAR
--   1. Rode a SEÇÃO 0 (auditoria) e confira os números.
--   2. Rode a SEÇÃO 1 dentro da transação. Confira o resultado da SEÇÃO 5.
--   3. COMMIT se estiver certo, ROLLBACK se não estiver.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- SEÇÃO 0 — Auditoria (só leitura, rode antes)
-- ─────────────────────────────────────────────────────────────────────────

-- 0.1 Quanto cada problema está inflando o total
select
  count(*) filter (where a.id is null)                      as orfas_agendamento_excluido,
  count(*) filter (where a.status = 'cancelled')            as de_agendamento_cancelado,
  coalesce(sum(t.total_amount) filter (where a.id is null or a.status = 'cancelled'), 0) as valor_inflado
from transactions t
left join appointments a on a.id = t.appointment_id
where t.category = 'adiantamento';

-- 0.2 Agendamentos com mais de uma linha de adiantamento (duplicatas de edição)
select
  t.appointment_id,
  count(*)                as qtd_linhas,
  sum(t.total_amount)     as somado_no_financeiro,
  max(a.advance_amount)   as valor_real_no_agendamento
from transactions t
join appointments a on a.id = t.appointment_id
where t.category = 'adiantamento'
group by t.appointment_id
having count(*) > 1
order by sum(t.total_amount) - max(a.advance_amount) desc;

-- 0.3 Divergências de valor/data entre agendamento e financeiro
select
  a.id,
  coalesce(c.name, a.client_name) as cliente,
  a.status,
  a.starts_at,
  a.advance_amount                as no_agendamento,
  coalesce(sum(t.total_amount), 0) as no_financeiro,
  count(t.id)                      as qtd_linhas
from appointments a
left join clients c on c.id = a.client_id
left join transactions t on t.appointment_id = a.id and t.category = 'adiantamento'
where a.advance_amount > 0 or t.id is not null
group by a.id, c.name, a.client_name, a.status, a.starts_at, a.advance_amount
having a.advance_amount <> coalesce(sum(t.total_amount), 0)
order by a.starts_at;


-- ─────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1 — Correção (rode dentro da transação e confira antes do COMMIT)
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- 1.1 Linhas órfãs: o agendamento foi excluído, o dinheiro ficou somando
delete from transactions t
where t.category = 'adiantamento'
  and t.appointment_id is not null
  and not exists (select 1 from appointments a where a.id = t.appointment_id);

-- 1.2 Linhas de agendamentos cancelados: não há turno futuro, não é adiantamento
delete from transactions t
using appointments a
where t.appointment_id = a.id
  and t.category = 'adiantamento'
  and a.status = 'cancelled';

-- 1.3 Duplicatas: mantém a linha mais antiga (preserva o registered_at real)
delete from transactions t
using (
  select id,
         row_number() over (partition by appointment_id order by created_at, id) as rn
  from transactions
  where category = 'adiantamento'
    and appointment_id is not null
) ranked
where t.id = ranked.id
  and ranked.rn > 1;

-- 1.4 Linhas que sobraram mas o sinal foi zerado no agendamento
delete from transactions t
using appointments a
where t.appointment_id = a.id
  and t.category = 'adiantamento'
  and coalesce(a.advance_amount, 0) <= 0;

-- 1.5 Alinha valor, forma de pagamento e data com o agendamento
--     (a data é o que conserta as remarcações que ficaram no mês errado).
--     O app agora decide mês/dia sempre em horário de Brasília — este UPDATE
--     copia `starts_at` direto, então a linha passa a seguir a mesma regra.
update transactions t
set total_amount     = a.advance_amount,
    transaction_date = a.starts_at,
    payment_pix      = case when coalesce(a.advance_payment_method, 'pix') = 'pix'      then a.advance_amount else 0 end,
    payment_cash     = case when a.advance_payment_method = 'cash'     then a.advance_amount else 0 end,
    payment_card     = case when a.advance_payment_method = 'card'     then a.advance_amount else 0 end,
    payment_transfer = case when a.advance_payment_method = 'transfer' then a.advance_amount else 0 end
from appointments a
where t.appointment_id = a.id
  and t.category = 'adiantamento'
  and a.advance_amount > 0;

-- 1.6 Agendamentos com sinal que nunca geraram linha no financeiro
insert into transactions (
  salon_id, type, appointment_id, client_id, professional_id, description,
  total_amount, service_price, discount, tax, tips, category,
  payment_pix, payment_cash, payment_card, payment_transfer,
  transaction_date, registered_at
)
select
  a.salon_id, 'sale', a.id, a.client_id, a.professional_id,
  'Adiantamento: ' || coalesce(c.name, a.client_name, 'Cliente'),
  a.advance_amount, 0, 0, 0, 0, 'adiantamento',
  case when coalesce(a.advance_payment_method, 'pix') = 'pix'      then a.advance_amount else 0 end,
  case when a.advance_payment_method = 'cash'     then a.advance_amount else 0 end,
  case when a.advance_payment_method = 'card'     then a.advance_amount else 0 end,
  case when a.advance_payment_method = 'transfer' then a.advance_amount else 0 end,
  a.starts_at,
  coalesce(a.advance_paid_at, a.created_at)
from appointments a
left join clients c on c.id = a.client_id
where a.advance_amount > 0
  and a.status <> 'cancelled'
  and not exists (
    select 1 from transactions t
    where t.appointment_id = a.id and t.category = 'adiantamento'
  );


-- ─────────────────────────────────────────────────────────────────────────
-- SEÇÃO 5 — Conferência: deve voltar ZERO linhas
-- ─────────────────────────────────────────────────────────────────────────

select
  a.id,
  coalesce(c.name, a.client_name) as cliente,
  a.starts_at,
  a.advance_amount                 as no_agendamento,
  coalesce(sum(t.total_amount), 0) as no_financeiro
from appointments a
left join clients c on c.id = a.client_id
left join transactions t on t.appointment_id = a.id and t.category = 'adiantamento'
where a.status <> 'cancelled'
group by a.id, c.name, a.client_name, a.starts_at, a.advance_amount
having a.advance_amount <> coalesce(sum(t.total_amount), 0);

-- commit;
-- rollback;


-- ============================================================================
-- SEÇÃO 6 — Realtime (rode uma vez, fora da transação acima)
--
-- Liga o Supabase Realtime nas duas tabelas para que a atualização automática
-- também funcione entre celular e computador. Sem isso, a tela só recalcula
-- dentro do próprio navegador (que já cobre o uso do dia a dia).
-- ============================================================================

alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.transactions;

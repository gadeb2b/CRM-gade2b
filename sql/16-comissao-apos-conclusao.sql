-- =========================================================
-- CRM — comissão visível ao vendedor só depois da data de conclusão (instalação/ativação)
-- Rodar uma única vez no Supabase (depois do 15): SQL Editor → New query → colar → Run
-- A regra fica em Financeiro → Configurações e começa ligada.
-- =========================================================

alter table public.configuracao_empresa
  add column if not exists comissao_apos_conclusao boolean not null default true;

-- "Minhas comissões": o vendedor vê só o próprio repasse, sem os valores que a empresa recebe,
-- e (se a regra estiver ligada) só depois de informada a conclusão do pedido
create or replace function public.minhas_comissoes()
returns table (
  id uuid, data_venda date, negocio_nome text, produto_nome text, quantidade int, parcela int, parcelas int,
  data_prevista date, situacao text, repasse_valor numeric, repasse_pago_em date, repasse_valor_pago numeric)
language sql stable security definer set search_path = '' as $$
  select r.id, r.data_venda, r.negocio_nome, r.produto_nome, r.quantidade, r.parcela, r.parcelas, r.data_prevista,
         case when r.repasse_pago_em is not null then 'pago'
              when r.status = 'recebido' then 'liberado'
              when r.status = 'previsto' then 'aguardando'
              else 'cancelado' end,
         r.repasse_valor, r.repasse_pago_em, r.repasse_valor_pago
    from public.recebimentos r
    left join public.configuracao_empresa c on c.empresa_id = r.empresa_id
   where r.vendedor_id = (select auth.uid()) and (select interno.eh_ativo()) and r.repasse_tipo <> 'nenhum'
     and r.empresa_id = (select interno.minha_empresa())
     and (not coalesce(c.comissao_apos_conclusao, true) or not r.data_estimada or r.repasse_pago_em is not null)
   order by r.data_prevista desc nulls last;
$$;
revoke execute on function public.minhas_comissoes() from public, anon;
grant execute on function public.minhas_comissoes() to authenticated;

notify pgrst, 'reload schema';

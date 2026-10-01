-- =========================================================
-- CRM — data de conclusão do pedido e regra de prazo quinzenal
-- Rodar uma única vez no Supabase (depois do 12): SQL Editor → New query → colar → Run
--
--  * Negócio ganha a "data de conclusão" (instalação/ativação), editável.
--  * Cada produto escolhe a regra de prazo: "dias" (X dias depois) ou "quinzenal"
--    (concluído do dia 1 ao 15 → recebe no próximo dia 30; do 16 ao 31 → no próximo dia 15).
--    Meses sem dia 30 usam o último dia do mês. Parcelas seguintes: mesmo dia dos meses seguintes.
--  * Sem data de conclusão, a data do recebimento é estimada a partir do dia em que virou Ganho.
--    Ao informar ou mudar a conclusão, os recebimentos ainda não recebidos são recalculados.
-- =========================================================

alter table public.negocios add column if not exists concluido_em date;

alter table public.produtos add column if not exists prazo_tipo text not null default 'dias'
  check (prazo_tipo in ('dias','quinzenal'));

alter table public.configuracao_empresa
  add column if not exists quinzena_corte int not null default 15 check (quinzena_corte between 1 and 30),
  add column if not exists quinzena_dia_1 int not null default 30 check (quinzena_dia_1 between 1 and 31),
  add column if not exists quinzena_dia_2 int not null default 15 check (quinzena_dia_2 between 1 and 31);

alter table public.recebimentos
  add column if not exists data_estimada boolean not null default false,
  add column if not exists prazo_tipo text not null default 'dias',
  add column if not exists prazo_dias int,
  add column if not exists intervalo_dias int not null default 30;

-- Recebimentos antigos: guarda a regra que foi usada (prazo em dias)
update public.recebimentos r
   set prazo_dias = greatest(0, (r.data_prevista - r.data_venda) - (r.parcela - 1) * r.intervalo_dias)
 where r.prazo_dias is null and r.data_prevista is not null and r.data_venda is not null;

-- ---------- Cálculo da data de pagamento ----------
-- Dia D do mês (ou o último dia, se o mês for menor)
create or replace function interno.dia_do_mes(p_ref date, p_dia int)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_ref)::int, extract(month from p_ref)::int,
                   least(p_dia, extract(day from (date_trunc('month', p_ref) + interval '1 month - 1 day'))::int));
$$;

create or replace function interno.calcular_data(p_base date, p_tipo text, p_prazo int, p_intervalo int, p_parcela int, p_empresa uuid)
returns date language plpgsql stable security definer set search_path = '' as $$
declare cfg public.configuracao_empresa; d int; primeira date;
begin
  if p_base is null then return null; end if;
  if coalesce(p_tipo, 'dias') <> 'quinzenal' then
    return p_base + coalesce(p_prazo, 30) + (p_parcela - 1) * coalesce(p_intervalo, 30);
  end if;
  select * into cfg from public.configuracao_empresa where empresa_id = p_empresa;
  d := case when extract(day from p_base) <= coalesce(cfg.quinzena_corte, 15) then coalesce(cfg.quinzena_dia_1, 30) else coalesce(cfg.quinzena_dia_2, 15) end;
  -- Próxima data com o dia D, depois da data base
  primeira := interno.dia_do_mes(p_base, d);
  if primeira <= p_base then primeira := interno.dia_do_mes((date_trunc('month', p_base) + interval '1 month')::date, d); end if;
  -- Parcelas seguintes: mesmo dia D nos meses seguintes
  return interno.dia_do_mes((date_trunc('month', primeira) + make_interval(months => p_parcela - 1))::date, d);
end;
$$;

-- ---------- Geração dos recebimentos, agora com a regra de prazo do produto ----------
create or replace function interno.gerar_recebimentos(p_negocio uuid, p_produto uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n   public.negocios;
  np  public.negocio_produtos;
  pr  public.produtos;
  cfg public.configuracao_empresa;
  pe  public.perfis;
  forn_nome text;
  total numeric(12,2);
  parc numeric(12,2);
  acumulado numeric(12,2) := 0;
  rep_total numeric(12,2);
  rep numeric(12,2);
  rep_acum numeric(12,2) := 0;
  rep_tipo text;
  regra_tipo text;
  regra_valor numeric(12,2);
  i int;
  base date;
  prazo_d int;
  intervalo_d int;
  tipo_prazo text;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.etapa <> 'ganho' or n.excluido_em is not null then return; end if;
  if exists (select 1 from public.recebimentos r where r.negocio_id = p_negocio and r.produto_id = p_produto
             and r.status in ('previsto','recebido')) then return; end if;
  select * into np from public.negocio_produtos where negocio_id = p_negocio and produto_id = p_produto;
  if not found then return; end if;
  select * into pr from public.produtos where id = p_produto;
  if not found then return; end if;
  select * into cfg from public.configuracao_empresa where empresa_id = n.empresa_id;
  select * into pe from public.perfis where user_id = n.user_id;
  select nome into forn_nome from public.fornecedores where id = pr.fornecedor_id;

  total := round(case pr.comissao_tipo when 'fixo' then pr.comissao_valor
                                       else pr.preco * pr.comissao_valor / 100 end * np.quantidade, 2);
  -- Regra mais específica do vendedor: fornecedor + categoria > só fornecedor > só categoria > padrão do vendedor
  select cv.tipo, cv.valor into regra_tipo, regra_valor
    from public.comissoes_vendedor cv
   where cv.vendedor_id = n.user_id and cv.empresa_id = n.empresa_id
     and ((cv.fornecedor_id = pr.fornecedor_id and lower(trim(cv.categoria)) = lower(trim(pr.categoria)) and trim(cv.categoria) <> '')
       or (cv.fornecedor_id = pr.fornecedor_id and trim(cv.categoria) = '')
       or (cv.fornecedor_id is null and trim(cv.categoria) <> '' and lower(trim(cv.categoria)) = lower(trim(pr.categoria))))
   order by (cv.fornecedor_id is not null)::int * 2 + (trim(cv.categoria) <> '')::int desc
   limit 1;
  if not found then
    regra_tipo := pe.comissao_tipo;
    regra_valor := coalesce(pe.comissao_valor, 0);
  end if;
  rep_tipo := case when pe.user_id is null or coalesce(regra_valor, 0) = 0 then 'nenhum' else regra_tipo end;
  rep_total := case rep_tipo when 'fixo' then round(regra_valor * np.quantidade, 2) else 0 end;
  base := coalesce(n.concluido_em, n.ganho_em, interno.hoje_sp());
  tipo_prazo := coalesce(pr.prazo_tipo, 'dias');
  prazo_d := coalesce(pr.comissao_prazo_dias, cfg.prazo_padrao_dias, 30);
  intervalo_d := coalesce(cfg.intervalo_parcelas_dias, 30);

  for i in 1 .. greatest(pr.comissao_parcelas, 1) loop
    if i < pr.comissao_parcelas then parc := round(total / pr.comissao_parcelas, 2); else parc := total - acumulado; end if;
    acumulado := acumulado + parc;
    if rep_tipo = 'percentual' then
      rep := round(parc * regra_valor / 100, 2);
    elsif rep_tipo = 'fixo' then
      if i < pr.comissao_parcelas then rep := round(rep_total / pr.comissao_parcelas, 2); else rep := rep_total - rep_acum; end if;
      rep_acum := rep_acum + rep;
    else
      rep := 0;
    end if;

    insert into public.recebimentos (
      empresa_id, negocio_id, negocio_nome, cliente_empresa, produto_id, produto_nome, fornecedor_id, fornecedor_nome,
      quantidade, parcela, parcelas, data_venda, valor_previsto, data_prevista, data_estimada, prazo_tipo, prazo_dias, intervalo_dias, status, revisar, observacao,
      vendedor_id, vendedor_nome, repasse_tipo, repasse_base, repasse_valor)
    values (
      n.empresa_id, n.id, coalesce(nullif(n.nome, ''), n.empresa), n.empresa, pr.id, pr.nome, pr.fornecedor_id, coalesce(forn_nome, ''),
      np.quantidade, i, pr.comissao_parcelas, coalesce(n.ganho_em, interno.hoje_sp()), parc,
      interno.calcular_data(base, tipo_prazo, prazo_d, intervalo_d, i, n.empresa_id), n.concluido_em is null, tipo_prazo, prazo_d, intervalo_d, 'previsto',
      total = 0, case when total = 0 then 'Comissão do produto não configurada no catálogo.' else '' end,
      n.user_id, coalesce(nullif(pe.nome, ''), pe.email, ''), rep_tipo,
      case rep_tipo when 'nenhum' then 0 else regra_valor end, rep);
  end loop;
end;
$$;




-- ---------- Ao informar ou mudar a data de conclusão, recalcula o que ainda não foi recebido ----------
create or replace function interno.conclusao_mudou()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.recebimentos r
     set data_prevista = interno.calcular_data(coalesce(new.concluido_em, new.ganho_em, r.data_venda), r.prazo_tipo, r.prazo_dias, r.intervalo_dias, r.parcela, r.empresa_id),
         data_estimada = new.concluido_em is null
   where r.negocio_id = new.id and r.status = 'previsto';
  return null;
end;
$$;
drop trigger if exists negocio_conclusao on public.negocios;
create trigger negocio_conclusao after update of concluido_em on public.negocios
  for each row when (old.concluido_em is distinct from new.concluido_em)
  execute function interno.conclusao_mudou();

revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

notify pgrst, 'reload schema';

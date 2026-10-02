-- =========================================================
-- CRM — produtos do negócio como "Base" (cliente já existente) ou "Fresh" (cliente novo)
-- Rodar uma única vez no Supabase (depois do 13): SQL Editor → New query → colar → Run
--
--  * Cada produto do negócio é marcado como base ou fresh (dá para misturar no mesmo negócio).
--  * Cada produto do catálogo pode ter um valor de comissão diferente para base.
--    Em branco, vale o mesmo valor do fresh. Forma de cálculo, parcelas e prazo são os mesmos.
--  * A comissão do vendedor não muda.
-- =========================================================

alter table public.negocio_produtos add column if not exists tipo_cliente text not null default 'fresh'
  check (tipo_cliente in ('fresh','base'));
alter table public.produtos add column if not exists comissao_valor_base numeric(12,2) check (comissao_valor_base >= 0);
alter table public.recebimentos add column if not exists tipo_cliente text not null default 'fresh';

-- Geração dos recebimentos usando o valor de base ou fresh
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
  valor_com numeric(12,2);
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

  -- Cliente da base usa o valor de comissão para base (se não houver, usa o mesmo do fresh)
  valor_com := case when np.tipo_cliente = 'base' then coalesce(pr.comissao_valor_base, pr.comissao_valor) else pr.comissao_valor end;
  total := round(case pr.comissao_tipo when 'fixo' then valor_com
                                       else pr.preco * valor_com / 100 end * np.quantidade, 2);
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
      quantidade, tipo_cliente, parcela, parcelas, data_venda, valor_previsto, data_prevista, data_estimada, prazo_tipo, prazo_dias, intervalo_dias, status, revisar, observacao,
      vendedor_id, vendedor_nome, repasse_tipo, repasse_base, repasse_valor)
    values (
      n.empresa_id, n.id, coalesce(nullif(n.nome, ''), n.empresa), n.empresa, pr.id, pr.nome, pr.fornecedor_id, coalesce(forn_nome, ''),
      np.quantidade, np.tipo_cliente, i, pr.comissao_parcelas, coalesce(n.ganho_em, interno.hoje_sp()), parc,
      interno.calcular_data(base, tipo_prazo, prazo_d, intervalo_d, i, n.empresa_id), n.concluido_em is null, tipo_prazo, prazo_d, intervalo_d, 'previsto',
      total = 0, case when total = 0 then 'Comissão do produto não configurada no catálogo.' else '' end,
      n.user_id, coalesce(nullif(pe.nome, ''), pe.email, ''), rep_tipo,
      case rep_tipo when 'nenhum' then 0 else regra_valor end, rep);
  end loop;
end;
$$;





-- Trocar base/fresh (ou a quantidade) de um produto já ganho refaz os recebimentos dele
create or replace function interno.negocio_produto_depois()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform interno.cancelar_recebimentos(old.negocio_id, old.produto_id,
      case when tg_op = 'DELETE' then 'produto retirado do negócio' else 'produto alterado (quantidade ou base/fresh)' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform interno.gerar_recebimentos(new.negocio_id, new.produto_id);
  end if;
  return null;
end;
$$;
drop trigger if exists negocio_produto_depois on public.negocio_produtos;
create trigger negocio_produto_depois after insert or delete or update of quantidade, tipo_cliente on public.negocio_produtos
  for each row execute function interno.negocio_produto_depois();

revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

notify pgrst, 'reload schema';

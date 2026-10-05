-- =========================================================
-- CRM — novo modelo de comissão do vendedor: % do preço do produto
-- Rodar uma única vez no Supabase (depois do 14): SQL Editor → New query → colar → Run
--
-- Modelos de comissão do vendedor:
--   percentual → % do que a empresa recebe do fornecedor
--   fixo       → R$ por produto vendido
--   preco      → % do preço do produto (preço do catálogo × quantidade)   ← novo
-- Nos três, o repasse só é liberado depois que a empresa recebe; com parcelas,
-- a comissão do vendedor é dividida igualmente entre elas.
-- =========================================================

-- Troca as validações antigas (que só aceitavam percentual/fixo) pelas novas
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabela, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.perfis'::regclass, 'public.comissoes_vendedor'::regclass,
                          'public.configuracao_empresa'::regclass, 'public.recebimentos'::regclass)
       and pg_get_constraintdef(c.oid) ilike '%''fixo''%'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end;
$$;

alter table public.perfis add constraint perfis_comissao_tipo_ok
  check (comissao_tipo in ('percentual','fixo','preco'));
alter table public.comissoes_vendedor add constraint comissoes_vendedor_tipo_ok
  check (tipo in ('percentual','fixo','preco') and (tipo = 'fixo' or valor <= 100));
alter table public.configuracao_empresa add constraint configuracao_empresa_tipo_ok
  check (vendedor_comissao_tipo in ('percentual','fixo','preco'));
alter table public.recebimentos add constraint recebimentos_repasse_tipo_ok
  check (repasse_tipo in ('percentual','fixo','preco','nenhum'));

create or replace function public.definir_comissao_usuario(alvo uuid, tipo text, valor numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  if not exists (select 1 from public.perfis where user_id = alvo and empresa_id = interno.minha_empresa()) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;
  if tipo not in ('percentual','fixo','preco') or valor < 0 or (tipo <> 'fixo' and valor > 100) then
    raise exception 'Valor de comissão inválido.';
  end if;
  update public.perfis set comissao_tipo = tipo, comissao_valor = valor where user_id = alvo;
end;
$$;

-- Geração dos recebimentos com o novo modelo
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
  rep_total := case rep_tipo when 'fixo' then round(regra_valor * np.quantidade, 2)
                             when 'preco' then round(pr.preco * np.quantidade * regra_valor / 100, 2) else 0 end;
  base := coalesce(n.concluido_em, n.ganho_em, interno.hoje_sp());
  tipo_prazo := coalesce(pr.prazo_tipo, 'dias');
  prazo_d := coalesce(pr.comissao_prazo_dias, cfg.prazo_padrao_dias, 30);
  intervalo_d := coalesce(cfg.intervalo_parcelas_dias, 30);

  for i in 1 .. greatest(pr.comissao_parcelas, 1) loop
    if i < pr.comissao_parcelas then parc := round(total / pr.comissao_parcelas, 2); else parc := total - acumulado; end if;
    acumulado := acumulado + parc;
    if rep_tipo = 'percentual' then
      rep := round(parc * regra_valor / 100, 2);
    elsif rep_tipo in ('fixo', 'preco') then
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






revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

notify pgrst, 'reload schema';

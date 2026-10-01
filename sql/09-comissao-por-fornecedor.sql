-- =========================================================
-- CRM Gade2B — comissão de cada vendedor por fornecedor e/ou categoria
-- Rodar uma única vez no Supabase (depois do 08): SQL Editor → New query → colar → Run
--
-- Ordem de prioridade na hora da venda:
--   1. regra do vendedor para fornecedor + categoria
--   2. regra do vendedor só para o fornecedor
--   3. regra do vendedor só para a categoria (de qualquer fornecedor)
--   4. comissão padrão do vendedor
-- =========================================================

create table if not exists public.comissoes_vendedor (
  id             uuid primary key default gen_random_uuid(),
  vendedor_id    uuid not null references auth.users(id) on delete cascade,
  fornecedor_id  uuid references public.fornecedores(id) on delete cascade,
  categoria      text not null default '',
  tipo           text not null default 'percentual' check (tipo in ('percentual','fixo')),
  valor          numeric(12,2) not null default 0 check (valor >= 0),
  criado_em      timestamptz not null default now(),
  check (fornecedor_id is not null or trim(categoria) <> ''),
  check (tipo <> 'percentual' or valor <= 100)
);
create unique index if not exists comissoes_vendedor_unica
  on public.comissoes_vendedor (vendedor_id, coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(categoria)));

alter table public.comissoes_vendedor enable row level security;
create policy "admins veem" on public.comissoes_vendedor for select to authenticated using ((select interno.eh_admin()));
create policy "admins criam" on public.comissoes_vendedor for insert to authenticated with check ((select interno.eh_admin()));
create policy "admins alteram" on public.comissoes_vendedor for update to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "admins apagam" on public.comissoes_vendedor for delete to authenticated using ((select interno.eh_admin()));
revoke all on public.comissoes_vendedor from anon;
grant select, insert, update, delete on public.comissoes_vendedor to authenticated;

-- A comissão padrão de cada vendedor agora pode ser definida por admins (antes só super admin)
create or replace function public.definir_comissao_usuario(alvo uuid, tipo text, valor numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  if tipo not in ('percentual','fixo') or valor < 0 or (tipo = 'percentual' and valor > 100) then
    raise exception 'Valor de comissão inválido.';
  end if;
  update public.perfis set comissao_tipo = tipo, comissao_valor = valor where user_id = alvo;
end;
$$;

-- Geração dos recebimentos, agora usando as regras por fornecedor/categoria
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
  inicio date;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.etapa <> 'ganho' or n.excluido_em is not null then return; end if;
  if exists (select 1 from public.recebimentos r where r.negocio_id = p_negocio and r.produto_id = p_produto
             and r.status in ('previsto','recebido')) then return; end if;
  select * into np from public.negocio_produtos where negocio_id = p_negocio and produto_id = p_produto;
  if not found then return; end if;
  select * into pr from public.produtos where id = p_produto;
  if not found then return; end if;
  select * into cfg from public.configuracao_empresa where id = 1;
  select * into pe from public.perfis where user_id = n.user_id;
  select nome into forn_nome from public.fornecedores where id = pr.fornecedor_id;

  total := round(case pr.comissao_tipo when 'fixo' then pr.comissao_valor
                                       else pr.preco * pr.comissao_valor / 100 end * np.quantidade, 2);
  -- Regra mais específica do vendedor: fornecedor + categoria > só fornecedor > só categoria > padrão do vendedor
  select cv.tipo, cv.valor into regra_tipo, regra_valor
    from public.comissoes_vendedor cv
   where cv.vendedor_id = n.user_id
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
  inicio := coalesce(n.ganho_em, interno.hoje_sp()) + coalesce(pr.comissao_prazo_dias, cfg.prazo_padrao_dias, 30);

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
      negocio_id, negocio_nome, cliente_empresa, produto_id, produto_nome, fornecedor_id, fornecedor_nome,
      quantidade, parcela, parcelas, data_venda, valor_previsto, data_prevista, status, revisar, observacao,
      vendedor_id, vendedor_nome, repasse_tipo, repasse_base, repasse_valor)
    values (
      n.id, coalesce(nullif(n.nome, ''), n.empresa), n.empresa, pr.id, pr.nome, pr.fornecedor_id, coalesce(forn_nome, ''),
      np.quantidade, i, pr.comissao_parcelas, coalesce(n.ganho_em, interno.hoje_sp()), parc,
      inicio + (i - 1) * coalesce(cfg.intervalo_parcelas_dias, 30), 'previsto',
      total = 0, case when total = 0 then 'Comissão do produto não configurada no catálogo.' else '' end,
      n.user_id, coalesce(nullif(pe.nome, ''), pe.email, ''), rep_tipo,
      case rep_tipo when 'nenhum' then 0 else regra_valor end, rep);
  end loop;
end;
$$;


revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp() to authenticated;

notify pgrst, 'reload schema';

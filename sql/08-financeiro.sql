-- =========================================================
-- CRM Gade2B — financeiro: comissões, recebimentos e repasses
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
--
-- Como funciona:
--  * Cada produto tem a comissão que a Gade2B recebe do fornecedor
--    (valor fixo ou % do preço), dividida em N parcelas, com prazo.
--  * Quando um negócio vai para "Ganho", o banco cria os recebimentos
--    previstos (um por produto e parcela), congelando os valores.
--  * Cada recebimento já traz o repasse do vendedor responsável
--    (% do que a Gade2B recebe ou valor fixo por produto). O repasse
--    só fica liberado depois que o recebimento é marcado como recebido.
--  * Se o negócio sai de "Ganho" ou vai para a lixeira, o que ainda
--    não foi recebido é cancelado e o que já foi recebido fica para revisão.
-- =========================================================

-- ---------- Comissão nos produtos ----------
alter table public.produtos
  add column if not exists comissao_tipo     text not null default 'fixo' check (comissao_tipo in ('fixo','percentual')),
  add column if not exists comissao_valor    numeric(12,2) not null default 0,
  add column if not exists comissao_parcelas int not null default 1 check (comissao_parcelas between 1 and 36),
  add column if not exists comissao_prazo_dias int check (comissao_prazo_dias between 0 and 730);

-- ---------- Quantidade de cada produto no negócio ----------
alter table public.negocio_produtos
  add column if not exists quantidade int not null default 1 check (quantidade between 1 and 9999);

-- ---------- Data em que o negócio foi ganho ----------
alter table public.negocios add column if not exists ganho_em date;
update public.negocios set ganho_em = etapa_desde where etapa = 'ganho' and ganho_em is null;

-- ---------- Comissão de cada vendedor ----------
alter table public.perfis
  add column if not exists comissao_tipo  text not null default 'percentual' check (comissao_tipo in ('percentual','fixo')),
  add column if not exists comissao_valor numeric(12,2) not null default 0;

-- ---------- Configurações financeiras da empresa (uma linha só) ----------
create table if not exists public.configuracao_empresa (
  id                       int primary key default 1 check (id = 1),
  vendedor_comissao_tipo   text not null default 'percentual' check (vendedor_comissao_tipo in ('percentual','fixo')),
  vendedor_comissao_valor  numeric(12,2) not null default 0,
  prazo_padrao_dias        int not null default 30 check (prazo_padrao_dias between 0 and 730),
  intervalo_parcelas_dias  int not null default 30 check (intervalo_parcelas_dias between 1 and 365),
  atualizado_em            timestamptz not null default now()
);
insert into public.configuracao_empresa (id) values (1) on conflict (id) do nothing;

alter table public.configuracao_empresa enable row level security;
create policy "ativos veem" on public.configuracao_empresa for select to authenticated using ((select interno.eh_ativo()));
create policy "admins alteram" on public.configuracao_empresa for update to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
revoke all on public.configuracao_empresa from anon;
grant select, update on public.configuracao_empresa to authenticated;

-- Usuários novos já nascem com a comissão padrão da empresa
create or replace function interno.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.configuracao_empresa;
begin
  select * into cfg from public.configuracao_empresa where id = 1;
  insert into public.perfis (user_id, email, nome, comissao_tipo, comissao_valor)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(cfg.vendedor_comissao_tipo, 'percentual'), coalesce(cfg.vendedor_comissao_valor, 0))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------- Recebimentos (entradas) e repasses (comissão do vendedor) ----------
create table if not exists public.recebimentos (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          uuid references public.negocios(id) on delete set null,
  negocio_nome        text not null default '',
  cliente_empresa     text not null default '',
  produto_id          uuid references public.produtos(id) on delete set null,
  produto_nome        text not null default '',
  fornecedor_id       uuid references public.fornecedores(id) on delete set null,
  fornecedor_nome     text not null default '',
  quantidade          int not null default 1,
  parcela             int not null default 1,
  parcelas            int not null default 1,
  data_venda          date,
  valor_previsto      numeric(12,2) not null default 0,
  data_prevista       date,
  valor_recebido      numeric(12,2),
  data_recebimento    date,
  status              text not null default 'previsto' check (status in ('previsto','recebido','estornado','cancelado')),
  revisar             boolean not null default false,
  observacao          text not null default '',
  vendedor_id         uuid references auth.users(id) on delete set null,
  vendedor_nome       text not null default '',
  repasse_tipo        text not null default 'nenhum' check (repasse_tipo in ('percentual','fixo','nenhum')),
  repasse_base        numeric(12,2) not null default 0,
  repasse_valor       numeric(12,2) not null default 0,
  repasse_pago_em     date,
  repasse_valor_pago  numeric(12,2),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists recebimentos_negocio_idx  on public.recebimentos (negocio_id, produto_id);
create index if not exists recebimentos_prevista_idx on public.recebimentos (data_prevista);
create index if not exists recebimentos_vendedor_idx on public.recebimentos (vendedor_id);

alter table public.recebimentos enable row level security;
create policy "admins veem" on public.recebimentos for select to authenticated using ((select interno.eh_admin()));
create policy "admins criam" on public.recebimentos for insert to authenticated with check ((select interno.eh_admin()));
create policy "admins alteram" on public.recebimentos for update to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "admins apagam" on public.recebimentos for delete to authenticated using ((select interno.eh_admin()));
revoke all on public.recebimentos from anon;
grant select, insert, update, delete on public.recebimentos to authenticated;

-- ---------- Funções internas ----------
create or replace function interno.hoje_sp()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Cria os recebimentos de um produto de um negócio ganho (se ainda não existirem)
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
  rep_tipo := case when pe.user_id is null or coalesce(pe.comissao_valor, 0) = 0 then 'nenhum' else pe.comissao_tipo end;
  rep_total := case rep_tipo when 'fixo' then round(pe.comissao_valor * np.quantidade, 2) else 0 end;
  inicio := coalesce(n.ganho_em, interno.hoje_sp()) + coalesce(pr.comissao_prazo_dias, cfg.prazo_padrao_dias, 30);

  for i in 1 .. greatest(pr.comissao_parcelas, 1) loop
    if i < pr.comissao_parcelas then parc := round(total / pr.comissao_parcelas, 2); else parc := total - acumulado; end if;
    acumulado := acumulado + parc;
    if rep_tipo = 'percentual' then
      rep := round(parc * pe.comissao_valor / 100, 2);
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
      case rep_tipo when 'nenhum' then 0 else pe.comissao_valor end, rep);
  end loop;
end;
$$;

-- Cancela o que ainda não foi recebido; o que já foi recebido fica para revisão
create or replace function interno.cancelar_recebimentos(p_negocio uuid, p_produto uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.recebimentos
     set status = 'cancelado',
         observacao = trim(both ' ' from observacao || ' Cancelado automaticamente: ' || p_motivo || '.')
   where negocio_id = p_negocio and (p_produto is null or produto_id = p_produto) and status = 'previsto';
  update public.recebimentos
     set revisar = true,
         observacao = trim(both ' ' from observacao || ' Atenção: ' || p_motivo || ' depois do recebimento.')
   where negocio_id = p_negocio and (p_produto is null or produto_id = p_produto) and status = 'recebido' and not revisar;
end;
$$;

-- Marca a data em que o negócio foi ganho
create or replace function interno.negocio_antes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.etapa = 'ganho' and (tg_op = 'INSERT' or old.etapa <> 'ganho') then
    new.ganho_em := interno.hoje_sp();
  end if;
  return new;
end;
$$;

-- Gera ou cancela recebimentos quando o negócio entra ou sai de "Ganho" (ou da lixeira)
create or replace function interno.negocio_depois()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ativo_antes boolean := tg_op = 'UPDATE' and old.etapa = 'ganho' and old.excluido_em is null;
  ativo_agora boolean := new.etapa = 'ganho' and new.excluido_em is null;
  r record;
begin
  if ativo_agora and not ativo_antes then
    for r in select produto_id from public.negocio_produtos where negocio_id = new.id loop
      perform interno.gerar_recebimentos(new.id, r.produto_id);
    end loop;
  elsif ativo_antes and not ativo_agora then
    perform interno.cancelar_recebimentos(new.id, null,
      case when new.excluido_em is not null then 'negócio enviado para a lixeira' else 'negócio saiu de Ganho' end);
  end if;
  return null;
end;
$$;

-- Acompanha produtos adicionados, removidos ou com quantidade alterada em negócios ganhos
create or replace function interno.negocio_produto_depois()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform interno.cancelar_recebimentos(old.negocio_id, old.produto_id,
      case when tg_op = 'DELETE' then 'produto retirado do negócio' else 'quantidade alterada' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform interno.gerar_recebimentos(new.negocio_id, new.produto_id);
  end if;
  return null;
end;
$$;

-- Recalcula o repasse quando o valor recebido muda e preenche dados ao dar baixa
create or replace function interno.recebimento_antes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'recebido' then
    new.valor_recebido := coalesce(new.valor_recebido, new.valor_previsto);
    new.data_recebimento := coalesce(new.data_recebimento, interno.hoje_sp());
  elsif new.status = 'previsto' then
    new.valor_recebido := null;
    new.data_recebimento := null;
  end if;
  if new.repasse_tipo = 'percentual' and new.repasse_pago_em is null then
    new.repasse_valor := round(coalesce(new.valor_recebido, new.valor_previsto) * new.repasse_base / 100, 2);
  end if;
  if new.repasse_pago_em is not null and new.repasse_valor_pago is null then
    new.repasse_valor_pago := new.repasse_valor;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists negocio_antes on public.negocios;
create trigger negocio_antes before insert or update of etapa on public.negocios
  for each row execute function interno.negocio_antes();
drop trigger if exists negocio_depois on public.negocios;
create trigger negocio_depois after insert or update of etapa, excluido_em on public.negocios
  for each row execute function interno.negocio_depois();
drop trigger if exists negocio_produto_depois on public.negocio_produtos;
create trigger negocio_produto_depois after insert or delete or update of quantidade on public.negocio_produtos
  for each row execute function interno.negocio_produto_depois();
drop trigger if exists recebimento_antes on public.recebimentos;
create trigger recebimento_antes before update on public.recebimentos
  for each row execute function interno.recebimento_antes();

-- ---------- Ações chamadas pela tela ----------

-- Gera recebimentos de negócios ganhos que ainda não têm (ex.: vendas antigas)
create or replace function public.gerar_recebimentos_pendentes()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; antes int; depois int;
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  select count(*) into antes from public.recebimentos;
  for r in select np.negocio_id, np.produto_id from public.negocio_produtos np
           join public.negocios n on n.id = np.negocio_id
           where n.etapa = 'ganho' and n.excluido_em is null loop
    perform interno.gerar_recebimentos(r.negocio_id, r.produto_id);
  end loop;
  select count(*) into depois from public.recebimentos;
  return depois - antes;
end;
$$;

-- Comissão de um usuário (só super admin)
create or replace function public.definir_comissao_usuario(alvo uuid, tipo text, valor numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_super() then raise exception 'Apenas o super admin pode fazer isso.'; end if;
  if tipo not in ('percentual','fixo') or valor < 0 or (tipo = 'percentual' and valor > 100) then
    raise exception 'Valor de comissão inválido.';
  end if;
  update public.perfis set comissao_tipo = tipo, comissao_valor = valor where user_id = alvo;
end;
$$;

-- "Minhas comissões": o vendedor vê só o próprio repasse, sem os valores que a Gade2B recebe
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
   where r.vendedor_id = (select auth.uid()) and (select interno.eh_ativo()) and r.repasse_tipo <> 'nenhum'
   order by r.data_prevista desc nulls last;
$$;

revoke execute on function public.gerar_recebimentos_pendentes(), public.definir_comissao_usuario(uuid, text, numeric), public.minhas_comissoes() from public, anon;
grant execute on function public.gerar_recebimentos_pendentes(), public.definir_comissao_usuario(uuid, text, numeric), public.minhas_comissoes() to authenticated;
revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp() to authenticated;

notify pgrst, 'reload schema';

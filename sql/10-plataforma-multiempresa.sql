-- =========================================================
-- CRM — plataforma para várias empresas (white label)
-- Rodar uma única vez no Supabase (depois do 09): SQL Editor → New query → colar → Run
--
--  * Cria a tabela de empresas. Todos os dados atuais passam a ser da empresa "Gade2B".
--  * Toda tabela ganha a coluna empresa_id, e as regras de segurança passam a
--    separar as empresas: ninguém enxerga dados de outra empresa.
--  * Usuários novos entram por link de convite da empresa.
--  * O dono da plataforma (você) ganha um painel para criar e gerenciar empresas.
--
-- Confira perto do fim se o e-mail do dono da plataforma é o seu e-mail de login.
-- =========================================================

-- ---------- Empresas ----------
create table if not exists public.empresas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  status          text not null default 'ativa' check (status in ('ativa','bloqueada')),
  logo_url        text not null default '',
  cor_primaria    text not null default '#1FA56A' check (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_secundaria  text not null default '#D8AE48' check (cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  dominio         text not null default '',
  codigo_convite  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
  codigo_admin    text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
  criado_em       timestamptz not null default now()
);

-- Quem administra a plataforma inteira (dono do sistema)
create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.plataforma_admins enable row level security;
revoke all on public.plataforma_admins from anon, authenticated;

-- A primeira empresa: Gade2B, com todos os dados atuais
insert into public.empresas (nome, slug, logo_url, dominio)
select 'Gade2B', 'gade2b', '', 'crm.gade2b.com.br'
where not exists (select 1 from public.empresas where slug = 'gade2b');

-- ---------- empresa_id em todas as tabelas ----------
do $$
declare t text; gade uuid := (select id from public.empresas where slug = 'gade2b');
begin
  foreach t in array array['perfis','fornecedores','produtos','tipos_mensagem','modelos_produto','negocios',
                           'negocio_produtos','interacoes','configuracoes','recebimentos','comissoes_vendedor']
  loop
    execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id) on delete cascade', t);
    execute format('update public.%I set empresa_id = %L where empresa_id is null', t, gade);
    execute format('create index if not exists %I on public.%I (empresa_id)', t || '_empresa_idx', t);
  end loop;
end;
$$;

-- Configuração financeira: deixa de ser "uma linha só" e passa a ser uma por empresa
alter table public.configuracao_empresa drop constraint if exists configuracao_empresa_id_check;
alter table public.configuracao_empresa drop constraint if exists configuracao_empresa_pkey;
alter table public.configuracao_empresa add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
update public.configuracao_empresa set empresa_id = (select id from public.empresas where slug = 'gade2b') where empresa_id is null;
alter table public.configuracao_empresa drop column if exists id;
alter table public.configuracao_empresa alter column empresa_id set not null;
alter table public.configuracao_empresa add primary key (empresa_id);

-- ---------- Funções de permissão ----------
create or replace function interno.minha_empresa()
returns uuid language sql stable security definer set search_path = '' as $$
  select empresa_id from public.perfis where user_id = (select auth.uid());
$$;

create or replace function interno.papel_ativo()
returns text language sql stable security definer set search_path = '' as $$
  select p.papel from public.perfis p join public.empresas e on e.id = p.empresa_id
   where p.user_id = (select auth.uid()) and p.status = 'ativo' and e.status = 'ativa';
$$;

create or replace function interno.eh_plataforma()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plataforma_admins where user_id = (select auth.uid()));
$$;

-- Daqui em diante, dados novos já nascem com a empresa de quem está logado
do $$
declare t text;
begin
  foreach t in array array['fornecedores','produtos','tipos_mensagem','modelos_produto','negocios',
                           'negocio_produtos','interacoes','configuracoes','recebimentos','comissoes_vendedor']
  loop
    execute format('alter table public.%I alter column empresa_id set default interno.minha_empresa()', t);
    execute format('alter table public.%I alter column empresa_id set not null', t);
  end loop;
end;
$$;

-- ---------- Regras de segurança: refeitas com a separação por empresa ----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('perfis','fornecedores','produtos','tipos_mensagem','modelos_produto','negocios',
                             'negocio_produtos','interacoes','configuracoes','recebimentos','comissoes_vendedor','configuracao_empresa')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

-- Perfis: cada um vê o seu; admins veem os da própria empresa
create policy "ver perfis" on public.perfis for select to authenticated
  using (user_id = (select auth.uid()) or ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa())));

-- Catálogo e cadastros: todos os ativos da empresa usam, admins da empresa editam
do $$
declare t text;
begin
  foreach t in array array['fornecedores','produtos','tipos_mensagem','modelos_produto']
  loop
    execute format('create policy "empresa ve" on public.%I for select to authenticated using ((select interno.eh_ativo()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin cria" on public.%I for insert to authenticated with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin altera" on public.%I for update to authenticated using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa())) with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin apaga" on public.%I for delete to authenticated using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
  end loop;
  foreach t in array array['recebimentos','comissoes_vendedor']
  loop
    execute format('create policy "empresa admin ve" on public.%I for select to authenticated using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin cria" on public.%I for insert to authenticated with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin altera" on public.%I for update to authenticated using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa())) with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
    execute format('create policy "empresa admin apaga" on public.%I for delete to authenticated using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))', t);
  end loop;
end;
$$;

-- Negócios: vendedor vê os seus; admins veem todos da empresa
create policy "ver negocios" on public.negocios for select to authenticated
  using (empresa_id = (select interno.minha_empresa()) and ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid()))));
create policy "criar negocios" on public.negocios for insert to authenticated
  with check (empresa_id = (select interno.minha_empresa()) and ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid()))));
create policy "alterar negocios" on public.negocios for update to authenticated
  using (empresa_id = (select interno.minha_empresa()) and ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid()))))
  with check (empresa_id = (select interno.minha_empresa()) and ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid()))));
create policy "apagar negocios" on public.negocios for delete to authenticated
  using (empresa_id = (select interno.minha_empresa()) and (select interno.eh_admin()));

-- Produtos do negócio e histórico seguem o acesso ao negócio
do $$
declare t text;
begin
  foreach t in array array['negocio_produtos','interacoes']
  loop
    execute format($f$
      create policy "segue o negocio" on public.%I for all to authenticated
      using ((select interno.eh_ativo()) and empresa_id = (select interno.minha_empresa()) and exists (
        select 1 from public.negocios n where n.id = negocio_id
          and ((select interno.eh_admin()) or n.user_id = (select auth.uid()))))
      with check ((select interno.eh_ativo()) and empresa_id = (select interno.minha_empresa()) and exists (
        select 1 from public.negocios n where n.id = negocio_id
          and ((select interno.eh_admin()) or n.user_id = (select auth.uid()))))
    $f$, t);
  end loop;
end;
$$;

create policy "propria configuracao" on public.configuracoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "empresa ve" on public.configuracao_empresa for select to authenticated
  using ((select interno.eh_ativo()) and empresa_id = (select interno.minha_empresa()));
create policy "empresa admin altera" on public.configuracao_empresa for update to authenticated
  using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))
  with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()));

-- Empresas: cada usuário vê a própria; só a plataforma altera diretamente
alter table public.empresas enable row level security;
create policy "ver propria empresa" on public.empresas for select to authenticated
  using (id = (select interno.minha_empresa()) or (select interno.eh_plataforma()));
revoke all on public.empresas from anon;
grant select on public.empresas to authenticated;

-- ---------- Cadastro: o link de convite decide a empresa ----------
create or replace function interno.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  codigo text := nullif(trim(new.raw_user_meta_data->>'convite'), '');
  emp public.empresas;
  admin boolean := false;
  cfg public.configuracao_empresa;
begin
  if codigo is not null then
    select * into emp from public.empresas where codigo_convite = codigo and status = 'ativa';
    if not found then
      select * into emp from public.empresas where codigo_admin = codigo and status = 'ativa';
      admin := found;
    end if;
  end if;
  if emp.id is not null then
    select * into cfg from public.configuracao_empresa where empresa_id = emp.id;
  end if;
  insert into public.perfis (user_id, email, nome, empresa_id, papel, status, comissao_tipo, comissao_valor)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''), emp.id,
          case when admin then 'super_admin' else 'vendedor' end,
          case when admin then 'ativo' else 'pendente' end,
          coalesce(cfg.vendedor_comissao_tipo, 'percentual'), coalesce(cfg.vendedor_comissao_valor, 0))
  on conflict (user_id) do nothing;
  -- O link de primeiro administrador só vale uma vez
  if admin then
    update public.empresas set codigo_admin = substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) where id = emp.id;
  end if;
  return new;
end;
$$;

-- ---------- Ações de usuários e comissões, agora limitadas à própria empresa ----------
create or replace function public.decidir_usuario(alvo uuid, novo_status text, novo_papel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_super() then raise exception 'Apenas o super admin pode fazer isso.'; end if;
  if not exists (select 1 from public.perfis where user_id = alvo and empresa_id = interno.minha_empresa()) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;
  if novo_status not in ('pendente','ativo','bloqueado') or novo_papel not in ('super_admin','admin','vendedor') then
    raise exception 'Valor inválido.';
  end if;
  if alvo = (select auth.uid()) and (novo_status <> 'ativo' or novo_papel <> 'super_admin') then
    raise exception 'Você não pode rebaixar nem bloquear o seu próprio acesso.';
  end if;
  update public.perfis set status = novo_status, papel = novo_papel, decidido_por = (select auth.uid()), decidido_em = now()
   where user_id = alvo;
end;
$$;

create or replace function public.definir_comissao_usuario(alvo uuid, tipo text, valor numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  if not exists (select 1 from public.perfis where user_id = alvo and empresa_id = interno.minha_empresa()) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;
  if tipo not in ('percentual','fixo') or valor < 0 or (tipo = 'percentual' and valor > 100) then
    raise exception 'Valor de comissão inválido.';
  end if;
  update public.perfis set comissao_tipo = tipo, comissao_valor = valor where user_id = alvo;
end;
$$;

-- Geração de recebimentos, com a configuração e a empresa do negócio
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
      empresa_id, negocio_id, negocio_nome, cliente_empresa, produto_id, produto_nome, fornecedor_id, fornecedor_nome,
      quantidade, parcela, parcelas, data_venda, valor_previsto, data_prevista, status, revisar, observacao,
      vendedor_id, vendedor_nome, repasse_tipo, repasse_base, repasse_valor)
    values (
      n.empresa_id, n.id, coalesce(nullif(n.nome, ''), n.empresa), n.empresa, pr.id, pr.nome, pr.fornecedor_id, coalesce(forn_nome, ''),
      np.quantidade, i, pr.comissao_parcelas, coalesce(n.ganho_em, interno.hoje_sp()), parc,
      inicio + (i - 1) * coalesce(cfg.intervalo_parcelas_dias, 30), 'previsto',
      total = 0, case when total = 0 then 'Comissão do produto não configurada no catálogo.' else '' end,
      n.user_id, coalesce(nullif(pe.nome, ''), pe.email, ''), rep_tipo,
      case rep_tipo when 'nenhum' then 0 else regra_valor end, rep);
  end loop;
end;
$$;



create or replace function public.gerar_recebimentos_pendentes()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; antes int; depois int; emp uuid := interno.minha_empresa();
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  select count(*) into antes from public.recebimentos where empresa_id = emp;
  for r in select np.negocio_id, np.produto_id from public.negocio_produtos np
           join public.negocios n on n.id = np.negocio_id
           where n.empresa_id = emp and n.etapa = 'ganho' and n.excluido_em is null loop
    perform interno.gerar_recebimentos(r.negocio_id, r.produto_id);
  end loop;
  select count(*) into depois from public.recebimentos where empresa_id = emp;
  return depois - antes;
end;
$$;

-- ---------- Marca da empresa ----------

-- Dados públicos para a tela de login (pelo domínio ou pelo link de convite)
create or replace function public.empresa_publica(p_dominio text, p_convite text)
returns table (nome text, logo_url text, cor_primaria text, cor_secundaria text, convite_valido boolean, convite_admin boolean)
language sql stable security definer set search_path = '' as $$
  select e.nome, e.logo_url, e.cor_primaria, e.cor_secundaria,
         coalesce(nullif(trim(p_convite), '') in (e.codigo_convite, e.codigo_admin), false),
         coalesce(nullif(trim(p_convite), '') = e.codigo_admin, false)
    from public.empresas e
   where e.status = 'ativa'
     and ((nullif(trim(p_convite), '') is not null and trim(p_convite) in (e.codigo_convite, e.codigo_admin))
       or (nullif(trim(p_convite), '') is null and lower(e.dominio) = lower(trim(p_dominio)) and e.dominio <> ''))
   limit 1;
$$;

-- Super admin da empresa (ou a plataforma) muda nome, logo e cores
create or replace function public.atualizar_marca(p_empresa uuid, p_nome text, p_logo_url text, p_cor1 text, p_cor2 text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (interno.eh_plataforma() or (interno.eh_super() and p_empresa = interno.minha_empresa())) then
    raise exception 'Sem permissão para alterar esta empresa.';
  end if;
  update public.empresas set nome = coalesce(nullif(trim(p_nome), ''), nome), logo_url = coalesce(p_logo_url, logo_url),
         cor_primaria = coalesce(nullif(p_cor1, ''), cor_primaria), cor_secundaria = coalesce(nullif(p_cor2, ''), cor_secundaria)
   where id = p_empresa;
end;
$$;

-- Gera um novo link de convite (o antigo deixa de funcionar)
create or replace function public.novo_link_convite(p_empresa uuid, p_tipo text)
returns text language plpgsql security definer set search_path = '' as $$
declare novo text := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, case when p_tipo = 'admin' then 24 else 18 end);
begin
  if p_tipo = 'admin' and not interno.eh_plataforma() then raise exception 'Sem permissão.'; end if;
  if p_tipo <> 'admin' and not (interno.eh_plataforma() or (interno.eh_super() and p_empresa = interno.minha_empresa())) then
    raise exception 'Sem permissão.';
  end if;
  if p_tipo = 'admin' then update public.empresas set codigo_admin = novo where id = p_empresa;
  else update public.empresas set codigo_convite = novo where id = p_empresa; end if;
  return novo;
end;
$$;

-- ---------- Painel da plataforma ----------
create or replace function public.sou_plataforma()
returns boolean language sql stable security definer set search_path = '' as $$
  select interno.eh_plataforma();
$$;

create or replace function public.plataforma_empresas()
returns table (id uuid, nome text, slug text, status text, logo_url text, cor_primaria text, cor_secundaria text, dominio text,
               codigo_convite text, codigo_admin text, criado_em timestamptz, usuarios bigint, pendentes bigint, negocios bigint, tem_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not interno.eh_plataforma() then raise exception 'Sem permissão.'; end if;
  return query
  select e.id, e.nome, e.slug, e.status, e.logo_url, e.cor_primaria, e.cor_secundaria, e.dominio, e.codigo_convite, e.codigo_admin, e.criado_em,
         (select count(*) from public.perfis p where p.empresa_id = e.id and p.status = 'ativo'),
         (select count(*) from public.perfis p where p.empresa_id = e.id and p.status = 'pendente'),
         (select count(*) from public.negocios n where n.empresa_id = e.id and n.excluido_em is null),
         exists (select 1 from public.perfis p where p.empresa_id = e.id and p.papel = 'super_admin' and p.status = 'ativo')
    from public.empresas e order by e.criado_em;
end;
$$;

create or replace function public.plataforma_criar_empresa(p_nome text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare novo uuid;
begin
  if not interno.eh_plataforma() then raise exception 'Sem permissão.'; end if;
  insert into public.empresas (nome, slug) values (trim(p_nome), lower(trim(p_slug))) returning id into novo;
  insert into public.configuracao_empresa (empresa_id) values (novo);
  return novo;
end;
$$;

create or replace function public.plataforma_atualizar_empresa(p_empresa uuid, p_status text, p_dominio text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_plataforma() then raise exception 'Sem permissão.'; end if;
  if p_empresa = interno.minha_empresa() and p_status = 'bloqueada' then
    raise exception 'Você não pode bloquear a sua própria empresa.';
  end if;
  update public.empresas set status = coalesce(p_status, status), dominio = coalesce(lower(trim(p_dominio)), dominio) where id = p_empresa;
end;
$$;

-- ---------- Arquivos: backups e logos separados por empresa ----------
drop policy if exists "admins veem backups" on storage.objects;
create policy "admins veem backups da empresa" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (select interno.eh_admin()) and (storage.foldername(name))[1] = (select interno.minha_empresa())::text);

insert into storage.buckets (id, name, public) values ('marcas', 'marcas', true) on conflict (id) do nothing;
create policy "marca: super admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'marcas' and ((select interno.eh_plataforma())
    or ((select interno.eh_super()) and (storage.foldername(name))[1] = (select interno.minha_empresa())::text)));
create policy "marca: super admin troca" on storage.objects for update to authenticated
  using (bucket_id = 'marcas' and ((select interno.eh_plataforma())
    or ((select interno.eh_super()) and (storage.foldername(name))[1] = (select interno.minha_empresa())::text)));

-- ---------- Permissões das funções ----------
revoke execute on function public.empresa_publica(text, text), public.atualizar_marca(uuid, text, text, text, text),
  public.novo_link_convite(uuid, text), public.sou_plataforma(), public.plataforma_empresas(),
  public.plataforma_criar_empresa(text, text), public.plataforma_atualizar_empresa(uuid, text, text) from public;
grant execute on function public.empresa_publica(text, text) to anon, authenticated;
grant execute on function public.atualizar_marca(uuid, text, text, text, text), public.novo_link_convite(uuid, text), public.sou_plataforma(),
  public.plataforma_empresas(), public.plataforma_criar_empresa(text, text), public.plataforma_atualizar_empresa(uuid, text, text) to authenticated;
revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

-- ---------- Você como dono da plataforma ----------
insert into public.plataforma_admins (user_id)
select user_id from public.perfis where lower(email) = lower('italo.pimentel1@gmail.com')
on conflict do nothing;

-- Confere: deve mostrar 1 linha com o seu e-mail
select p.email, 'dono da plataforma' as papel from public.plataforma_admins a join public.perfis p on p.user_id = a.user_id;

notify pgrst, 'reload schema';

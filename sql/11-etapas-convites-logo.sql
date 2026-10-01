-- =========================================================
-- CRM — etapas do quadro por empresa, cadastro só por convite e correção do envio de logo
-- Rodar uma única vez no Supabase (depois do 10): SQL Editor → New query → colar → Run
-- =========================================================

-- ---------- 1. Correção do envio de logo ----------
-- O envio precisa também da permissão de leitura na pasta "marcas"
drop policy if exists "marca: todos leem" on storage.objects;
create policy "marca: todos leem" on storage.objects for select to authenticated
  using (bucket_id = 'marcas');

-- ---------- 2. Cadastro só com link de convite válido ----------
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
  if emp.id is null then
    raise exception 'CONVITE_INVALIDO: o cadastro só é permitido por um link de convite válido.';
  end if;
  select * into cfg from public.configuracao_empresa where empresa_id = emp.id;
  insert into public.perfis (user_id, email, nome, empresa_id, papel, status, comissao_tipo, comissao_valor)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''), emp.id,
          case when admin then 'super_admin' else 'vendedor' end,
          case when admin then 'ativo' else 'pendente' end,
          coalesce(cfg.vendedor_comissao_tipo, 'percentual'), coalesce(cfg.vendedor_comissao_valor, 0))
  on conflict (user_id) do nothing;
  if admin then
    update public.empresas set codigo_admin = substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) where id = emp.id;
  end if;
  return new;
end;
$$;

-- ---------- 3. Etapas do quadro por empresa ----------
create table if not exists public.etapas (
  empresa_id  uuid not null default interno.minha_empresa() references public.empresas(id) on delete cascade,
  chave       text not null default ('e' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  nome        text not null check (length(trim(nome)) between 1 and 40),
  ordem       int not null default 0,
  tipo        text not null default 'aberta' check (tipo in ('aberta','ganho','perdido')),
  primary key (empresa_id, chave),
  check ((tipo = 'ganho') = (chave = 'ganho') and (tipo = 'perdido') = (chave = 'perdido'))
);

-- Etapas padrão para empresas novas e para as que já existem
create or replace function interno.etapas_padrao(p_empresa uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.etapas (empresa_id, chave, nome, ordem, tipo) values
    (p_empresa, 'novo', 'Novo lead', 1, 'aberta'),
    (p_empresa, 'contato', 'Primeiro contato', 2, 'aberta'),
    (p_empresa, 'conversa', 'Em conversa', 3, 'aberta'),
    (p_empresa, 'proposta', 'Proposta enviada', 4, 'aberta'),
    (p_empresa, 'negociacao', 'Negociação', 5, 'aberta'),
    (p_empresa, 'ganho', 'Ganho', 1000, 'ganho'),
    (p_empresa, 'perdido', 'Perdido', 1001, 'perdido')
  on conflict do nothing;
$$;
select interno.etapas_padrao(id) from public.empresas;

create or replace function interno.empresa_nova()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform interno.etapas_padrao(new.id);
  insert into public.configuracao_empresa (empresa_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists empresa_nova on public.empresas;
create trigger empresa_nova after insert on public.empresas for each row execute function interno.empresa_nova();

create or replace function public.plataforma_criar_empresa(p_nome text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare novo uuid;
begin
  if not interno.eh_plataforma() then raise exception 'Sem permissão.'; end if;
  insert into public.empresas (nome, slug) values (trim(p_nome), lower(trim(p_slug))) returning id into novo;
  return novo;
end;
$$;

-- Ganho e Perdido não mudam de tipo nem de código; só o nome e a posição
create or replace function interno.etapa_protegida()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.chave <> old.chave or new.tipo <> old.tipo or new.empresa_id <> old.empresa_id then
    raise exception 'Não é possível mudar o tipo de uma etapa.';
  end if;
  return new;
end;
$$;
drop trigger if exists etapa_protegida on public.etapas;
create trigger etapa_protegida before update on public.etapas for each row execute function interno.etapa_protegida();

-- Negócio só pode estar numa etapa que existe na empresa dele
alter table public.negocios drop constraint if exists negocios_etapa_check;
alter table public.negocios alter column etapa drop default;
alter table public.negocios drop constraint if exists negocios_etapa_fk;
alter table public.negocios add constraint negocios_etapa_fk
  foreign key (empresa_id, etapa) references public.etapas (empresa_id, chave);

alter table public.etapas enable row level security;
create policy "empresa ve etapas" on public.etapas for select to authenticated
  using ((select interno.eh_ativo()) and empresa_id = (select interno.minha_empresa()));
create policy "admin cria etapas" on public.etapas for insert to authenticated
  with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()) and tipo = 'aberta');
create policy "admin altera etapas" on public.etapas for update to authenticated
  using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()))
  with check ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()));
create policy "admin apaga etapas" on public.etapas for delete to authenticated
  using ((select interno.eh_admin()) and empresa_id = (select interno.minha_empresa()) and tipo = 'aberta');
revoke all on public.etapas from anon;
grant select, insert, update, delete on public.etapas to authenticated;

-- Move os negócios de uma etapa para outra e apaga a etapa (só admins)
create or replace function public.excluir_etapa(p_chave text, p_destino text)
returns int language plpgsql security definer set search_path = '' as $$
declare emp uuid := interno.minha_empresa(); n int;
begin
  if not interno.eh_admin() then raise exception 'Apenas admins podem fazer isso.'; end if;
  if not exists (select 1 from public.etapas where empresa_id = emp and chave = p_chave and tipo = 'aberta') then
    raise exception 'Etapa não encontrada ou não pode ser excluída.';
  end if;
  if exists (select 1 from public.negocios where empresa_id = emp and etapa = p_chave) then
    if p_destino is null or p_destino = p_chave or not exists (select 1 from public.etapas where empresa_id = emp and chave = p_destino) then
      raise exception 'Escolha para qual etapa mover os negócios.';
    end if;
  end if;
  update public.negocios set etapa = p_destino, etapa_desde = interno.hoje_sp() where empresa_id = emp and etapa = p_chave;
  get diagnostics n = row_count;
  update public.tipos_mensagem set etapas = array_remove(etapas, p_chave) where empresa_id = emp;
  delete from public.etapas where empresa_id = emp and chave = p_chave;
  return n;
end;
$$;
revoke execute on function public.excluir_etapa(text, text), public.plataforma_criar_empresa(text, text) from public, anon;
grant execute on function public.excluir_etapa(text, text), public.plataforma_criar_empresa(text, text) to authenticated;
revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

notify pgrst, 'reload schema';

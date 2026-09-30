-- =========================================================
-- CRM Gade2B — usuários, aprovação e permissões
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
--
-- Papéis:
--   super_admin → aprova e gerencia usuários, vê e edita tudo
--   admin       → vê todos os negócios, cadastra produtos e tipos de mensagem
--   vendedor    → vê e edita só os próprios negócios, usa os produtos e modelos
-- Status: pendente (aguardando aprovação), ativo, bloqueado.
-- Quem não está ativo não enxerga nenhum dado.
-- =========================================================

-- Funções internas ficam num schema que não é exposto pela API
create schema if not exists interno;
grant usage on schema interno to authenticated;

-- ---------- Perfis ----------
create table public.perfis (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         text not null default '',
  nome          text not null default '',
  papel         text not null default 'vendedor' check (papel in ('super_admin','admin','vendedor')),
  status        text not null default 'pendente' check (status in ('pendente','ativo','bloqueado')),
  criado_em     timestamptz not null default now(),
  decidido_por  uuid references auth.users(id) on delete set null,
  decidido_em   timestamptz
);

-- Usuários que já existirem ganham um perfil pendente
insert into public.perfis (user_id, email, nome)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'nome', '')
from auth.users
on conflict (user_id) do nothing;

-- Todo usuário novo ganha um perfil pendente automaticamente
create or replace function interno.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (user_id, email, nome)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function interno.criar_perfil();

-- ---------- Funções de permissão ----------
create or replace function interno.papel_ativo()
returns text language sql stable security definer set search_path = '' as $$
  select papel from public.perfis where user_id = (select auth.uid()) and status = 'ativo';
$$;

create or replace function interno.eh_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select interno.papel_ativo() is not null;
$$;

create or replace function interno.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(interno.papel_ativo() in ('admin','super_admin'), false);
$$;

create or replace function interno.eh_super()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(interno.papel_ativo() = 'super_admin', false);
$$;

revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super() to authenticated;

-- ---------- Aprovar, bloquear e mudar papel (só super admin) ----------
create or replace function public.decidir_usuario(alvo uuid, novo_status text, novo_papel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not interno.eh_super() then
    raise exception 'Apenas o super admin pode fazer isso.';
  end if;
  if novo_status not in ('pendente','ativo','bloqueado') or novo_papel not in ('super_admin','admin','vendedor') then
    raise exception 'Valor inválido.';
  end if;
  if alvo = (select auth.uid()) and (novo_status <> 'ativo' or novo_papel <> 'super_admin') then
    raise exception 'Você não pode rebaixar nem bloquear o seu próprio acesso.';
  end if;
  update public.perfis
     set status = novo_status, papel = novo_papel,
         decidido_por = (select auth.uid()), decidido_em = now()
   where user_id = alvo;
end;
$$;

revoke execute on function public.decidir_usuario(uuid, text, text) from public, anon;
grant execute on function public.decidir_usuario(uuid, text, text) to authenticated;

-- ---------- Remove as regras antigas (cada um só via o que criou) ----------
do $$
declare t text; p text;
begin
  foreach t in array array['produtos','tipos_mensagem','modelos_produto','negocios',
                           'negocio_produtos','interacoes','configuracoes']
  loop
    foreach p in array array['dono le','dono cria','dono altera','dono apaga']
    loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end;
$$;

-- ---------- Perfis: cada um vê o seu; admins veem todos ----------
alter table public.perfis enable row level security;
create policy "ver perfis" on public.perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select interno.eh_admin()));
revoke all on public.perfis from anon;
revoke insert, update, delete on public.perfis from authenticated;
grant select on public.perfis to authenticated;

-- ---------- Catálogo compartilhado: todos ativos usam, admins editam ----------
do $$
declare t text;
begin
  foreach t in array array['produtos','tipos_mensagem','modelos_produto']
  loop
    execute format('create policy "ativos veem" on public.%I for select to authenticated using ((select interno.eh_ativo()))', t);
    execute format('create policy "admins criam" on public.%I for insert to authenticated with check ((select interno.eh_admin()))', t);
    execute format('create policy "admins alteram" on public.%I for update to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()))', t);
    execute format('create policy "admins apagam" on public.%I for delete to authenticated using ((select interno.eh_admin()))', t);
  end loop;
end;
$$;

-- ---------- Negócios: vendedor vê os seus, admins veem todos ----------
-- A coluna user_id passa a significar "responsável pelo negócio".
comment on column public.negocios.user_id is 'Responsável pelo negócio';

create policy "ver negocios" on public.negocios for select to authenticated
  using ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid())));
create policy "criar negocios" on public.negocios for insert to authenticated
  with check ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid())));
create policy "alterar negocios" on public.negocios for update to authenticated
  using ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid())))
  with check ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid())));
create policy "apagar negocios" on public.negocios for delete to authenticated
  using ((select interno.eh_admin()) or ((select interno.eh_ativo()) and user_id = (select auth.uid())));

-- ---------- Produtos do negócio e histórico seguem o acesso ao negócio ----------
do $$
declare t text;
begin
  foreach t in array array['negocio_produtos','interacoes']
  loop
    execute format($f$
      create policy "segue o negocio" on public.%I for all to authenticated
      using ((select interno.eh_ativo()) and exists (
        select 1 from public.negocios n where n.id = negocio_id
          and ((select interno.eh_admin()) or n.user_id = (select auth.uid()))))
      with check ((select interno.eh_ativo()) and exists (
        select 1 from public.negocios n where n.id = negocio_id
          and ((select interno.eh_admin()) or n.user_id = (select auth.uid()))))
    $f$, t);
  end loop;
end;
$$;

-- ---------- Configurações: cada um cuida da sua ----------
create policy "propria configuracao" on public.configuracoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

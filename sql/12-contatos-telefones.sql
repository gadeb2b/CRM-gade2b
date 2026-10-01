-- =========================================================
-- CRM — contatos do negócio (várias pessoas, vários telefones) e operadora de cada número
-- Rodar uma única vez no Supabase (depois do 11): SQL Editor → New query → colar → Run
--
--  * Cada negócio pode ter vários contatos (nome, cargo, e-mail), cada um com vários telefones.
--  * Um telefone do negócio é o "principal": ele é copiado para negocios.telefone,
--    e o e-mail do contato dele para negocios.email (o card e os envios usam esses campos).
--  * Os telefones e e-mails que já existem viram o primeiro contato de cada negócio.
-- =========================================================

create table if not exists public.contatos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default interno.minha_empresa() references public.empresas(id) on delete cascade,
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  nome        text not null default '',
  cargo       text not null default '',
  email       text not null default '',
  ordem       int not null default 0,
  criado_em   timestamptz not null default now()
);
create index if not exists contatos_negocio_idx on public.contatos (negocio_id);
create index if not exists contatos_empresa_idx on public.contatos (empresa_id);

create table if not exists public.telefones (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null default interno.minha_empresa() references public.empresas(id) on delete cascade,
  contato_id               uuid not null references public.contatos(id) on delete cascade,
  negocio_id               uuid not null references public.negocios(id) on delete cascade,
  numero                   text not null default '',
  etiqueta                 text not null default 'celular' check (etiqueta in ('celular','whatsapp','fixo','outro')),
  principal                boolean not null default false,
  origem                   text not null default '' check (origem in ('','receita')),
  operadora                text not null default '',
  portado                  boolean not null default false,
  operadora_consultada_em  date,
  criado_em                timestamptz not null default now()
);
create index if not exists telefones_negocio_idx on public.telefones (negocio_id);
create index if not exists telefones_contato_idx on public.telefones (contato_id);
create index if not exists telefones_empresa_idx on public.telefones (empresa_id);
-- No máximo um telefone principal por negócio
create unique index if not exists telefones_um_principal on public.telefones (negocio_id) where principal;

-- ---------- Segurança: seguem o acesso ao negócio ----------
alter table public.contatos enable row level security;
alter table public.telefones enable row level security;
do $$
declare t text;
begin
  foreach t in array array['contatos','telefones']
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
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- O telefone pertence ao mesmo negócio do contato
create or replace function interno.telefone_coerente()
returns trigger language plpgsql set search_path = '' as $$
begin
  select c.negocio_id, c.empresa_id into new.negocio_id, new.empresa_id from public.contatos c where c.id = new.contato_id;
  return new;
end;
$$;
drop trigger if exists telefone_coerente on public.telefones;
create trigger telefone_coerente before insert or update of contato_id on public.telefones
  for each row execute function interno.telefone_coerente();

-- ---------- Mantém o telefone e o e-mail principais copiados no negócio ----------
create or replace function interno.sincronizar_principal(p_negocio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tel text; mail text;
begin
  select t.numero, c.email into tel, mail
    from public.telefones t join public.contatos c on c.id = t.contato_id
   where t.negocio_id = p_negocio and t.principal limit 1;
  if coalesce(mail, '') = '' then
    select c.email into mail from public.contatos c where c.negocio_id = p_negocio and c.email <> '' order by c.ordem, c.criado_em limit 1;
  end if;
  update public.negocios set telefone = coalesce(tel, ''), email = coalesce(mail, '')
   where id = p_negocio and (telefone is distinct from coalesce(tel, '') or email is distinct from coalesce(mail, ''));
end;
$$;

create or replace function interno.contato_mudou()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform interno.sincronizar_principal(coalesce(new.negocio_id, old.negocio_id));
  return null;
end;
$$;
drop trigger if exists telefones_sincroniza on public.telefones;
create trigger telefones_sincroniza after insert or update or delete on public.telefones
  for each row execute function interno.contato_mudou();
drop trigger if exists contatos_sincroniza on public.contatos;
create trigger contatos_sincroniza after update of email or delete on public.contatos
  for each row execute function interno.contato_mudou();

-- ---------- Migração: telefone e e-mail atuais viram o primeiro contato ----------
do $$
declare n record; novo uuid;
begin
  for n in select * from public.negocios
           where (coalesce(telefone, '') <> '' or coalesce(email, '') <> '')
             and not exists (select 1 from public.contatos c where c.negocio_id = negocios.id)
  loop
    insert into public.contatos (empresa_id, negocio_id, nome, email, ordem)
    values (n.empresa_id, n.id, coalesce(n.nome, ''), coalesce(n.email, ''), 0) returning id into novo;
    if coalesce(n.telefone, '') <> '' then
      insert into public.telefones (empresa_id, contato_id, negocio_id, numero, etiqueta, principal)
      values (n.empresa_id, novo, n.id, n.telefone, case when n.canal = 'whatsapp' then 'whatsapp' else 'celular' end, true);
    end if;
  end loop;
end;
$$;

revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.papel_ativo(), interno.eh_ativo(), interno.eh_admin(), interno.eh_super(), interno.hoje_sp(),
  interno.minha_empresa(), interno.eh_plataforma() to authenticated;

notify pgrst, 'reload schema';

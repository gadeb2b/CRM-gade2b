-- =========================================================
-- CRM Gade2B — criação do banco de dados
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
-- Todas as tabelas têm RLS: cada linha pertence ao usuário logado
-- e só ele consegue ler ou alterar.
-- =========================================================

-- ---------- Produtos ----------
create table public.produtos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  preco       numeric(12,2) not null default 0,
  cobranca    text not null default 'unico' check (cobranca in ('unico','mensal')),
  oferta      text not null default '',
  segmentos   text not null default '',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- Tipos de mensagem ----------
create table public.tipos_mensagem (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  objetivo    text not null default '',
  assunto     text not null default '',
  modelo      text not null default '',
  etapas      text[] not null default '{}',
  ordem       int not null default 0,
  criado_em   timestamptz not null default now()
);

-- ---------- Mensagem específica de um produto para um tipo ----------
create table public.modelos_produto (
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  tipo_id     uuid not null references public.tipos_mensagem(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modelo      text not null default '',
  primary key (produto_id, tipo_id)
);

-- ---------- Negócios (cards do kanban) ----------
create table public.negocios (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome             text not null default '',
  empresa          text not null default '',
  cnpj             text not null default '',
  cnae             text not null default '',
  atividade        text not null default '',
  telefone         text not null default '',
  email            text not null default '',
  canal            text not null default 'whatsapp' check (canal in ('whatsapp','email')),
  valor            numeric(12,2) not null default 0,
  etapa            text not null default 'novo'
                   check (etapa in ('novo','contato','conversa','proposta','negociacao','ganho','perdido')),
  etapa_desde      date not null default current_date,
  acao             text not null default '',
  acao_data        date,
  motivo_perda     text not null default '',
  tipo_msg_id      uuid references public.tipos_mensagem(id) on delete set null,
  msg_rascunho     text not null default '',
  assunto_rascunho text not null default '',
  msg_origem       text not null default '',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- ---------- Produtos de cada negócio ----------
create table public.negocio_produtos (
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (negocio_id, produto_id)
);

-- ---------- Histórico de interações ----------
create table public.interacoes (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto       text not null,
  sistema     boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- ---------- Configurações do usuário ----------
create table public.configuracoes (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  assinatura  text not null default ''
);

-- ---------- Índices ----------
create index on public.produtos (user_id);
create index on public.tipos_mensagem (user_id);
create index on public.modelos_produto (user_id);
create index on public.negocios (user_id, etapa);
create index on public.negocio_produtos (user_id);
create index on public.negocio_produtos (produto_id);
create index on public.interacoes (negocio_id, criado_em desc);
create index on public.interacoes (user_id);

-- ---------- Atualiza "atualizado_em" sozinho ----------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger negocios_atualizado_em
  before update on public.negocios
  for each row execute function public.tocar_atualizado_em();

-- ---------- Segurança (RLS) ----------
do $$
declare t text;
begin
  foreach t in array array['produtos','tipos_mensagem','modelos_produto','negocios',
                           'negocio_produtos','interacoes','configuracoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "dono le" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "dono cria" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono altera" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono apaga" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

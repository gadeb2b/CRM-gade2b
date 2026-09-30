-- =========================================================
-- CRM Gade2B — fornecedores e organização do catálogo
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
-- =========================================================

create table if not exists public.fornecedores (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  nome         text not null,
  contato      text not null default '',
  observacoes  text not null default '',
  criado_em    timestamptz not null default now()
);

alter table public.produtos
  add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null,
  add column if not exists categoria     text not null default '';

create index if not exists produtos_fornecedor_idx on public.produtos (fornecedor_id);

-- Mesmas regras do catálogo: todos os usuários ativos veem, só admins editam
alter table public.fornecedores enable row level security;
create policy "ativos veem" on public.fornecedores for select to authenticated using ((select interno.eh_ativo()));
create policy "admins criam" on public.fornecedores for insert to authenticated with check ((select interno.eh_admin()));
create policy "admins alteram" on public.fornecedores for update to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "admins apagam" on public.fornecedores for delete to authenticated using ((select interno.eh_admin()));
revoke all on public.fornecedores from anon;
grant select, insert, update, delete on public.fornecedores to authenticated;

notify pgrst, 'reload schema';

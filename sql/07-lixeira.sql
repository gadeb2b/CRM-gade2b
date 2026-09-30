-- =========================================================
-- CRM Gade2B — lixeira de negócios excluídos
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
-- "Excluir" passa a mandar o negócio para a lixeira (dá para restaurar).
-- Só admins conseguem apagar de vez.
-- =========================================================
alter table public.negocios
  add column if not exists excluido_em  timestamptz,
  add column if not exists excluido_por uuid references auth.users(id) on delete set null;

create index if not exists negocios_excluido_idx on public.negocios (excluido_em);

-- Exclusão definitiva: só admins e super admin
drop policy if exists "apagar negocios" on public.negocios;
create policy "apagar negocios" on public.negocios for delete to authenticated
  using ((select interno.eh_admin()));

notify pgrst, 'reload schema';

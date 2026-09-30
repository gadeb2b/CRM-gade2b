-- =========================================================
-- CRM Gade2B — área de armazenamento dos backups
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
-- Cria uma pasta privada "backups". Só admins e o super admin
-- conseguem ver e baixar os arquivos; quem grava é o servidor.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

create policy "admins veem backups" on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and (select interno.eh_admin()));

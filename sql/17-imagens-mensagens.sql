-- =========================================================
-- CRM — imagem nas mensagens (WhatsApp)
-- Rodar uma única vez no Supabase (depois do 16): SQL Editor → New query → colar → Run
--  * Cada tipo de mensagem e cada mensagem específica de produto pode ter uma imagem.
--  * As imagens ficam na pasta "midias" do Storage, separadas por empresa.
-- =========================================================

alter table public.tipos_mensagem add column if not exists imagem_url text not null default '';
alter table public.modelos_produto add column if not exists imagem_url text not null default '';

insert into storage.buckets (id, name, public) values ('midias', 'midias', true) on conflict (id) do nothing;

drop policy if exists "midias: todos leem" on storage.objects;
create policy "midias: todos leem" on storage.objects for select to authenticated
  using (bucket_id = 'midias');
drop policy if exists "midias: admins enviam" on storage.objects;
create policy "midias: admins enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'midias' and (select interno.eh_admin())
              and (storage.foldername(name))[1] = (select interno.minha_empresa())::text);
drop policy if exists "midias: admins apagam" on storage.objects;
create policy "midias: admins apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'midias' and (select interno.eh_admin())
         and (storage.foldername(name))[1] = (select interno.minha_empresa())::text);

notify pgrst, 'reload schema';

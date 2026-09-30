-- =========================================================
-- CRM Gade2B — campos extras preenchidos pela consulta de CNPJ
-- Rodar uma única vez no Supabase: SQL Editor → New query → colar → Run
-- =========================================================
alter table public.negocios
  add column if not exists razao_social  text not null default '',
  add column if not exists cidade        text not null default '',
  add column if not exists uf            text not null default '',
  add column if not exists situacao_cnpj text not null default '';

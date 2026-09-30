-- =========================================================
-- CRM Gade2B — define o seu usuário como super admin
-- Rodar DEPOIS de criar sua conta pela tela "Solicitar acesso".
-- Troque o e-mail abaixo pelo seu e rode no SQL Editor.
-- =========================================================
update public.perfis
   set papel = 'super_admin', status = 'ativo', decidido_em = now()
 where email = 'SEU_EMAIL_AQUI';

-- Confere o resultado: deve aparecer uma linha com super_admin / ativo
select email, papel, status from public.perfis;

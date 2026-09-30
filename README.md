# CRM Gade2B

CRM de vendas em kanban para vendas por WhatsApp e e-mail.

Stack: Next.js (hospedado na Vercel) + Supabase (banco de dados e login).

## Estrutura

- `app/page.js`: decide entre tela de login e CRM
- `components/Crm.js`: quadro kanban, funil, filtros e gravação no banco
- `components/Painel.js`: painel do negócio (dados, produtos, mensagem, histórico)
- `components/Config.js`: produtos, tipos de mensagem e remetente
- `lib/mensagens.js`: modelos com variáveis e texto enviado para a IA
- `app/api/gerar-mensagem/route.js`: geração de mensagem com IA (lado do servidor)
- `sql/01-banco-crm.sql`: criação das tabelas (já executado no Supabase)

## Variáveis de ambiente (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto no Supabase
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave pública (sb_publishable_...)
- `ANTHROPIC_API_KEY` (opcional, Secret): liga o botão "Gerar com IA"
- `ANTHROPIC_MODEL` (opcional): troca o modelo usado na geração

A chave secreta do Supabase (sb_secret_...) nunca vai para este repositório.

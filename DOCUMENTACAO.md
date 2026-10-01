# Documentação do CRM de vendas (plataforma multiempresa)

Última atualização: versão 20 (01/10/2026).

Este arquivo reúne tudo o que é preciso para entender, manter e continuar o projeto: contas, estrutura do código, banco de dados, regras de negócio, deploy e solução de problemas. Ao abrir uma conversa nova com o Claude, envie este arquivo para ele ter o contexto completo.

---

## 1. Visão geral

CRM de vendas em formato de quadro kanban, criado para a Gade2B (vendas por WhatsApp e e-mail, com produtos de fornecedores como a Vivo) e transformado em **plataforma white label**: várias empresas usam o mesmo sistema, cada uma com seus dados separados, sua marca e seus usuários.

Principais recursos:

- Quadro kanban com etapas personalizáveis por empresa, funil de valores e filtros.
- Negócios com dados do cliente, busca automática por CNPJ, produtos com quantidade, mensagens prontas e histórico.
- Catálogo de fornecedores e produtos em formato de planilha, com colagem direto do Excel.
- Tipos de mensagem com modelos e variáveis, mensagens específicas por produto e geração com IA (opcional).
- Usuários com aprovação por convite e três papéis: vendedor, admin e super admin.
- Financeiro: comissões por produto, recebimentos previstos e recebidos, repasses aos vendedores e regras de comissão por vendedor, fornecedor e categoria.
- Lixeira, backup diário automático e exportação em Excel.
- Painel da plataforma para criar e gerenciar empresas clientes.

---

## 2. Contas e serviços

| Serviço | Para que serve | Observações |
|---|---|---|
| **GitHub** (conta da Gade2B) | Guarda o código, no repositório `crm-gade2b` | Atualizado por upload de zip (ver seção 7) |
| **Vercel** (conta `gade2b`) | Hospeda o site e roda o backup diário | Precisa do plano **Pro** para uso comercial |
| **Supabase** (projeto `sfubdprmichakvnarwhz`) | Banco de dados, login, arquivos (logos e backups) | Plano gratuito no início; **Pro** recomendado ao ter clientes pagantes |
| **Brevo** | Envio dos e-mails do sistema (confirmação e nova senha) | Remetente `atendimento@gade2b.com.br` |
| **UOL** | DNS do domínio `gade2b.com.br` e caixa de e-mail | O CNAME `crm` aponta para a Vercel |
| **Anthropic** (opcional) | Geração de mensagens com IA | Cobrança pré-paga por uso |

Endereço do sistema: **https://crm.gade2b.com.br**

Os conectores do Supabase e da Vercel no Claude **não** estão ligados a este projeto (estão nas contas do 1 Para 10). Por isso, scripts SQL são rodados manualmente no SQL Editor e o código é enviado por zip.

---

## 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Tipo | Valor / função |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `https://sfubdprmichakvnarwhz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | Chave pública `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | **Secret** | Chave `sb_secret_...`. Usada só no servidor (backup e exportação). Nunca com `NEXT_PUBLIC_` e nunca em chat |
| `CRON_SECRET` | **Secret** | Senha longa aleatória; autoriza o backup diário |
| `ANTHROPIC_API_KEY` | **Secret** (opcional) | Liga o botão "Gerar com IA" |
| `ANTHROPIC_MODEL` | Config (opcional) | Troca o modelo da IA (padrão: Claude Haiku 4.5) |

Depois de criar ou alterar variáveis, faça **Redeploy** (variáveis `NEXT_PUBLIC_` são gravadas no momento do build).

---

## 4. Estrutura do código

Stack: **Next.js 16** (App Router, JavaScript) + **Supabase** (`@supabase/supabase-js`) + **write-excel-file** para planilhas.

```
app/
  page.js                     Decide entre login, telas de aviso e o CRM; carrega empresa e marca
  layout.js                   Estrutura da página e fontes
  globals.css                 Todo o visual (tema escuro, cores via variáveis --brand e --gold)
  icon.png                    Ícone da aba do navegador
  nova-senha/page.js          Página aberta pelo link de "Esqueci minha senha"
  api/gerar-mensagem/route.js Geração de mensagem com IA (servidor)
  api/cnpj/route.js           Consulta de CNPJ (BrasilAPI, com CNPJ.ws de reserva)
  api/backup/route.js         Backup diário e "Fazer backup agora" (por empresa)
  api/exportar-empresa/route.js Exportação completa de uma empresa (só dono da plataforma)
components/
  Crm.js            Tela principal: cabeçalho, menu, quadro, funil, carga e gravação de dados
  Painel.js         Painel do negócio (dados, CNPJ, produtos com quantidade, mensagem, histórico)
  Login.js          Entrar, solicitar acesso (só com convite) e esqueci minha senha
  NovaSenha.js      Formulário de nova senha
  Catalogo.js       Catálogo em planilha: fornecedores, produtos, comissões, colar do Excel
  Config.js         Tipos de mensagem e remetente
  Usuarios.js       Aprovação de usuários e link de convite
  Financeiro.js     Recebimentos, repasses, regras de comissão e configurações financeiras
  RegrasComissao.js Comissão por vendedor, fornecedor e categoria (com prévia)
  MinhasComissoes.js Tela do vendedor com as comissões dele
  Lixeira.js        Negócios excluídos (restaurar / apagar de vez)
  Backup.js         Exportar planilha e backups automáticos
  EtapasEditor.js   Etapas do quadro (renomear, criar, reordenar, excluir)
  MinhaEmpresa.js   Marca e link de convite da empresa
  MarcaEditor.js    Edição de nome, logo e cores
  Plataforma.js     Painel do dono da plataforma (empresas clientes)
  Icon.js           Ícones
lib/
  supabase.js     Cliente do Supabase
  constantes.js   Etapas (carregadas do banco), CNAEs, variáveis, tipos de mensagem padrão
  mensagens.js    Modelos com variáveis, status da próxima ação e texto enviado à IA
  util.js         Datas, moeda, links de WhatsApp/e-mail, validação de CNPJ
  backup.js       Coleta de dados e montagem da planilha de backup
  marca.js        Aplica as cores da empresa no sistema
public/           Logos da Gade2B (marca padrão da plataforma)
sql/              Scripts do banco, na ordem em que foram rodados
docs/             Modelos de e-mail do Supabase
.github/workflows/atualizar-com-zip.yml  Automação que extrai o zip enviado ao GitHub
vercel.json       Agendamento do backup diário (06:00 UTC = 03:00 de Brasília)
```

---

## 5. Banco de dados

### Scripts SQL (pasta `sql/`), na ordem

| Script | O que faz |
|---|---|
| `01-banco-crm.sql` | Tabelas principais: produtos, tipos de mensagem, negócios, histórico etc. |
| `02-usuarios-e-permissoes.sql` | Perfis, papéis (vendedor/admin/super admin), aprovação e regras de segurança |
| `03-definir-super-admin.sql` | Definiu o primeiro super admin (uso único, já executado) |
| `04-backups.sql` | Pasta privada de backups no Storage |
| `05-dados-cnpj.sql` | Campos de razão social, cidade, UF e situação do CNPJ |
| `06-fornecedores.sql` | Fornecedores e categoria nos produtos |
| `07-lixeira.sql` | Exclusão vai para a lixeira; só admins apagam de vez |
| `08-financeiro.sql` | Comissões, quantidade, recebimentos, repasses e geração automática |
| `09-comissao-por-fornecedor.sql` | Regras de comissão por vendedor, fornecedor e categoria |
| `10-plataforma-multiempresa.sql` | Empresas, separação de dados, convites, marca, painel da plataforma |
| `11-etapas-convites-logo.sql` | Etapas por empresa, cadastro só por convite e permissão do logo |

Todos os scripts já foram executados. Um script novo deve ser rodado **antes** de subir a versão do código que depende dele.

### Tabelas principais

- `empresas`: cada empresa cliente (nome, marca, domínio, códigos de convite, status).
- `plataforma_admins`: quem é dono da plataforma.
- `perfis`: usuários (empresa, papel, status, comissão padrão).
- `etapas`: etapas do quadro de cada empresa (`ganho` e `perdido` são fixas, só renomeáveis).
- `negocios`, `negocio_produtos` (com quantidade), `interacoes` (histórico).
- `fornecedores`, `produtos` (com comissão), `tipos_mensagem`, `modelos_produto`.
- `recebimentos`: uma linha por venda, produto e parcela, com o repasse do vendedor.
- `comissoes_vendedor`: regras por vendedor, fornecedor e categoria.
- `configuracao_empresa`: comissão padrão, prazo e intervalo de parcelas de cada empresa.
- `configuracoes`: assinatura de cada usuário.

### Segurança (RLS)

Toda tabela tem `empresa_id` e regras que garantem:

- ninguém vê nem grava dados de outra empresa;
- vendedor vê e edita só os próprios negócios; admins veem todos da empresa;
- catálogo, etapas e financeiro: todos os ativos leem, só admins alteram (financeiro: só admins leem);
- usuário pendente, bloqueado ou de empresa bloqueada não acessa nada.

As funções auxiliares ficam no schema `interno` (não exposto pela API): `minha_empresa()`, `eh_ativo()`, `eh_admin()`, `eh_super()`, `eh_plataforma()`.

---

## 6. Regras de negócio

### Usuários e convites

- Cadastro **só por link de convite** (`/?convite=CODIGO`). Sem convite válido, o banco recusa.
- Link da equipe: o cadastro entra como **pendente** e o super admin aprova em Usuários.
- Link de primeiro administrador (gerado na Plataforma): o cadastro vira **super admin ativo**. Vale **uma vez**.
- Cada e-mail pertence a uma única empresa.
- Ninguém consegue rebaixar ou bloquear a própria conta.

### Papéis

| | Vendedor | Admin | Super admin | Dono da plataforma |
|---|---|---|---|---|
| Negócios | Só os seus | Todos da empresa | Todos da empresa | (os da própria empresa) |
| Catálogo, mensagens, etapas | Usa | Edita | Edita | — |
| Financeiro | Só "Minhas comissões" | Tudo | Tudo | — |
| Usuários e marca da empresa | — | — | Sim | — |
| Painel Plataforma | — | — | — | Sim |

### Financeiro

- Comissão do produto: valor fixo (R$) ou % do preço; total dividido em N parcelas; prazo em dias até a 1ª parcela (em branco = padrão da empresa).
- Quando um negócio vai para a etapa de **venda ganha**, o banco cria os recebimentos previstos, com valores **congelados** naquele momento.
- Comissão do vendedor: regra mais específica entre fornecedor + categoria → só fornecedor → só categoria → padrão do vendedor. Pode ser % do que a empresa recebe ou R$ por produto.
- O repasse só fica **liberado** depois que o recebimento é marcado como recebido. Se o valor recebido mudar, o repasse em % é recalculado.
- Se o negócio sair de "ganho", for para a lixeira ou perder um produto: o que não foi recebido é **cancelado**; o que já foi recebido fica **"Para revisar"**.
- Produto vendido sem comissão configurada gera recebimento zerado marcado "Para revisar".

### Mensagens

- Variáveis: `{primeiro_nome}`, `{nome}`, `{empresa}`, `{segmento}`, `{cnae}`, `{produto}`, `{fornecedor}`, `{oferta}`, `{preco}`, `{meu_nome}`.
- `{preco}` já inclui "R$", centavos e "/mês" nos produtos mensais (o sistema evita "R$ R$").
- Mensagem específica do produto substitui o modelo do tipo quando o negócio tem só aquele produto.
- Envio: abre o WhatsApp (links wa.me) ou o programa de e-mail do usuário; o envio é registrado no histórico.

### Etapas

- Cada empresa tem as suas; as etapas de andamento podem ser renomeadas, criadas, reordenadas e excluídas (com destino para os negócios).
- `ganho` e `perdido` ficam sempre no fim e só mudam de nome.

---

## 7. Como publicar uma nova versão

1. Se a versão vier com script SQL novo, rode o script no **Supabase → SQL Editor** primeiro.
2. No GitHub, repositório **crm-gade2b**: **Add file → Upload files** → arraste o **zip sem descompactar** → **Commit changes**.
3. A automação (aba **Actions**) extrai o zip e substitui o projeto em cerca de 30 segundos. Confira o ✓ verde.
4. A Vercel publica sozinha. Aperte **Ctrl + F5** no sistema.

Cuidados:

- O zip substitui o projeto inteiro (menos `.git` e `.github`). Edições feitas direto no GitHub são sobrescritas no próximo zip.
- Confira o nome do repositório antes do commit (um zip já foi enviado por engano ao repositório do 1 Para 10 e foi revertido criando um ramo a partir do commit anterior).
- Configuração única já feita: GitHub → Settings → Actions → General → Workflow permissions → **Read and write**.

---

## 8. Plataforma multiempresa

### Criar uma empresa nova

1. Menu ☰ → **Plataforma** → **Nova empresa** (nome e identificador) → **Criar empresa**.
2. Abra a empresa, copie o **Link de primeiro administrador** e envie ao responsável.
3. O responsável se cadastra pelo link e já entra como super admin.
4. Ele configura marca (Minha empresa), etapas, catálogo, mensagens, financeiro e convida a equipe (Usuários).

### Domínio próprio de um cliente

1. Preencher o domínio na empresa (painel Plataforma).
2. Vercel → Settings → Domains → adicionar o domínio.
3. O cliente cria o CNAME indicado pela Vercel no DNS dele.

O login reconhece a empresa pelo domínio ou pelo link de convite e mostra a marca dela.

### Outras ações do painel

- Bloquear ou reativar empresa (bloqueio corta o acesso de todos na hora; os dados ficam guardados).
- Gerar novos links de convite.
- Exportar todos os dados de uma empresa (planilha ou JSON).

---

## 9. E-mails do sistema

- Envio pela **Brevo**: Supabase → Authentication → Emails → SMTP Settings com host `smtp-relay.brevo.com`, porta `587`, usuário = login SMTP da Brevo (`...@smtp-brevo.com`), senha = chave SMTP da Brevo, remetente `atendimento@gade2b.com.br`, nome `CRM de vendas`.
- Modelos de texto neutros em `docs/templates-email-supabase.md`.
- Supabase → Authentication → URL Configuration: Site URL `https://crm.gade2b.com.br` e Redirect URL `https://crm.gade2b.com.br/**`.
- O SMTP da UOL não funcionou (`smtps.uhserver.com` recusa a autenticação com erro 535; `smtp.uhserver.com` não oferece TLS na 587 e não responde na 465).

---

## 10. Backups

- Automático todo dia às 03:00 (Brasília), por empresa, na pasta privada `backups/<id-da-empresa>/` do Supabase Storage. Guarda os últimos 30 dias (planilha .xlsx e .json).
- Manual: menu ☰ → Backup e exportação (planilha na hora ou "Fazer backup agora").
- Backups anteriores à versão multiempresa ficaram na raiz da pasta `backups` e não aparecem na lista, mas continuam guardados.
- Recomendação: baixar a planilha de tempos em tempos e guardar fora do Supabase.

---

## 11. Solução de problemas (já aconteceram)

| Sintoma | Causa | Solução |
|---|---|---|
| Página 404 da Vercel | Projeto sem build Next.js ou arquivos em subpasta | Framework Preset = Next.js; Root Directory vazio; conferir arquivos na raiz |
| "Module not found" no build | Pasta não subiu no upload | Subir o zip completo pela automação |
| "Variáveis não encontradas" / "Invalid supabaseUrl" | Variáveis com nome errado ou valores trocados | Conferir nomes e valores (seção 3) e fazer Redeploy |
| "Could not find the 'X' column … in the schema cache" | Script SQL não rodado ou cache antigo | Rodar o script e `notify pgrst, 'reload schema';` |
| "Esqueci minha senha" com erro 500 | SMTP recusando login | Ver o erro em Supabase → Logs → Auth; hoje o envio é pela Brevo |
| Link de senha abre o site sem formulário | Link antigo | Usar o link do e-mail mais recente (abre `/nova-senha`) |
| Erro de "row-level security" ao enviar logo | Faltava permissão de leitura na pasta `marcas` | Corrigido no script 11 |
| Janela lateral atrás do cabeçalho da tabela | Ordem das camadas | Corrigido (painéis com z-index acima) |

---

## 12. Pendências e próximos passos

Desenvolvimento:

- Importar a planilha de contatos atual (falta ver o formato da planilha).
- Fila de disparos do WhatsApp (links wa.me, com limite diário, intervalo e "não quer receber").
- "Alterar minha senha" dentro do sistema.
- Recriar parcelas automaticamente quando um negócio volta para "ganho".
- Imagem e botões nos tipos de mensagem (preparação para a API do WhatsApp).
- Cobrança de assinatura das empresas clientes e limites por plano.

Do lado do negócio:

- Vercel Pro antes de uso comercial; Supabase Pro ao ter clientes pagantes.
- CNPJ (necessário para API oficial do WhatsApp, RCS e para vender a plataforma).
- Termos de uso, política de privacidade e contrato de tratamento de dados (LGPD).
- Chave da Anthropic, se quiser a geração com IA.

---

## 13. Histórico de versões (resumo)

| Versão | Principais mudanças |
|---|---|
| v1 | Projeto inicial publicado com teste de conexão ao Supabase |
| v2–v3 | Kanban real com login; usuários, aprovação e papéis |
| v4 | Novo negócio só é salvo ao concluir |
| v5 | Backup diário e exportação em Excel |
| v6–v7 | Busca por CNPJ e "esqueci minha senha"; automação de upload por zip |
| v8 | Identidade visual da Gade2B (tema escuro, logo) |
| v9–v10 | Preço com centavos; correção de "R$ R$" |
| v11 | Página própria de nova senha |
| v12–v14 | Catálogo em planilha com fornecedores; logo volta ao quadro |
| v15 | Lixeira |
| v16 | Menu único (☰) e filtros reorganizados |
| v17 | Financeiro: comissões, recebimentos e repasses |
| v18 | Comissão por vendedor, fornecedor e categoria |
| v19 | Plataforma multiempresa (white label) |
| v20 | Etapas personalizáveis, cadastro só por convite, exportação por empresa, e-mails neutros |

export const ETAPAS = [
  { id: "novo", nome: "Novo lead", cor: "var(--s1)" },
  { id: "contato", nome: "Primeiro contato", cor: "var(--s2)" },
  { id: "conversa", nome: "Em conversa", cor: "var(--s3)" },
  { id: "proposta", nome: "Proposta enviada", cor: "var(--s4)" },
  { id: "negociacao", nome: "Negociação", cor: "var(--s5)" },
  { id: "ganho", nome: "Ganho", cor: "var(--won)" },
  { id: "perdido", nome: "Perdido", cor: "var(--lost)" },
];
export const ABERTAS = ["novo", "contato", "conversa", "proposta", "negociacao"];
export const nomeEtapa = (id) => ETAPAS.find((e) => e.id === id)?.nome || id;

export const VARS = ["primeiro_nome", "nome", "empresa", "segmento", "cnae", "produto", "oferta", "preco", "meu_nome"];

// Lista curta de CNAEs comuns, só para sugestão. Qualquer código pode ser digitado.
export const CNAES = [
  ["1091-1/02", "Fabricação de produtos de padaria e confeitaria com predominância de produção própria"],
  ["4399-1/03", "Obras de alvenaria"],
  ["4520-0/01", "Serviços de manutenção e reparação mecânica de veículos automotores"],
  ["4712-1/00", "Comércio varejista de mercadorias em geral – minimercados, mercearias e armazéns"],
  ["4721-1/02", "Padaria e confeitaria com predominância de revenda"],
  ["4771-7/01", "Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas"],
  ["4781-4/00", "Comércio varejista de artigos do vestuário e acessórios"],
  ["4930-2/02", "Transporte rodoviário de carga intermunicipal, interestadual e internacional"],
  ["5611-2/01", "Restaurantes e similares"],
  ["5611-2/03", "Lanchonetes, casas de chá, de sucos e similares"],
  ["6201-5/01", "Desenvolvimento de programas de computador sob encomenda"],
  ["6821-8/01", "Corretagem na compra e venda e avaliação de imóveis"],
  ["6911-7/01", "Serviços advocatícios"],
  ["6920-6/01", "Atividades de contabilidade"],
  ["7111-1/00", "Serviços de arquitetura"],
  ["7500-1/00", "Atividades veterinárias"],
  ["8112-5/00", "Condomínios prediais"],
  ["8230-0/01", "Serviços de organização de feiras, congressos, exposições e festas"],
  ["8599-6/04", "Treinamento em desenvolvimento profissional e gerencial"],
  ["8630-5/03", "Atividade médica ambulatorial restrita a consultas"],
  ["8630-5/04", "Atividade odontológica"],
  ["8650-0/04", "Atividades de fisioterapia"],
  ["9313-1/00", "Atividades de condicionamento físico"],
  ["9602-5/01", "Cabeleireiros, manicure e pedicure"],
  ["9602-5/02", "Atividades de estética e outros serviços de cuidados com a beleza"],
  ["9609-2/08", "Higiene e embelezamento de animais domésticos"],
];

// Criados automaticamente no primeiro acesso.
export const TIPOS_PADRAO = [
  { nome: "Primeiro contato", etapas: ["novo", "contato"], objetivo: "Apresentar-se e despertar interesse mostrando que entende o negócio do cliente. Não falar preço. Terminar com uma pergunta simples.", assunto: "{produto} para {empresa}", modelo: "Oi {primeiro_nome}, tudo bem? Aqui é {meu_nome}. Trabalho com negócios de {segmento} e queria te apresentar {produto}: {oferta}. Faz sentido conversarmos 5 minutinhos?" },
  { nome: "Follow-up", etapas: ["proposta"], objetivo: "Retomar a conversa sem pressionar, lembrar o benefício principal e facilitar a resposta.", assunto: "Sobre {produto}", modelo: "Oi {primeiro_nome}! Passando para saber se conseguiu pensar sobre {produto}. Se ficou alguma dúvida, me fala que eu te ajudo." },
  { nome: "Oferta com preço", etapas: ["conversa", "negociacao"], objetivo: "Apresentar a oferta com preço, ligando o benefício à realidade do segmento do cliente, e pedir um próximo passo claro.", assunto: "Proposta de {produto} para {empresa}", modelo: "Oi {primeiro_nome}, preparei uma condição para {empresa}: {preco}. Inclui {oferta}. Posso te mandar os detalhes para fecharmos?" },
  { nome: "Pós-venda e indicação", etapas: ["ganho"], objetivo: "Agradecer a compra e pedir indicação de forma leve.", assunto: "Obrigado pela confiança", modelo: "Oi {primeiro_nome}, obrigado por confiar no nosso trabalho! Se conhecer alguém que também precise de {produto}, vou adorar ajudar." },
  { nome: "Reativação", etapas: ["perdido"], objetivo: "Reabrir a conversa com um cliente que esfriou ou recusou, trazendo um motivo novo para conversar.", assunto: "Uma novidade para {empresa}", modelo: "Oi {primeiro_nome}, tudo bem? Faz um tempo que conversamos sobre {produto}. Tenho uma novidade que pode fazer sentido para {empresa} agora. Posso te contar?" },
];

// Colunas da tabela negocios que podem ser gravadas pela tela.
export const COLUNAS_NEGOCIO = ["user_id", "nome", "empresa", "cnpj", "cnae", "atividade", "telefone", "email", "canal", "valor", "etapa", "etapa_desde", "acao", "acao_data", "motivo_perda", "tipo_msg_id", "msg_rascunho", "assunto_rascunho", "msg_origem"];

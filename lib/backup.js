// Montagem do backup: usada tanto pelo botão "Baixar planilha" (navegador)
// quanto pelo backup automático diário (servidor).
import { nomeEtapa } from "./constantes";

export const TABELAS = ["perfis", "produtos", "tipos_mensagem", "modelos_produto", "negocios", "negocio_produtos", "interacoes", "configuracoes"];

// Busca todas as linhas de cada tabela, de 1000 em 1000.
export async function coletarDados(sb) {
  const dados = {};
  for (const t of TABELAS) {
    dados[t] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from(t).select("*").range(de, de + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      dados[t].push(...data);
      if (data.length < 1000) break;
    }
  }
  return dados;
}

const B = (v) => ({ value: v, fontWeight: "bold" });
const txt = (v) => (v === null || v === undefined ? "" : String(v));
const din = (v) => ({ value: Number(v) || 0, format: '"R$" #,##0.00' });
function dataHora(v) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? txt(v) : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function data(v) {
  if (!v) return "";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Converte os dados em abas de planilha (formato do write-excel-file).
export function montarPlanilha(dados) {
  const pessoas = Object.fromEntries(dados.perfis.map((p) => [p.user_id, p.nome || p.email]));
  const produtos = Object.fromEntries(dados.produtos.map((p) => [p.id, p.nome]));
  const tipos = Object.fromEntries(dados.tipos_mensagem.map((t) => [t.id, t.nome]));
  const negocios = Object.fromEntries(dados.negocios.map((n) => [n.id, n.nome || n.empresa]));
  const prodsPorNegocio = {};
  dados.negocio_produtos.forEach((r) => { (prodsPorNegocio[r.negocio_id] ||= []).push(produtos[r.produto_id] || "?"); });

  const aba = (sheet, cabecalho, linhas) => ({
    sheet,
    data: [cabecalho.map(B), ...linhas],
    columns: cabecalho.map((c) => ({ width: Math.min(Math.max(c.length + 4, 14), 48) })),
  });

  return [
    aba("Negócios",
      ["Nome", "Empresa", "Razão social", "CNPJ", "Situação na Receita", "Cidade", "UF", "CNAE", "Atividade", "Telefone", "E-mail", "Canal", "Valor", "Etapa", "Na etapa desde", "Próxima ação", "Data da ação", "Motivo da perda", "Produtos", "Responsável", "Criado em", "Atualizado em", "ID"],
      dados.negocios.map((n) => [
        txt(n.nome), txt(n.empresa), txt(n.razao_social), txt(n.cnpj), txt(n.situacao_cnpj), txt(n.cidade), txt(n.uf), txt(n.cnae), txt(n.atividade), txt(n.telefone), txt(n.email),
        n.canal === "email" ? "E-mail" : "WhatsApp", din(n.valor), nomeEtapa(n.etapa), data(n.etapa_desde),
        txt(n.acao), data(n.acao_data), txt(n.motivo_perda), (prodsPorNegocio[n.id] || []).join(", "),
        txt(pessoas[n.user_id]), dataHora(n.criado_em), dataHora(n.atualizado_em), n.id,
      ])),
    aba("Histórico",
      ["Data", "Negócio", "Registro", "Automático", "ID do negócio"],
      dados.interacoes
        .slice().sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
        .map((i) => [dataHora(i.criado_em), txt(negocios[i.negocio_id]), txt(i.texto), i.sistema ? "Sim" : "Não", i.negocio_id])),
    aba("Produtos",
      ["Nome", "Preço", "Cobrança", "Oferta", "Segmentos ideais", "Ativo", "ID"],
      dados.produtos.map((p) => [txt(p.nome), din(p.preco), p.cobranca === "mensal" ? "Mensal" : "Único", txt(p.oferta), txt(p.segmentos), p.ativo ? "Sim" : "Não", p.id])),
    aba("Tipos de mensagem",
      ["Nome", "Objetivo", "Assunto do e-mail", "Modelo padrão", "Etapas", "ID"],
      dados.tipos_mensagem.map((t) => [txt(t.nome), txt(t.objetivo), txt(t.assunto), txt(t.modelo), (t.etapas || []).map(nomeEtapa).join(", "), t.id])),
    aba("Mensagens por produto",
      ["Produto", "Tipo de mensagem", "Mensagem"],
      dados.modelos_produto.filter((m) => (m.modelo || "").trim()).map((m) => [txt(produtos[m.produto_id]), txt(tipos[m.tipo_id]), txt(m.modelo)])),
    aba("Usuários",
      ["Nome", "E-mail", "Papel", "Status", "Cadastro"],
      dados.perfis.map((p) => [txt(p.nome), txt(p.email), txt(p.papel), txt(p.status), dataHora(p.criado_em)])),
  ];
}

// Nome do arquivo com data e hora de Brasília, ex.: crm-gade2b-2026-09-30-0300
export function nomeBackup(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return `crm-gade2b-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

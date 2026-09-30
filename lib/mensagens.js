import { ABERTAS, nomeEtapa } from "./constantes";
import { brlExato, diff, hoje, fmtData } from "./util";

export const precoTxt = (p) => brlExato(p.preco) + (p.cobranca === "mensal" ? "/mês" : "");
export function juntar(a) {
  a = a.filter(Boolean);
  if (a.length <= 1) return a[0] || "";
  return a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
}
export function prodsDe(d, produtos) {
  return (d.produtos || []).map((id) => produtos.find((p) => p.id === id)).filter(Boolean);
}
export function tipoAtual(d, tipos) {
  return tipos.find((t) => t.id === d.tipo_msg_id) || tipos.find((t) => (t.etapas || []).includes(d.etapa)) || tipos[0];
}
export function variaveis(d, ps, assinatura) {
  const seg = d.atividade ? d.atividade.charAt(0).toLowerCase() + d.atividade.slice(1) : "seu segmento";
  return {
    nome: d.nome || "",
    primeiro_nome: (d.nome || "").trim().split(/\s+/)[0] || "",
    empresa: d.empresa || "você",
    segmento: seg,
    cnae: d.cnae || "",
    produto: juntar(ps.map((p) => p.nome)) || "nossas soluções",
    oferta: ps.map((p) => p.oferta).filter(Boolean).join("; "),
    preco: ps.length === 1 ? precoTxt(ps[0]) : juntar(ps.map((p) => p.nome + " por " + precoTxt(p))),
    meu_nome: assinatura || "",
  };
}
export function preencher(tpl, v) {
  return (tpl || "")
    // {preco} já traz o "R$"; evita "R$ R$ 99,99" quando o modelo tiver "R$ {preco}"
    .replace(/R\$\s*\{preco\}/gi, "{preco}")
    .replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m))
    .replace(/ +([,.!?:;])/g, "$1")
    .replace(/ {2,}/g, " ")
    .replace(/^Oi[,!]/, "Oi")
    .trim();
}
// ctx = { produtos, tipos, modelos, assinatura }  — modelos: { "produtoId:tipoId": texto }
export function modeloPara(d, ctx) {
  const t = tipoAtual(d, ctx.tipos);
  if (!t) return { msg: "", assunto: "", especifico: false };
  const ps = prodsDe(d, ctx.produtos);
  const v = variaveis(d, ps, ctx.assinatura);
  const esp = ps.length === 1 && (ctx.modelos[ps[0].id + ":" + t.id] || "").trim();
  return { msg: preencher(esp || t.modelo, v), assunto: preencher(t.assunto, v), especifico: !!esp };
}

export function statusAcao(d) {
  if (!d.acao_data || !ABERTAS.includes(d.etapa)) return null;
  const x = diff(d.acao_data, hoje());
  if (x < 0) return { cls: "late", txt: `Atrasado ${-x} ${-x === 1 ? "dia" : "dias"}` };
  if (x === 0) return { cls: "today", txt: "Hoje" };
  if (x === 1) return { cls: "", txt: "Amanhã" };
  return { cls: "", txt: fmtData(d.acao_data) };
}

export function promptIA(d, ctx, interacoes) {
  const t = tipoAtual(d, ctx.tipos);
  const ps = prodsDe(d, ctx.produtos);
  const ref = modeloPara(d, ctx);
  const canal = d.canal === "email" ? "e-mail" : "WhatsApp";
  const ultimas = (interacoes || []).filter((n) => !n.sistema).slice(0, 5).map((n) => fmtData(n.criado_em) + ": " + n.texto).join(" | ");
  return `Você escreve mensagens de vendas em português do Brasil, prontas para enviar por ${canal}.

TIPO DE MENSAGEM: ${t?.nome || "-"}
OBJETIVO: ${t?.objetivo || "-"}

REMETENTE (como se apresentar): ${ctx.assinatura || "-"}

CLIENTE
- Nome: ${d.nome || "-"}
- Empresa: ${d.empresa || "pessoa física ou não informada"}
- CNAE: ${d.cnae || "não informado"}${d.atividade ? " – " + d.atividade : ""}
- Cidade: ${d.cidade ? d.cidade + (d.uf ? "/" + d.uf : "") : "não informada"}
- Etapa no funil: ${nomeEtapa(d.etapa)}
- Últimas interações: ${ultimas || "nenhuma"}

PRODUTOS A OFERECER
${ps.length ? ps.map((p) => `- ${p.nome} (${precoTxt(p)}): ${p.oferta || "-"}. Segmentos ideais: ${p.segmentos || "-"}`).join("\n") : "- Nenhum produto selecionado: fale de forma geral sobre ajudar o negócio do cliente."}

MODELO DE REFERÊNCIA (use como base de tom e estrutura, não copie literalmente):
${ref.msg}

REGRAS
- Conecte a oferta à realidade concreta da atividade do cliente (pelo CNAE), mostrando que você entende o dia a dia desse tipo de negócio.
- Não invente números, resultados, prazos, descontos ou garantias que não estejam nos dados acima.
- Use o primeiro nome do cliente. Tom próximo e profissional, sem exageros.
- Só mencione preço se o objetivo do tipo de mensagem pedir.
- ${d.canal === "email" ? "E-mail: assunto com até 60 caracteres; corpo com saudação, 2 a 3 parágrafos curtos e assinatura com o remetente." : "WhatsApp: até 600 caracteres, parágrafos curtos, no máximo 1 emoji, sem assinatura formal e sem assunto."}
- Termine com uma pergunta ou um próximo passo claro.

Responda somente com JSON no formato {"assunto": "...", "mensagem": "..."}${d.canal === "email" ? "" : ' com "assunto" vazio'}.`;
}

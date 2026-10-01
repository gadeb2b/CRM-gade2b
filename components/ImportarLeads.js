"use client";
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, nomeEtapa } from "../lib/constantes";
import { hoje, soDigitos, cnpjValido, formatarCnpj } from "../lib/util";
import { IcX } from "./Icon";

// ---------- Campos de destino e reconhecimento automático das colunas ----------
const CAMPOS = [
  ["", "— ignorar coluna —"],
  ["nome", "Nome do lead"],
  ["empresa", "Empresa (nome fantasia)"],
  ["razao_social", "Razão social"],
  ["cnpj", "CNPJ"],
  ["contato_nome", "Nome do contato"],
  ["contato_cargo", "Cargo do contato"],
  ["email", "E-mail"],
  ["tel_whatsapp", "Telefone (WhatsApp)"],
  ["tel_celular", "Telefone (celular)"],
  ["tel_fixo", "Telefone (fixo)"],
  ["cidade", "Cidade"],
  ["uf", "UF"],
  ["cnae", "CNAE"],
  ["valor", "Valor do negócio"],
  ["observacao", "Observação (vai para o histórico)"],
];
const sem = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function adivinhar(cabecalhos) {
  const usados = new Set();
  const regras = [
    [/cnpj/, "cnpj"], [/raz[a]?o/, "razao_social"], [/fantasia|empresa|companhia|loja/, "empresa"],
    [/whats|zap/, "tel_whatsapp"], [/fixo|comercial/, "tel_fixo"], [/celular|\bcel\b|movel/, "tel_celular"],
    [/telefone|fone|\btel\b|numero/, "tel_celular"], [/e-?mail/, "email"],
    [/cargo|funcao/, "contato_cargo"], [/contato|responsavel/, "contato_nome"],
    [/cidade|municipio/, "cidade"], [/^uf$|estado/, "uf"], [/cnae|atividade/, "cnae"],
    [/valor|preco|ticket/, "valor"], [/obs|anotac|nota|coment/, "observacao"], [/nome|cliente|lead/, "nome"],
  ];
  return cabecalhos.map((c) => {
    const h = sem(c);
    for (const [re, campo] of regras) {
      let alvo = campo;
      if (alvo === "tel_celular" && usados.has("tel_celular")) alvo = usados.has("tel_fixo") ? "" : "tel_fixo";
      if (re.test(h) && alvo && !usados.has(alvo)) { usados.add(alvo); return alvo; }
    }
    return "";
  });
}

// ---------- Leitura de CSV e de texto colado ----------
function lerCsv(texto) {
  const primeira = texto.split(/\r?\n/)[0] || "";
  const sep = primeira.includes("\t") ? "\t" : (primeira.split(";").length >= primeira.split(",").length ? ";" : ",");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => String(c).trim()));
}

// ---------- Ajustes dos valores ----------
const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
function titulo(s) {
  return String(s || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ")
    .replace(/\b(Ltda|Me|Epp|Eireli|S\/a)\b/gi, (m) => m.toUpperCase());
}
const ehMaiusculas = (s) => { const l = String(s || "").replace(/[^A-Za-zÀ-ú]/g, ""); return l.length > 3 && l === l.toUpperCase(); };
function formatarTel(v) {
  let n = soDigitos(v);
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(v || "").trim();
}
const digitosTel = (v) => { let n = soDigitos(v); if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2); return n; };
function lerValor(v) {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  let s = String(v || "").replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
const texto = (v) => (v === null || v === undefined ? "" : v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v).trim());

export default function ImportarLeads({ etapaInicial, produtos, pessoas, ehAdmin, userId, negocios, contatosMap, concluido, fechar, toast }) {
  const [passo, setPasso] = useState(1);
  const [arquivo, setArquivo] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [colado, setColado] = useState("");
  const [temCabecalho, setTemCabecalho] = useState(true);
  const [mapa, setMapa] = useState([]);
  const [etapa, setEtapa] = useState(etapaInicial || ETAPAS.find((e) => e.tipo === "aberta")?.id || "");
  const [resp, setResp] = useState(userId);
  const [produto, setProduto] = useState("");
  const [corrigirMaiusculas, setCorrigirMaiusculas] = useState(true);
  const [pularDuplicados, setPularDuplicados] = useState(true);
  const [progresso, setProgresso] = useState(null);
  const vendedores = (pessoas || []).filter((p) => p.status === "ativo");

  function carregarLinhas(ls, nome) {
    const limpas = ls.map((l) => l.map(texto));
    if (!limpas.length) { toast("Não encontrei linhas com dados."); return; }
    setArquivo(nome);
    setLinhas(limpas);
    setMapa(adivinhar(temCabecalho ? limpas[0] : limpas[0].map(() => "")));
    setCorrigirMaiusculas(limpas.slice(1, 30).some((l) => l.some(ehMaiusculas)));
    setPasso(2);
  }

  async function lerArquivo(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        carregarLinhas(await readSheet(f), f.name);
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        carregarLinhas(lerCsv(await f.text()), f.name);
      } else toast("Use um arquivo .xlsx ou .csv. Se for .xls antigo, salve como .xlsx no Excel.");
    } catch (err) {
      toast("Não consegui ler o arquivo: " + err.message);
    }
  }

  const cab = temCabecalho ? linhas[0] || [] : (linhas[0] || []).map((_, i) => `Coluna ${i + 1}`);
  const dadosBrutos = temCabecalho ? linhas.slice(1) : linhas;

  // Monta os leads a partir das colunas escolhidas
  const leads = useMemo(() => {
    const idx = (campo) => mapa.indexOf(campo);
    const pega = (l, campo) => { const i = idx(campo); return i >= 0 ? texto(l[i]) : ""; };
    return dadosBrutos.map((l, n) => {
      const ajusta = (v) => (corrigirMaiusculas && ehMaiusculas(v) ? titulo(v) : v);
      const tels = [["tel_whatsapp", "whatsapp"], ["tel_celular", "celular"], ["tel_fixo", "fixo"]]
        .map(([c, et]) => ({ numero: formatarTel(pega(l, c)), etiqueta: et, dig: digitosTel(pega(l, c)) }))
        .filter((t, i, arr) => t.dig.length >= 8 && arr.findIndex((y) => y.dig === t.dig) === i);
      const cnpjDig = soDigitos(pega(l, "cnpj"));
      const empresa = ajusta(pega(l, "empresa"));
      const razao = ajusta(pega(l, "razao_social"));
      const nome = ajusta(pega(l, "nome")) || ajusta(pega(l, "contato_nome")) || empresa || razao;
      return {
        linha: n + (temCabecalho ? 2 : 1),
        nome, empresa, razao_social: razao,
        cnpj: cnpjDig.length === 14 ? formatarCnpj(cnpjDig) : pega(l, "cnpj"),
        cnpjDig: cnpjDig.length === 14 && cnpjValido(cnpjDig) ? cnpjDig : "",
        contato_nome: ajusta(pega(l, "contato_nome")) || (pega(l, "nome") ? ajusta(pega(l, "nome")) : ""),
        contato_cargo: pega(l, "contato_cargo"),
        email: pega(l, "email").toLowerCase(),
        tels,
        cidade: ajusta(pega(l, "cidade")), uf: pega(l, "uf").toUpperCase().slice(0, 2),
        cnae: pega(l, "cnae"), valor: lerValor(pega(l, "valor")), observacao: pega(l, "observacao"),
      };
    }).filter((x) => x.nome || x.tels.length || x.email);
  }, [dadosBrutos, mapa, corrigirMaiusculas, temCabecalho]);

  // Duplicados: mesmo CNPJ ou mesmo telefone de um negócio já existente (ou repetido na planilha)
  const analise = useMemo(() => {
    const cnpjs = new Set(negocios.map((d) => soDigitos(d.cnpj)).filter((x) => x.length === 14));
    const fones = new Set();
    negocios.forEach((d) => { const x = digitosTel(d.telefone); if (x.length >= 8) fones.add(x); });
    Object.values(contatosMap || {}).flat().forEach((c) => (c.telefones || []).forEach((t) => { const x = digitosTel(t.numero); if (x.length >= 8) fones.add(x); }));
    const vistosC = new Set(), vistosT = new Set();
    return leads.map((x) => {
      let dup = "";
      if (x.cnpjDig && (cnpjs.has(x.cnpjDig) || vistosC.has(x.cnpjDig))) dup = cnpjs.has(x.cnpjDig) ? "CNPJ já existe no CRM" : "CNPJ repetido na planilha";
      else { const t = x.tels.find((t) => fones.has(t.dig) || vistosT.has(t.dig)); if (t) dup = fones.has(t.dig) ? `Telefone ${t.numero} já existe no CRM` : `Telefone ${t.numero} repetido na planilha`; }
      if (x.cnpjDig) vistosC.add(x.cnpjDig);
      x.tels.forEach((t) => vistosT.add(t.dig));
      return { ...x, dup };
    });
  }, [leads, negocios, contatosMap]);

  const aImportar = analise.filter((x) => !(pularDuplicados && x.dup));
  const nDup = analise.filter((x) => x.dup).length;

  async function importar() {
    if (!aImportar.length) return;
    const nomeArquivo = arquivo || "texto colado";
    const prod = produtos.find((p) => p.id === produto);
    const distribuir = resp === "__dividir__";
    const ids = vendedores.map((v) => v.user_id);
    let feitos = 0, falhas = 0;
    setProgresso({ feitos: 0, total: aImportar.length });
    for (let i = 0; i < aImportar.length; i += 50) {
      const lote = aImportar.slice(i, i + 50);
      const linhasNeg = lote.map((x, k) => ({
        nome: x.nome || x.empresa || "Sem nome", empresa: x.empresa, razao_social: x.razao_social, cnpj: x.cnpj,
        cidade: x.cidade, uf: x.uf, cnae: x.cnae, etapa,
        valor: x.valor || (prod ? +prod.preco || 0 : 0),
        canal: x.tels.length ? "whatsapp" : x.email ? "email" : "whatsapp",
        acao: "Fazer primeiro contato", acao_data: hoje(),
        user_id: ehAdmin ? (distribuir ? ids[(i + k) % ids.length] : resp) : userId,
      }));
      const { data: novos, error } = await supabase.from("negocios").insert(linhasNeg).select("id");
      if (error) { falhas += lote.length; toast("Erro ao importar um lote: " + error.message); continue; }
      // Contatos e telefones
      const comContato = lote.map((x, k) => ({ x, id: novos[k]?.id })).filter((o) => o.id && (o.x.contato_nome || o.x.email || o.x.tels.length));
      if (comContato.length) {
        const { data: cs, error: e2 } = await supabase.from("contatos").insert(comContato.map((o) => ({
          negocio_id: o.id, nome: o.x.contato_nome, cargo: o.x.contato_cargo, email: o.x.email, ordem: 0,
        }))).select("id,negocio_id");
        if (e2) toast("Contatos não salvos: " + e2.message);
        else {
          const porNeg = Object.fromEntries(cs.map((c) => [c.negocio_id, c.id]));
          const tels = comContato.flatMap((o) => o.x.tels.map((t, j) => ({
            contato_id: porNeg[o.id], negocio_id: o.id, numero: t.numero, etiqueta: t.etiqueta, principal: j === 0,
          })));
          if (tels.length) { const r = await supabase.from("telefones").insert(tels); if (r.error) toast("Telefones não salvos: " + r.error.message); }
        }
      }
      if (prod) await supabase.from("negocio_produtos").insert(novos.map((n) => ({ negocio_id: n.id, produto_id: prod.id, quantidade: 1 })));
      const notas = lote.flatMap((x, k) => {
        const id = novos[k]?.id; if (!id) return [];
        const r = [{ negocio_id: id, texto: `Importado da planilha “${nomeArquivo}” (linha ${x.linha})`, sistema: true }];
        if (x.observacao) r.push({ negocio_id: id, texto: x.observacao, sistema: false });
        return r;
      });
      await supabase.from("interacoes").insert(notas);
      feitos += novos.length;
      setProgresso({ feitos, total: aImportar.length });
    }
    toast(`${feitos} lead(s) importado(s)${falhas ? `, ${falhas} com erro` : ""}.`);
    await concluido();
    fechar();
  }

  return (
    <aside className="drawer wide open imp" aria-labelledby="imp-title">
      <div className="d-head">
        <h2 id="imp-title">Importar leads</h2>
        <button className="btn ghost" onClick={fechar} aria-label="Fechar" disabled={!!progresso}><IcX /></button>
      </div>
      <div className="imp-passos">
        {["Enviar planilha", "Ligar colunas", "Revisar e importar"].map((t, i) => (
          <span key={t} className={passo === i + 1 ? "atual" : passo > i + 1 ? "feito" : ""}>{i + 1}. {t}</span>
        ))}
      </div>
      <div className="d-body">
        {passo === 1 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Envie a planilha com os leads. A primeira linha pode ter os nomes das colunas (Nome, Telefone, E-mail…): o sistema reconhece sozinho.</p>
            <label className="imp-arquivo">
              <input type="file" accept=".xlsx,.csv,.txt" hidden onChange={lerArquivo} />
              <b>Escolher arquivo</b>
              <span className="muted">Excel (.xlsx) ou .csv</span>
            </label>
            <label className="cat-check" style={{ margin: "12px 0" }}>
              <input type="checkbox" checked={temCabecalho} onChange={(e) => setTemCabecalho(e.target.checked)} /> A primeira linha tem os nomes das colunas
            </label>
            <h3>Ou cole as linhas</h3>
            <p className="muted" style={{ marginTop: 0 }}>Selecione as linhas no Excel ou Google Sheets (com o cabeçalho), copie e cole aqui.</p>
            <textarea className="col-area" value={colado} onChange={(e) => setColado(e.target.value)} placeholder={"Nome\tTelefone\tE-mail\nMaria Souza\t(11) 98765-4321\tmaria@empresa.com"} />
            <button className="btn primary" style={{ marginTop: 10 }} disabled={!colado.trim()} onClick={() => carregarLinhas(lerCsv(colado), "")}>Continuar com o texto colado</button>
          </>
        )}

        {passo === 2 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {arquivo ? <>Arquivo <b>{arquivo}</b> · </> : null}{dadosBrutos.length} linha(s). Confira para onde vai cada coluna. Colunas marcadas como “ignorar” não são importadas.
            </p>
            <div className="planilha-wrap" style={{ flex: "none" }}>
              <table className="planilha">
                <thead><tr><th>Coluna da planilha</th><th>Exemplo</th><th>Vai para</th></tr></thead>
                <tbody>
                  {cab.map((c, i) => (
                    <tr key={i}>
                      <td className="txt">{c || `Coluna ${i + 1}`}</td>
                      <td className="txt muted imp-ex">{dadosBrutos.slice(0, 3).map((l) => l[i]).filter(Boolean).join(" · ")}</td>
                      <td>
                        <select className="cel" value={mapa[i] || ""} onChange={(e) => setMapa((m) => { const n = [...m]; n[i] = e.target.value; return n; })}>
                          {CAMPOS.map(([v, t]) => <option key={v} value={v} disabled={v && mapa.includes(v) && mapa[i] !== v}>{t}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mapa.some((m) => ["nome", "empresa", "razao_social", "contato_nome", "tel_whatsapp", "tel_celular", "tel_fixo", "email"].includes(m)) &&
              <p className="status err">Escolha pelo menos uma coluna de nome, empresa, telefone ou e-mail.</p>}
          </>
        )}

        {passo === 3 && (
          <>
            <div className="grid">
              <div className="field">
                <label>Etapa inicial</label>
                <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                  {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              {ehAdmin && (
                <div className="field">
                  <label>Responsável</label>
                  <select value={resp} onChange={(e) => setResp(e.target.value)}>
                    {vendedores.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome || p.email}</option>)}
                    {vendedores.length > 1 && <option value="__dividir__">Dividir igualmente entre todos</option>}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Produto para todos (opcional)</label>
                <select value={produto} onChange={(e) => setProduto(e.target.value)}>
                  <option value="">Nenhum</option>
                  {produtos.filter((p) => p.ativo !== false).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="imp-opcoes">
              <label className="cat-check"><input type="checkbox" checked={corrigirMaiusculas} onChange={(e) => setCorrigirMaiusculas(e.target.checked)} /> Converter nomes em MAIÚSCULAS para “Nome Próprio”</label>
              <label className="cat-check"><input type="checkbox" checked={pularDuplicados} onChange={(e) => setPularDuplicados(e.target.checked)} /> Pular duplicados (mesmo CNPJ ou telefone)</label>
            </div>
            <div className="fin-cards" style={{ marginTop: 12 }}>
              <div className="fin-card ok"><span>Serão importados</span><b>{aImportar.length}</b></div>
              <div className="fin-card"><span>Duplicados encontrados</span><b>{nDup}</b></div>
              <div className="fin-card"><span>Linhas sem dados úteis</span><b>{dadosBrutos.length - leads.length}</b></div>
            </div>
            <div className="planilha-wrap" style={{ flex: "none", maxHeight: 320 }}>
              <table className="planilha leitura">
                <thead><tr><th>Linha</th><th>Nome</th><th>Empresa</th><th>Contato</th><th>Telefones</th><th>E-mail</th><th>Situação</th></tr></thead>
                <tbody>
                  {analise.slice(0, 200).map((x) => (
                    <tr key={x.linha} className={x.dup && pularDuplicados ? "inativo" : ""}>
                      <td>{x.linha}</td><td>{x.nome}</td><td>{x.empresa || x.razao_social}</td><td>{x.contato_nome}{x.contato_cargo ? ` (${x.contato_cargo})` : ""}</td>
                      <td className="imp-tels">{x.tels.map((t) => <span key={t.dig}>{t.numero}</span>)}</td><td>{x.email}</td>
                      <td>{x.dup ? <span className="tag-sit aguardando">{x.dup}</span> : <span className="tag-sit liberado">Novo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analise.length > 200 && <p className="muted">Mostrando as primeiras 200 linhas da prévia.</p>}
            {progresso && (
              <div className="imp-progresso">
                <div style={{ width: `${Math.round((progresso.feitos / progresso.total) * 100)}%` }} />
                <span>Importando… {progresso.feitos} de {progresso.total}</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="d-foot">
        {passo > 1 ? <button className="btn" disabled={!!progresso} onClick={() => setPasso(passo - 1)}>Voltar</button> : <span />}
        {passo === 2 && <button className="btn primary" disabled={!leads.length} onClick={() => setPasso(3)}>Continuar ({leads.length} leads)</button>}
        {passo === 3 && <button className="btn primary" disabled={!aImportar.length || !!progresso} onClick={importar}>
          {progresso ? "Importando…" : `Importar ${aImportar.length} lead(s) em “${nomeEtapa(etapa)}”`}
        </button>}
      </div>
    </aside>
  );
}

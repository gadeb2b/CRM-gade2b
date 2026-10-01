"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { hoje } from "../lib/util";
import { IcSearch } from "./Icon";
import RegrasComissao from "./RegrasComissao";

const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");
const mesNome = (m) => {
  const [y, mm] = m.split("-");
  return new Date(+y, +mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

// Situação de cada recebimento, para filtros e etiquetas
function situacao(r) {
  if (r.status === "previsto") return r.data_prevista && r.data_prevista < hoje() ? "atrasado" : "previsto";
  if (r.status === "recebido") return Number(r.valor_recebido) !== Number(r.valor_previsto) ? "diferenca" : "recebido";
  return r.status;
}
const ROTULO = { previsto: "A receber", atrasado: "Atrasado", recebido: "Recebido", diferenca: "Recebido com diferença", estornado: "Estornado", cancelado: "Cancelado" };

function situacaoRepasse(r) {
  if (r.repasse_pago_em) return "pago";
  if (r.status === "recebido") return "liberado";
  if (r.status === "previsto") return "aguardando";
  return "cancelado";
}
const ROTULO_REP = { aguardando: "Aguardando recebimento", liberado: "Liberado para pagar", pago: "Pago", cancelado: "Cancelado/estornado" };

export default function Financeiro({ fornecedores, produtos, pessoas, recarregarPessoas, toast }) {
  const [aba, setAba] = useState("recebimentos");
  const [linhas, setLinhas] = useState(null);

  const carregar = useCallback(async () => {
    const todas = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("recebimentos").select("*").order("data_prevista", { ascending: true }).range(de, de + 999);
      if (error) { toast("Não foi possível carregar o financeiro: " + error.message); setLinhas([]); return; }
      todas.push(...data);
      if (data.length < 1000) break;
    }
    setLinhas(todas);
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  // Atualiza uma ou várias linhas e traz de volta os valores recalculados pelo banco
  const atualizar = useCallback(async (ids, patch, msg) => {
    const { data, error } = await supabase.from("recebimentos").update(patch).in("id", ids).select();
    if (error) { toast("Não foi possível salvar: " + error.message); return false; }
    const novos = Object.fromEntries(data.map((r) => [r.id, r]));
    setLinhas((ls) => ls.map((r) => novos[r.id] || r));
    if (msg) toast(msg);
    return true;
  }, [toast]);

  return (
    <div className="fin">
      <div className="fin-topo">
        <h2>Financeiro</h2>
        <div className="tabs fin-tabs" role="tablist">
          {[["recebimentos", "Recebimentos"], ["comissoes", "Repasses aos vendedores"], ["regras", "Comissão por vendedor"], ["config", "Configurações"]].map(([id, n]) => (
            <button key={id} className="tab" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{n}</button>
          ))}
        </div>
      </div>
      {linhas === null ? <p className="muted" style={{ padding: 20 }}>Carregando…</p>
        : aba === "recebimentos" ? <Recebimentos linhas={linhas} fornecedores={fornecedores} atualizar={atualizar} />
        : aba === "comissoes" ? <Comissoes linhas={linhas} atualizar={atualizar} />
        : aba === "regras" ? <RegrasComissao pessoas={pessoas} fornecedores={fornecedores} produtos={produtos} recarregarPessoas={recarregarPessoas} toast={toast} />
        : <Configuracoes toast={toast} recarregar={carregar} />}
    </div>
  );
}

/* ---------------- Recebimentos ---------------- */
function Recebimentos({ linhas, fornecedores, atualizar }) {
  const [mes, setMes] = useState("todos");
  const [filtro, setFiltro] = useState("ativos");
  const [forn, setForn] = useState("");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState(new Set());
  const [dataBaixa, setDataBaixa] = useState(hoje());

  const meses = useMemo(() => [...new Set(linhas.map((r) => (r.data_prevista || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [linhas]);

  const base = linhas.filter((r) => (mes === "todos" || (r.data_prevista || "").startsWith(mes)) && (!forn || r.fornecedor_id === forn)
    && (!busca || (r.negocio_nome + " " + r.cliente_empresa + " " + r.produto_nome + " " + r.vendedor_nome).toLowerCase().includes(busca.toLowerCase())));
  const lista = base.filter((r) => {
    const s = situacao(r);
    if (filtro === "ativos") return s !== "cancelado";
    if (filtro === "abertos") return s === "previsto" || s === "atrasado";
    if (filtro === "revisar") return r.revisar;
    if (filtro === "todos") return true;
    return s === filtro;
  });

  const soma = (arr, f) => arr.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  const aReceber = soma(base.filter((r) => r.status === "previsto"), (r) => r.valor_previsto);
  const atrasado = soma(base.filter((r) => situacao(r) === "atrasado"), (r) => r.valor_previsto);
  const recebido = soma(base.filter((r) => r.status === "recebido"), (r) => r.valor_recebido);
  const estornado = soma(base.filter((r) => r.status === "estornado"), (r) => r.valor_previsto);
  const paraRevisar = base.filter((r) => r.revisar).length;

  const visiveis = lista.map((r) => r.id);
  const todosMarcados = visiveis.length > 0 && visiveis.every((id) => sel.has(id));
  const marcar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...sel].filter((id) => visiveis.includes(id));

  async function emLote(patch, msg) {
    if (await atualizar(ids, patch, msg)) setSel(new Set());
  }

  return (
    <>
      <div className="fin-cards">
        <div className="fin-card"><span>A receber</span><b>{reais(aReceber)}</b></div>
        <div className="fin-card alerta"><span>Atrasado</span><b>{reais(atrasado)}</b></div>
        <div className="fin-card ok"><span>Recebido</span><b>{reais(recebido)}</b></div>
        <div className="fin-card"><span>Estornado</span><b>{reais(estornado)}</b></div>
        {paraRevisar > 0 && <button className="fin-card revisar" onClick={() => setFiltro("revisar")}><span>Para revisar</span><b>{paraRevisar}</b></button>}
      </div>

      <div className="fin-filtros">
        <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês previsto">
          <option value="todos">Todos os meses</option>
          {meses.map((m) => <option key={m} value={m}>{mesNome(m)}</option>)}
        </select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Situação">
          <option value="ativos">Todos (sem cancelados)</option>
          <option value="abertos">Em aberto</option>
          <option value="atrasado">Atrasados</option>
          <option value="recebido">Recebidos</option>
          <option value="diferenca">Recebidos com diferença</option>
          <option value="estornado">Estornados</option>
          <option value="cancelado">Cancelados</option>
          <option value="revisar">Para revisar</option>
          <option value="todos">Todos</option>
        </select>
        <select value={forn} onChange={(e) => setForn(e.target.value)} aria-label="Fornecedor">
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="search"><IcSearch /><input type="search" placeholder="Buscar cliente, produto ou vendedor" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" /></div>
      </div>

      {ids.length > 0 && (
        <div className="fin-lote">
          <b>{ids.length} selecionado(s)</b> · {reais(soma(lista.filter((r) => sel.has(r.id)), (r) => r.valor_previsto))} previstos
          <span className="spacer" />
          <label>Recebido em <input type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} /></label>
          <button className="btn small primary" onClick={() => emLote({ status: "recebido", data_recebimento: dataBaixa, valor_recebido: null }, "Baixa feita. Valores recebidos iguais aos previstos; ajuste na linha se houver diferença.")}>Marcar como recebido</button>
          <button className="btn small" onClick={() => emLote({ status: "estornado" }, "Marcado como estornado")}>Estornado</button>
          <button className="btn small" onClick={() => emLote({ status: "previsto" }, "Voltou para a receber")}>Voltar para a receber</button>
          <button className="btn small ghost" onClick={() => setSel(new Set())}>Limpar</button>
        </div>
      )}

      <div className="planilha-wrap">
        <table className="planilha fin-tab">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(visiveis))} aria-label="Selecionar todos" /></th>
              <th>Previsto para</th><th>Cliente</th><th>Produto</th><th>Parcela</th><th>Qtd</th>
              <th>Previsto</th><th>Recebido</th><th>Recebido em</th><th>Situação</th><th>Vendedor</th><th style={{ minWidth: 220 }}>Observação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const s = situacao(r);
              return (
                <tr key={r.id} className={sel.has(r.id) ? "sel" : ""}>
                  <td className="chk"><input type="checkbox" checked={sel.has(r.id)} onChange={() => marcar(r.id)} aria-label="Selecionar" /></td>
                  <td className="txt">{dataBr(r.data_prevista)}</td>
                  <td className="txt">{r.negocio_nome}{r.cliente_empresa && r.cliente_empresa !== r.negocio_nome ? <span className="muted"> · {r.cliente_empresa}</span> : null}</td>
                  <td className="txt">{r.produto_nome}{r.fornecedor_nome ? <span className="muted"> · {r.fornecedor_nome}</span> : null}</td>
                  <td className="txt num">{r.parcela}/{r.parcelas}</td>
                  <td className="txt num">{r.quantidade}</td>
                  <td className="txt num">{reais(r.valor_previsto)}</td>
                  <td>
                    {r.status === "recebido"
                      ? <input key={r.atualizado_em} className="cel num" type="number" step="0.01" defaultValue={r.valor_recebido ?? ""}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(r.valor_recebido)) atualizar([r.id], { valor_recebido: v }, "Valor recebido ajustado"); }} aria-label="Valor recebido" />
                      : <span className="txt muted">—</span>}
                  </td>
                  <td>
                    {r.status === "recebido"
                      ? <input key={r.atualizado_em} className="cel" type="date" defaultValue={r.data_recebimento || ""}
                          onChange={(e) => e.target.value && atualizar([r.id], { data_recebimento: e.target.value })} aria-label="Data do recebimento" />
                      : <span className="txt muted">—</span>}
                  </td>
                  <td>
                    <select className={"cel sit " + s} value={r.status} onChange={(e) => atualizar([r.id], { status: e.target.value })} aria-label="Situação">
                      <option value="previsto">{s === "atrasado" ? "Atrasado" : "A receber"}</option>
                      <option value="recebido">{s === "diferenca" ? "Recebido c/ diferença" : "Recebido"}</option>
                      <option value="estornado">Estornado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </td>
                  <td className="txt">{r.vendedor_nome || "—"}</td>
                  <td>
                    <div className="obs">
                      {r.revisar && <button className="btn small revisar-btn" title="Marcar como revisado" onClick={() => atualizar([r.id], { revisar: false }, "Marcado como revisado")}>Revisar ✓</button>}
                      <input key={r.atualizado_em} className="cel" defaultValue={r.observacao} placeholder="—"
                        onBlur={(e) => { if (e.target.value !== r.observacao) atualizar([r.id], { observacao: e.target.value }); }} aria-label="Observação" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length && <p className="muted" style={{ padding: 20 }}>Nenhum recebimento com esses filtros. Os recebimentos aparecem aqui quando um negócio vai para “Ganho”.</p>}
      </div>
    </>
  );
}

/* ---------------- Comissões dos vendedores ---------------- */
function Comissoes({ linhas, atualizar }) {
  const [vend, setVend] = useState("");
  const [filtro, setFiltro] = useState("liberado");
  const [sel, setSel] = useState(new Set());
  const [dataPag, setDataPag] = useState(hoje());

  const comRepasse = linhas.filter((r) => r.repasse_tipo !== "nenhum");
  const vendedores = useMemo(() => {
    const m = new Map();
    comRepasse.forEach((r) => {
      const k = r.vendedor_id || r.vendedor_nome;
      if (!m.has(k)) m.set(k, { id: k, nome: r.vendedor_nome || "Sem nome", aguardando: 0, liberado: 0, pago: 0 });
      const v = m.get(k), s = situacaoRepasse(r);
      if (s === "aguardando") v.aguardando += Number(r.repasse_valor) || 0;
      if (s === "liberado") v.liberado += Number(r.repasse_valor) || 0;
      if (s === "pago") v.pago += Number(r.repasse_valor_pago ?? r.repasse_valor) || 0;
    });
    return [...m.values()].sort((a, b) => b.liberado - a.liberado);
  }, [comRepasse]);

  const lista = comRepasse
    .filter((r) => !vend || (r.vendedor_id || r.vendedor_nome) === vend)
    .filter((r) => filtro === "todos" || situacaoRepasse(r) === filtro)
    .sort((a, b) => ((a.data_recebimento || a.data_prevista || "") < (b.data_recebimento || b.data_prevista || "") ? 1 : -1));
  const visiveis = lista.filter((r) => ["liberado", "pago"].includes(situacaoRepasse(r))).map((r) => r.id);
  const todosMarcados = visiveis.length > 0 && visiveis.every((id) => sel.has(id));
  const ids = [...sel].filter((id) => visiveis.includes(id));
  const marcar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const totalSel = lista.filter((r) => sel.has(r.id)).reduce((t, r) => t + (Number(r.repasse_valor) || 0), 0);

  async function emLote(patch, msg) {
    if (await atualizar(ids, patch, msg)) setSel(new Set());
  }

  return (
    <>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        A comissão do vendedor só fica <b>liberada para pagar</b> depois que a Gade2B recebe do fornecedor. Selecione as linhas liberadas e marque como pagas quando fizer o repasse.
      </p>
      <div className="planilha-wrap" style={{ flex: "none", marginBottom: 14 }}>
        <table className="planilha leitura">
          <thead><tr><th>Vendedor</th><th>Aguardando recebimento</th><th>Liberado para pagar</th><th>Já pago</th><th /></tr></thead>
          <tbody>
            {vendedores.map((v) => (
              <tr key={v.id}>
                <td>{v.nome}</td><td className="num">{reais(v.aguardando)}</td><td className="num destaque">{reais(v.liberado)}</td><td className="num">{reais(v.pago)}</td>
                <td><button className="btn small ghost" onClick={() => { setVend(v.id); setFiltro("liberado"); }}>Ver detalhes</button></td>
              </tr>
            ))}
            {!vendedores.length && <tr><td colSpan={5} className="muted">Nenhuma comissão ainda. Defina a comissão de cada vendedor na aba “Comissão por vendedor”.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="fin-filtros">
        <select value={vend} onChange={(e) => setVend(e.target.value)} aria-label="Vendedor">
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Situação do repasse">
          <option value="liberado">Liberados para pagar</option>
          <option value="aguardando">Aguardando recebimento</option>
          <option value="pago">Pagos</option>
          <option value="cancelado">Cancelados/estornados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {ids.length > 0 && (
        <div className="fin-lote">
          <b>{ids.length} selecionado(s)</b> · {reais(totalSel)}
          <span className="spacer" />
          <label>Pago em <input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} /></label>
          <button className="btn small primary" onClick={() => emLote({ repasse_pago_em: dataPag, repasse_valor_pago: null }, "Repasse marcado como pago")}>Marcar como pago</button>
          <button className="btn small" onClick={() => emLote({ repasse_pago_em: null, repasse_valor_pago: null }, "Pagamento desfeito")}>Desfazer pagamento</button>
          <button className="btn small ghost" onClick={() => setSel(new Set())}>Limpar</button>
        </div>
      )}

      <div className="planilha-wrap">
        <table className="planilha fin-tab">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(visiveis))} aria-label="Selecionar todos" /></th>
              <th>Vendedor</th><th>Cliente</th><th>Produto</th><th>Parcela</th><th>Gade2B recebe</th><th>Regra</th><th>Comissão</th><th>Situação</th><th>Pago em</th><th>Valor pago</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const s = situacaoRepasse(r);
              const podeMarcar = s === "liberado" || s === "pago";
              return (
                <tr key={r.id} className={sel.has(r.id) ? "sel" : ""}>
                  <td className="chk">{podeMarcar && <input type="checkbox" checked={sel.has(r.id)} onChange={() => marcar(r.id)} aria-label="Selecionar" />}</td>
                  <td className="txt">{r.vendedor_nome}</td>
                  <td className="txt">{r.negocio_nome}</td>
                  <td className="txt">{r.produto_nome}{r.quantidade > 1 ? ` (${r.quantidade}×)` : ""}</td>
                  <td className="txt num">{r.parcela}/{r.parcelas}</td>
                  <td className="txt num">{reais(r.status === "recebido" ? r.valor_recebido : r.valor_previsto)}</td>
                  <td className="txt">{r.repasse_tipo === "percentual" ? `${Number(r.repasse_base).toLocaleString("pt-BR")}%` : `${reais(r.repasse_base)} por produto`}</td>
                  <td className="txt num destaque">{reais(r.repasse_valor)}</td>
                  <td className="txt"><span className={"tag-sit " + s}>{ROTULO_REP[s]}</span></td>
                  <td className="txt">{dataBr(r.repasse_pago_em)}</td>
                  <td>
                    {s === "pago"
                      ? <input key={r.atualizado_em} className="cel num" type="number" step="0.01" defaultValue={r.repasse_valor_pago ?? ""}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(r.repasse_valor_pago)) atualizar([r.id], { repasse_valor_pago: v }, "Valor pago ajustado"); }} aria-label="Valor pago" />
                      : <span className="txt muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length && <p className="muted" style={{ padding: 20 }}>Nada por aqui com esses filtros.</p>}
      </div>
    </>
  );
}

/* ---------------- Configurações financeiras ---------------- */
function Configuracoes({ toast, recarregar }) {
  const [cfg, setCfg] = useState(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    supabase.from("configuracao_empresa").select("*").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) toast(error.message);
      setCfg(data || {});
    });
  }, [toast]);

  async function salvar(patch) {
    setCfg((c) => ({ ...c, ...patch }));
    const { error } = await supabase.from("configuracao_empresa").update({ ...patch, atualizado_em: new Date().toISOString() }).eq("id", 1);
    if (error) toast("Não foi possível salvar: " + error.message);
  }

  async function gerarAntigos() {
    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_recebimentos_pendentes");
    setGerando(false);
    if (error) { toast(error.message); return; }
    toast(data ? `${data} recebimento(s) criado(s)` : "Nenhuma venda antiga sem recebimentos");
    recarregar();
  }

  if (!cfg) return <p className="muted" style={{ padding: 20 }}>Carregando…</p>;
  return (
    <div className="fin-config">
      <section>
        <h3>Comissão padrão de vendedores novos</h3>
        <p className="muted">Usada quando um usuário novo é aprovado. Depois dá para mudar a de cada um em Usuários.</p>
        <div className="com-user">
          <input type="number" min="0" step="0.01" defaultValue={cfg.vendedor_comissao_valor ?? 0}
            onBlur={(e) => salvar({ vendedor_comissao_valor: Number(e.target.value) || 0 })} aria-label="Comissão padrão" />
          <select value={cfg.vendedor_comissao_tipo || "percentual"} onChange={(e) => salvar({ vendedor_comissao_tipo: e.target.value })} aria-label="Tipo de comissão padrão">
            <option value="percentual">% do que a Gade2B recebe</option>
            <option value="fixo">R$ por produto vendido</option>
          </select>
        </div>
      </section>
      <section>
        <h3>Prazos de recebimento</h3>
        <div className="grid" style={{ maxWidth: 520 }}>
          <div className="field"><label>Prazo padrão até a 1ª parcela (dias)</label>
            <input type="number" min="0" max="730" defaultValue={cfg.prazo_padrao_dias ?? 30} onBlur={(e) => salvar({ prazo_padrao_dias: parseInt(e.target.value, 10) || 0 })} /></div>
          <div className="field"><label>Intervalo entre parcelas (dias)</label>
            <input type="number" min="1" max="365" defaultValue={cfg.intervalo_parcelas_dias ?? 30} onBlur={(e) => salvar({ intervalo_parcelas_dias: Math.max(1, parseInt(e.target.value, 10) || 30) })} /></div>
        </div>
        <p className="muted">O prazo padrão vale para produtos com a coluna “Prazo (dias)” em branco no Catálogo. Mudanças valem para as próximas vendas.</p>
      </section>
      <section>
        <h3>Vendas que já estavam em “Ganho”</h3>
        <p className="muted">Cria os recebimentos de negócios ganhos que ainda não têm, usando as comissões atuais do Catálogo. Configure as comissões dos produtos antes. Se rodar de novo, não duplica nada.</p>
        <button className="btn" onClick={gerarAntigos} disabled={gerando}>{gerando ? "Gerando…" : "Gerar recebimentos das vendas antigas"}</button>
      </section>
    </div>
  );
}

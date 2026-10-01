"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s) => (s || "").trim().toLowerCase();
const PAPEL = { super_admin: "Super admin", admin: "Admin", vendedor: "Vendedor" };

// Mesma prioridade usada pelo banco: fornecedor + categoria > fornecedor > categoria > padrão
function regraPara(produto, regras, pessoa) {
  const pontos = (r) => (r.fornecedor_id ? 2 : 0) + (norm(r.categoria) ? 1 : 0);
  const validas = regras.filter((r) =>
    (r.fornecedor_id && r.fornecedor_id === produto.fornecedor_id && norm(r.categoria) && norm(r.categoria) === norm(produto.categoria)) ||
    (r.fornecedor_id && r.fornecedor_id === produto.fornecedor_id && !norm(r.categoria)) ||
    (!r.fornecedor_id && norm(r.categoria) && norm(r.categoria) === norm(produto.categoria)));
  validas.sort((a, b) => pontos(b) - pontos(a));
  if (validas[0]) return { tipo: validas[0].tipo, valor: Number(validas[0].valor) || 0, origem: validas[0] };
  return { tipo: pessoa?.comissao_tipo || "percentual", valor: Number(pessoa?.comissao_valor) || 0, origem: null };
}
const gadeRecebe = (p) => (p.comissao_tipo === "percentual" ? (+p.preco || 0) * (+p.comissao_valor || 0) / 100 : +p.comissao_valor || 0);
const textoRegra = (t, v) => (t === "fixo" ? `${reais(v)} por produto` : `${Number(v).toLocaleString("pt-BR")}% do recebido`);

export default function RegrasComissao({ pessoas, fornecedores, produtos, recarregarPessoas, toast }) {
  const vendedores = pessoas.filter((p) => p.status === "ativo");
  const [selId, setSelId] = useState(vendedores[0]?.user_id || null);
  const [regras, setRegras] = useState(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("comissoes_vendedor").select("*").order("criado_em");
    if (error) { toast("Não foi possível carregar as regras: " + error.message); setRegras([]); return; }
    setRegras(data);
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const pessoa = vendedores.find((p) => p.user_id === selId);
  const minhas = (regras || []).filter((r) => r.vendedor_id === selId);
  const categorias = useMemo(() => [...new Set(produtos.map((p) => (p.categoria || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [produtos]);
  const nomeForn = (id) => fornecedores.find((f) => f.id === id)?.nome || "";

  const erroAmigavel = (e) => (/duplicate|unica/i.test(e.message) ? "Já existe uma regra igual para este vendedor." : /check/i.test(e.message) ? "Escolha um fornecedor ou uma categoria (e % até 100)." : e.message);

  async function salvarRegra(id, patch) {
    const antes = regras;
    setRegras((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("comissoes_vendedor").update(patch).eq("id", id);
    if (error) { setRegras(antes); toast(erroAmigavel(error)); }
  }
  async function novaRegra() {
    const usados = new Set(minhas.filter((r) => !norm(r.categoria)).map((r) => r.fornecedor_id));
    const livre = fornecedores.find((f) => !usados.has(f.id));
    const linha = livre ? { fornecedor_id: livre.id, categoria: "" } : { fornecedor_id: null, categoria: categorias.find((c) => !minhas.some((r) => !r.fornecedor_id && norm(r.categoria) === norm(c))) || "" };
    if (!linha.fornecedor_id && !linha.categoria) { toast("Cadastre fornecedores ou categorias no Catálogo primeiro."); return; }
    const { data, error } = await supabase.from("comissoes_vendedor").insert({ vendedor_id: selId, ...linha, tipo: "percentual", valor: 0 }).select().single();
    if (error) { toast(erroAmigavel(error)); return; }
    setRegras((rs) => [...rs, data]);
  }
  async function apagarRegra(id) {
    const { error } = await supabase.from("comissoes_vendedor").delete().eq("id", id);
    if (error) { toast(error.message); return; }
    setRegras((rs) => rs.filter((r) => r.id !== id));
  }
  async function copiarDe(origemId) {
    const origem = vendedores.find((p) => p.user_id === origemId);
    if (!origem || !confirm(`Substituir as regras de ${pessoa.nome || pessoa.email} pelas de ${origem.nome || origem.email}? A comissão padrão também será copiada.`)) return;
    const del = await supabase.from("comissoes_vendedor").delete().eq("vendedor_id", selId);
    if (del.error) { toast(del.error.message); return; }
    const copias = (regras || []).filter((r) => r.vendedor_id === origemId).map(({ fornecedor_id, categoria, tipo, valor }) => ({ vendedor_id: selId, fornecedor_id, categoria, tipo, valor }));
    if (copias.length) { const ins = await supabase.from("comissoes_vendedor").insert(copias); if (ins.error) { toast(ins.error.message); } }
    await supabase.rpc("definir_comissao_usuario", { alvo: selId, tipo: origem.comissao_tipo || "percentual", valor: Number(origem.comissao_valor) || 0 });
    await Promise.all([carregar(), recarregarPessoas()]);
    toast("Regras copiadas");
  }

  if (!vendedores.length) return <p className="muted">Nenhum usuário ativo ainda.</p>;
  return (
    <div className="regras">
      <aside className="regras-lado">
        {vendedores.map((p) => {
          const n = (regras || []).filter((r) => r.vendedor_id === p.user_id).length;
          return (
            <button key={p.user_id} className={"cat-forn" + (p.user_id === selId ? " ativo" : "")} onClick={() => setSelId(p.user_id)}>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", color: "var(--ink)" }}>
                {p.nome || p.email}
                <small className="muted">{PAPEL[p.papel]} · padrão {textoRegra(p.comissao_tipo, p.comissao_valor || 0)}{n ? ` · ${n} regra(s)` : ""}</small>
              </span>
            </button>
          );
        })}
      </aside>

      {pessoa && (
        <section className="regras-main">
          <h3 style={{ marginTop: 0 }}>{pessoa.nome || pessoa.email}</h3>

          <div className="regras-bloco">
            <h4>Comissão padrão</h4>
            <p className="muted">Vale para tudo que não tiver uma regra específica abaixo.</p>
            <Padrao key={pessoa.user_id + pessoa.comissao_tipo + pessoa.comissao_valor} p={pessoa} toast={toast} recarregar={recarregarPessoas} />
          </div>

          <div className="regras-bloco">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0 }}>Regras por fornecedor e categoria</h4>
              <span className="spacer" style={{ flex: 1 }} />
              <select className="fsel" defaultValue="" onChange={(e) => { if (e.target.value) copiarDe(e.target.value); e.target.value = ""; }} aria-label="Copiar regras de outro vendedor">
                <option value="">Copiar regras de…</option>
                {vendedores.filter((v) => v.user_id !== selId).map((v) => <option key={v.user_id} value={v.user_id}>{v.nome || v.email}</option>)}
              </select>
              <button className="btn small primary" onClick={novaRegra}>+ Regra</button>
            </div>
            <p className="muted">Prioridade: fornecedor + categoria → só fornecedor → só categoria → padrão. Deixe a categoria em branco para valer em todo o fornecedor.</p>
            {regras === null ? <p className="muted">Carregando…</p> : !minhas.length ? <p className="muted">Nenhuma regra. Todas as vendas usam a comissão padrão.</p> : (
              <div className="planilha-wrap" style={{ flex: "none" }}>
                <table className="planilha">
                  <thead><tr><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Tipo</th><th /></tr></thead>
                  <tbody>
                    {minhas.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <select className="cel" value={r.fornecedor_id || ""} onChange={(e) => salvarRegra(r.id, { fornecedor_id: e.target.value || null })}>
                            <option value="">Qualquer fornecedor</option>
                            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="cel" list="cats-regra" placeholder="Todas as categorias" defaultValue={r.categoria}
                            onBlur={(e) => { if (e.target.value.trim() !== r.categoria) salvarRegra(r.id, { categoria: e.target.value.trim() }); }} />
                        </td>
                        <td><input className="cel num" type="number" min="0" step="0.01" defaultValue={r.valor}
                          onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== Number(r.valor)) salvarRegra(r.id, { valor: v }); }} /></td>
                        <td>
                          <select className="cel" value={r.tipo} onChange={(e) => salvarRegra(r.id, { tipo: e.target.value })}>
                            <option value="percentual">% do recebido</option>
                            <option value="fixo">R$ por produto</option>
                          </select>
                        </td>
                        <td className="acoes"><button className="btn ghost small danger" onClick={() => apagarRegra(r.id)}>Excluir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <datalist id="cats-regra">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>

          <div className="regras-bloco">
            <h4>Prévia por produto</h4>
            <p className="muted">Quanto {pessoa.nome || "este vendedor"} recebe por unidade vendida de cada produto, com as regras acima. Vale para as próximas vendas.</p>
            <div className="planilha-wrap" style={{ flex: "none", maxHeight: 360 }}>
              <table className="planilha leitura">
                <thead><tr><th>Produto</th><th>Fornecedor</th><th>Categoria</th><th className="num">Empresa recebe</th><th>Regra aplicada</th><th className="num">Vendedor recebe</th></tr></thead>
                <tbody>
                  {produtos.filter((p) => p.ativo !== false).sort((a, b) => (nomeForn(a.fornecedor_id) + a.nome).localeCompare(nomeForn(b.fornecedor_id) + b.nome, "pt-BR", { numeric: true })).map((p) => {
                    const g = gadeRecebe(p);
                    const r = regraPara(p, minhas, pessoa);
                    const v = r.tipo === "fixo" ? r.valor : g * r.valor / 100;
                    const origem = r.origem ? [r.origem.fornecedor_id ? nomeForn(r.origem.fornecedor_id) : "Qualquer fornecedor", r.origem.categoria].filter(Boolean).join(" + ") : "Padrão";
                    return (
                      <tr key={p.id}>
                        <td>{p.nome}</td><td>{nomeForn(p.fornecedor_id) || "—"}</td><td>{p.categoria || "—"}</td>
                        <td className="num">{g ? reais(g) : "—"}</td>
                        <td>{origem}: {textoRegra(r.tipo, r.valor)}</td>
                        <td className="num destaque">{reais(v)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Padrao({ p, toast, recarregar }) {
  const [tipo, setTipo] = useState(p.comissao_tipo || "percentual");
  const [valor, setValor] = useState(String(p.comissao_valor ?? 0));
  const [salvando, setSalvando] = useState(false);
  const mudou = tipo !== (p.comissao_tipo || "percentual") || Number(valor) !== Number(p.comissao_valor ?? 0);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("definir_comissao_usuario", { alvo: p.user_id, tipo, valor: Number(valor) || 0 });
    setSalvando(false);
    if (error) { toast(error.message); return; }
    toast("Comissão padrão atualizada");
    recarregar();
  }
  return (
    <div className="com-user">
      <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Comissão padrão" />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
        <option value="percentual">% do que a empresa recebe</option>
        <option value="fixo">R$ por produto vendido</option>
      </select>
      {mudou && <button className="btn small primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>}
    </div>
  );
}

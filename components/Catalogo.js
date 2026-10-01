"use client";
import { useMemo, useState } from "react";
import { VARS } from "../lib/constantes";
import { IcX, IcPlus, IcSearch } from "./Icon";

// Converte "R$ 1.799,90", "1799.9", "99,99" em número
function lerPreco(v) {
  let s = String(v || "").replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// Lê linhas copiadas do Excel/Google Sheets (separadas por tabulação ou ponto e vírgula)
function lerColagem(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  const itens = linhas.map((l) => (l.includes("\t") ? l.split("\t") : l.split(";")).map((c) => c.trim()));
  // Pula cabeçalho quando a segunda coluna não parece preço
  if (itens.length && itens[0][1] !== undefined && !/\d/.test(itens[0][1])) itens.shift();
  return itens
    .filter((c) => c[0])
    .map((c) => ({
      nome: c[0],
      preco: lerPreco(c[1]),
      cobranca: /mens/i.test(c[2] || "") ? "mensal" : "unico",
      categoria: c[3] || "",
      oferta: c[4] || "",
      segmentos: c[5] || "",
      comissao_tipo: /%/.test(c[6] || "") ? "percentual" : "fixo",
      comissao_valor: lerPreco((c[6] || "").replace("%", "")),
      comissao_parcelas: Math.max(1, Math.min(36, parseInt(c[7], 10) || 1)),
      comissao_prazo_dias: c[8] !== undefined && c[8] !== "" && !isNaN(parseInt(c[8], 10)) ? parseInt(c[8], 10) : null,
    }));
}

const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function comissaoTxt(p) {
  const total = p.comissao_tipo === "percentual" ? (+p.preco || 0) * (+p.comissao_valor || 0) / 100 : +p.comissao_valor || 0;
  if (!total) return "—";
  const n = p.comissao_parcelas || 1;
  return n > 1 ? `${reais(total)} (${n}× ${reais(total / n)})` : reais(total);
}

export default function Catalogo({ fornecedores, produtos, tipos, modelos, cfg, voltar }) {
  const [forn, setForn] = useState("todos"); // "todos" | "sem" | id
  const [busca, setBusca] = useState("");
  const [inativos, setInativos] = useState(false);
  const [novoForn, setNovoForn] = useState("");
  const [colando, setColando] = useState(false);
  const [msgDe, setMsgDe] = useState(null);

  const contagem = useMemo(() => {
    const c = { todos: produtos.length, sem: 0 };
    produtos.forEach((p) => { const k = p.fornecedor_id || "sem"; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [produtos]);

  const lista = produtos
    .filter((p) => forn === "todos" || (forn === "sem" ? !p.fornecedor_id : p.fornecedor_id === forn))
    .filter((p) => inativos || p.ativo !== false)
    .filter((p) => {
      if (!busca) return true;
      const f = fornecedores.find((x) => x.id === p.fornecedor_id)?.nome || "";
      return (p.nome + " " + p.categoria + " " + f + " " + p.oferta).toLowerCase().includes(busca.toLowerCase());
    })
    .sort((a, b) => (!a.nome ? -1 : !b.nome ? 1 : a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })));

  const fornAtual = fornecedores.find((f) => f.id === forn);

  async function adicionarFornecedor(e) {
    e.preventDefault();
    if (!novoForn.trim()) return;
    const id = await cfg.addFornecedor(novoForn.trim());
    if (id) { setForn(id); setNovoForn(""); }
  }

  return (
    <div className="catalogo">
      <aside className="cat-lado">
        <div className="cat-titulo">
          <button className="btn ghost small" onClick={voltar}>← Voltar ao quadro</button>
        </div>
        <h2>Fornecedores</h2>
        <nav>
          <button className={"cat-forn" + (forn === "todos" ? " ativo" : "")} onClick={() => setForn("todos")}>
            Todos os produtos <span>{contagem.todos}</span>
          </button>
          {fornecedores.map((f) => (
            <button key={f.id} className={"cat-forn" + (forn === f.id ? " ativo" : "")} onClick={() => setForn(f.id)}>
              {f.nome || "Sem nome"} <span>{contagem[f.id] || 0}</span>
            </button>
          ))}
          {contagem.sem > 0 && (
            <button className={"cat-forn" + (forn === "sem" ? " ativo" : "")} onClick={() => setForn("sem")}>
              Sem fornecedor <span>{contagem.sem}</span>
            </button>
          )}
        </nav>
        <form onSubmit={adicionarFornecedor} className="cat-novo">
          <input placeholder="Novo fornecedor" value={novoForn} onChange={(e) => setNovoForn(e.target.value)} aria-label="Nome do novo fornecedor" />
          <button className="btn small" type="submit" aria-label="Adicionar fornecedor"><IcPlus /></button>
        </form>

        {fornAtual && (
          <div className="cat-dados">
            <h3>Dados do fornecedor</h3>
            <div className="field"><label>Nome</label><input value={fornAtual.nome} onChange={(e) => cfg.updFornecedor(fornAtual.id, { nome: e.target.value })} /></div>
            <div className="field"><label>Contato</label><input placeholder="Nome, telefone ou e-mail" value={fornAtual.contato} onChange={(e) => cfg.updFornecedor(fornAtual.id, { contato: e.target.value })} /></div>
            <div className="field"><label>Observações</label><textarea value={fornAtual.observacoes} onChange={(e) => cfg.updFornecedor(fornAtual.id, { observacoes: e.target.value })} /></div>
            <button className="btn danger small" onClick={async () => { if (await cfg.delFornecedor(fornAtual.id)) setForn("todos"); }}>Excluir fornecedor</button>
          </div>
        )}
      </aside>

      <section className="cat-main">
        <div className="cat-barra">
          <h2>{forn === "todos" ? "Todos os produtos" : forn === "sem" ? "Sem fornecedor" : fornAtual?.nome}</h2>
          <div className="search">
            <IcSearch />
            <input type="search" placeholder="Buscar produto, categoria ou oferta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
          </div>
          <label className="cat-check"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
          <div className="spacer" />
          <button className="btn" onClick={() => setColando(true)}>Colar do Excel</button>
          <button className="btn primary" onClick={() => cfg.addProduto({ fornecedor_id: fornAtual ? fornAtual.id : null })}><IcPlus />Produto</button>
        </div>

        <div className="planilha-wrap">
          <table className="planilha">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Produto</th>
                <th style={{ minWidth: 150 }}>Fornecedor</th>
                <th style={{ minWidth: 120 }}>Categoria</th>
                <th style={{ minWidth: 110 }}>Preço (R$)</th>
                <th style={{ minWidth: 110 }}>Cobrança</th>
                <th style={{ minWidth: 280 }}>Oferta (o que o cliente recebe)</th>
                <th style={{ minWidth: 200 }}>Segmentos ideais</th>
                <th style={{ minWidth: 90 }} title="Como a comissão é calculada">Comissão</th>
                <th style={{ minWidth: 100 }} title="Valor fixo em R$ ou percentual do preço">Valor</th>
                <th style={{ minWidth: 80 }} title="Em quantas parcelas o fornecedor paga">Parcelas</th>
                <th style={{ minWidth: 90 }} title="Dias depois da venda até a 1ª parcela (em branco = padrão)">Prazo (dias)</th>
                <th style={{ minWidth: 120 }} title="Total que a Gade2B recebe por unidade vendida">Você recebe</th>
                <th>Ativo</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={p.ativo === false ? "inativo" : ""}>
                  <td><input className="cel" value={p.nome} placeholder="Nome do produto" autoFocus={!p.nome} onChange={(e) => cfg.updProduto(p.id, { nome: e.target.value })} /></td>
                  <td>
                    <select className="cel" value={p.fornecedor_id || ""} onChange={(e) => cfg.updProduto(p.id, { fornecedor_id: e.target.value || null })}>
                      <option value="">—</option>
                      {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </td>
                  <td><input className="cel" value={p.categoria || ""} placeholder="Ex.: Fibra" onChange={(e) => cfg.updProduto(p.id, { categoria: e.target.value })} /></td>
                  <td><input className="cel num" type="number" min="0" step="0.01" value={p.preco} onChange={(e) => cfg.updProduto(p.id, { preco: Number(e.target.value) || 0 })} /></td>
                  <td>
                    <select className="cel" value={p.cobranca} onChange={(e) => cfg.updProduto(p.id, { cobranca: e.target.value })}>
                      <option value="unico">Único</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </td>
                  <td><input className="cel" value={p.oferta} placeholder="Ex.: 700 mega + Wi-Fi grátis" onChange={(e) => cfg.updProduto(p.id, { oferta: e.target.value })} title={p.oferta} /></td>
                  <td><input className="cel" value={p.segmentos} placeholder="Ex.: comércio, clínicas" onChange={(e) => cfg.updProduto(p.id, { segmentos: e.target.value })} /></td>
                  <td>
                    <select className="cel" value={p.comissao_tipo || "fixo"} onChange={(e) => cfg.updProduto(p.id, { comissao_tipo: e.target.value })}>
                      <option value="fixo">R$ fixo</option>
                      <option value="percentual">% do preço</option>
                    </select>
                  </td>
                  <td><input className="cel num" type="number" min="0" step="0.01" value={p.comissao_valor ?? 0} onChange={(e) => cfg.updProduto(p.id, { comissao_valor: Number(e.target.value) || 0 })} /></td>
                  <td><input className="cel num" type="number" min="1" max="36" step="1" value={p.comissao_parcelas ?? 1} onChange={(e) => cfg.updProduto(p.id, { comissao_parcelas: Math.max(1, Math.min(36, parseInt(e.target.value, 10) || 1)) })} /></td>
                  <td><input className="cel num" type="number" min="0" max="730" step="1" placeholder="padrão" value={p.comissao_prazo_dias ?? ""} onChange={(e) => cfg.updProduto(p.id, { comissao_prazo_dias: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} /></td>
                  <td className="num calc">{comissaoTxt(p)}</td>
                  <td className="centro"><input type="checkbox" checked={p.ativo !== false} onChange={(e) => cfg.updProduto(p.id, { ativo: e.target.checked })} aria-label="Produto ativo" /></td>
                  <td className="acoes">
                    <button className="btn ghost small" onClick={() => setMsgDe(p.id)} title="Mensagens específicas deste produto">Mensagens</button>
                    <button className="btn ghost small" onClick={() => cfg.duplicarProduto(p)} title="Duplicar">Duplicar</button>
                    <button className="btn ghost small danger" onClick={() => cfg.delProduto(p.id)} title="Excluir">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && (
            <p className="muted" style={{ padding: 20 }}>
              {busca ? "Nenhum produto encontrado com essa busca." : "Nenhum produto aqui ainda. Clique em “+ Produto” ou em “Colar do Excel” para cadastrar vários de uma vez."}
            </p>
          )}
        </div>
        <p className="muted cat-rodape">{lista.length} produto(s) · as alterações são salvas automaticamente · produtos inativos não aparecem para escolher nos negócios, mas continuam nos negócios antigos</p>
      </section>

      {colando && <Colagem fornecedores={fornecedores} fornPadrao={fornAtual?.id || ""} cfg={cfg} fechar={() => setColando(false)} />}
      {msgDe && <MensagensProduto produto={produtos.find((p) => p.id === msgDe)} tipos={tipos} modelos={modelos} cfg={cfg} fechar={() => setMsgDe(null)} />}
    </div>
  );
}

function Colagem({ fornecedores, fornPadrao, cfg, fechar }) {
  const [texto, setTexto] = useState("");
  const [fornId, setFornId] = useState(fornPadrao);
  const [salvando, setSalvando] = useState(false);
  const itens = lerColagem(texto);

  async function salvar() {
    setSalvando(true);
    const ok = await cfg.addProdutosEmLote(itens.map((i) => ({ ...i, fornecedor_id: fornId || null })));
    setSalvando(false);
    if (ok) fechar();
  }

  return (
    <>
      <div className="scrim open" onClick={fechar} />
      <aside className="drawer wide open" aria-labelledby="col-title">
        <div className="d-head">
          <h2 id="col-title">Colar produtos do Excel</h2>
          <button className="btn ghost" onClick={fechar} aria-label="Fechar"><IcX /></button>
        </div>
        <div className="d-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Na sua planilha, deixe as colunas nesta ordem, selecione as linhas, copie (Ctrl + C) e cole abaixo (Ctrl + V). Só o nome é obrigatório.
          </p>
          <div className="vars">
            <code>Nome</code> <code>Preço</code> <code>Cobrança (único ou mensal)</code> <code>Categoria</code> <code>Oferta</code> <code>Segmentos</code>
            <code>Comissão (R$ ou %)</code> <code>Parcelas</code> <code>Prazo em dias</code>
            <br />Na comissão, escreva só o número para valor fixo (ex.: 120) ou com % para percentual do preço (ex.: 100%).
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="col-forn">Fornecedor destes produtos</label>
            <select id="col-forn" value={fornId} onChange={(e) => setFornId(e.target.value)}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <textarea className="col-area" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Vivo Fibra 700 Mega\t99,99\tmensal\tFibra\t700 mega + Wi-Fi grátis\tresidencial, comércio"} aria-label="Linhas copiadas da planilha" />
          {itens.length > 0 && (
            <>
              <h3>Prévia ({itens.length} produto{itens.length > 1 ? "s" : ""})</h3>
              <div className="planilha-wrap" style={{ maxHeight: 240 }}>
                <table className="planilha leitura">
                  <thead><tr><th>Nome</th><th>Preço</th><th>Cobrança</th><th>Categoria</th><th>Comissão</th><th>Parcelas</th></tr></thead>
                  <tbody>
                    {itens.slice(0, 50).map((i, k) => (
                      <tr key={k}><td>{i.nome}</td><td>{i.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td>{i.cobranca === "mensal" ? "Mensal" : "Único"}</td><td>{i.categoria}</td><td>{i.comissao_valor ? (i.comissao_tipo === "percentual" ? i.comissao_valor + "%" : "R$ " + i.comissao_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })) : "—"}</td><td>{i.comissao_parcelas}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="d-foot">
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn primary" disabled={!itens.length || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : `Adicionar ${itens.length || ""} produto${itens.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </aside>
    </>
  );
}

function MensagensProduto({ produto, tipos, modelos, cfg, fechar }) {
  if (!produto) return null;
  return (
    <>
      <div className="scrim open" onClick={fechar} />
      <aside className="drawer wide open" aria-labelledby="mp-title">
        <div className="d-head">
          <h2 id="mp-title">Mensagens: {produto.nome || "produto"}</h2>
          <button className="btn ghost" onClick={fechar} aria-label="Fechar"><IcX /></button>
        </div>
        <div className="d-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Opcional. Quando o negócio tem só este produto, estes textos substituem o modelo padrão do tipo de mensagem. Em branco, vale o modelo padrão.
          </p>
          <div className="vars">
            Variáveis: {VARS.map((v) => <code key={v}>{"{" + v + "}"}</code>).reduce((a, b) => [a, " ", b])}
            <br />O <code>{"{preco}"}</code> já vem com “R$”, centavos e “/mês” nos produtos mensais.
          </div>
          {tipos.map((t) => (
            <div key={t.id} className="field" style={{ marginBottom: 12 }}>
              <label>{t.nome}</label>
              <textarea style={{ minHeight: 110 }} placeholder={`Em branco: usa o modelo padrão de “${t.nome}”`} value={modelos[produto.id + ":" + t.id] || ""} onChange={(e) => cfg.setModelo(produto.id, t.id, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="d-foot" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" onClick={fechar}>Concluir</button>
        </div>
      </aside>
    </>
  );
}

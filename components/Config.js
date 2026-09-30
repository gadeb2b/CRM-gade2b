"use client";
import { useEffect, useRef, useState } from "react";
import { ETAPAS, VARS } from "../lib/constantes";
import { precoTxt } from "../lib/mensagens";
import { IcX } from "./Icon";

function Vars() {
  return <div className="vars">Variáveis que você pode usar: {VARS.map((v) => <code key={v}>{"{" + v + "}"}</code>).reduce((a, b) => [a, " ", b])}</div>;
}

export default function Config({ produtos, tipos, modelos, assinatura, cfg, fechar, podeEditar }) {
  const [aba, setAba] = useState(podeEditar ? "produtos" : "remetente");
  const [abertoItem, setAbertoItem] = useState(null);
  const fecharRef = useRef(null);
  useEffect(() => { fecharRef.current?.focus(); }, []);

  async function novoProduto() { const id = await cfg.addProduto(); if (id) setAbertoItem(id); }
  async function novoTipo() { const id = await cfg.addTipo(); if (id) setAbertoItem(id); }

  return (
    <aside className="drawer wide open" aria-labelledby="c-title">
      <div className="d-head">
        <h2 id="c-title">{podeEditar ? "Produtos e mensagens" : "Minha assinatura"}</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar configurações"><IcX /></button>
      </div>
      <div className="tabs" role="tablist">
        {(podeEditar ? [["produtos", "Produtos"], ["tipos", "Tipos de mensagem"], ["remetente", "Remetente"]] : [["remetente", "Remetente"]]).map(([id, n]) => (
          <button key={id} className="tab" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{n}</button>
        ))}
      </div>
      <div className="d-body">
        {aba === "produtos" && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Cadastre o que você vende. A oferta e os segmentos ideais alimentam os modelos e a geração com IA.</p>
            {produtos.map((p) => (
              <details key={p.id} className="item" open={abertoItem === p.id} onToggle={(e) => { if (e.currentTarget.open) setAbertoItem(p.id); else if (abertoItem === p.id) setAbertoItem(null); }}>
                <summary><b>{p.nome || "Produto sem nome"}</b><span className="muted">{precoTxt(p)}</span></summary>
                <div className="inner">
                  <div className="grid" style={{ marginTop: 12 }}>
                    <div className="field full"><label>Nome do produto</label><input value={p.nome} onChange={(e) => cfg.updProduto(p.id, { nome: e.target.value })} autoFocus={abertoItem === p.id && p.nome === "Novo produto"} /></div>
                    <div className="field"><label>Preço (R$)</label><input type="number" min="0" step="0.01" value={p.preco} onChange={(e) => cfg.updProduto(p.id, { preco: Number(e.target.value) || 0 })} /></div>
                    <div className="field"><label>Cobrança</label>
                      <select value={p.cobranca} onChange={(e) => cfg.updProduto(p.id, { cobranca: e.target.value })}>
                        <option value="unico">Pagamento único</option><option value="mensal">Mensal</option>
                      </select>
                    </div>
                    <div className="field full"><label>Oferta: o que o cliente recebe</label><textarea value={p.oferta} onChange={(e) => cfg.updProduto(p.id, { oferta: e.target.value })} /></div>
                    <div className="field full"><label>Segmentos ideais</label><input placeholder="Ex.: clínicas, salões, academias" value={p.segmentos} onChange={(e) => cfg.updProduto(p.id, { segmentos: e.target.value })} /></div>
                  </div>
                  <h4>Mensagens específicas deste produto</h4>
                  <p className="muted" style={{ margin: 0 }}>Opcional. Quando o negócio tem só este produto, estes textos substituem o modelo padrão do tipo. Em branco, vale o modelo padrão.</p>
                  <Vars />
                  {tipos.map((t) => (
                    <div key={t.id} className="field" style={{ marginBottom: 10 }}>
                      <label>{t.nome}</label>
                      <textarea placeholder={`Em branco: usa o modelo padrão de “${t.nome}”`} value={modelos[p.id + ":" + t.id] || ""} onChange={(e) => cfg.setModelo(p.id, t.id, e.target.value)} />
                    </div>
                  ))}
                  <button className="btn danger small" onClick={() => cfg.delProduto(p.id)}>Excluir produto</button>
                </div>
              </details>
            ))}
            <button className="btn" onClick={novoProduto}>+ Adicionar produto</button>
          </>
        )}

        {aba === "tipos" && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Cada tipo tem um objetivo (usado pela IA) e um modelo padrão com variáveis. Marque em quais etapas ele é sugerido automaticamente.</p>
            {tipos.map((t) => (
              <details key={t.id} className="item" open={abertoItem === t.id} onToggle={(e) => { if (e.currentTarget.open) setAbertoItem(t.id); else if (abertoItem === t.id) setAbertoItem(null); }}>
                <summary><b>{t.nome}</b><span className="muted">{t.etapas.map((e) => ETAPAS.find((x) => x.id === e)?.nome).filter(Boolean).join(", ") || "Nenhuma etapa"}</span></summary>
                <div className="inner">
                  <div className="grid" style={{ marginTop: 12 }}>
                    <div className="field full"><label>Nome</label><input value={t.nome} onChange={(e) => cfg.updTipo(t.id, { nome: e.target.value })} /></div>
                    <div className="field full"><label>Objetivo da mensagem</label><textarea value={t.objetivo} onChange={(e) => cfg.updTipo(t.id, { objetivo: e.target.value })} /></div>
                    <div className="field full"><label>Assunto do e-mail</label><input value={t.assunto} onChange={(e) => cfg.updTipo(t.id, { assunto: e.target.value })} /></div>
                    <div className="field full"><label>Modelo padrão</label><textarea style={{ minHeight: 110 }} value={t.modelo} onChange={(e) => cfg.updTipo(t.id, { modelo: e.target.value })} /></div>
                  </div>
                  <Vars />
                  <div className="lbl" style={{ marginBottom: 6 }}>Sugerir nas etapas</div>
                  <div className="stages">
                    {ETAPAS.map((e) => (
                      <button key={e.id} className="stage-btn" aria-pressed={t.etapas.includes(e.id)} onClick={() => cfg.toggleEtapaTipo(t.id, e.id)}>
                        <span className="dot" style={{ background: e.cor }} />{e.nome}
                      </button>
                    ))}
                  </div>
                  <button className="btn danger small" style={{ marginTop: 12 }} onClick={() => cfg.delTipo(t.id)}>Excluir tipo</button>
                </div>
              </details>
            ))}
            <button className="btn" onClick={novoTipo}>+ Adicionar tipo de mensagem</button>
          </>
        )}

        {aba === "remetente" && (
          <>
            <div className="field">
              <label htmlFor="c-ass">Como você se apresenta nas mensagens</label>
              <input id="c-ass" placeholder="Ex.: Ana, da Gade2B" value={assinatura} onChange={(e) => cfg.setAssinatura(e.target.value)} />
            </div>
            <p className="muted">Esse texto entra na variável <code>{"{meu_nome}"}</code> e é usado pela IA para assinar e-mails.</p>
          </>
        )}
      </div>
      <div className="d-foot" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

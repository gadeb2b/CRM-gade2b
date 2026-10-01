"use client";
import { useEffect, useRef, useState } from "react";
import { ETAPAS, VARS } from "../lib/constantes";
import { IcX } from "./Icon";

function Vars() {
  return (
    <div className="vars">
      Variáveis que você pode usar: {VARS.map((v) => <code key={v}>{"{" + v + "}"}</code>).reduce((a, b) => [a, " ", b])}
      <br />O <code>{"{preco}"}</code> já vem com “R$” e com os centavos (ex.: R$ 99,99), e com “/mês” nos produtos mensais.
    </div>
  );
}

export default function Config({ tipos, assinatura, cfg, fechar, podeEditar }) {
  const [aba, setAba] = useState(podeEditar ? "tipos" : "remetente");
  const [abertoItem, setAbertoItem] = useState(null);
  const fecharRef = useRef(null);
  useEffect(() => { fecharRef.current?.focus(); }, []);

  async function novoTipo() { const id = await cfg.addTipo(); if (id) setAbertoItem(id); }

  return (
    <aside className="drawer wide open" aria-labelledby="c-title">
      <div className="d-head">
        <h2 id="c-title">{podeEditar ? "Mensagens" : "Minha assinatura"}</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar configurações"><IcX /></button>
      </div>
      <div className="tabs" role="tablist">
        {(podeEditar ? [["tipos", "Tipos de mensagem"], ["remetente", "Remetente"]] : [["remetente", "Remetente"]]).map(([id, n]) => (
          <button key={id} className="tab" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{n}</button>
        ))}
      </div>
      <div className="d-body">
        {aba === "tipos" && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Cada tipo tem um objetivo (usado pela IA) e um modelo padrão com variáveis. Marque em quais etapas ele é sugerido automaticamente. As mensagens específicas de cada produto ficam no Catálogo, no botão “Mensagens” da linha do produto.</p>
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
              <input id="c-ass" placeholder="Ex.: Ana, da Sua Empresa" value={assinatura} onChange={(e) => cfg.setAssinatura(e.target.value)} />
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

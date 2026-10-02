"use client";
import { useEffect, useRef, useState } from "react";
import { ETAPAS, VARS } from "../lib/constantes";
import { IcX } from "./Icon";
import { ordenarTipos } from "../lib/mensagens";

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
  const [verEtapa, setVerEtapa] = useState("");
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
        {(podeEditar ? [["tipos", "Mensagens por etapa"], ["remetente", "Remetente"]] : [["remetente", "Remetente"]]).map(([id, n]) => (
          <button key={id} className="tab" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{n}</button>
        ))}
      </div>
      <div className="d-body">
        {aba === "tipos" && (() => {
          const lista = ordenarTipos(tipos).filter((t) => !verEtapa || (t.etapas || []).includes(verEtapa));
          return (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Cada mensagem pode valer para várias etapas, e cada etapa pode ter várias mensagens. A ordem abaixo é a <b>sequência</b> em que elas aparecem no negócio: a 1ª é sugerida primeiro e, depois de cada envio, o sistema já passa para a próxima.
              As mensagens específicas de cada produto ficam no Catálogo, no botão “Mensagens” da linha do produto.
            </p>
            <div className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
              <label htmlFor="ver-etapa">Ver a sequência de</label>
              <select id="ver-etapa" value={verEtapa} onChange={(e) => setVerEtapa(e.target.value)}>
                <option value="">Todas as mensagens</option>
                {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            {!lista.length && <p className="muted">Nenhuma mensagem marcada para esta etapa ainda. Abra uma mensagem abaixo (em “Todas”) e marque a etapa.</p>}
            {lista.map((t, i) => (
              <div key={t.id} className="tipo-linha">
                <div className="etapa-ordem">
                  <button className="btn ghost small" disabled={i === 0} onClick={() => cfg.moverTipo(t.id, -1, lista)} aria-label="Subir na sequência">▲</button>
                  <button className="btn ghost small" disabled={i === lista.length - 1} onClick={() => cfg.moverTipo(t.id, 1, lista)} aria-label="Descer na sequência">▼</button>
                </div>
                <details className="item" open={abertoItem === t.id} onToggle={(e) => { if (e.currentTarget.open) setAbertoItem(t.id); else if (abertoItem === t.id) setAbertoItem(null); }}>
                  <summary><span className="seq-num">{i + 1}</span><b>{t.nome}</b><span className="muted">{(t.etapas || []).map((e) => ETAPAS.find((x) => x.id === e)?.nome).filter(Boolean).join(", ") || "Nenhuma etapa"}</span></summary>
                  <div className="inner">
                    <div className="grid" style={{ marginTop: 12 }}>
                      <div className="field full"><label>Nome</label><input value={t.nome} onChange={(e) => cfg.updTipo(t.id, { nome: e.target.value })} /></div>
                      <div className="field full"><label>Objetivo da mensagem</label><textarea value={t.objetivo} onChange={(e) => cfg.updTipo(t.id, { objetivo: e.target.value })} /></div>
                      <div className="field full"><label>Assunto do e-mail</label><input value={t.assunto} onChange={(e) => cfg.updTipo(t.id, { assunto: e.target.value })} /></div>
                      <div className="field full"><label>Modelo padrão</label><textarea style={{ minHeight: 110 }} value={t.modelo} onChange={(e) => cfg.updTipo(t.id, { modelo: e.target.value })} /></div>
                    </div>
                    <Vars />
                    <div className="lbl" style={{ marginBottom: 6 }}>Usar nas etapas (pode marcar várias)</div>
                    <div className="stages">
                      {ETAPAS.map((e) => (
                        <button key={e.id} className="stage-btn" aria-pressed={(t.etapas || []).includes(e.id)} onClick={() => cfg.toggleEtapaTipo(t.id, e.id)}>
                          <span className="dot" style={{ background: e.cor }} />{e.nome}
                        </button>
                      ))}
                    </div>
                    <button className="btn danger small" style={{ marginTop: 12 }} onClick={() => cfg.delTipo(t.id)}>Excluir mensagem</button>
                  </div>
                </details>
              </div>
            ))}
            <button className="btn" onClick={novoTipo}>+ Adicionar mensagem</button>
          </>
          );
        })()}

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

"use client";
import { useState } from "react";
import { IcX } from "./Icon";

// Editor das etapas do quadro: renomear, criar, reordenar e excluir
export default function EtapasEditor({ etapas, contagem, acoes, fechar }) {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const abertas = ordenadas.filter((e) => e.tipo === "aberta");
  const finais = ordenadas.filter((e) => e.tipo !== "aberta");
  const [excluindo, setExcluindo] = useState(null);
  const [destino, setDestino] = useState("");

  function pedirExclusao(e) {
    if (!contagem[e.chave]) {
      if (confirm(`Excluir a etapa “${e.nome}”?`)) acoes.excluir(e.chave, null);
      return;
    }
    setExcluindo(e);
    setDestino(abertas.find((x) => x.chave !== e.chave)?.chave || "");
  }

  return (
    <aside className="drawer open" aria-labelledby="et-title">
      <div className="d-head">
        <h2 id="et-title">Etapas do quadro</h2>
        <button className="btn ghost" onClick={fechar} aria-label="Fechar"><IcX /></button>
      </div>
      <div className="d-body">
        <p className="muted" style={{ marginTop: 0 }}>Renomeie, crie, reordene ou exclua as etapas de andamento. As alterações valem para toda a equipe.</p>
        <div className="etapas-lista">
          {abertas.map((e, i) => (
            <div key={e.chave} className="etapa-linha">
              <div className="etapa-ordem">
                <button className="btn ghost small" disabled={i === 0} onClick={() => acoes.mover(e.chave, -1)} aria-label="Subir">▲</button>
                <button className="btn ghost small" disabled={i === abertas.length - 1} onClick={() => acoes.mover(e.chave, 1)} aria-label="Descer">▼</button>
              </div>
              <input defaultValue={e.nome} maxLength={40} aria-label="Nome da etapa"
                onBlur={(x) => { const v = x.target.value.trim(); if (v && v !== e.nome) acoes.renomear(e.chave, v); else x.target.value = e.nome; }}
                onKeyDown={(x) => { if (x.key === "Enter") x.currentTarget.blur(); }} />
              <span className="muted etapa-qtd">{contagem[e.chave] || 0} negócio(s)</span>
              <button className="btn ghost small danger" disabled={abertas.length <= 1} onClick={() => pedirExclusao(e)}>Excluir</button>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={acoes.adicionar}>+ Nova etapa</button>

        <h3>Etapas finais</h3>
        <p className="muted" style={{ marginTop: 0 }}>Sempre ficam no fim do quadro. Dá para mudar o nome, mas não excluir: a de venda ganha gera os recebimentos do Financeiro, e a de perda guarda o motivo.</p>
        <div className="etapas-lista">
          {finais.map((e) => (
            <div key={e.chave} className="etapa-linha">
              <span className="tag">{e.tipo === "ganho" ? "Venda ganha" : "Venda perdida"}</span>
              <input defaultValue={e.nome} maxLength={40} aria-label="Nome da etapa"
                onBlur={(x) => { const v = x.target.value.trim(); if (v && v !== e.nome) acoes.renomear(e.chave, v); else x.target.value = e.nome; }}
                onKeyDown={(x) => { if (x.key === "Enter") x.currentTarget.blur(); }} />
              <span className="muted etapa-qtd">{contagem[e.chave] || 0} negócio(s)</span>
            </div>
          ))}
        </div>

        {excluindo && (
          <div className="etapa-excluir">
            <b>Excluir “{excluindo.nome}”</b>
            <p className="muted">Esta etapa tem {contagem[excluindo.chave]} negócio(s). Para onde eles devem ir?</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="fsel" value={destino} onChange={(x) => setDestino(x.target.value)} aria-label="Mover negócios para">
                {ordenadas.filter((x) => x.chave !== excluindo.chave).map((x) => <option key={x.chave} value={x.chave}>{x.nome}</option>)}
              </select>
              <button className="btn danger" disabled={!destino} onClick={async () => { if (await acoes.excluir(excluindo.chave, destino)) setExcluindo(null); }}>Mover e excluir</button>
              <button className="btn ghost" onClick={() => setExcluindo(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
      <div className="d-foot" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

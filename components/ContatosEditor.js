"use client";
import { useState } from "react";
import { soDigitos, diff, hoje } from "../lib/util";

export const OPERADORAS = ["Vivo", "Claro", "TIM", "Oi", "Algar", "Outra"];
const ETIQUETAS = [["whatsapp", "WhatsApp"], ["celular", "Celular"], ["fixo", "Fixo"], ["outro", "Outro"]];
const URL_ABR = "https://consultanumero.abrtelecom.com.br/";
const dataBr = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");

// Contatos do negócio: cada pessoa com cargo, e-mail e vários telefones
export default function ContatosEditor({ contatos, ops, toast }) {
  const [consultando, setConsultando] = useState(null);
  const [portado, setPortado] = useState(false);

  async function consultar(t) {
    let num = soDigitos(t.numero);
    if (num.length >= 12 && num.startsWith("55")) num = num.slice(2);
    if (num.length < 10) { toast("Digite o número completo, com DDD, antes de consultar."); return; }
    try { await navigator.clipboard.writeText(num); } catch { /* sem permissão: segue sem copiar */ }
    const largura = Math.min(720, Math.round(window.screen.availWidth / 2));
    window.open(URL_ABR, "abr-consulta", `width=${largura},height=${window.screen.availHeight - 80},left=0,top=0`);
    setPortado(!!t.portado);
    setConsultando(t.id);
    toast(`Número ${num} copiado. Cole no site da ABR (Ctrl + V), resolva o captcha e escolha a operadora aqui.`);
  }

  function salvarOperadora(t, operadora) {
    ops.salvarOperadora(t.id, { operadora, portado, operadora_consultada_em: hoje() });
    setConsultando(null);
  }

  return (
    <div className="contatos">
      {contatos.map((c, ci) => (
        <div key={c.id} className="contato">
          <div className="contato-cab">
            <input className="contato-nome" placeholder={ci === 0 ? "Nome do contato (ex.: dono, gerente)" : "Nome do contato"} value={c.nome}
              onChange={(e) => ops.updContato(c.id, { nome: e.target.value })} aria-label="Nome do contato" />
            <input placeholder="Cargo" value={c.cargo} onChange={(e) => ops.updContato(c.id, { cargo: e.target.value })} aria-label="Cargo" />
            <button type="button" className="btn ghost small danger" onClick={() => ops.delContato(c.id)} title="Remover contato" aria-label="Remover contato">×</button>
          </div>
          <input className="contato-email" type="email" placeholder="E-mail" value={c.email} onChange={(e) => ops.updContato(c.id, { email: e.target.value })} aria-label="E-mail do contato" />

          {(c.telefones || []).map((t) => {
            const idade = t.operadora_consultada_em ? diff(hoje(), t.operadora_consultada_em) : null;
            const antiga = idade !== null && idade > 180;
            return (
              <div key={t.id} className="tel">
                <div className="tel-linha">
                  <button type="button" className={"tel-principal" + (t.principal ? " ativo" : "")} title={t.principal ? "Número principal" : "Tornar principal"}
                    aria-label={t.principal ? "Número principal" : "Tornar principal"} onClick={() => !t.principal && ops.definirPrincipal(t.id)}>★</button>
                  <input inputMode="tel" placeholder="(11) 99999-9999" value={t.numero} onChange={(e) => ops.updTelefone(t.id, { numero: e.target.value })} aria-label="Telefone" />
                  <select value={t.etiqueta} onChange={(e) => ops.updTelefone(t.id, { etiqueta: e.target.value })} aria-label="Tipo de número">
                    {ETIQUETAS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                  </select>
                  <button type="button" className="btn ghost small danger" onClick={() => ops.delTelefone(t.id)} aria-label="Remover telefone">×</button>
                </div>
                <div className="tel-info">
                  {t.origem === "receita" && <span className="tag" title="Veio da consulta de CNPJ; costuma ser do contador">da Receita</span>}
                  {t.operadora
                    ? <button type="button" className={"op-badge" + (antiga ? " antiga" : "")} onClick={() => consultar(t)}
                        title={antiga ? "Consulta antiga: clique para consultar de novo" : "Clique para consultar de novo"}>
                        {t.operadora}{t.portado ? " · portado" : ""} · {antiga ? `consultado há ${Math.round(idade / 30)} meses` : dataBr(t.operadora_consultada_em)}
                      </button>
                    : <button type="button" className="btn ghost small" onClick={() => consultar(t)}>Consultar operadora</button>}
                  {t.principal && <span className="muted">principal</span>}
                </div>
                {consultando === t.id && (
                  <div className="op-escolha">
                    <span>Qual operadora apareceu na ABR?</span>
                    <div className="op-botoes">
                      {OPERADORAS.map((o) => <button key={o} type="button" className="chip" onClick={() => salvarOperadora(t, o)}>{o}</button>)}
                    </div>
                    <label className="cat-check"><input type="checkbox" checked={portado} onChange={(e) => setPortado(e.target.checked)} /> Número já foi portado</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <a className="btn small ghost" href={URL_ABR} target="_blank" rel="noopener">Abrir a ABR de novo</a>
                      <button type="button" className="btn small ghost" onClick={() => setConsultando(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="btn ghost small" onClick={() => ops.addTelefone(c.id)}>+ Telefone</button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => ops.addContato()}>+ Contato</button>
    </div>
  );
}

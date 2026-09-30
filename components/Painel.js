"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, CNAES } from "../lib/constantes";
import { fmtData, temTel, temMail, waLink, mailLink } from "../lib/util";
import { modeloPara, prodsDe, precoTxt, tipoAtual, juntar, promptIA } from "../lib/mensagens";
import { IcChat, IcMail, IcSpark, IcX } from "./Icon";

export default function Painel({ d, ctx, interacoes, iaDisponivel, focoNome, responsaveis, atualizar, mover, toggleProduto, registrar, excluir, fechar, toast }) {
  const [aviso, setAviso] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [nota, setNota] = useState("");
  const ctrl = useRef(null);
  const nomeRef = useRef(null);
  const fecharRef = useRef(null);

  const t = tipoAtual(d, ctx.tipos);
  const m = modeloPara(d, ctx);
  const ps = prodsDe(d, ctx.produtos);

  // Foco ao abrir
  useEffect(() => {
    setAviso(null);
    setNota("");
    setTimeout(() => (focoNome ? nomeRef.current : fecharRef.current)?.focus(), 50);
    return () => ctrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  // Enquanto a mensagem vier do modelo, ela acompanha as mudanças de produto, tipo, CNAE etc.
  useEffect(() => {
    if (d.msg_origem && d.msg_origem !== "modelo") return;
    if (m.msg !== d.msg_rascunho || m.assunto !== d.assunto_rascunho || d.msg_origem !== "modelo") {
      atualizar({ msg_rascunho: m.msg, assunto_rascunho: m.assunto, msg_origem: "modelo" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.msg, m.assunto, d.msg_origem]);

  const statusPadrao = {
    modelo: m.especifico ? "Modelo específico do produto" : "Modelo padrão do tipo de mensagem",
    ia: "Gerada com IA. Revise antes de enviar.",
    manual: "Editada por você",
  }[d.msg_origem] || "";

  function usarModelo() {
    setAviso(null);
    atualizar({ msg_rascunho: m.msg, assunto_rascunho: m.assunto, msg_origem: "modelo" });
  }

  async function gerarIA() {
    setGerando(true);
    setAviso({ t: "Gerando mensagem com IA…", cls: "ai" });
    ctrl.current = new AbortController();
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/gerar-mensagem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({ prompt: promptIA(d, ctx, interacoes) }),
        signal: ctrl.current.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível gerar agora. Tente de novo ou use o modelo.");
      atualizar({ msg_rascunho: j.mensagem, assunto_rascunho: j.assunto || d.assunto_rascunho, msg_origem: "ia" });
      setAviso({ t: "Mensagem gerada com IA. Revise antes de enviar.", cls: "ai" });
    } catch (e) {
      if (e.name === "AbortError") setAviso({ t: "Geração interrompida." });
      else setAviso({ t: e.message, cls: "err" });
    } finally {
      setGerando(false);
      ctrl.current = null;
    }
  }

  function mudarCnae(v) {
    const hit = CNAES.find((c) => v === c[0] + " – " + c[1] || v.trim() === c[0]);
    if (hit) atualizar({ cnae: hit[0], atividade: hit[1] });
    else atualizar({ cnae: v });
  }

  function addNota() {
    if (!nota.trim()) return;
    registrar(nota.trim(), false);
    setNota("");
  }

  const descEnvio = t ? t.nome + (ps.length ? " – " + juntar(ps.map((p) => p.nome)) : "") : "";
  const campo = (k, extra = {}) => ({ value: d[k] ?? "", onChange: (e) => atualizar({ [k]: extra.num ? Number(e.target.value) || 0 : e.target.value }) });

  return (
    <aside className="drawer open" aria-labelledby="d-title">
      <div className="d-head">
        <h2 id="d-title">{d.nome || "Novo lead"}</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar painel"><IcX /></button>
      </div>
      <div className="d-body">
        <div className="lbl" style={{ marginBottom: 6 }}>Etapa</div>
        <div className="stages" role="group" aria-label="Etapa">
          {ETAPAS.map((e) => (
            <button key={e.id} className="stage-btn" aria-pressed={d.etapa === e.id} onClick={() => mover(e.id)}>
              <span className="dot" style={{ background: e.cor }} />{e.nome}
            </button>
          ))}
        </div>

        {responsaveis && (
          <div className="field" style={{ marginTop: 14, maxWidth: 280 }}>
            <label htmlFor="f-resp">Responsável</label>
            <select id="f-resp" {...campo("user_id")}>
              {responsaveis.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome || p.email}</option>)}
            </select>
          </div>
        )}

        <h3>Cliente</h3>
        <div className="grid">
          <div className="field full"><label htmlFor="f-nome">Nome</label><input id="f-nome" ref={nomeRef} {...campo("nome")} /></div>
          <div className="field"><label htmlFor="f-emp">Empresa</label><input id="f-emp" {...campo("empresa")} /></div>
          <div className="field"><label htmlFor="f-cnpj">CNPJ</label><input id="f-cnpj" inputMode="numeric" {...campo("cnpj")} /></div>
          <div className="field"><label htmlFor="f-cnae">CNAE</label><input id="f-cnae" list="cnaes" placeholder="Ex.: 9602-5/02" value={d.cnae} onChange={(e) => mudarCnae(e.target.value)} /></div>
          <div className="field"><label htmlFor="f-ativ">Atividade</label><input id="f-ativ" placeholder="Preenchida pelo CNAE" {...campo("atividade")} /></div>
          <div className="field"><label htmlFor="f-tel">Telefone / WhatsApp</label><input id="f-tel" inputMode="tel" {...campo("telefone")} /></div>
          <div className="field"><label htmlFor="f-mail">E-mail</label><input id="f-mail" type="email" {...campo("email")} /></div>
        </div>
        <datalist id="cnaes">{CNAES.map((c) => <option key={c[0]} value={c[0] + " – " + c[1]} />)}</datalist>

        <h3>Produtos oferecidos</h3>
        <div className="pchips" role="group" aria-label="Produtos">
          {ctx.produtos.length ? ctx.produtos.map((p) => (
            <button key={p.id} className="stage-btn" aria-pressed={d.produtos.includes(p.id)} onClick={() => toggleProduto(p.id)}>
              {p.nome} <span className="muted">{precoTxt(p)}</span>
            </button>
          )) : <span className="muted">Nenhum produto cadastrado. Cadastre em “Produtos e mensagens”.</span>}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="f-val">Valor do negócio (R$)</label><input id="f-val" type="number" min="0" step="50" {...campo("valor", { num: true })} /></div>
          <div className="field"><label htmlFor="f-canal">Canal principal</label>
            <select id="f-canal" {...campo("canal")}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select>
          </div>
        </div>

        <h3>Mensagem</h3>
        <div className="composer">
          <div className="comp-row">
            <div className="field"><label htmlFor="m-tipo">Tipo de mensagem</label>
              <select id="m-tipo" value={t?.id || ""} onChange={(e) => { setAviso(null); atualizar({ tipo_msg_id: e.target.value, msg_origem: "modelo" }); }}>
                {ctx.tipos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </div>
            <button className="btn small" onClick={usarModelo}>Usar modelo</button>
            {iaDisponivel && <button className="btn small ai" onClick={gerarIA} disabled={gerando}><IcSpark /> Gerar com IA</button>}
            {gerando && <button className="btn small ghost" onClick={() => ctrl.current?.abort()}>Parar</button>}
          </div>
          {(d.canal === "email" || temMail(d)) && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="m-assunto">Assunto do e-mail</label>
              <input id="m-assunto" value={d.assunto_rascunho} onChange={(e) => atualizar({ assunto_rascunho: e.target.value })} />
            </div>
          )}
          <textarea aria-label="Texto da mensagem" value={d.msg_rascunho}
            onChange={(e) => { setAviso(null); atualizar({ msg_rascunho: e.target.value, msg_origem: "manual" }); }} />
          <div className={"status" + (aviso?.cls ? " " + aviso.cls : "")}>{aviso ? aviso.t : statusPadrao}</div>
          <div className="send">
            <a className="btn wa" target="_blank" rel="noopener" aria-disabled={!temTel(d)} href={temTel(d) ? waLink(d) : undefined}
              onClick={() => { if (temTel(d)) { registrar("WhatsApp enviado: " + descEnvio, true); toast("Envio registrado no histórico"); } }}>
              <IcChat /> Abrir WhatsApp
            </a>
            <a className="btn mail" aria-disabled={!temMail(d)} href={temMail(d) ? mailLink(d) : undefined}
              onClick={() => { if (temMail(d)) { registrar("E-mail enviado: " + descEnvio, true); toast("Envio registrado no histórico"); } }}>
              <IcMail /> Abrir e-mail
            </a>
          </div>
        </div>

        <h3>Próxima ação</h3>
        <div className="grid">
          <div className="field"><label htmlFor="f-acao">O que fazer</label><input id="f-acao" placeholder="Ex.: Cobrar retorno" {...campo("acao")} /></div>
          <div className="field"><label htmlFor="f-data">Quando</label><input id="f-data" type="date" {...campo("acao_data")} /></div>
          {d.etapa === "perdido" && (
            <div className="field full"><label htmlFor="f-mot">Motivo da perda</label><input id="f-mot" placeholder="Ex.: Achou caro" {...campo("motivo_perda")} /></div>
          )}
        </div>

        <h3>Histórico</h3>
        <div className="add-note">
          <input placeholder="Registrar interação (ex.: pediu desconto)" aria-label="Nova interação" value={nota}
            onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNota(); }} />
          <button className="btn" onClick={addNota}>Registrar</button>
        </div>
        <ul className="timeline">
          {interacoes.length ? interacoes.map((n) => (
            <li key={n.id} className={n.sistema ? "sys" : ""}><time>{fmtData(n.criado_em)}</time>{n.texto}</li>
          )) : <li className="sys">Nenhuma interação registrada ainda.</li>}
        </ul>
      </div>
      <div className="d-foot">
        <button className="btn danger" onClick={excluir}>Excluir negócio</button>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, CNAES } from "../lib/constantes";
import { fmtData, soDigitos, cnpjValido, formatarCnpj, waLinkPara, mailLinkPara } from "../lib/util";
import ContatosEditor from "./ContatosEditor";
import { modeloPara, prodsDe, precoTxt, tipoAtual, juntar, promptIA } from "../lib/mensagens";
import { IcChat, IcMail, IcSpark, IcX } from "./Icon";

export default function Painel({ novo = false, criando = false, concluir, d, contatos = [], opsContatos, ctx, interacoes, iaDisponivel, focoNome, responsaveis, atualizar, mover, toggleProduto, setQuantidade, registrar, excluir, fechar, toast }) {
  const [aviso, setAviso] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [nota, setNota] = useState("");
  const [cnpjStatus, setCnpjStatus] = useState(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
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
    setCnpjStatus(null);
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

  async function buscarCnpj() {
    const c = soDigitos(d.cnpj);
    if (!cnpjValido(c)) { setCnpjStatus({ cls: "err", t: "CNPJ inválido. Confira os números." }); return; }
    setBuscandoCnpj(true);
    setCnpjStatus({ t: "Consultando a Receita…" });
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/cnpj?cnpj=" + c, { headers: { Authorization: "Bearer " + (data.session?.access_token || "") } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível consultar o CNPJ.");
      const patch = {
        cnpj: formatarCnpj(c),
        razao_social: j.razao_social || "",
        cnae: j.cnae || d.cnae,
        atividade: j.atividade || d.atividade,
        cidade: j.cidade || "",
        uf: j.uf || "",
        situacao_cnpj: j.situacao || "",
      };
      if (!d.empresa.trim()) patch.empresa = j.nome_fantasia || j.razao_social || "";
      atualizar(patch);
      const obs = await daReceita(j);
      const ativa = !j.situacao || j.situacao.toUpperCase() === "ATIVA";
      setCnpjStatus({
        cls: ativa ? "" : "err",
        t: (ativa
          ? `Dados preenchidos pela Receita${j.cidade ? ` · ${j.cidade}/${j.uf}` : ""}.`
          : `Atenção: a situação deste CNPJ na Receita é “${j.situacao}”.`) + (obs.length ? " " + obs.join(" ") : ""),
      });
    } catch (e) {
      setCnpjStatus({ cls: "err", t: e.message });
    }
    setBuscandoCnpj(false);
  }

  // Telefone e e-mail da Receita entram nos contatos (sem apagar nada que já exista)
  async function daReceita(j) {
    const obs = [];
    const numeros = contatos.flatMap((c) => c.telefones || []).map((t) => soDigitos(t.numero));
    let alvo = contatos[0];
    if ((j.telefone || j.email) && !alvo) alvo = await opsContatos.addContato({ cargo: "Contato da Receita (pode ser do contador)" });
    if (j.telefone && alvo) {
      if (numeros.includes(soDigitos(j.telefone))) obs.push("O telefone da Receita já estava nos contatos.");
      else {
        const vazio = (alvo.telefones || []).find((t) => !t.numero.trim());
        if (vazio) opsContatos.updTelefone(vazio.id, { numero: j.telefone, etiqueta: "fixo", origem: "receita" });
        else await opsContatos.addTelefone(alvo.id, { numero: j.telefone, etiqueta: "fixo", origem: "receita" });
        obs.push(`Telefone da Receita adicionado aos contatos (${j.telefone}).`);
      }
    } else if (!j.telefone) obs.push("A Receita não tem telefone cadastrado.");
    if (j.email && alvo) {
      if (contatos.some((c) => (c.email || "").toLowerCase() === j.email)) { /* já existe */ }
      else if (!alvo.email) { opsContatos.updContato(alvo.id, { email: j.email }); obs.push("E-mail da Receita adicionado ao contato."); }
      else obs.push(`E-mail da Receita: ${j.email} (o contato já tinha outro e-mail).`);
    } else if (!j.email) obs.push("A Receita não tem e-mail cadastrado.");
    return obs;
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

  // Para quem enviar: todos os telefones e e-mails dos contatos (o principal vem primeiro)
  const ROT = { whatsapp: "WhatsApp", celular: "Celular", fixo: "Fixo", outro: "Outro" };
  const destinosTel = contatos.flatMap((c) => (c.telefones || []).filter((x) => soDigitos(x.numero).length >= 10)
    .map((x) => ({ id: x.id, numero: x.numero, principal: x.principal, rotulo: `${c.nome || "Sem nome"} · ${x.numero} (${ROT[x.etiqueta] || x.etiqueta})${x.principal ? " ★" : ""}` })))
    .sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  const destinosMail = contatos.filter((c) => /.+@.+\..+/.test(c.email || ""))
    .map((c) => ({ id: c.id, email: c.email, rotulo: `${c.nome || "Sem nome"} · ${c.email}` }));
  const [destTel, setDestTel] = useState(null);
  const [destMail, setDestMail] = useState(null);
  const telEscolhido = destinosTel.find((x) => x.id === destTel) || destinosTel[0] || null;
  const mailEscolhido = destinosMail.find((x) => x.id === destMail) || destinosMail[0] || null;

  const descEnvio = t ? t.nome + (ps.length ? " – " + juntar(ps.map((p) => p.nome)) : "") : "";
  const campo = (k, extra = {}) => ({ value: d[k] ?? "", onChange: (e) => atualizar({ [k]: extra.num ? Number(e.target.value) || 0 : e.target.value }) });

  return (
    <aside className="drawer open" aria-labelledby="d-title">
      <div className="d-head">
        <h2 id="d-title">{novo ? "Novo negócio" : d.nome || "Sem nome"}</h2>
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
          <div className="field full">
            <label htmlFor="f-cnpj">CNPJ</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="f-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" style={{ flex: 1 }} {...campo("cnpj")}
                onKeyDown={(e) => { if (e.key === "Enter") buscarCnpj(); }} />
              <button type="button" className="btn small" onClick={buscarCnpj} disabled={buscandoCnpj || soDigitos(d.cnpj).length !== 14}>
                {buscandoCnpj ? "Buscando…" : "Buscar dados"}
              </button>
            </div>
            {cnpjStatus && <span className={"status" + (cnpjStatus.cls ? " " + cnpjStatus.cls : "")} style={{ margin: "4px 0 0" }}>{cnpjStatus.t}</span>}
          </div>
          <div className="field"><label htmlFor="f-emp">Empresa (nome fantasia)</label><input id="f-emp" {...campo("empresa")} /></div>
          <div className="field"><label htmlFor="f-razao">Razão social</label><input id="f-razao" {...campo("razao_social")} /></div>
          <div className="field"><label htmlFor="f-cnae">CNAE</label><input id="f-cnae" list="cnaes" placeholder="Ex.: 9602-5/02" value={d.cnae} onChange={(e) => mudarCnae(e.target.value)} /></div>
          <div className="field"><label htmlFor="f-ativ">Atividade</label><input id="f-ativ" placeholder="Preenchida pelo CNAE" {...campo("atividade")} /></div>
          <div className="field"><label htmlFor="f-cid">Cidade</label><input id="f-cid" {...campo("cidade")} /></div>
          <div className="field"><label htmlFor="f-uf">UF</label><input id="f-uf" maxLength={2} {...campo("uf")} /></div>
        </div>
        <datalist id="cnaes">{CNAES.map((c) => <option key={c[0]} value={c[0] + " – " + c[1]} />)}</datalist>

        <h3>Contatos</h3>
        <p className="muted" style={{ margin: "-4px 0 10px" }}>Pessoas da empresa cliente. A ★ marca o número principal: ele aparece no card e é o padrão para enviar mensagens.</p>
        <ContatosEditor contatos={contatos} ops={opsContatos} toast={toast} />

        <h3>Produtos oferecidos</h3>
        <SeletorProdutos d={d} produtos={ctx.produtos} fornecedores={ctx.fornecedores || []} toggle={toggleProduto} setQtd={setQuantidade} />
        <div className="grid" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="f-val">Valor do negócio (R$)</label><input id="f-val" type="number" min="0" step="0.01" {...campo("valor", { num: true })} /></div>
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
          {destinosTel.length > 1 && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="m-dest-tel">Enviar WhatsApp para</label>
              <select id="m-dest-tel" value={telEscolhido?.id || ""} onChange={(e) => setDestTel(e.target.value)}>
                {destinosTel.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
              </select>
            </div>
          )}
          {destinosMail.length > 1 && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="m-dest-mail">Enviar e-mail para</label>
              <select id="m-dest-mail" value={mailEscolhido?.id || ""} onChange={(e) => setDestMail(e.target.value)}>
                {destinosMail.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
              </select>
            </div>
          )}
          {(d.canal === "email" || mailEscolhido) && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="m-assunto">Assunto do e-mail</label>
              <input id="m-assunto" value={d.assunto_rascunho} onChange={(e) => atualizar({ assunto_rascunho: e.target.value })} />
            </div>
          )}
          <textarea aria-label="Texto da mensagem" value={d.msg_rascunho}
            onChange={(e) => { setAviso(null); atualizar({ msg_rascunho: e.target.value, msg_origem: "manual" }); }} />
          <div className={"status" + (aviso?.cls ? " " + aviso.cls : "")}>{aviso ? aviso.t : statusPadrao}</div>
          {novo && <p className="muted" style={{ margin: "0 0 10px" }}>Clique em Concluir para salvar o negócio antes de enviar a mensagem.</p>}
          <div className="send">
            <a className="btn wa" target="_blank" rel="noopener" aria-disabled={novo || !telEscolhido} href={!novo && telEscolhido ? waLinkPara(telEscolhido.numero, d.msg_rascunho) : undefined}
              onClick={() => { if (!novo && telEscolhido) { registrar(`WhatsApp enviado para ${telEscolhido.rotulo}: ${descEnvio}`, true); toast("Envio registrado no histórico"); } }}>
              <IcChat /> Abrir WhatsApp
            </a>
            <a className="btn mail" aria-disabled={novo || !mailEscolhido} href={!novo && mailEscolhido ? mailLinkPara(mailEscolhido.email, d.assunto_rascunho, d.msg_rascunho) : undefined}
              onClick={() => { if (!novo && mailEscolhido) { registrar(`E-mail enviado para ${mailEscolhido.rotulo}: ${descEnvio}`, true); toast("Envio registrado no histórico"); } }}>
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
        {novo ? <p className="muted">O histórico começa quando o negócio for criado.</p> : (
          <>
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
          </>
        )}
      </div>
      <div className="d-foot">
        {novo
          ? <button className="btn" onClick={fechar}>Cancelar</button>
          : <button className="btn danger" onClick={excluir}>Mover para a lixeira</button>}
        <button className="btn primary" onClick={concluir || fechar} disabled={criando}>{criando ? "Salvando…" : "Concluir"}</button>
      </div>
    </aside>
  );
}

// Escolha de produtos com busca, agrupada por fornecedor (pensada para catálogos grandes)
function SeletorProdutos({ d, produtos, fornecedores, toggle, setQtd }) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const fechar = useRef(null);
  const selecionados = prodsDe(d, produtos);
  const nomeForn = (id) => fornecedores.find((f) => f.id === id)?.nome || "";

  const grupos = useMemo(() => {
    const termo = q.trim().toLowerCase();
    const livres = produtos.filter((p) => p.ativo !== false && !d.produtos.includes(p.id) &&
      (!termo || (p.nome + " " + (p.categoria || "") + " " + nomeForn(p.fornecedor_id)).toLowerCase().includes(termo)));
    const mapa = new Map();
    livres.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { numeric: true }))
      .forEach((p) => { const k = nomeForn(p.fornecedor_id) || "Sem fornecedor"; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(p); });
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, produtos, d.produtos, fornecedores]);

  const total = grupos.reduce((s, g) => s + g[1].length, 0);

  return (
    <div className="seletor">
      {selecionados.length > 0 && (
        <div className="pchips" style={{ marginBottom: 8 }}>
          {selecionados.map((p) => (
            <span key={p.id} className="stage-btn sel-chip">
              <input type="number" min="1" max="9999" className="qtd" aria-label={"Quantidade de " + p.nome}
                value={(d.qtd || {})[p.id] || 1} onChange={(e) => setQtd(p.id, e.target.value)} />
              <span>×</span>
              {p.nome} <span className="muted">{precoTxt(p)}</span>
              <button type="button" onClick={() => toggle(p.id)} aria-label={"Remover " + p.nome}>×</button>
            </span>
          ))}
        </div>
      )}
      {!produtos.length ? <span className="muted">Nenhum produto cadastrado. Cadastre no Catálogo.</span> : (
        <div className="seletor-caixa"
          onFocus={() => { clearTimeout(fechar.current); setAberto(true); }}
          onBlur={() => { fechar.current = setTimeout(() => setAberto(false), 150); }}>
          <input placeholder="+ Adicionar produto: digite o nome, categoria ou fornecedor" value={q}
            onChange={(e) => { setQ(e.target.value); setAberto(true); }}
            onKeyDown={(e) => { if (e.key === "Escape") { setAberto(false); e.stopPropagation(); } }}
            aria-label="Buscar produto para adicionar" />
          {aberto && (
            <div className="seletor-lista" role="listbox">
              {!total && <div className="muted" style={{ padding: 10 }}>Nenhum produto encontrado.</div>}
              {grupos.map(([forn, ps]) => (
                <div key={forn}>
                  <div className="seletor-grupo">{forn}</div>
                  {ps.slice(0, 80).map((p) => (
                    <button type="button" key={p.id} className="seletor-item" role="option" aria-selected="false"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { toggle(p.id); setQ(""); }}>
                      <span>{p.nome || "Sem nome"}{p.categoria ? <span className="muted"> · {p.categoria}</span> : null}</span>
                      <span className="muted">{precoTxt(p)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

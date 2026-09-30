"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, ABERTAS, TIPOS_PADRAO, COLUNAS_NEGOCIO, nomeEtapa } from "../lib/constantes";
import { brl, brlExato, hoje, diff } from "../lib/util";
import { modeloPara, prodsDe, statusAcao } from "../lib/mensagens";
import Painel from "./Painel";
import Config from "./Config";
import Usuarios from "./Usuarios";
import Backup from "./Backup";
import { IcChat, IcMail, IcClock, IcPlus, IcSearch, IcSliders } from "./Icon";

export default function Crm({ sessao, perfil }) {
  const userId = sessao.user.id;
  const ehAdmin = perfil.papel === "admin" || perfil.papel === "super_admin";
  const ehSuper = perfil.papel === "super_admin";
  const [pessoas, setPessoas] = useState([]);
  const [usuariosAberto, setUsuariosAberto] = useState(false);
  const [backupAberto, setBackupAberto] = useState(false);
  const [fresp, setFresp] = useState("");
  const [rascunho, setRascunho] = useState(null);
  const [criando, setCriando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [negocios, setNegocios] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [modelos, setModelos] = useState({});
  const [assinatura, setAssinatura] = useState("");
  const [interacoes, setInteracoes] = useState({});
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [fprod, setFprod] = useState("");
  const [abertoId, setAbertoId] = useState(null);
  const [focoNome, setFocoNome] = useState(false);
  const [cfgAberto, setCfgAberto] = useState(false);
  const [toastTxt, setToastTxt] = useState("");
  const [iaDisponivel, setIaDisponivel] = useState(false);
  const [sobre, setSobre] = useState(null);
  const toastTimer = useRef();
  const iniciou = useRef(false);
  const pend = useRef({});

  const toast = useCallback((t) => {
    setToastTxt(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastTxt(""), 2600);
  }, []);

  /* ---------- Gravação com atraso (evita uma chamada por tecla) ---------- */
  const executar = useCallback(async (k) => {
    const p = pend.current[k];
    if (!p) return;
    clearTimeout(p.timer);
    delete pend.current[k];
    const { error } = p.upsert
      ? await supabase.from(p.tabela).upsert(p.patch, { onConflict: p.upsert })
      : await supabase.from(p.tabela).update(p.patch).eq(p.idCol, p.id);
    if (error) toast("Não foi possível salvar: " + error.message);
  }, [toast]);

  const salvarDepois = useCallback((tabela, id, patch, idCol = "id", upsert = null) => {
    const k = tabela + ":" + id;
    const p = pend.current[k] || { tabela, id, idCol, upsert, patch: {} };
    p.patch = { ...p.patch, ...patch };
    clearTimeout(p.timer);
    p.timer = setTimeout(() => executar(k), 600);
    pend.current[k] = p;
  }, [executar]);

  const salvarTudoAgora = useCallback(() => {
    Object.keys(pend.current).forEach(executar);
  }, [executar]);

  useEffect(() => {
    const antesDeSair = () => salvarTudoAgora();
    window.addEventListener("beforeunload", antesDeSair);
    return () => window.removeEventListener("beforeunload", antesDeSair);
  }, [salvarTudoAgora]);

  /* ---------- Carga inicial ---------- */
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    (async () => {
      const [n, np, p, t, m, c] = await Promise.all([
        supabase.from("negocios").select("*").order("criado_em", { ascending: false }),
        supabase.from("negocio_produtos").select("negocio_id,produto_id"),
        supabase.from("produtos").select("*").order("criado_em"),
        supabase.from("tipos_mensagem").select("*").order("ordem"),
        supabase.from("modelos_produto").select("*"),
        supabase.from("configuracoes").select("*").maybeSingle(),
      ]);
      const falha = [n, np, p, t, m, c].find((r) => r.error);
      if (falha) { setErroCarga(falha.error.message); return; }

      let tiposRows = t.data;
      if (!tiposRows.length && ehAdmin) {
        const r = await supabase.from("tipos_mensagem").insert(TIPOS_PADRAO.map((x, i) => ({ ...x, ordem: i }))).select();
        if (r.error) { setErroCarga(r.error.message); return; }
        tiposRows = r.data.sort((a, b) => a.ordem - b.ordem);
      }
      if (!c.data) await supabase.from("configuracoes").insert({ assinatura: "" });

      const mapa = {};
      np.data.forEach((r) => { (mapa[r.negocio_id] ||= []).push(r.produto_id); });
      const mm = {};
      m.data.forEach((r) => { mm[r.produto_id + ":" + r.tipo_id] = r.modelo; });

      setNegocios(n.data.map((d) => ({ ...d, valor: Number(d.valor) || 0, produtos: mapa[d.id] || [] })));
      setProdutos(p.data.map((x) => ({ ...x, preco: Number(x.preco) || 0 })));
      setTipos(tiposRows);
      setModelos(mm);
      setAssinatura(c.data?.assinatura || "");
      setCarregado(true);
    })();
    fetch("/api/gerar-mensagem").then((r) => r.json()).then((j) => setIaDisponivel(!!j.disponivel)).catch(() => {});
  }, []);

  const carregarPessoas = useCallback(async () => {
    if (!ehAdmin) return;
    const { data, error } = await supabase.from("perfis").select("user_id,nome,email,papel,status,criado_em").order("criado_em");
    if (!error) setPessoas(data);
  }, [ehAdmin]);
  useEffect(() => { carregarPessoas(); }, [carregarPessoas]);

  const ctx = useMemo(() => ({ produtos, tipos, modelos, assinatura }), [produtos, tipos, modelos, assinatura]);

  /* ---------- Negócios ---------- */
  const atualizarNegocio = useCallback((id, patch) => {
    setNegocios((ns) => ns.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    const db = {};
    for (const k in patch) if (COLUNAS_NEGOCIO.includes(k)) db[k] = k === "acao_data" && !patch[k] ? null : patch[k];
    if (Object.keys(db).length) salvarDepois("negocios", id, db);
  }, [salvarDepois]);

  const registrar = useCallback(async (negocioId, texto, sistema = false) => {
    const { data, error } = await supabase.from("interacoes").insert({ negocio_id: negocioId, texto, sistema }).select().single();
    if (error) { toast("Não foi possível registrar: " + error.message); return; }
    setInteracoes((m) => (m[negocioId] ? { ...m, [negocioId]: [data, ...m[negocioId]] } : m));
  }, [toast]);

  const mover = useCallback((id, etapa) => {
    const d = negocios.find((x) => x.id === id);
    if (!d || d.etapa === etapa) return;
    const patch = { etapa, etapa_desde: hoje(), tipo_msg_id: null };
    if (d.msg_origem === "modelo" || !d.msg_origem) {
      const m = modeloPara({ ...d, ...patch }, ctx);
      Object.assign(patch, { msg_rascunho: m.msg, assunto_rascunho: m.assunto, msg_origem: "modelo" });
    }
    atualizarNegocio(id, patch);
    registrar(id, "Movido para " + nomeEtapa(etapa), true);
    toast(`${d.nome || "Negócio"} movido para ${nomeEtapa(etapa)}`);
  }, [negocios, ctx, atualizarNegocio, registrar, toast]);

  const toggleProduto = useCallback(async (negocioId, produtoId) => {
    const d = negocios.find((x) => x.id === negocioId);
    if (!d) return;
    const tem = d.produtos.includes(produtoId);
    const lista = tem ? d.produtos.filter((x) => x !== produtoId) : [...d.produtos, produtoId];
    const valor = prodsDe({ produtos: lista }, produtos).reduce((s, p) => s + (+p.preco || 0), 0);
    atualizarNegocio(negocioId, { produtos: lista, valor });
    const { error } = tem
      ? await supabase.from("negocio_produtos").delete().eq("negocio_id", negocioId).eq("produto_id", produtoId)
      : await supabase.from("negocio_produtos").insert({ negocio_id: negocioId, produto_id: produtoId });
    if (error) toast("Não foi possível salvar o produto: " + error.message);
  }, [negocios, produtos, atualizarNegocio, toast]);

  const abrir = useCallback(async (id, foco = false) => {
    setAbertoId(id);
    setFocoNome(foco);
    if (!interacoes[id]) {
      const { data, error } = await supabase.from("interacoes").select("*").eq("negocio_id", id).order("criado_em", { ascending: false });
      if (!error) setInteracoes((m) => ({ ...m, [id]: data }));
    }
  }, [interacoes]);

  const fechar = useCallback(() => {
    if (rascunho) {
      const preenchido = rascunho.nome || rascunho.empresa || rascunho.telefone || rascunho.email;
      if (preenchido && !confirm("Descartar este novo negócio? Ele ainda não foi salvo.")) return;
      setRascunho(null);
    }
    salvarTudoAgora();
    setAbertoId(null);
    setCfgAberto(false);
    setUsuariosAberto(false);
    setBackupAberto(false);
  }, [rascunho, salvarTudoAgora]);

  // "Novo lead" só abre um rascunho; o negócio é gravado ao clicar em Concluir.
  const novoNegocio = useCallback(() => {
    salvarTudoAgora();
    setAbertoId(null);
    setCfgAberto(false);
    setUsuariosAberto(false);
    const prods = fprod ? [fprod] : [];
    setRascunho({
      id: "__novo__", user_id: userId, nome: "", empresa: "", razao_social: "", cidade: "", uf: "", situacao_cnpj: "",
      cnpj: "", cnae: "", atividade: "",
      telefone: "", email: "", canal: "whatsapp", etapa: "novo", etapa_desde: hoje(),
      acao: "Fazer primeiro contato", acao_data: hoje(), motivo_perda: "", tipo_msg_id: null,
      msg_rascunho: "", assunto_rascunho: "", msg_origem: "", produtos: prods,
      valor: prodsDe({ produtos: prods }, produtos).reduce((s, p) => s + (+p.preco || 0), 0),
    });
    setFocoNome(true);
  }, [fprod, produtos, userId, salvarTudoAgora]);

  const atualizarRascunho = useCallback((patch) => setRascunho((r) => (r ? { ...r, ...patch } : r)), []);

  const toggleProdutoRascunho = useCallback((produtoId) => {
    setRascunho((r) => {
      if (!r) return r;
      const lista = r.produtos.includes(produtoId) ? r.produtos.filter((x) => x !== produtoId) : [...r.produtos, produtoId];
      return { ...r, produtos: lista, valor: prodsDe({ produtos: lista }, produtos).reduce((s, p) => s + (+p.preco || 0), 0) };
    });
  }, [produtos]);

  const criarRascunho = useCallback(async () => {
    if (!rascunho || criando) return;
    if (!rascunho.nome.trim() && !rascunho.empresa.trim()) { toast("Preencha pelo menos o nome ou a empresa"); return; }
    setCriando(true);
    const linha = {};
    COLUNAS_NEGOCIO.forEach((k) => { linha[k] = k === "acao_data" && !rascunho[k] ? null : rascunho[k]; });
    const { data, error } = await supabase.from("negocios").insert(linha).select().single();
    if (error) { setCriando(false); toast("Não foi possível criar: " + error.message); return; }
    if (rascunho.produtos.length) {
      const r = await supabase.from("negocio_produtos").insert(rascunho.produtos.map((pid) => ({ negocio_id: data.id, produto_id: pid })));
      if (r.error) toast("Negócio criado, mas os produtos não foram salvos: " + r.error.message);
    }
    const { data: nota } = await supabase.from("interacoes").insert({ negocio_id: data.id, texto: "Lead criado", sistema: true }).select().single();
    setNegocios((ns) => [{ ...data, valor: Number(data.valor) || 0, produtos: rascunho.produtos }, ...ns]);
    setInteracoes((m) => ({ ...m, [data.id]: nota ? [nota] : [] }));
    setRascunho(null);
    setCriando(false);
    toast(`${data.nome || data.empresa} criado em ${nomeEtapa(data.etapa)}`);
  }, [rascunho, criando, toast]);

  const excluirNegocio = useCallback(async (id) => {
    const d = negocios.find((x) => x.id === id);
    if (!confirm(`Excluir o negócio de ${d?.nome || "este lead"}? Isso não pode ser desfeito.`)) return;
    delete pend.current["negocios:" + id];
    const { error } = await supabase.from("negocios").delete().eq("id", id);
    if (error) { toast("Não foi possível excluir: " + error.message); return; }
    setNegocios((ns) => ns.filter((x) => x.id !== id));
    setAbertoId(null);
    toast("Negócio excluído");
  }, [negocios, toast]);

  /* ---------- Produtos, tipos e remetente ---------- */
  const cfg = {
    addProduto: async () => {
      const { data, error } = await supabase.from("produtos").insert({ nome: "Novo produto" }).select().single();
      if (error) { toast(error.message); return null; }
      setProdutos((ps) => [...ps, { ...data, preco: Number(data.preco) || 0 }]);
      return data.id;
    },
    updProduto: (id, patch) => {
      setProdutos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      salvarDepois("produtos", id, patch);
    },
    delProduto: async (id) => {
      const p = produtos.find((x) => x.id === id);
      if (!confirm(`Excluir “${p?.nome}”? Ele será retirado dos negócios em que aparece.`)) return;
      delete pend.current["produtos:" + id];
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) { toast(error.message); return; }
      setProdutos((ps) => ps.filter((x) => x.id !== id));
      setNegocios((ns) => ns.map((d) => ({ ...d, produtos: d.produtos.filter((x) => x !== id) })));
      if (fprod === id) setFprod("");
      toast("Produto excluído");
    },
    setModelo: (produtoId, tipoId, texto) => {
      setModelos((m) => ({ ...m, [produtoId + ":" + tipoId]: texto }));
      salvarDepois("modelos_produto", produtoId + ":" + tipoId, { produto_id: produtoId, tipo_id: tipoId, modelo: texto }, null, "produto_id,tipo_id");
    },
    addTipo: async () => {
      const { data, error } = await supabase.from("tipos_mensagem")
        .insert({ nome: "Novo tipo", assunto: "{produto} para {empresa}", modelo: "Oi {primeiro_nome}, ", ordem: tipos.length })
        .select().single();
      if (error) { toast(error.message); return null; }
      setTipos((ts) => [...ts, data]);
      return data.id;
    },
    updTipo: (id, patch) => {
      setTipos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      salvarDepois("tipos_mensagem", id, patch);
    },
    toggleEtapaTipo: (id, etapa) => {
      const alvo = tipos.find((t) => t.id === id);
      const tinha = alvo.etapas.includes(etapa);
      const novos = tipos.map((t) => {
        let e = t.etapas.filter((x) => x !== etapa);
        if (t.id === id && !tinha) e = [...e, etapa];
        return { ...t, etapas: e };
      });
      novos.forEach((t, i) => { if (t.etapas.join() !== tipos[i].etapas.join()) salvarDepois("tipos_mensagem", t.id, { etapas: t.etapas }); });
      setTipos(novos);
    },
    delTipo: async (id) => {
      if (tipos.length <= 1) { toast("Mantenha pelo menos um tipo de mensagem"); return; }
      const t = tipos.find((x) => x.id === id);
      if (!confirm(`Excluir o tipo “${t?.nome}”?`)) return;
      delete pend.current["tipos_mensagem:" + id];
      const { error } = await supabase.from("tipos_mensagem").delete().eq("id", id);
      if (error) { toast(error.message); return; }
      setTipos((ts) => ts.filter((x) => x.id !== id));
      setNegocios((ns) => ns.map((d) => (d.tipo_msg_id === id ? { ...d, tipo_msg_id: null } : d)));
      toast("Tipo excluído");
    },
    setAssinatura: (v) => {
      setAssinatura(v);
      salvarDepois("configuracoes", userId, { assinatura: v }, "user_id");
    },
  };

  /* ---------- Filtros e números ---------- */
  function visivel(d) {
    if (filtro === "whatsapp" && d.canal !== "whatsapp") return false;
    if (filtro === "email" && d.canal !== "email") return false;
    if (filtro === "atrasados") { const s = statusAcao(d); if (!s || s.cls !== "late") return false; }
    if (fprod && !d.produtos.includes(fprod)) return false;
    if (fresp && d.user_id !== fresp) return false;
    if (busca) {
      const t = (d.nome + " " + d.empresa + " " + d.telefone + " " + d.email).toLowerCase();
      if (!t.includes(busca.toLowerCase())) return false;
    }
    return true;
  }

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && (abertoId || rascunho || cfgAberto || usuariosAberto || backupAberto)) fechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abertoId, rascunho, cfgAberto, usuariosAberto, backupAberto, fechar]);

  if (erroCarga) return <div className="carregando">Erro ao carregar os dados: {erroCarga}</div>;
  if (!carregado) return <div className="carregando">Carregando seus negócios…</div>;

  const abertos = negocios.filter((d) => ABERTAS.includes(d.etapa));
  const totalAberto = abertos.reduce((s, d) => s + (+d.valor || 0), 0);
  const mes = hoje().slice(0, 7);
  const ganhoMes = negocios.filter((d) => d.etapa === "ganho" && String(d.etapa_desde).slice(0, 7) === mes).reduce((s, d) => s + (+d.valor || 0), 0);
  const nGanho = negocios.filter((d) => d.etapa === "ganho").length;
  const nPerdido = negocios.filter((d) => d.etapa === "perdido").length;
  const atrasados = negocios.filter((d) => statusAcao(d)?.cls === "late").length;
  const aberto = negocios.find((d) => d.id === abertoId);
  const pendentes = pessoas.filter((p) => p.status === "pendente").length;
  const nomes = Object.fromEntries(pessoas.map((p) => [p.user_id, p.nome || p.email]));

  return (
    <div className="app">
      <header>
        <div className="marca">
          <img src="/logo-icone.png" alt="" />
          <img src="/logo-texto.png" alt="gade2b" style={{ height: 22 }} />
          <span className="sep" />
          <span className="mod">CRM</span>
        </div>
        <div className="search">
          <IcSearch />
          <input type="search" placeholder="Buscar nome, empresa ou telefone" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="fsel" aria-label="Filtrar por produto" value={fprod} onChange={(e) => setFprod(e.target.value)}>
          <option value="">Todos os produtos</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        {ehAdmin && (
          <select className="fsel" aria-label="Filtrar por responsável" value={fresp} onChange={(e) => setFresp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {pessoas.filter((p) => p.status === "ativo").map((p) => <option key={p.user_id} value={p.user_id}>{p.nome || p.email}</option>)}
          </select>
        )}
        <div className="chips" role="group" aria-label="Filtros">
          {[["todos", "Todos"], ["whatsapp", "WhatsApp"], ["email", "E-mail"], ["atrasados", "Ações atrasadas"]].map(([id, t]) => (
            <button key={id} className="chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{t}</button>
          ))}
        </div>
        <div className="spacer" />
        {ehSuper && (
          <button className="btn" onClick={() => { setAbertoId(null); setCfgAberto(false); setBackupAberto(false); setUsuariosAberto(true); }}>
            Usuários {pendentes > 0 && <span className="badge">{pendentes}</span>}
          </button>
        )}
        {ehAdmin && <button className="btn" onClick={() => { setAbertoId(null); setCfgAberto(false); setUsuariosAberto(false); setBackupAberto(true); }}>Backup</button>}
        <button className="btn" onClick={() => { setAbertoId(null); setUsuariosAberto(false); setBackupAberto(false); setCfgAberto(true); }}><IcSliders />{ehAdmin ? "Produtos e mensagens" : "Minha assinatura"}</button>
        <button className="btn primary" onClick={novoNegocio}><IcPlus />Novo lead</button>
        <button className="btn ghost" onClick={() => { salvarTudoAgora(); supabase.auth.signOut(); }} title={sessao.user.email}>Sair</button>
      </header>

      <section className="funnel" aria-label="Valor em aberto por etapa">
        <div className="funnel-bar">
          {ABERTAS.map((id) => {
            const e = ETAPAS.find((x) => x.id === id);
            const v = abertos.filter((d) => d.etapa === id).reduce((s, d) => s + (+d.valor || 0), 0);
            return (
              <button key={id} className="seg" title={`${e.nome}: ${brl.format(v)}`}
                style={{ flexGrow: Math.max(v, totalAberto * 0.02) || 1, background: e.cor, color: "var(--ink)" }}
                onClick={() => document.querySelector(`.col[data-etapa="${id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
                <span>{e.nome} · {brl.format(v)}</span>
              </button>
            );
          })}
        </div>
        <div className="funnel-meta">
          <span>Em aberto <strong>{brl.format(totalAberto)}</strong> em {abertos.length} negócios</span>
          <span>Ganho no mês <strong>{brl.format(ganhoMes)}</strong></span>
          <span>Conversão <strong>{nGanho + nPerdido ? Math.round((nGanho / (nGanho + nPerdido)) * 100) : 0}%</strong> dos negócios encerrados</span>
          <span className={atrasados ? "alert" : ""}>Ações atrasadas <strong>{atrasados}</strong></span>
        </div>
      </section>

      {!negocios.length && <p className="hint">Comece em “Produtos e mensagens” para cadastrar o que você vende, depois clique em “Novo lead”.</p>}

      <main className="board">
        {ETAPAS.map((e) => {
          const lista = negocios.filter((d) => d.etapa === e.id && visivel(d)).sort((a, b) => ((a.acao_data || "9") < (b.acao_data || "9") ? -1 : 1));
          const soma = lista.reduce((s, d) => s + (+d.valor || 0), 0);
          return (
            <section key={e.id} className={"col" + (sobre === e.id ? " over" : "")} data-etapa={e.id} aria-label={e.nome}
              onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id); }}
              onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setSobre(null); }}
              onDrop={(ev) => { ev.preventDefault(); setSobre(null); mover(ev.dataTransfer.getData("text/plain"), e.id); }}>
              <div className="col-head">
                <div className="col-title"><span className="dot" style={{ background: e.cor }} />{e.nome}<span className="count">{lista.length}</span></div>
                <div className="col-sum">{brl.format(soma)}</div>
              </div>
              <div className="cards">
                {lista.length ? lista.map((d) => <Card key={d.id} d={d} produtos={produtos} resp={ehAdmin ? nomes[d.user_id] : null} onOpen={() => abrir(d.id)} />)
                  : <div className="empty">{busca || fprod || filtro !== "todos" ? "Nenhum negócio com esse filtro" : "Arraste um card para cá"}</div>}
              </div>
            </section>
          );
        })}
      </main>

      <div className={"scrim" + (aberto || rascunho || cfgAberto || usuariosAberto || backupAberto ? " open" : "")} onClick={fechar} />

      {rascunho && (
        <Painel
          novo criando={criando}
          d={rascunho} ctx={ctx} interacoes={[]} iaDisponivel={iaDisponivel} focoNome={focoNome}
          responsaveis={ehAdmin ? pessoas.filter((p) => p.status === "ativo") : null}
          atualizar={atualizarRascunho}
          mover={(etapa) => atualizarRascunho({ etapa, tipo_msg_id: null })}
          toggleProduto={toggleProdutoRascunho}
          registrar={() => {}}
          excluir={fechar}
          concluir={criarRascunho}
          fechar={fechar} toast={toast}
        />
      )}

      {aberto && (
        <Painel
          d={aberto} ctx={ctx} interacoes={interacoes[aberto.id] || []} iaDisponivel={iaDisponivel} focoNome={focoNome}
          responsaveis={ehAdmin ? pessoas.filter((p) => p.status === "ativo" || p.user_id === aberto.user_id) : null}
          atualizar={(patch) => atualizarNegocio(aberto.id, patch)}
          mover={(etapa) => mover(aberto.id, etapa)}
          toggleProduto={(pid) => toggleProduto(aberto.id, pid)}
          registrar={(t, s) => registrar(aberto.id, t, s)}
          excluir={() => excluirNegocio(aberto.id)}
          fechar={fechar} toast={toast}
        />
      )}
      {cfgAberto && <Config produtos={produtos} tipos={tipos} modelos={modelos} assinatura={assinatura} cfg={cfg} fechar={fechar} podeEditar={ehAdmin} />}
      {backupAberto && <Backup fechar={fechar} toast={toast} />}
      {usuariosAberto && <Usuarios pessoas={pessoas} meId={userId} recarregar={carregarPessoas} fechar={fechar} toast={toast} />}

      <div className={"toast" + (toastTxt ? " show" : "")} role="status" aria-live="polite">{toastTxt}</div>
    </div>
  );
}

function Card({ d, produtos, resp, onOpen }) {
  const s = statusAcao(d);
  const ps = prodsDe(d, produtos);
  const parado = ABERTAS.includes(d.etapa) ? diff(hoje(), d.etapa_desde) : 0;
  return (
    <div className={"card " + d.canal} draggable tabIndex={0} role="button" aria-label={`${d.nome || "Sem nome"}, ${brl.format(+d.valor || 0)}`}
      onClick={onOpen}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(); } }}
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", d.id); ev.dataTransfer.effectAllowed = "move"; ev.currentTarget.classList.add("dragging"); }}
      onDragEnd={(ev) => ev.currentTarget.classList.remove("dragging")}>
      <div className="c-top"><span className="c-name">{d.nome || "Sem nome"}</span><span className="c-val">{brlExato(d.valor)}</span></div>
      {d.empresa && <div className="c-co">{d.empresa}</div>}
      {ps.length > 0 && <div className="c-prod">{ps.map((p) => <span key={p.id}>{p.nome}</span>)}</div>}
      {d.acao && s && <div className={"c-next " + s.cls}><IcClock /><span><b>{s.txt}:</b> {d.acao}</span></div>}
      {d.etapa === "perdido" && d.motivo_perda && <div className="c-next">{d.motivo_perda}</div>}
      <div className="c-foot">
        <span className="ch-tag">{d.canal === "whatsapp" ? <><IcChat /> WhatsApp</> : <><IcMail /> E-mail</>}</span>
        {resp && <span className="c-resp">{resp}</span>}
        {parado >= 7 && <span className="stale">parado há {parado} dias</span>}
      </div>
    </div>
  );
}

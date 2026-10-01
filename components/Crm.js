"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, ABERTAS, TIPOS_PADRAO, COLUNAS_NEGOCIO, nomeEtapa, definirEtapas } from "../lib/constantes";
import { brl, brlExato, hoje, diff } from "../lib/util";
import { modeloPara, prodsDe, statusAcao } from "../lib/mensagens";
import Painel from "./Painel";
import Config from "./Config";
import Usuarios from "./Usuarios";
import Backup from "./Backup";
import Catalogo from "./Catalogo";
import Lixeira from "./Lixeira";
import Financeiro from "./Financeiro";
import MinhasComissoes from "./MinhasComissoes";
import Plataforma from "./Plataforma";
import MinhaEmpresa from "./MinhaEmpresa";
import EtapasEditor from "./EtapasEditor";
import { OPERADORAS } from "./ContatosEditor";
import ImportarLeads from "./ImportarLeads";
import { IcChat, IcMail, IcClock, IcPlus, IcSearch, IcMenu } from "./Icon";

// Busca todas as linhas de uma consulta, de 1000 em 1000 (limite do Supabase por chamada)
async function buscarTodos(consulta) {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) return { data: null, error };
    todas.push(...data);
    if (data.length < 1000) break;
  }
  return { data: todas, error: null };
}

// Soma preço × quantidade dos produtos do negócio
function valorDe(lista, qtd, produtos) {
  return Math.round(prodsDe({ produtos: lista }, produtos).reduce((s, p) => s + (+p.preco || 0) * ((qtd || {})[p.id] || 1), 0) * 100) / 100;
}

export default function Crm({ sessao, perfil, empresa, plataforma, recarregarEmpresa }) {
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
  const [foper, setFoper] = useState("");
  const [importar, setImportar] = useState(null);
  const [contatosMap, setContatosMap] = useState({});
  const contatosMapRef = useRef({});
  contatosMapRef.current = contatosMap;
  const [fornecedores, setFornecedores] = useState([]);
  const [tela, setTela] = useState("quadro");
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [empresaAberta, setEmpresaAberta] = useState(false);
  const [etapas, setEtapasEstado] = useState([]);
  const [etapasAberto, setEtapasAberto] = useState(false);
  const setEtapas = useCallback((lista) => { definirEtapas(lista); setEtapasEstado(lista); }, []);
  const menuRef = useRef(null);
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
    toastTimer.current = setTimeout(() => setToastTxt(""), Math.max(2600, String(t).length * 55));
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
  const carregarDados = useCallback(async () => {
    {
      const [n, np, p, t, m, c, fo, et, ct, tl] = await Promise.all([
        buscarTodos((de, ate) => supabase.from("negocios").select("*").is("excluido_em", null).order("criado_em", { ascending: false }).range(de, ate)),
        buscarTodos((de, ate) => supabase.from("negocio_produtos").select("negocio_id,produto_id,quantidade").range(de, ate)),
        supabase.from("produtos").select("*").order("criado_em"),
        supabase.from("tipos_mensagem").select("*").order("ordem"),
        supabase.from("modelos_produto").select("*"),
        supabase.from("configuracoes").select("*").maybeSingle(),
        supabase.from("fornecedores").select("*").order("nome"),
        supabase.from("etapas").select("*").order("ordem"),
        buscarTodos((de, ate) => supabase.from("contatos").select("*").order("ordem").order("criado_em").range(de, ate)),
        buscarTodos((de, ate) => supabase.from("telefones").select("*").order("criado_em").range(de, ate)),
      ]);
      const falha = [n, np, p, t, m, c, fo, et, ct, tl].find((r) => r.error);
      if (falha) { setErroCarga(falha.error.message); return; }

      let tiposRows = t.data;
      if (!tiposRows.length && ehAdmin) {
        const r = await supabase.from("tipos_mensagem").insert(TIPOS_PADRAO.map((x, i) => ({ ...x, ordem: i }))).select();
        if (r.error) { setErroCarga(r.error.message); return; }
        tiposRows = r.data.sort((a, b) => a.ordem - b.ordem);
      }
      if (!c.data) await supabase.from("configuracoes").insert({ assinatura: "" });

      const mapa = {};
      const qtds = {};
      np.data.forEach((r) => { (mapa[r.negocio_id] ||= []).push(r.produto_id); (qtds[r.negocio_id] ||= {})[r.produto_id] = r.quantidade || 1; });
      const mm = {};
      m.data.forEach((r) => { mm[r.produto_id + ":" + r.tipo_id] = r.modelo; });

      setNegocios(n.data.map((d) => ({ ...d, valor: Number(d.valor) || 0, produtos: mapa[d.id] || [], qtd: qtds[d.id] || {} })));
      setProdutos(p.data.map((x) => ({ ...x, preco: Number(x.preco) || 0 })));
      setFornecedores(fo.data);
      if (et.data?.length) setEtapas(et.data);
      const cm = {};
      ct.data.forEach((x) => { (cm[x.negocio_id] ||= []).push({ ...x, telefones: [] }); });
      tl.data.forEach((x) => { const c = (cm[x.negocio_id] || []).find((y) => y.id === x.contato_id); if (c) c.telefones.push(x); });
      setContatosMap(cm);
      setTipos(tiposRows);
      setModelos(mm);
      setAssinatura(c.data?.assinatura || "");
      setCarregado(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    carregarDados();
    fetch("/api/gerar-mensagem").then((r) => r.json()).then((j) => setIaDisponivel(!!j.disponivel)).catch(() => {});
  }, [carregarDados]);

  const carregarPessoas = useCallback(async () => {
    if (!ehAdmin) return;
    const { data, error } = await supabase.from("perfis").select("user_id,nome,email,papel,status,criado_em,comissao_tipo,comissao_valor").order("criado_em");
    if (!error) setPessoas(data);
  }, [ehAdmin]);
  useEffect(() => { carregarPessoas(); }, [carregarPessoas]);

  const ctx = useMemo(() => ({ produtos, tipos, modelos, assinatura, fornecedores }), [produtos, tipos, modelos, assinatura, fornecedores]);

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
    const qtd = { ...(d.qtd || {}) };
    if (tem) delete qtd[produtoId]; else qtd[produtoId] = 1;
    atualizarNegocio(negocioId, { produtos: lista, qtd, valor: valorDe(lista, qtd, produtos) });
    const { error } = tem
      ? await supabase.from("negocio_produtos").delete().eq("negocio_id", negocioId).eq("produto_id", produtoId)
      : await supabase.from("negocio_produtos").insert({ negocio_id: negocioId, produto_id: produtoId, quantidade: 1 });
    if (error) toast("Não foi possível salvar o produto: " + error.message);
  }, [negocios, produtos, atualizarNegocio, toast]);

  const qtdTimers = useRef({});
  const setQuantidade = useCallback((negocioId, produtoId, q) => {
    const d = negocios.find((x) => x.id === negocioId);
    if (!d) return;
    const n = Math.max(1, Math.min(9999, parseInt(q, 10) || 1));
    const qtd = { ...(d.qtd || {}), [produtoId]: n };
    atualizarNegocio(negocioId, { qtd, valor: valorDe(d.produtos, qtd, produtos) });
    const k = negocioId + ":" + produtoId;
    clearTimeout(qtdTimers.current[k]);
    qtdTimers.current[k] = setTimeout(async () => {
      const { error } = await supabase.from("negocio_produtos").update({ quantidade: n }).eq("negocio_id", negocioId).eq("produto_id", produtoId);
      if (error) toast("Não foi possível salvar a quantidade: " + error.message);
    }, 700);
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
    setLixeiraAberta(false);
    setEmpresaAberta(false);
    setEtapasAberto(false);
    setImportar(null);
  }, [rascunho, salvarTudoAgora]);

  // "Novo lead" só abre um rascunho; o negócio é gravado ao clicar em Concluir.
  const novoNegocio = useCallback((etapaEscolhida) => {
    salvarTudoAgora();
    setAbertoId(null);
    setCfgAberto(false);
    setUsuariosAberto(false);
    const prods = fprod ? [fprod] : [];
    setRascunho({
      id: "__novo__", user_id: userId, nome: "", empresa: "", razao_social: "", cidade: "", uf: "", situacao_cnpj: "",
      cnpj: "", cnae: "", atividade: "",
      telefone: "", email: "", canal: "whatsapp", etapa: (typeof etapaEscolhida === "string" && etapaEscolhida) || ABERTAS[0] || "novo", etapa_desde: hoje(),
      acao: "Fazer primeiro contato", acao_data: hoje(), motivo_perda: "", tipo_msg_id: null,
      msg_rascunho: "", assunto_rascunho: "", msg_origem: "", produtos: prods, qtd: prods.length ? { [prods[0]]: 1 } : {},
      contatos: [{ id: "tmp-c1", nome: "", cargo: "", email: "", telefones: [{ id: "tmp-t1", numero: "", etiqueta: "whatsapp", principal: true, origem: "", operadora: "", portado: false, operadora_consultada_em: null }] }],
      valor: valorDe(prods, {}, produtos),
    });
    setFocoNome(true);
  }, [fprod, produtos, userId, salvarTudoAgora]);

  const atualizarRascunho = useCallback((patch) => setRascunho((r) => (r ? { ...r, ...patch } : r)), []);

  const toggleProdutoRascunho = useCallback((produtoId) => {
    setRascunho((r) => {
      if (!r) return r;
      const tem = r.produtos.includes(produtoId);
      const lista = tem ? r.produtos.filter((x) => x !== produtoId) : [...r.produtos, produtoId];
      const qtd = { ...(r.qtd || {}) };
      if (tem) delete qtd[produtoId]; else qtd[produtoId] = 1;
      return { ...r, produtos: lista, qtd, valor: valorDe(lista, qtd, produtos) };
    });
  }, [produtos]);
  const setQuantidadeRascunho = useCallback((produtoId, q) => {
    setRascunho((r) => {
      if (!r) return r;
      const qtd = { ...(r.qtd || {}), [produtoId]: Math.max(1, Math.min(9999, parseInt(q, 10) || 1)) };
      return { ...r, qtd, valor: valorDe(r.produtos, qtd, produtos) };
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
      const r = await supabase.from("negocio_produtos").insert(rascunho.produtos.map((pid) => ({ negocio_id: data.id, produto_id: pid, quantidade: (rascunho.qtd || {})[pid] || 1 })));
      if (r.error) toast("Negócio criado, mas os produtos não foram salvos: " + r.error.message);
    }
    await gravarContatosRascunho(data.id, rascunho.contatos);
    const { data: nota } = await supabase.from("interacoes").insert({ negocio_id: data.id, texto: "Lead criado", sistema: true }).select().single();
    setNegocios((ns) => [{ ...data, valor: Number(data.valor) || 0, produtos: rascunho.produtos, qtd: rascunho.qtd || {} }, ...ns]);
    setInteracoes((m) => ({ ...m, [data.id]: nota ? [nota] : [] }));
    setRascunho(null);
    setCriando(false);
    toast(`${data.nome || data.empresa} criado em ${nomeEtapa(data.etapa)}`);
  }, [rascunho, criando, toast]);

  // "Excluir" manda para a lixeira; dá para restaurar depois
  const excluirNegocio = useCallback(async (id) => {
    const d = negocios.find((x) => x.id === id);
    if (!confirm(`Mover o negócio de ${d?.nome || d?.empresa || "este lead"} para a lixeira? Dá para restaurar depois, no botão Lixeira.`)) return;
    salvarTudoAgora();
    const { error } = await supabase.from("negocios").update({ excluido_em: new Date().toISOString(), excluido_por: userId }).eq("id", id);
    if (error) { toast("Não foi possível excluir: " + error.message); return; }
    await supabase.from("interacoes").insert({ negocio_id: id, texto: "Enviado para a lixeira", sistema: true });
    setNegocios((ns) => ns.filter((x) => x.id !== id));
    setInteracoes((m) => { const c = { ...m }; delete c[id]; return c; });
    setAbertoId(null);
    toast("Negócio movido para a lixeira");
  }, [negocios, toast, userId, salvarTudoAgora]);

  /* ---------- Produtos, tipos e remetente ---------- */
  const cfg = {
    addProduto: async (extra = {}) => {
      const { data, error } = await supabase.from("produtos").insert({ nome: "", ...extra }).select().single();
      if (error) { toast(error.message); return null; }
      setProdutos((ps) => [...ps, { ...data, preco: Number(data.preco) || 0 }]);
      return data.id;
    },
    addProdutosEmLote: async (itens) => {
      const { data, error } = await supabase.from("produtos").insert(itens).select();
      if (error) { toast("Não foi possível adicionar: " + error.message); return false; }
      setProdutos((ps) => [...ps, ...data.map((x) => ({ ...x, preco: Number(x.preco) || 0 }))]);
      toast(`${data.length} produto(s) adicionado(s)`);
      return true;
    },
    duplicarProduto: async (p) => {
      const { id, criado_em, user_id, ...copia } = p;
      const { data, error } = await supabase.from("produtos").insert({ ...copia, nome: p.nome + " (cópia)" }).select().single();
      if (error) { toast(error.message); return; }
      setProdutos((ps) => [...ps, { ...data, preco: Number(data.preco) || 0 }]);
      toast("Produto duplicado");
    },
    addFornecedor: async (nome) => {
      const { data, error } = await supabase.from("fornecedores").insert({ nome }).select().single();
      if (error) { toast(error.message); return null; }
      setFornecedores((fs) => [...fs, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      return data.id;
    },
    updFornecedor: (id, patch) => {
      setFornecedores((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      salvarDepois("fornecedores", id, patch);
    },
    delFornecedor: async (id) => {
      const f = fornecedores.find((x) => x.id === id);
      const n = produtos.filter((p) => p.fornecedor_id === id).length;
      if (!confirm(`Excluir o fornecedor “${f?.nome}”?${n ? ` Os ${n} produto(s) dele continuam cadastrados, mas ficam sem fornecedor.` : ""}`)) return false;
      delete pend.current["fornecedores:" + id];
      const { error } = await supabase.from("fornecedores").delete().eq("id", id);
      if (error) { toast(error.message); return false; }
      setFornecedores((fs) => fs.filter((x) => x.id !== id));
      setProdutos((ps) => ps.map((p) => (p.fornecedor_id === id ? { ...p, fornecedor_id: null } : p)));
      toast("Fornecedor excluído");
      return true;
    },
    updProduto: (id, patch) => {
      setProdutos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      salvarDepois("produtos", id, patch);
    },
    delProduto: async (id) => {
      const p = produtos.find((x) => x.id === id);
      if (!confirm(`Excluir “${p?.nome || "produto sem nome"}”? Ele será retirado dos negócios em que aparece. Se quiser só tirar da lista, desmarque “Ativo”.`)) return;
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

  /* ---------- Contatos e telefones ---------- */
  // Copia o telefone e o e-mail principais para o negócio na tela (no banco, um gatilho faz isso)
  const principalDe = (lista) => {
    for (const c of lista || []) { const t = (c.telefones || []).find((x) => x.principal); if (t) return { t, c }; }
    return null;
  };
  const sincronizar = useCallback((nid, lista) => {
    const p = principalDe(lista);
    const mail = (p?.c.email) || (lista || []).find((c) => c.email)?.email || "";
    setNegocios((ns) => ns.map((d) => (d.id === nid ? { ...d, telefone: p?.t.numero || "", email: mail } : d)));
  }, []);
  const mudarContatos = useCallback((nid, fn) => {
    setContatosMap((m) => {
      const lista = fn(m[nid] || []);
      sincronizar(nid, lista);
      return { ...m, [nid]: lista };
    });
  }, [sincronizar]);

  const opsPara = useCallback((nid) => {
    const lista = () => contatosMapRef.current[nid] || [];
    const acharTel = (tid) => { for (const c of lista()) { const t = (c.telefones || []).find((x) => x.id === tid); if (t) return t; } return null; };
    const promover = async () => {
      if (principalDe(lista())) return;
      const primeiro = lista().flatMap((c) => c.telefones || [])[0];
      if (!primeiro) return;
      mudarContatos(nid, (l) => l.map((c) => ({ ...c, telefones: c.telefones.map((x) => (x.id === primeiro.id ? { ...x, principal: true } : x)) })));
      await supabase.from("telefones").update({ principal: true }).eq("id", primeiro.id);
    };
    return {
      addContato: async (extra = {}) => {
        const { data, error } = await supabase.from("contatos").insert({ negocio_id: nid, ordem: lista().length, ...extra }).select().single();
        if (error) { toast("Não foi possível criar o contato: " + error.message); return null; }
        const novo = { ...data, telefones: [] };
        mudarContatos(nid, (l) => [...l, novo]);
        return novo;
      },
      updContato: (cid, patch) => {
        mudarContatos(nid, (l) => l.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
        salvarDepois("contatos", cid, patch);
      },
      delContato: async (cid) => {
        const c = lista().find((x) => x.id === cid);
        if (c && (c.nome || c.email || (c.telefones || []).some((t) => t.numero)) && !confirm(`Remover o contato ${c.nome || "sem nome"} e os telefones dele?`)) return;
        delete pend.current["contatos:" + cid];
        const { error } = await supabase.from("contatos").delete().eq("id", cid);
        if (error) { toast(error.message); return; }
        mudarContatos(nid, (l) => l.filter((x) => x.id !== cid));
        await promover();
      },
      addTelefone: async (cid, extra = {}) => {
        const temPrincipal = !!principalDe(lista());
        const { data, error } = await supabase.from("telefones")
          .insert({ contato_id: cid, negocio_id: nid, numero: "", etiqueta: "whatsapp", principal: !temPrincipal, ...extra }).select().single();
        if (error) { toast("Não foi possível adicionar o telefone: " + error.message); return null; }
        mudarContatos(nid, (l) => l.map((c) => (c.id === cid ? { ...c, telefones: [...c.telefones, data] } : c)));
        return data;
      },
      updTelefone: (tid, patch) => {
        mudarContatos(nid, (l) => l.map((c) => ({ ...c, telefones: c.telefones.map((x) => (x.id === tid ? { ...x, ...patch } : x)) })));
        salvarDepois("telefones", tid, patch);
      },
      delTelefone: async (tid) => {
        const t = acharTel(tid);
        if (t?.numero && !confirm(`Remover o telefone ${t.numero}?`)) return;
        delete pend.current["telefones:" + tid];
        const { error } = await supabase.from("telefones").delete().eq("id", tid);
        if (error) { toast(error.message); return; }
        mudarContatos(nid, (l) => l.map((c) => ({ ...c, telefones: c.telefones.filter((x) => x.id !== tid) })));
        if (t?.principal) await promover();
      },
      definirPrincipal: async (tid) => {
        const atual = principalDe(lista());
        salvarTudoAgora();
        if (atual) { const r = await supabase.from("telefones").update({ principal: false }).eq("id", atual.t.id); if (r.error) { toast(r.error.message); return; } }
        const r2 = await supabase.from("telefones").update({ principal: true }).eq("id", tid);
        if (r2.error) { toast(r2.error.message); return; }
        mudarContatos(nid, (l) => l.map((c) => ({ ...c, telefones: c.telefones.map((x) => ({ ...x, principal: x.id === tid })) })));
      },
      salvarOperadora: async (tid, patch) => {
        mudarContatos(nid, (l) => l.map((c) => ({ ...c, telefones: c.telefones.map((x) => (x.id === tid ? { ...x, ...patch } : x)) })));
        const { error } = await supabase.from("telefones").update(patch).eq("id", tid);
        if (error) toast("Não foi possível salvar a operadora: " + error.message);
        else toast(`Operadora salva: ${patch.operadora}`);
      },
    };
  }, [mudarContatos, salvarDepois, salvarTudoAgora, toast]);

  // Contatos do rascunho (novo negócio): ficam só na tela até clicar em Concluir
  const tmp = () => "tmp-" + Math.random().toString(36).slice(2, 10);
  const opsRascunho = {
    addContato: async (extra = {}) => {
      const novo = { id: tmp(), nome: "", cargo: "", email: "", ...extra, telefones: [] };
      setRascunho((r) => ({ ...r, contatos: [...(r.contatos || []), novo] }));
      return novo;
    },
    updContato: (cid, patch) => setRascunho((r) => ({ ...r, contatos: r.contatos.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })),
    delContato: async (cid) => setRascunho((r) => {
      const contatos = r.contatos.filter((c) => c.id !== cid);
      if (!contatos.some((c) => c.telefones.some((t) => t.principal)) && contatos[0]?.telefones[0]) contatos[0].telefones[0] = { ...contatos[0].telefones[0], principal: true };
      return { ...r, contatos };
    }),
    addTelefone: async (cid, extra = {}) => {
      const t = { id: tmp(), numero: "", etiqueta: "whatsapp", principal: false, origem: "", operadora: "", portado: false, operadora_consultada_em: null, ...extra };
      setRascunho((r) => {
        const temPrincipal = r.contatos.some((c) => c.telefones.some((x) => x.principal));
        return { ...r, contatos: r.contatos.map((c) => (c.id === cid ? { ...c, telefones: [...c.telefones, { ...t, principal: !temPrincipal }] } : c)) };
      });
      return t;
    },
    updTelefone: (tid, patch) => setRascunho((r) => ({ ...r, contatos: r.contatos.map((c) => ({ ...c, telefones: c.telefones.map((x) => (x.id === tid ? { ...x, ...patch } : x)) })) })),
    delTelefone: async (tid) => setRascunho((r) => {
      let contatos = r.contatos.map((c) => ({ ...c, telefones: c.telefones.filter((x) => x.id !== tid) }));
      if (!contatos.some((c) => c.telefones.some((t) => t.principal))) {
        const ci = contatos.findIndex((c) => c.telefones.length);
        if (ci >= 0) contatos = contatos.map((c, i) => (i === ci ? { ...c, telefones: c.telefones.map((x, j) => (j === 0 ? { ...x, principal: true } : x)) } : c));
      }
      return { ...r, contatos };
    }),
    definirPrincipal: async (tid) => setRascunho((r) => ({ ...r, contatos: r.contatos.map((c) => ({ ...c, telefones: c.telefones.map((x) => ({ ...x, principal: x.id === tid })) })) })),
    salvarOperadora: async (tid, patch) => setRascunho((r) => ({ ...r, contatos: r.contatos.map((c) => ({ ...c, telefones: c.telefones.map((x) => (x.id === tid ? { ...x, ...patch } : x)) })) })),
  };

  // Grava os contatos do rascunho depois que o negócio é criado
  async function gravarContatosRascunho(nid, contatos) {
    const uteis = (contatos || []).map((c) => ({ ...c, telefones: c.telefones.filter((t) => t.numero.trim()) }))
      .filter((c) => c.nome.trim() || c.cargo.trim() || c.email.trim() || c.telefones.length);
    if (uteis.length && !uteis.some((c) => c.telefones.some((t) => t.principal))) {
      const ci = uteis.findIndex((c) => c.telefones.length);
      if (ci >= 0) uteis[ci].telefones[0] = { ...uteis[ci].telefones[0], principal: true };
    }
    const salvos = [];
    for (const [i, c] of uteis.entries()) {
      const { data, error } = await supabase.from("contatos").insert({ negocio_id: nid, nome: c.nome, cargo: c.cargo, email: c.email, ordem: i }).select().single();
      if (error) { toast("Contato não salvo: " + error.message); continue; }
      let tels = [];
      if (c.telefones.length) {
        const r = await supabase.from("telefones").insert(c.telefones.map((t) => ({
          contato_id: data.id, negocio_id: nid, numero: t.numero, etiqueta: t.etiqueta, principal: t.principal, origem: t.origem || "",
          operadora: t.operadora || "", portado: !!t.portado, operadora_consultada_em: t.operadora_consultada_em || null,
        }))).select();
        if (r.error) toast("Telefones não salvos: " + r.error.message); else tels = r.data;
      }
      salvos.push({ ...data, telefones: tels });
    }
    setContatosMap((m) => ({ ...m, [nid]: salvos }));
    sincronizar(nid, salvos);
  }

  /* ---------- Etapas do quadro ---------- */
  const acoesEtapas = {
    renomear: async (chave, nome) => {
      setEtapas(etapas.map((e) => (e.chave === chave ? { ...e, nome } : e)));
      const { error } = await supabase.from("etapas").update({ nome }).eq("chave", chave);
      if (error) toast("Não foi possível renomear: " + error.message);
    },
    adicionar: async () => {
      const ultima = Math.max(0, ...etapas.filter((e) => e.tipo === "aberta").map((e) => e.ordem));
      const { data, error } = await supabase.from("etapas").insert({ nome: "Nova etapa", ordem: ultima + 1 }).select().single();
      if (error) { toast("Não foi possível criar: " + error.message); return; }
      setEtapas([...etapas, data]);
    },
    mover: async (chave, dir) => {
      const abertas = etapas.filter((e) => e.tipo === "aberta").sort((a, b) => a.ordem - b.ordem);
      const i = abertas.findIndex((e) => e.chave === chave);
      const j = i + dir;
      if (j < 0 || j >= abertas.length) return;
      const nova = [...abertas];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      const reordenadas = nova.map((e, k) => ({ ...e, ordem: k + 1 }));
      setEtapas([...reordenadas, ...etapas.filter((e) => e.tipo !== "aberta")]);
      const mudaram = reordenadas.filter((e) => abertas.find((x) => x.chave === e.chave).ordem !== e.ordem);
      const res = await Promise.all(mudaram.map((e) => supabase.from("etapas").update({ ordem: e.ordem }).eq("chave", e.chave)));
      if (res.some((r) => r.error)) toast("Não foi possível salvar a nova ordem.");
    },
    excluir: async (chave, destino) => {
      const { error } = await supabase.rpc("excluir_etapa", { p_chave: chave, p_destino: destino });
      if (error) { toast(error.message); return false; }
      setEtapas(etapas.filter((e) => e.chave !== chave));
      if (destino) setNegocios((ns) => ns.map((d) => (d.etapa === chave ? { ...d, etapa: destino, etapa_desde: hoje() } : d)));
      setTipos((ts) => ts.map((t) => ({ ...t, etapas: (t.etapas || []).filter((e) => e !== chave) })));
      toast("Etapa excluída");
      return true;
    },
  };

  /* ---------- Filtros e números ---------- */
  function visivel(d) {
    if (filtro === "whatsapp" && d.canal !== "whatsapp") return false;
    if (filtro === "email" && d.canal !== "email") return false;
    if (filtro === "atrasados") { const s = statusAcao(d); if (!s || s.cls !== "late") return false; }
    if (fprod && !d.produtos.includes(fprod)) return false;
    if (fresp && d.user_id !== fresp) return false;
    if (foper) {
      const tels = (contatosMap[d.id] || []).flatMap((c) => c.telefones || []);
      if (foper === "sem" ? tels.some((t) => t.operadora) : !tels.some((t) => t.operadora === foper)) return false;
    }
    if (busca) {
      const cs = contatosMap[d.id] || [];
      const extra = cs.map((c) => `${c.nome} ${c.email} ${(c.telefones || []).map((t) => t.numero + " " + t.numero.replace(/\D/g, "")).join(" ")}`).join(" ");
      const t = (d.nome + " " + d.empresa + " " + d.razao_social + " " + d.telefone + " " + d.email + " " + extra).toLowerCase();
      const b = busca.toLowerCase().trim();
      const bDig = b.replace(/\D/g, "");
      if (!t.includes(b) && !(bDig.length >= 4 && t.includes(bDig))) return false;
    }
    return true;
  }

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && (abertoId || rascunho || cfgAberto || usuariosAberto || backupAberto || lixeiraAberta || empresaAberta || etapasAberto || importar)) fechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abertoId, rascunho, cfgAberto, usuariosAberto, backupAberto, lixeiraAberta, empresaAberta, etapasAberto, importar, fechar]);

  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setMenuAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [menuAberto]);

  // Fecha o menu e o que estiver aberto antes de abrir a opção escolhida
  function abrirMenu(acao) {
    setMenuAberto(false);
    fechar();
    acao();
  }

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
        <div className="hrow">
          <button type="button" className="marca" title="Voltar ao quadro" aria-label={(empresa?.nome || "CRM") + ", voltar ao quadro"}
            onClick={() => { fechar(); setTela("quadro"); }}>
            {empresa?.logo_url ? <img className="logo-empresa" src={empresa.logo_url} alt="" />
              : !empresa || empresa.slug === "gade2b" ? <><img src="/logo-icone.png" alt="" /><img src="/logo-texto.png" alt="" style={{ height: 22 }} /></>
              : <span className="nome-empresa">{empresa.nome}</span>}
            <span className="sep" />
            <span className="mod">CRM</span>
          </button>

          <div className="menu-wrap" ref={menuRef}>
            <button type="button" className={"btn menu-btn" + (menuAberto ? " aberto" : "")} aria-haspopup="menu" aria-expanded={menuAberto}
              aria-label="Menu" title="Menu" onClick={() => setMenuAberto((v) => !v)}>
              <IcMenu />
              {ehSuper && pendentes > 0 && <span className="badge menu-badge">{pendentes}</span>}
            </button>
            {menuAberto && (
              <div className="menu" role="menu">
                <div className="menu-user">
                  <b>{perfil.nome || sessao.user.email}</b>
                  <span className="muted">{sessao.user.email} · {{ super_admin: "Super admin", admin: "Admin", vendedor: "Vendedor" }[perfil.papel]}</span>
                </div>
                <button role="menuitem" className={tela === "quadro" ? "atual" : ""} onClick={() => abrirMenu(() => setTela("quadro"))}>Quadro de vendas</button>
                {ehAdmin && <button role="menuitem" className={tela === "catalogo" ? "atual" : ""} onClick={() => abrirMenu(() => setTela("catalogo"))}>Catálogo de produtos</button>}
                {ehAdmin && <button role="menuitem" className={tela === "financeiro" ? "atual" : ""} onClick={() => abrirMenu(() => setTela("financeiro"))}>Financeiro</button>}
                <button role="menuitem" className={tela === "minhas" ? "atual" : ""} onClick={() => abrirMenu(() => setTela("minhas"))}>Minhas comissões</button>
                <button role="menuitem" onClick={() => abrirMenu(() => setCfgAberto(true))}>{ehAdmin ? "Mensagens" : "Minha assinatura"}</button>
                {ehAdmin && <button role="menuitem" onClick={() => abrirMenu(() => { setTela("quadro"); setEtapasAberto(true); })}>Etapas do quadro</button>}
                <button role="menuitem" onClick={() => abrirMenu(() => { setTela("quadro"); setImportar({ etapa: ABERTAS[0] }); })}>Importar leads</button>
                <button role="menuitem" onClick={() => abrirMenu(() => setLixeiraAberta(true))}>Lixeira</button>
                {(ehAdmin || ehSuper) && <div className="menu-sep" />}
                {ehSuper && (
                  <button role="menuitem" onClick={() => abrirMenu(() => setUsuariosAberto(true))}>
                    Usuários {pendentes > 0 && <span className="badge">{pendentes}</span>}
                  </button>
                )}
                {ehAdmin && <button role="menuitem" onClick={() => abrirMenu(() => setBackupAberto(true))}>Backup e exportação</button>}
                <div className="menu-sep" />
                {ehSuper && empresa && <button role="menuitem" onClick={() => abrirMenu(() => setEmpresaAberta(true))}>Minha empresa</button>}
                {plataforma && <button role="menuitem" className={tela === "plataforma" ? "atual" : ""} onClick={() => abrirMenu(() => setTela("plataforma"))}>Plataforma (empresas clientes)</button>}
                {(ehSuper || plataforma) && <div className="menu-sep" />}
                <button role="menuitem" className="sair" onClick={() => { setMenuAberto(false); salvarTudoAgora(); supabase.auth.signOut(); }}>Sair</button>
              </div>
            )}
          </div>

          {tela === "quadro" && (
            <div className="search">
              <IcSearch />
              <input type="search" placeholder="Buscar nome, empresa ou telefone" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={() => novoNegocio()}><IcPlus />Novo lead</button>
        </div>

        {tela === "quadro" && (
          <div className="hrow">
            <div className="chips" role="group" aria-label="Filtros">
              {[["todos", "Todos"], ["whatsapp", "WhatsApp"], ["email", "E-mail"], ["atrasados", "Ações atrasadas"]].map(([id, t]) => (
                <button key={id} className="chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{t}</button>
              ))}
            </div>
            <div className="spacer" />
            <select className="fsel" aria-label="Filtrar por produto" value={fprod} onChange={(e) => setFprod(e.target.value)}>
              <option value="">Todos os produtos</option>
              {[...fornecedores, { id: null, nome: "Sem fornecedor" }].map((f) => {
                const ps = produtos.filter((p) => (p.fornecedor_id || null) === f.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
                return ps.length ? <optgroup key={f.id || "sem"} label={f.nome}>{ps.map((p) => <option key={p.id} value={p.id}>{p.nome || "Sem nome"}</option>)}</optgroup> : null;
              })}
            </select>
            <select className="fsel" aria-label="Filtrar por operadora" value={foper} onChange={(e) => setFoper(e.target.value)}>
              <option value="">Todas as operadoras</option>
              {OPERADORAS.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="sem">Sem operadora consultada</option>
            </select>
            {ehAdmin && (
              <select className="fsel" aria-label="Filtrar por responsável" value={fresp} onChange={(e) => setFresp(e.target.value)}>
                <option value="">Todos os responsáveis</option>
                {pessoas.filter((p) => p.status === "ativo").map((p) => <option key={p.user_id} value={p.user_id}>{p.nome || p.email}</option>)}
              </select>
            )}
          </div>
        )}
      </header>

      {tela === "catalogo" ? (
        <Catalogo fornecedores={fornecedores} produtos={produtos} tipos={tipos} modelos={modelos} cfg={cfg} voltar={() => setTela("quadro")} />
      ) : tela === "financeiro" ? (
        <Financeiro empresaId={empresa?.id} fornecedores={fornecedores} produtos={produtos} pessoas={pessoas} recarregarPessoas={carregarPessoas} toast={toast} />
      ) : tela === "minhas" ? (
        <MinhasComissoes toast={toast} />
      ) : tela === "plataforma" && plataforma ? (
        <Plataforma minhaEmpresaId={empresa?.id} toast={toast} />
      ) : <>
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

      {!negocios.length && <p className="hint">Comece pelo “Catálogo” para cadastrar fornecedores e produtos, depois clique em “Novo lead”.</p>}

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
                <div className="col-title">
                  <span className="dot" style={{ background: e.cor }} /><span className="col-nome" title={e.nome}>{e.nome}</span><span className="count">{lista.length}</span>
                  <span className="col-acoes">
                    <button type="button" className="col-btn" title={`Novo lead em “${e.nome}”`} aria-label={`Novo lead em ${e.nome}`} onClick={() => novoNegocio(e.id)}>+</button>
                    <button type="button" className="col-btn" title={`Importar leads para “${e.nome}”`} aria-label={`Importar leads para ${e.nome}`} onClick={() => { fechar(); setImportar({ etapa: e.id }); }}>⤒</button>
                  </span>
                </div>
                <div className="col-sum">{brl.format(soma)}</div>
              </div>
              <div className="cards">
                {lista.length ? lista.map((d) => <Card key={d.id} d={d} produtos={produtos} resp={ehAdmin ? nomes[d.user_id] : null} operadora={principalDe(contatosMap[d.id])?.t.operadora} onOpen={() => abrir(d.id)} />)
                  : <div className="empty">{busca || fprod || filtro !== "todos" ? "Nenhum negócio com esse filtro" : "Arraste um card para cá"}</div>}
              </div>
            </section>
          );
        })}
      </main>
      </>}

      <div className={"scrim" + (aberto || rascunho || cfgAberto || usuariosAberto || backupAberto || lixeiraAberta || empresaAberta || etapasAberto || importar ? " open" : "")} onClick={fechar} />

      {rascunho && (
        <Painel
          novo criando={criando}
          d={rascunho} contatos={rascunho.contatos || []} opsContatos={opsRascunho} ctx={ctx} interacoes={[]} iaDisponivel={iaDisponivel} focoNome={focoNome}
          responsaveis={ehAdmin ? pessoas.filter((p) => p.status === "ativo") : null}
          atualizar={atualizarRascunho}
          mover={(etapa) => atualizarRascunho({ etapa, tipo_msg_id: null })}
          toggleProduto={toggleProdutoRascunho}
          setQuantidade={setQuantidadeRascunho}
          registrar={() => {}}
          excluir={fechar}
          concluir={criarRascunho}
          fechar={fechar} toast={toast}
        />
      )}

      {aberto && (
        <Painel
          d={aberto} contatos={contatosMap[aberto.id] || []} opsContatos={opsPara(aberto.id)} ctx={ctx} interacoes={interacoes[aberto.id] || []} iaDisponivel={iaDisponivel} focoNome={focoNome}
          responsaveis={ehAdmin ? pessoas.filter((p) => p.status === "ativo" || p.user_id === aberto.user_id) : null}
          atualizar={(patch) => atualizarNegocio(aberto.id, patch)}
          mover={(etapa) => mover(aberto.id, etapa)}
          toggleProduto={(pid) => toggleProduto(aberto.id, pid)}
          setQuantidade={(pid, q) => setQuantidade(aberto.id, pid, q)}
          registrar={(t, s) => registrar(aberto.id, t, s)}
          excluir={() => excluirNegocio(aberto.id)}
          fechar={fechar} toast={toast}
        />
      )}
      {cfgAberto && <Config tipos={tipos} modelos={modelos} assinatura={assinatura} cfg={cfg} fechar={fechar} podeEditar={ehAdmin} />}
      {lixeiraAberta && (
        <Lixeira ehAdmin={ehAdmin} userId={userId} nomes={nomes} fechar={fechar} toast={toast}
          onRestaurado={(d) => { setNegocios((ns) => [d, ...ns]); setInteracoes((m) => { const c = { ...m }; delete c[d.id]; return c; }); }} />
      )}
      {backupAberto && <Backup empresa={empresa} fechar={fechar} toast={toast} />}
      {importar && (
        <ImportarLeads etapaInicial={importar.etapa} produtos={produtos} pessoas={ehAdmin ? pessoas : []} ehAdmin={ehAdmin} userId={userId}
          negocios={negocios} contatosMap={contatosMap} concluido={carregarDados} fechar={() => setImportar(null)} toast={toast} />
      )}
      {etapasAberto && (
        <EtapasEditor etapas={etapas} fechar={fechar}
          contagem={negocios.reduce((m, d) => { m[d.etapa] = (m[d.etapa] || 0) + 1; return m; }, {})}
          acoes={acoesEtapas} />
      )}
      {empresaAberta && empresa && <MinhaEmpresa empresa={empresa} toast={toast} recarregar={recarregarEmpresa} fechar={fechar} />}
      {usuariosAberto && <Usuarios empresa={empresa} pessoas={pessoas} meId={userId} recarregar={carregarPessoas} fechar={fechar} toast={toast} />}

      <div className={"toast" + (toastTxt ? " show" : "")} role="status" aria-live="polite">{toastTxt}</div>
    </div>
  );
}

function Card({ d, produtos, resp, operadora, onOpen }) {
  const s = statusAcao(d);
  const ps = prodsDe(d, produtos);
  const parado = ABERTAS.includes(d.etapa) ? diff(hoje(), d.etapa_desde) : 0;
  return (
    <div className={"card " + d.canal} draggable tabIndex={0} role="button" aria-label={`${d.nome || "Sem nome"}, ${brl.format(+d.valor || 0)}`}
      onClick={onOpen}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(); } }}
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", d.id); ev.dataTransfer.effectAllowed = "move"; ev.currentTarget.classList.add("dragging"); }}
      onDragEnd={(ev) => ev.currentTarget.classList.remove("dragging")}>
      <div className="c-top"><span className="c-name" title={d.nome}>{d.nome || "Sem nome"}</span><span className="c-val">{brlExato(d.valor)}</span></div>
      {d.empresa && <div className="c-co" title={d.empresa}>{d.empresa}</div>}
      {ps.length > 0 && (
        <div className="c-prod" title={ps.map((p) => p.nome).join(", ")}>
          {ps.slice(0, 2).map((p) => <span key={p.id}>{p.nome}</span>)}
          {ps.length > 2 && <span className="mais">+{ps.length - 2}</span>}
        </div>
      )}
      {d.acao && s && <div className={"c-next " + s.cls}><IcClock /><span><b>{s.txt}:</b> {d.acao}</span></div>}
      {d.etapa === "perdido" && d.motivo_perda && <div className="c-next">{d.motivo_perda}</div>}
      <div className="c-foot">
        <span className="ch-tag">{d.canal === "whatsapp" ? <><IcChat /> WhatsApp</> : <><IcMail /> E-mail</>}</span>
        {operadora && <span className="op-mini" title="Operadora do número principal">{operadora}</span>}
        {resp && <span className="c-resp" title={resp}>{resp}</span>}
        {parado >= 7 && <span className="stale">parado há {parado} dias</span>}
      </div>
    </div>
  );
}

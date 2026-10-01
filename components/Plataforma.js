"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import MarcaEditor from "./MarcaEditor";
import { LinkConvite } from "./MinhaEmpresa";

const dataBr = (s) => new Date(s).toLocaleDateString("pt-BR");
const paraSlug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// Painel do dono da plataforma: empresas clientes, marca, acesso e links
export default function Plataforma({ minhaEmpresaId, toast }) {
  const [empresas, setEmpresas] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("plataforma_empresas");
    if (error) { toast(error.message); setEmpresas([]); return; }
    setEmpresas(data);
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim() || !slug) return;
    setCriando(true);
    const { data, error } = await supabase.rpc("plataforma_criar_empresa", { p_nome: nome.trim(), p_slug: slug });
    setCriando(false);
    if (error) { toast(/duplicate|unique/i.test(error.message) ? "Já existe uma empresa com esse identificador." : error.message); return; }
    setNome(""); setSlug("");
    await carregar();
    setAberta(data);
    toast("Empresa criada. Envie o link de primeiro administrador para o responsável.");
  }

  async function exportar(e, formato) {
    toast("Gerando exportação…");
    const { data } = await supabase.auth.getSession();
    const r = await fetch(`/api/exportar-empresa?empresa=${e.id}&formato=${formato}`, { headers: { Authorization: "Bearer " + (data.session?.access_token || "") } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.erro || "A exportação falhou."); return; }
    const blob = await r.blob();
    const nome = (r.headers.get("Content-Disposition") || "").match(/filename="(.+)"/)?.[1] || `${e.slug}.${formato}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Exportação pronta");
  }

  async function atualizar(id, status, dominio) {
    const { error } = await supabase.rpc("plataforma_atualizar_empresa", { p_empresa: id, p_status: status, p_dominio: dominio });
    if (error) { toast(error.message); return; }
    toast("Empresa atualizada");
    carregar();
  }

  const ativos = (empresas || []).filter((e) => e.status === "ativa").length;
  return (
    <div className="fin">
      <div className="fin-topo"><h2>Plataforma</h2><span className="muted">{empresas ? `${empresas.length} empresa(s) · ${ativos} ativa(s)` : ""}</span></div>

      <form className="plat-nova" onSubmit={criar}>
        <b>Nova empresa</b>
        <input placeholder="Nome da empresa" value={nome} onChange={(e) => { setNome(e.target.value); setSlug(paraSlug(e.target.value)); }} aria-label="Nome da empresa" />
        <input placeholder="identificador" value={slug} onChange={(e) => setSlug(paraSlug(e.target.value))} aria-label="Identificador" title="Usado internamente; só letras minúsculas, números e hífen" />
        <button className="btn primary" disabled={criando || !nome.trim() || slug.length < 2}>{criando ? "Criando…" : "Criar empresa"}</button>
      </form>

      {empresas === null ? <p className="muted">Carregando…</p> : (
        <div className="plat-lista">
          {empresas.map((e) => (
            <div key={e.id} className={"plat-item" + (e.status !== "ativa" ? " bloqueada" : "")}>
              <button className="plat-cab" onClick={() => setAberta(aberta === e.id ? null : e.id)} aria-expanded={aberta === e.id}>
                <span className="plat-logo" style={{ borderColor: e.cor_primaria }}>{e.logo_url ? <img src={e.logo_url} alt="" /> : e.nome.slice(0, 2).toUpperCase()}</span>
                <span className="plat-nome"><b>{e.nome}</b>{e.id === minhaEmpresaId && <span className="tag">sua empresa</span>}<small className="muted">{e.dominio || "sem domínio próprio"} · desde {dataBr(e.criado_em)}</small></span>
                <span className="plat-num"><b>{e.usuarios}</b><small>usuários</small></span>
                <span className="plat-num"><b>{e.pendentes}</b><small>pendentes</small></span>
                <span className="plat-num"><b>{e.negocios}</b><small>negócios</small></span>
                <span className={"tag-sit " + (e.status === "ativa" ? (e.tem_admin ? "liberado" : "aguardando") : "cancelado")}>
                  {e.status !== "ativa" ? "Bloqueada" : e.tem_admin ? "Ativa" : "Aguardando 1º admin"}
                </span>
              </button>
              {aberta === e.id && (
                <div className="plat-corpo">
                  <div className="plat-col">
                    <h4>Link de primeiro administrador</h4>
                    <p className="muted">Mande para o responsável pela empresa. Quem se cadastrar por ele vira super admin, já ativo. Funciona uma única vez.</p>
                    <LinkConvite key={e.codigo_admin} empresa={e} tipo="admin" toast={toast} aoTrocar={carregar} />
                    <h4>Link de convite da equipe</h4>
                    <p className="muted">Cadastros por este link entram como pendentes, para o super admin da empresa aprovar.</p>
                    <LinkConvite key={e.codigo_convite} empresa={e} toast={toast} aoTrocar={carregar} />
                    <h4>Domínio próprio</h4>
                    <p className="muted">Ex.: crm.empresa.com.br. Também precisa ser adicionado no projeto da Vercel, e a empresa precisa criar o CNAME no DNS dela.</p>
                    <Dominio e={e} salvar={(d) => atualizar(e.id, null, d)} />
                    <h4>Exportar dados</h4>
                    <p className="muted">Tudo da empresa: negócios, histórico, catálogo, financeiro e usuários. Use para entregar os dados a um cliente que sair da plataforma.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn small" onClick={() => exportar(e, "xlsx")}>Planilha (.xlsx)</button>
                      <button className="btn small ghost" onClick={() => exportar(e, "json")}>Dados completos (.json)</button>
                    </div>
                    <h4>Acesso</h4>
                    {e.status === "ativa"
                      ? <button className="btn danger" disabled={e.id === minhaEmpresaId} onClick={() => { if (confirm(`Bloquear o acesso de ${e.nome}? Ninguém da empresa conseguirá entrar até você reativar. Os dados ficam guardados.`)) atualizar(e.id, "bloqueada", null); }}>Bloquear empresa</button>
                      : <button className="btn primary" onClick={() => atualizar(e.id, "ativa", null)}>Reativar empresa</button>}
                  </div>
                  <div className="plat-col">
                    <h4>Marca</h4>
                    <MarcaEditor key={e.id + e.logo_url + e.cor_primaria + e.cor_secundaria + e.nome} empresa={e} toast={toast} aoSalvar={carregar} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Dominio({ e, salvar }) {
  const [v, setV] = useState(e.dominio || "");
  return (
    <div className="link-convite">
      <input value={v} placeholder="crm.empresa.com.br" onChange={(x) => setV(x.target.value.trim().toLowerCase())} aria-label="Domínio próprio" />
      <button className="btn small" disabled={v === (e.dominio || "")} onClick={() => salvar(v)}>Salvar</button>
    </div>
  );
}

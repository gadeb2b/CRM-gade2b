"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import MarcaEditor from "./MarcaEditor";
import { IcX } from "./Icon";

export function LinkConvite({ empresa, tipo = "convite", toast, aoTrocar }) {
  const codigo = tipo === "admin" ? empresa.codigo_admin : empresa.codigo_convite;
  const [atual, setAtual] = useState(codigo);
  const url = typeof window !== "undefined" ? `${window.location.origin}/?convite=${atual}` : "";
  async function copiar() {
    try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { toast("Não foi possível copiar. Selecione o link e copie manualmente."); }
  }
  async function novo() {
    if (!confirm("Gerar um novo link? O link atual deixa de funcionar.")) return;
    const { data, error } = await supabase.rpc("novo_link_convite", { p_empresa: empresa.id, p_tipo: tipo });
    if (error) { toast(error.message); return; }
    setAtual(data);
    toast("Novo link gerado");
    aoTrocar && aoTrocar();
  }
  return (
    <div className="link-convite">
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de convite" />
      <button className="btn small primary" onClick={copiar}>Copiar</button>
      <button className="btn small ghost" onClick={novo}>Gerar novo</button>
    </div>
  );
}

export default function MinhaEmpresa({ empresa, toast, recarregar, fechar }) {
  return (
    <aside className="drawer wide open" aria-labelledby="me-title">
      <div className="d-head">
        <h2 id="me-title">Minha empresa</h2>
        <button className="btn ghost" onClick={fechar} aria-label="Fechar"><IcX /></button>
      </div>
      <div className="d-body">
        <h3 style={{ marginTop: 0 }}>Link de convite para a equipe</h3>
        <p className="muted" style={{ marginTop: 0 }}>Mande este link para quem vai usar o sistema. A pessoa se cadastra por ele e aparece em Usuários para você aprovar.</p>
        <LinkConvite empresa={empresa} toast={toast} aoTrocar={recarregar} />

        <h3>Marca</h3>
        <p className="muted" style={{ marginTop: 0 }}>O nome, o logo e as cores aparecem para toda a equipe, inclusive na tela de login quando a pessoa entra pelo link de convite ou pelo domínio da empresa.</p>
        <MarcaEditor key={empresa.id + empresa.logo_url + empresa.cor_primaria + empresa.cor_secundaria + empresa.nome} empresa={empresa} toast={toast} aoSalvar={recarregar} />
      </div>
      <div className="d-foot" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

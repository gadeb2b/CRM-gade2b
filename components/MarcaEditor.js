"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

// Edição de nome, logo e cores de uma empresa (usada em "Minha empresa" e no painel da plataforma)
export default function MarcaEditor({ empresa, toast, aoSalvar }) {
  const [nome, setNome] = useState(empresa.nome || "");
  const [cor1, setCor1] = useState(empresa.cor_primaria || "#1FA56A");
  const [cor2, setCor2] = useState(empresa.cor_secundaria || "#D8AE48");
  const [logo, setLogo] = useState(empresa.logo_url || "");
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function enviarLogo(e) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arq.type)) { toast("Use uma imagem PNG, JPG, WEBP ou SVG."); return; }
    if (arq.size > 1024 * 1024) { toast("A imagem precisa ter até 1 MB."); return; }
    setEnviando(true);
    const ext = arq.name.split(".").pop().toLowerCase().replace(/[^a-z]/g, "") || "png";
    const caminho = `${empresa.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("marcas").upload(caminho, arq, { contentType: arq.type });
    setEnviando(false);
    if (error) { toast("Não foi possível enviar o logo: " + error.message); return; }
    setLogo(supabase.storage.from("marcas").getPublicUrl(caminho).data.publicUrl);
  }

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("atualizar_marca", { p_empresa: empresa.id, p_nome: nome, p_logo_url: logo, p_cor1: cor1, p_cor2: cor2 });
    setSalvando(false);
    if (error) { toast(error.message); return; }
    toast("Marca atualizada");
    aoSalvar && aoSalvar();
  }

  const hex = (v) => /^#[0-9A-Fa-f]{6}$/.test(v);
  const mudou = nome !== (empresa.nome || "") || cor1 !== empresa.cor_primaria || cor2 !== empresa.cor_secundaria || logo !== (empresa.logo_url || "");

  return (
    <div className="marca-editor">
      <div className="grid">
        <div className="field full"><label>Nome da empresa</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div className="field">
          <label>Cor principal (botões, destaques)</label>
          <div className="cor-campo"><input type="color" value={hex(cor1) ? cor1 : "#1FA56A"} onChange={(e) => setCor1(e.target.value)} /><input value={cor1} onChange={(e) => setCor1(e.target.value)} maxLength={7} /></div>
        </div>
        <div className="field">
          <label>Cor de apoio (valores, abas)</label>
          <div className="cor-campo"><input type="color" value={hex(cor2) ? cor2 : "#D8AE48"} onChange={(e) => setCor2(e.target.value)} /><input value={cor2} onChange={(e) => setCor2(e.target.value)} maxLength={7} /></div>
        </div>
        <div className="field full">
          <label>Logo (PNG com fundo transparente fica melhor no tema escuro; até 1 MB)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="logo-previa">{logo ? <img src={logo} alt="Logo" /> : <span className="muted">Sem logo</span>}</div>
            <label className="btn small">{enviando ? "Enviando…" : "Enviar imagem"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={enviarLogo} /></label>
            {logo && <button className="btn small ghost" onClick={() => setLogo("")}>Remover logo</button>}
          </div>
        </div>
      </div>
      <div className="marca-previa" style={{ "--p": hex(cor1) ? cor1 : "#1FA56A", "--s": hex(cor2) ? cor2 : "#D8AE48" }}>
        <span className="muted">Prévia:</span>
        <span className="pv-botao">+ Novo lead</span>
        <span className="pv-valor">R$ 1.299,90</span>
        <span className="pv-aba">Aba ativa</span>
      </div>
      <button className="btn primary" disabled={!mudou || salvando || !hex(cor1) || !hex(cor2)} onClick={salvar}>{salvando ? "Salvando…" : "Salvar marca"}</button>
    </div>
  );
}

"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

// Imagem opcional de uma mensagem (banner, tabela de planos, foto do produto)
export default function ImagemMensagem({ url, onChange, empresaId, toast }) {
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!/^image\/(png|jpeg|webp)$/.test(arq.type)) { toast("Use uma imagem PNG, JPG ou WEBP."); return; }
    if (arq.size > 5 * 1024 * 1024) { toast("A imagem precisa ter até 5 MB."); return; }
    if (!empresaId) { toast("Empresa não identificada."); return; }
    setEnviando(true);
    const ext = arq.type === "image/png" ? "png" : arq.type === "image/webp" ? "webp" : "jpg";
    const caminho = `${empresaId}/msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from("midias").upload(caminho, arq, { contentType: arq.type });
    setEnviando(false);
    if (error) { toast("Não foi possível enviar a imagem: " + error.message); return; }
    onChange(supabase.storage.from("midias").getPublicUrl(caminho).data.publicUrl);
  }

  return (
    <div className="img-msg">
      <div className="img-msg-previa">{url ? <img src={url} alt="Imagem da mensagem" /> : <span className="muted">Sem imagem</span>}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label className="btn small">{enviando ? "Enviando…" : url ? "Trocar imagem" : "Adicionar imagem"}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={enviar} />
        </label>
        {url && <button type="button" className="btn small ghost" onClick={() => onChange("")}>Remover imagem</button>}
        <span className="muted" style={{ fontSize: 12 }}>PNG, JPG ou WEBP, até 5 MB</span>
      </div>
    </div>
  );
}

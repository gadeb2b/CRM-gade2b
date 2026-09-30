"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

// Aparece quando a pessoa abre o link de "Esqueci minha senha" recebido por e-mail.
export default function NovaSenha({ concluir }) {
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== senha2) return setErro("As senhas não são iguais.");
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) setErro("Não foi possível salvar a nova senha. Peça um novo link e tente de novo.");
    else concluir();
  }

  return (
    <div className="login">
      <form onSubmit={salvar}>
        <h1>Nova senha</h1>
        <p className="muted" style={{ margin: 0 }}>Escolha uma nova senha para entrar no CRM.</p>
        <div className="field">
          <label htmlFor="ns1">Nova senha</label>
          <input id="ns1" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="ns2">Repita a nova senha</label>
          <input id="ns2" type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required />
        </div>
        {erro && <p className="err">{erro}</p>}
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Salvando…" : "Salvar nova senha"}</button>
      </form>
    </div>
  );
}

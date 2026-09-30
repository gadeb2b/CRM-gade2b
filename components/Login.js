"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

function traduzir(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Seu e-mail ainda não foi confirmado.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esse e-mail já tem cadastro. Use a opção Entrar.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Novos cadastros estão desativados no momento.";
  if (m.includes("password")) return "A senha não atende aos requisitos. Use pelo menos 8 caracteres.";
  if (m.includes("rate limit")) return "Muitas tentativas seguidas. Espere alguns minutos.";
  return "Não foi possível concluir. Tente de novo.";
}

export default function Login() {
  const [modo, setModo] = useState("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);

  function trocar(m) { setModo(m); setErro(""); setOk(""); }

  async function enviar(e) {
    e.preventDefault();
    setErro(""); setOk("");
    if (modo === "solicitar") {
      if (!nome.trim()) return setErro("Informe seu nome.");
      if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
      if (senha !== senha2) return setErro("As senhas não são iguais.");
    }
    setEnviando(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) setErro(traduzir(error.message));
    } else if (modo === "recuperar") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) setErro(traduzir(error.message));
      else setOk("Se esse e-mail tiver cadastro, você vai receber um link para criar uma nova senha. Confira também a caixa de spam.");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password: senha,
        options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin },
      });
      if (error) setErro(traduzir(error.message));
      else if (!data.session) setOk("Cadastro recebido. Se chegar um e-mail de confirmação, clique no link. Depois é só aguardar a aprovação do administrador.");
    }
    setEnviando(false);
  }

  return (
    <div className="login">
      <form onSubmit={enviar}>
        <h1>CRM Gade2B</h1>
        {modo === "recuperar" ? <p className="muted" style={{ margin: 0 }}>Informe seu e-mail para receber um link de nova senha.</p> : (
        <div className="tabs" role="tablist" style={{ padding: 0 }}>
          <button type="button" className="tab" role="tab" aria-selected={modo === "entrar"} onClick={() => trocar("entrar")}>Entrar</button>
          <button type="button" className="tab" role="tab" aria-selected={modo === "solicitar"} onClick={() => trocar("solicitar")}>Solicitar acesso</button>
        </div>
        )}
        {modo === "solicitar" && (
          <div className="field">
            <label htmlFor="nome">Seu nome</label>
            <input id="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {modo !== "recuperar" && (
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
        )}
        {modo === "solicitar" && (
          <div className="field">
            <label htmlFor="senha2">Repita a senha</label>
            <input id="senha2" type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required />
          </div>
        )}
        {erro && <p className="err">{erro}</p>}
        {ok && <p className="okmsg">{ok}</p>}
        <button className="btn primary" type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : modo === "entrar" ? "Entrar" : modo === "recuperar" ? "Enviar link" : "Solicitar acesso"}
        </button>
        {modo === "entrar" && <button type="button" className="btn ghost small" onClick={() => trocar("recuperar")}>Esqueci minha senha</button>}
        {modo === "recuperar" && <button type="button" className="btn ghost small" onClick={() => trocar("entrar")}>Voltar para o login</button>}
        {modo === "solicitar" && <p className="muted" style={{ margin: 0 }}>Seu acesso só é liberado depois que o administrador aprovar a solicitação.</p>}
      </form>
    </div>
  );
}

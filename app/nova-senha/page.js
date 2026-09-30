"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import NovaSenha from "../../components/NovaSenha";

// Página aberta pelo link do e-mail "Esqueci minha senha".
// O Supabase coloca os dados de acesso no endereço; esperamos a sessão ser criada e mostramos o formulário.
export default function PaginaNovaSenha() {
  const [estado, setEstado] = useState("carregando"); // carregando | pronto | invalido | concluido

  useEffect(() => {
    if (!supabase) { setEstado("invalido"); return; }
    const url = window.location.hash + window.location.search;
    if (/error_code=|error=/.test(url)) { setEstado("invalido"); return; }

    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (s) setEstado((e) => (e === "carregando" ? "pronto" : e));
    });
    supabase.auth.getSession().then(({ data: d }) => {
      if (d.session) setEstado("pronto");
      else setTimeout(() => setEstado((e) => (e === "carregando" ? "invalido" : e)), 4000);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (estado === "pronto") return <NovaSenha concluir={() => setEstado("concluido")} />;

  const textos = {
    carregando: ["Validando o link…", "Só um instante."],
    invalido: ["Link expirado ou inválido", "Esse link já foi usado ou passou do prazo. Peça um novo na tela de login, em “Esqueci minha senha”, e use o link mais recente que chegar."],
    concluido: ["Senha alterada", "Sua nova senha já está valendo."],
  }[estado];

  return (
    <div className="login">
      <div className="aviso-box">
        <img className="logo-login" src="/logo-gade2b.png" alt="Gade2B" style={{ width: 120 }} />
        <h1>{textos[0]}</h1>
        <p>{textos[1]}</p>
        {estado !== "carregando" && (
          <button className="btn primary" onClick={() => { window.location.href = "/"; }}>
            {estado === "concluido" ? "Entrar no CRM" : "Voltar para o login"}
          </button>
        )}
      </div>
    </div>
  );
}

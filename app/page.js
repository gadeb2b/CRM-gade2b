"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Login from "../components/Login";
import Crm from "../components/Crm";
import NovaSenha from "../components/NovaSenha";

export default function Home() {
  const [sessao, setSessao] = useState(undefined);
  const [perfil, setPerfil] = useState(undefined);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = sessao?.user?.id;
  const carregarPerfil = useCallback(async () => {
    if (!uid) { setPerfil(undefined); return; }
    const { data, error } = await supabase.from("perfis").select("*").eq("user_id", uid).maybeSingle();
    setPerfil(error ? { erro: error.message } : data || null);
  }, [uid]);

  useEffect(() => { carregarPerfil(); }, [carregarPerfil]);

  if (!supabase) return <div className="carregando">Variáveis do Supabase não configuradas na Vercel.</div>;
  if (sessao === undefined) return <div className="carregando">Carregando…</div>;
  if (!sessao) return <Login />;
  if (recuperando) return <NovaSenha concluir={() => setRecuperando(false)} />;
  if (perfil === undefined) return <div className="carregando">Carregando…</div>;

  const sair = () => supabase.auth.signOut();
  if (!perfil || perfil.erro || perfil.status !== "ativo") {
    let titulo = "Solicitação enviada";
    let texto = "Seu cadastro foi recebido e está aguardando aprovação do administrador. Assim que for aprovado, você consegue entrar normalmente.";
    if (perfil?.status === "bloqueado") {
      titulo = "Acesso bloqueado";
      texto = "Seu acesso a este CRM foi bloqueado. Fale com o administrador se achar que é um engano.";
    } else if (!perfil || perfil.erro) {
      titulo = "Perfil não encontrado";
      texto = "Não foi possível carregar seu perfil de acesso." + (perfil?.erro ? " Detalhe: " + perfil.erro : "");
    }
    return (
      <div className="login">
        <div className="aviso-box">
          <h1>{titulo}</h1>
          <p>{texto}</p>
          <p className="muted">Conta: {sessao.user.email}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={carregarPerfil}>Verificar de novo</button>
            <button className="btn" onClick={sair}>Sair</button>
          </div>
        </div>
      </div>
    );
  }
  return <Crm sessao={sessao} perfil={perfil} />;
}

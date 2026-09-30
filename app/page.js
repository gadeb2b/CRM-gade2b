"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Login from "../components/Login";
import Crm from "../components/Crm";

export default function Home() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return <div className="carregando">Variáveis do Supabase não configuradas na Vercel.</div>;
  }
  if (sessao === undefined) return <div className="carregando">Carregando…</div>;
  if (!sessao) return <Login />;
  return <Crm sessao={sessao} />;
}

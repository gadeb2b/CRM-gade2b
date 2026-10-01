"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { aplicarMarca } from "../lib/marca";
import Login from "../components/Login";
import Crm from "../components/Crm";
import NovaSenha from "../components/NovaSenha";

export default function Home() {
  const [sessao, setSessao] = useState(undefined);
  const [perfil, setPerfil] = useState(undefined);
  const [empresa, setEmpresa] = useState(null);
  const [plataforma, setPlataforma] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [convite, setConvite] = useState("");
  const [marcaPublica, setMarcaPublica] = useState(undefined);

  useEffect(() => {
    if (!supabase) return;
    const params = new URLSearchParams(window.location.search);
    const c = (params.get("convite") || "").trim();
    setConvite(c);
    // Logo e cores na tela de login: pelo link de convite ou pelo domínio da empresa
    supabase.rpc("empresa_publica", { p_dominio: window.location.hostname, p_convite: c }).then(({ data }) => {
      const m = Array.isArray(data) ? data[0] : null;
      setMarcaPublica(m || null);
      aplicarMarca(m);
    });
    if (/type=recovery/.test(window.location.hash + window.location.search)) setRecuperando(true);
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
    if (error) { setPerfil({ erro: error.message }); return; }
    setPerfil(data || null);
    if (data?.empresa_id) {
      const { data: e } = await supabase.from("empresas").select("*").eq("id", data.empresa_id).maybeSingle();
      setEmpresa(e || null);
      aplicarMarca(e);
    }
    const { data: pl } = await supabase.rpc("sou_plataforma");
    setPlataforma(!!pl);
  }, [uid]);

  useEffect(() => { carregarPerfil(); }, [carregarPerfil]);

  if (!supabase) return <div className="carregando">Variáveis do Supabase não configuradas na Vercel.</div>;
  if (sessao === undefined || marcaPublica === undefined) return <div className="carregando">Carregando…</div>;
  if (!sessao) return <Login marca={marcaPublica} convite={convite} />;
  if (recuperando) return <NovaSenha concluir={() => setRecuperando(false)} />;
  if (perfil === undefined) return <div className="carregando">Carregando…</div>;

  const sair = () => supabase.auth.signOut();
  const bloqueadaEmpresa = empresa && empresa.status !== "ativa";
  if (!perfil || perfil.erro || perfil.status !== "ativo" || !perfil.empresa_id || bloqueadaEmpresa) {
    let titulo = "Solicitação enviada";
    let texto = "Seu cadastro foi recebido e está aguardando aprovação do administrador. Assim que for aprovado, você consegue entrar normalmente.";
    if (perfil && !perfil.erro && !perfil.empresa_id) {
      titulo = "Conta sem empresa";
      texto = "Sua conta não está ligada a nenhuma empresa. Peça ao administrador da sua empresa o link de convite e faça o cadastro por ele.";
    } else if (bloqueadaEmpresa) {
      titulo = "Acesso suspenso";
      texto = "O acesso desta empresa à plataforma está suspenso. Fale com o responsável pela sua empresa.";
    } else if (perfil?.status === "bloqueado") {
      titulo = "Acesso bloqueado";
      texto = "Seu acesso foi bloqueado. Fale com o administrador se achar que é um engano.";
    } else if (!perfil || perfil.erro) {
      titulo = "Perfil não encontrado";
      texto = "Não foi possível carregar seu perfil de acesso." + (perfil?.erro ? " Detalhe: " + perfil.erro : "");
    }
    const logo = empresa?.logo_url || marcaPublica?.logo_url;
    return (
      <div className="login">
        <div className="aviso-box">
          {logo ? <img className="logo-login custom" src={logo} alt="" /> : <img className="logo-login" src="/logo-gade2b.png" alt="" style={{ width: 120 }} />}
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
  return <Crm sessao={sessao} perfil={perfil} empresa={empresa} plataforma={plataforma} recarregarEmpresa={carregarPerfil} />;
}

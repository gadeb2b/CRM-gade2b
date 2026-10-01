"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtData } from "../lib/util";
import { IcX } from "./Icon";

const PAPEIS = [["vendedor", "Vendedor"], ["admin", "Admin"], ["super_admin", "Super admin"]];
const nomePapel = (p) => PAPEIS.find((x) => x[0] === p)?.[1] || p;

export default function Usuarios({ pessoas, meId, recarregar, fechar, toast }) {
  const [papelNovo, setPapelNovo] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const fecharRef = useRef(null);
  useEffect(() => { fecharRef.current?.focus(); recarregar(); }, [recarregar]);

  async function decidir(p, status, papel, msg) {
    setOcupado(p.user_id);
    const { error } = await supabase.rpc("decidir_usuario", { alvo: p.user_id, novo_status: status, novo_papel: papel });
    setOcupado(null);
    if (error) { toast(error.message); return; }
    toast(msg);
    recarregar();
  }

  const pendentes = pessoas.filter((p) => p.status === "pendente");
  const ativos = pessoas.filter((p) => p.status === "ativo");
  const bloqueados = pessoas.filter((p) => p.status === "bloqueado");
  const quem = (p) => (
    <div className="who"><b>{p.nome || "Sem nome"}{p.user_id === meId ? " (você)" : ""}</b><span className="muted">{p.email} · desde {fmtData(p.criado_em)}</span></div>
  );

  return (
    <aside className="drawer wide open" aria-labelledby="u-title">
      <div className="d-head">
        <h2 id="u-title">Usuários</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar usuários"><IcX /></button>
      </div>
      <div className="d-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Vendedor vê e edita só os próprios negócios. Admin vê todos os negócios e cadastra produtos e mensagens. Super admin também aprova e gerencia usuários.
        </p>

        <h3 style={{ marginTop: 8 }}>Aguardando aprovação {pendentes.length > 0 && <span className="badge">{pendentes.length}</span>}</h3>
        {pendentes.length ? pendentes.map((p) => (
          <div className="urow" key={p.user_id}>
            {quem(p)}
            <select aria-label="Papel" value={papelNovo[p.user_id] || "vendedor"} onChange={(e) => setPapelNovo((m) => ({ ...m, [p.user_id]: e.target.value }))}>
              {PAPEIS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <button className="btn small primary" disabled={ocupado === p.user_id} onClick={() => decidir(p, "ativo", papelNovo[p.user_id] || "vendedor", `${p.nome || p.email} aprovado`)}>Aprovar</button>
            <button className="btn small danger" disabled={ocupado === p.user_id} onClick={() => decidir(p, "bloqueado", "vendedor", "Solicitação recusada")}>Recusar</button>
          </div>
        )) : <p className="muted">Nenhuma solicitação pendente.</p>}

        <h3>Ativos</h3>
        <p className="muted" style={{ marginTop: -4 }}>As comissões de cada pessoa ficam em Financeiro → Comissão por vendedor.</p>
        {ativos.map((p) => (
          <div className="urow" key={p.user_id}>
            {quem(p)}
            {p.user_id === meId ? <span className="tag">{nomePapel(p.papel)}</span> : (
              <>
                <select aria-label="Papel" value={p.papel} disabled={ocupado === p.user_id} onChange={(e) => decidir(p, "ativo", e.target.value, "Papel atualizado")}>
                  {PAPEIS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
                <button className="btn small danger" disabled={ocupado === p.user_id}
                  onClick={() => { if (confirm(`Bloquear o acesso de ${p.nome || p.email}? Os negócios dele continuam salvos.`)) decidir(p, "bloqueado", p.papel, "Acesso bloqueado"); }}>Bloquear</button>
              </>
            )}
          </div>
        ))}

        {bloqueados.length > 0 && (
          <>
            <h3>Bloqueados e recusados</h3>
            {bloqueados.map((p) => (
              <div className="urow" key={p.user_id}>
                {quem(p)}
                <button className="btn small" disabled={ocupado === p.user_id} onClick={() => decidir(p, "ativo", p.papel === "super_admin" ? "admin" : p.papel, "Acesso reativado")}>Reativar</button>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="d-foot" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

function Comissao({ p, toast, recarregar }) {
  const [tipo, setTipo] = useState(p.comissao_tipo || "percentual");
  const [valor, setValor] = useState(String(p.comissao_valor ?? 0));
  const [salvando, setSalvando] = useState(false);
  const mudou = tipo !== (p.comissao_tipo || "percentual") || Number(valor) !== Number(p.comissao_valor ?? 0);

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("definir_comissao_usuario", { alvo: p.user_id, tipo, valor: Number(valor) || 0 });
    setSalvando(false);
    if (error) { toast(error.message); return; }
    toast("Comissão atualizada");
    recarregar();
  }

  return (
    <div className="com-user" title="Comissão do vendedor">
      <span className="muted">Comissão</span>
      <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor da comissão" />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de comissão">
        <option value="percentual">% do recebido</option>
        <option value="fixo">R$ por produto</option>
      </select>
      {mudou && <button className="btn small primary" disabled={salvando} onClick={salvar}>{salvando ? "…" : "Salvar"}</button>}
    </div>
  );
}

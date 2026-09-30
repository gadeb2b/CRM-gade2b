"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { nomeEtapa } from "../lib/constantes";
import { brlExato } from "../lib/util";
import { IcX, IcSearch } from "./Icon";

const quando = (s) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(".", "");

export default function Lixeira({ ehAdmin, userId, nomes, onRestaurado, fechar, toast }) {
  const [itens, setItens] = useState(null);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const fecharRef = useRef(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("negocios").select("*")
      .not("excluido_em", "is", null).order("excluido_em", { ascending: false });
    if (error) { toast("Não foi possível abrir a lixeira: " + error.message); setItens([]); return; }
    setItens(data);
  }, [toast]);

  useEffect(() => { fecharRef.current?.focus(); carregar(); }, [carregar]);

  async function restaurar(d) {
    setOcupado(d.id);
    const { data, error } = await supabase.from("negocios").update({ excluido_em: null, excluido_por: null }).eq("id", d.id).select().single();
    if (error) { setOcupado(null); toast("Não foi possível restaurar: " + error.message); return; }
    const { data: np } = await supabase.from("negocio_produtos").select("produto_id").eq("negocio_id", d.id);
    await supabase.from("interacoes").insert({ negocio_id: d.id, texto: "Restaurado da lixeira", sistema: true });
    setItens((l) => l.filter((x) => x.id !== d.id));
    setOcupado(null);
    onRestaurado({ ...data, valor: Number(data.valor) || 0, produtos: (np || []).map((r) => r.produto_id) });
    toast(`${d.nome || d.empresa || "Negócio"} restaurado para ${nomeEtapa(d.etapa)}`);
  }

  async function apagar(ids, texto) {
    if (!confirm(texto)) return;
    setOcupado("varios");
    const { error } = await supabase.from("negocios").delete().in("id", ids);
    setOcupado(null);
    if (error) { toast("Não foi possível apagar: " + error.message); return; }
    setItens((l) => l.filter((x) => !ids.includes(x.id)));
    toast(ids.length > 1 ? "Lixeira esvaziada" : "Negócio apagado definitivamente");
  }

  const lista = (itens || []).filter((d) => !busca || (d.nome + " " + d.empresa + " " + d.telefone + " " + d.email).toLowerCase().includes(busca.toLowerCase()));
  const quem = (id) => (id === userId ? "você" : nomes[id] || "outro usuário");

  return (
    <aside className="drawer wide open" aria-labelledby="lx-title">
      <div className="d-head">
        <h2 id="lx-title">Lixeira</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar lixeira"><IcX /></button>
      </div>
      <div className="d-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Negócios excluídos ficam aqui com todo o histórico e os produtos. Ao restaurar, o negócio volta para a mesma etapa em que estava.
          {ehAdmin ? " Só admins podem apagar definitivamente." : " Só um admin pode apagar definitivamente."}
        </p>
        {itens && itens.length > 0 && (
          <div className="search" style={{ maxWidth: "none", marginBottom: 12 }}>
            <IcSearch />
            <input type="search" placeholder="Buscar na lixeira" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar na lixeira" />
          </div>
        )}
        {itens === null ? <p className="muted">Carregando…</p>
          : !itens.length ? <p className="muted">A lixeira está vazia.</p>
          : !lista.length ? <p className="muted">Nada encontrado com essa busca.</p>
          : lista.map((d) => (
            <div className="urow" key={d.id}>
              <div className="who">
                <b>{d.nome || "Sem nome"}{d.empresa ? ` · ${d.empresa}` : ""}</b>
                <span className="muted">
                  {brlExato(d.valor)} · estava em {nomeEtapa(d.etapa)}{ehAdmin && nomes[d.user_id] ? ` · responsável: ${nomes[d.user_id]}` : ""}
                  <br />Excluído em {quando(d.excluido_em)} por {quem(d.excluido_por)}
                </span>
              </div>
              <button className="btn small primary" disabled={!!ocupado} onClick={() => restaurar(d)}>{ocupado === d.id ? "Restaurando…" : "Restaurar"}</button>
              {ehAdmin && (
                <button className="btn small danger" disabled={!!ocupado}
                  onClick={() => apagar([d.id], `Apagar definitivamente o negócio de ${d.nome || d.empresa || "este lead"}? O histórico dele também será apagado e isso não pode ser desfeito.`)}>
                  Apagar de vez
                </button>
              )}
            </div>
          ))}
      </div>
      <div className="d-foot">
        {ehAdmin && itens && itens.length > 0
          ? <button className="btn danger" disabled={!!ocupado} onClick={() => apagar(itens.map((x) => x.id), `Esvaziar a lixeira? Os ${itens.length} negócio(s) e seus históricos serão apagados definitivamente.`)}>Esvaziar lixeira</button>
          : <span />}
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

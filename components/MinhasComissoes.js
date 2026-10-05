"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");
const ROTULO = { aguardando: "Aguardando o fornecedor pagar", liberado: "Liberada, aguardando repasse", pago: "Paga", cancelado: "Cancelada/estornada" };

// Tela do vendedor: só o que ele tem a receber, sem os valores da empresa
export default function MinhasComissoes({ toast }) {
  const [linhas, setLinhas] = useState(null);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    supabase.rpc("minhas_comissoes").then(({ data, error }) => {
      if (error) toast("Não foi possível carregar: " + error.message);
      setLinhas(data || []);
    });
  }, [toast]);

  if (linhas === null) return <div className="fin"><p className="muted" style={{ padding: 20 }}>Carregando…</p></div>;
  const soma = (s) => linhas.filter((r) => r.situacao === s).reduce((t, r) => t + (Number(s === "pago" ? r.repasse_valor_pago ?? r.repasse_valor : r.repasse_valor) || 0), 0);
  const lista = linhas.filter((r) => filtro === "todos" || r.situacao === filtro);

  return (
    <div className="fin">
      <div className="fin-topo"><h2>Minhas comissões</h2></div>
      <div className="fin-cards">
        <div className="fin-card"><span>Aguardando o fornecedor</span><b>{reais(soma("aguardando"))}</b></div>
        <div className="fin-card ok"><span>Liberadas para receber</span><b>{reais(soma("liberado"))}</b></div>
        <div className="fin-card"><span>Já recebidas</span><b>{reais(soma("pago"))}</b></div>
      </div>
      <p className="muted" style={{ margin: "0 0 10px" }}>As comissões aparecem aqui depois que a venda é concluída (instalação ou ativação). Elas são liberadas quando a empresa recebe do fornecedor.</p>
      <div className="fin-filtros">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Situação">
          <option value="todos">Todas</option>
          <option value="aguardando">Aguardando o fornecedor</option>
          <option value="liberado">Liberadas</option>
          <option value="pago">Pagas</option>
          <option value="cancelado">Canceladas/estornadas</option>
        </select>
      </div>
      <div className="planilha-wrap">
        <table className="planilha leitura">
          <thead><tr><th>Venda</th><th>Cliente</th><th>Produto</th><th>Parcela</th><th>Comissão</th><th>Situação</th><th>Paga em</th></tr></thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{dataBr(r.data_venda)}</td>
                <td>{r.negocio_nome}</td>
                <td>{r.produto_nome}{r.quantidade > 1 ? ` (${r.quantidade}×)` : ""}</td>
                <td className="num">{r.parcela}/{r.parcelas}</td>
                <td className="num destaque">{reais(r.situacao === "pago" ? r.repasse_valor_pago ?? r.repasse_valor : r.repasse_valor)}</td>
                <td><span className={"tag-sit " + r.situacao}>{ROTULO[r.situacao]}</span></td>
                <td>{dataBr(r.repasse_pago_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length && <p className="muted" style={{ padding: 20 }}>Nenhuma comissão por aqui ainda. Elas aparecem quando um negócio seu vai para “Ganho”.</p>}
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { coletarDados, montarPlanilha, nomeBackup } from "../lib/backup";
import { IcX } from "./Icon";

const tamanho = (b) => (!b ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1) + " MB");
const quando = (s) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(".", "");

export default function Backup({ fechar, toast }) {
  const [arquivos, setArquivos] = useState(null);
  const [erroLista, setErroLista] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [fazendo, setFazendo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const fecharRef = useRef(null);

  const listar = useCallback(async () => {
    const { data, error } = await supabase.storage.from("backups").list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
    if (error) { setErroLista(error.message); setArquivos([]); return; }
    setErroLista("");
    // Agrupa .xlsx e .json do mesmo backup
    const grupos = {};
    (data || []).filter((f) => f.name && !f.name.startsWith(".")).forEach((f) => {
      const base = f.name.replace(/\.(xlsx|json)$/, "");
      const g = (grupos[base] ||= { base, criado: f.created_at, arquivos: {} });
      g.arquivos[f.name.endsWith(".json") ? "json" : "xlsx"] = f;
    });
    setArquivos(Object.values(grupos).sort((a, b) => (a.base < b.base ? 1 : -1)));
  }, []);

  useEffect(() => { fecharRef.current?.focus(); listar(); }, [listar]);

  async function baixarAgora() {
    setBaixando(true);
    try {
      const dados = await coletarDados(supabase);
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      await writeExcelFile(montarPlanilha(dados)).toFile(nomeBackup() + ".xlsx");
    } catch (e) {
      toast("Não foi possível gerar a planilha: " + e.message);
    }
    setBaixando(false);
  }

  async function fazerBackup() {
    setFazendo(true);
    setAviso(null);
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/backup", { headers: { Authorization: "Bearer " + (data.session?.access_token || "") } });
    const j = await r.json().catch(() => ({}));
    setFazendo(false);
    if (!r.ok) { setAviso({ cls: "err", t: j.erro || "O backup falhou." }); return; }
    setAviso({ cls: "", t: `Backup salvo: ${j.linhas?.negocios ?? 0} negócios e ${j.linhas?.interacoes ?? 0} registros de histórico.` });
    listar();
  }

  async function baixar(f) {
    const { data, error } = await supabase.storage.from("backups").createSignedUrl(f.name, 60, { download: f.name });
    if (error) { toast("Não foi possível baixar: " + error.message); return; }
    window.location.href = data.signedUrl;
  }

  return (
    <aside className="drawer wide open" aria-labelledby="b-title">
      <div className="d-head">
        <h2 id="b-title">Backup e exportação</h2>
        <button className="btn ghost" ref={fecharRef} onClick={fechar} aria-label="Fechar backup"><IcX /></button>
      </div>
      <div className="d-body">
        <h3 style={{ marginTop: 0 }}>Exportar agora</h3>
        <p className="muted" style={{ marginTop: 0 }}>Baixa uma planilha do Excel com negócios, histórico, produtos, tipos de mensagem e usuários.</p>
        <button className="btn primary" onClick={baixarAgora} disabled={baixando}>{baixando ? "Gerando planilha…" : "Baixar planilha (.xlsx)"}</button>

        <h3>Backups automáticos</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Todo dia de madrugada o sistema salva uma cópia completa (planilha e arquivo técnico .json) e guarda os últimos 30 dias.
        </p>
        <button className="btn" onClick={fazerBackup} disabled={fazendo}>{fazendo ? "Fazendo backup…" : "Fazer backup agora"}</button>
        {aviso && <p className={"status" + (aviso.cls ? " " + aviso.cls : "")}>{aviso.t}</p>}

        <div style={{ marginTop: 14 }}>
          {arquivos === null ? <p className="muted">Carregando…</p>
            : erroLista ? <p className="status err">Não foi possível listar os backups: {erroLista}</p>
            : !arquivos.length ? <p className="muted">Nenhum backup salvo ainda.</p>
            : arquivos.map((g) => (
              <div className="urow" key={g.base}>
                <div className="who"><b>{g.criado ? quando(g.criado) : g.base}</b><span className="muted">{g.base}</span></div>
                {g.arquivos.xlsx && <button className="btn small" onClick={() => baixar(g.arquivos.xlsx)}>Planilha · {tamanho(g.arquivos.xlsx.metadata?.size)}</button>}
                {g.arquivos.json && <button className="btn small ghost" onClick={() => baixar(g.arquivos.json)}>JSON · {tamanho(g.arquivos.json.metadata?.size)}</button>}
              </div>
            ))}
        </div>
      </div>
      <div className="d-foot" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={fechar}>Concluir</button>
      </div>
    </aside>
  );
}

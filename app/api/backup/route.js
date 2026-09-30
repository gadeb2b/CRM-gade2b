import { createClient } from "@supabase/supabase-js";
import writeExcelFile from "write-excel-file/node";
import { coletarDados, montarPlanilha, nomeBackup } from "../../../lib/backup";

// Backup completo do CRM, salvo no Storage do Supabase (bucket "backups").
// Roda sozinho todo dia pelo agendamento em vercel.json, e também pode ser
// disparado por um admin pelo botão "Fazer backup agora".
// Precisa das variáveis SUPABASE_SECRET_KEY e CRON_SECRET na Vercel (ambas Secret).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAS_GUARDADOS = 30;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function autorizado(req, admin) {
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return false;
  const { data: perfil } = await admin.from("perfis").select("papel,status").eq("user_id", data.user.id).maybeSingle();
  return perfil?.status === "ativo" && ["admin", "super_admin"].includes(perfil.papel);
}

export async function GET(req) {
  const segredo = process.env.SUPABASE_SECRET_KEY;
  if (!segredo) return Response.json({ erro: "Backup automático não configurado: falta SUPABASE_SECRET_KEY na Vercel." }, { status: 503 });
  const admin = createClient(url, segredo, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!(await autorizado(req, admin))) return Response.json({ erro: "Não autorizado." }, { status: 401 });

  try {
    const dados = await coletarDados(admin);
    const nome = nomeBackup();
    const xlsx = await writeExcelFile(montarPlanilha(dados)).toBuffer();
    const json = Buffer.from(JSON.stringify({ gerado_em: new Date().toISOString(), versao: 1, tabelas: dados }));

    const bucket = admin.storage.from("backups");
    const up1 = await bucket.upload(`${nome}.xlsx`, xlsx, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (up1.error) throw new Error("Envio da planilha: " + up1.error.message);
    const up2 = await bucket.upload(`${nome}.json`, json, { upsert: true, contentType: "application/json" });
    if (up2.error) throw new Error("Envio do JSON: " + up2.error.message);

    // Apaga backups com mais de 30 dias
    const { data: lista } = await bucket.list("", { limit: 1000 });
    const limite = Date.now() - DIAS_GUARDADOS * 864e5;
    const velhos = (lista || []).filter((f) => f.created_at && new Date(f.created_at).getTime() < limite).map((f) => f.name);
    if (velhos.length) await bucket.remove(velhos);

    const linhas = Object.fromEntries(Object.entries(dados).map(([t, v]) => [t, v.length]));
    return Response.json({ ok: true, arquivo: nome, linhas, removidos: velhos.length });
  } catch (e) {
    console.error("Backup falhou:", e);
    return Response.json({ erro: "O backup falhou: " + e.message }, { status: 500 });
  }
}

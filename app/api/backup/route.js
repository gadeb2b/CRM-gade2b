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

// Retorna as empresas que esta chamada pode copiar: todas (agendamento) ou só a do admin logado
async function empresasAutorizadas(req, admin) {
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    const { data } = await admin.from("empresas").select("id,slug").eq("status", "ativa");
    return data || [];
  }
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: perfil } = await admin.from("perfis").select("papel,status,empresa_id").eq("user_id", data.user.id).maybeSingle();
  if (!(perfil?.status === "ativo" && ["admin", "super_admin"].includes(perfil.papel) && perfil.empresa_id)) return null;
  const { data: emp } = await admin.from("empresas").select("id,slug").eq("id", perfil.empresa_id).eq("status", "ativa");
  return emp || [];
}

async function copiarEmpresa(admin, emp) {
  const dados = await coletarDados(admin, emp.id);
  const nome = nomeBackup(emp.slug);
  const xlsx = await writeExcelFile(montarPlanilha(dados)).toBuffer();
  const json = Buffer.from(JSON.stringify({ gerado_em: new Date().toISOString(), versao: 2, empresa: emp, tabelas: dados }));
  const bucket = admin.storage.from("backups");
  const up1 = await bucket.upload(`${emp.id}/${nome}.xlsx`, xlsx, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (up1.error) throw new Error("Envio da planilha: " + up1.error.message);
  const up2 = await bucket.upload(`${emp.id}/${nome}.json`, json, { upsert: true, contentType: "application/json" });
  if (up2.error) throw new Error("Envio do JSON: " + up2.error.message);
  // Apaga backups com mais de 30 dias desta empresa
  const { data: lista } = await bucket.list(emp.id, { limit: 1000 });
  const limite = Date.now() - DIAS_GUARDADOS * 864e5;
  const velhos = (lista || []).filter((f) => f.created_at && new Date(f.created_at).getTime() < limite).map((f) => `${emp.id}/${f.name}`);
  if (velhos.length) await bucket.remove(velhos);
  return { arquivo: nome, linhas: Object.fromEntries(Object.entries(dados).map(([t, v]) => [t, v.length])), removidos: velhos.length };
}

export async function GET(req) {
  const segredo = process.env.SUPABASE_SECRET_KEY;
  if (!segredo) return Response.json({ erro: "Backup automático não configurado: falta SUPABASE_SECRET_KEY na Vercel." }, { status: 503 });
  const admin = createClient(url, segredo, { auth: { persistSession: false, autoRefreshToken: false } });

  const empresas = await empresasAutorizadas(req, admin);
  if (!empresas) return Response.json({ erro: "Não autorizado." }, { status: 401 });

  const resultados = [];
  for (const emp of empresas) {
    try {
      resultados.push({ empresa: emp.slug, ok: true, ...(await copiarEmpresa(admin, emp)) });
    } catch (e) {
      console.error("Backup falhou:", emp.slug, e);
      resultados.push({ empresa: emp.slug, ok: false, erro: e.message });
    }
  }
  const falhas = resultados.filter((r) => !r.ok);
  if (empresas.length === 1) {
    const r = resultados[0];
    return r.ok ? Response.json({ ok: true, ...r }) : Response.json({ erro: "O backup falhou: " + r.erro }, { status: 500 });
  }
  return Response.json({ ok: !falhas.length, empresas: resultados }, { status: falhas.length ? 500 : 200 });
}

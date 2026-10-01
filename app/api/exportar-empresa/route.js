import { createClient } from "@supabase/supabase-js";
import writeExcelFile from "write-excel-file/node";
import { coletarDados, montarPlanilha, nomeBackup } from "../../../lib/backup";

// Exporta todos os dados de uma empresa (para entregar ao cliente que sair da plataforma).
// Só o dono da plataforma pode usar. Precisa da variável SUPABASE_SECRET_KEY na Vercel.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const segredo = process.env.SUPABASE_SECRET_KEY;
  if (!segredo) return Response.json({ erro: "Falta SUPABASE_SECRET_KEY na Vercel." }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, segredo, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = token ? await admin.auth.getUser(token) : { data: null };
  if (!u?.user) return Response.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const { data: dono } = await admin.from("plataforma_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
  if (!dono) return Response.json({ erro: "Apenas o dono da plataforma pode exportar empresas." }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const empresaId = params.get("empresa");
  const formato = params.get("formato") === "json" ? "json" : "xlsx";
  const { data: emp } = await admin.from("empresas").select("id,nome,slug").eq("id", empresaId || "").maybeSingle();
  if (!emp) return Response.json({ erro: "Empresa não encontrada." }, { status: 404 });

  try {
    const dados = await coletarDados(admin, emp.id);
    const nome = nomeBackup(emp.slug) + "-exportacao";
    if (formato === "json") {
      const corpo = JSON.stringify({ gerado_em: new Date().toISOString(), empresa: emp, tabelas: dados }, null, 1);
      return new Response(corpo, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}.json"` } });
    }
    const xlsx = await writeExcelFile(montarPlanilha(dados)).toBuffer();
    return new Response(xlsx, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}.xlsx"`,
    } });
  } catch (e) {
    console.error("Exportação falhou:", e);
    return Response.json({ erro: "A exportação falhou: " + e.message }, { status: 500 });
  }
}

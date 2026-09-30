import { createClient } from "@supabase/supabase-js";

// Consulta pública de CNPJ (dados da Receita Federal).
// Usa a BrasilAPI e, se ela falhar, a publica.cnpj.ws. Só para usuários logados.

export const dynamic = "force-dynamic";

const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com"]);
function titulo(s) {
  return (s || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
    .replace(/\b(Ltda|Eireli|Me|Epp|S\/a|Sa)\b/g, (m) => m.toUpperCase());
}
function formatarCnae(v) {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length !== 7) return String(v || "");
  return `${s.slice(0, 4)}-${s.slice(4, 5)}/${s.slice(5)}`;
}
function formatarTel(ddd, num) {
  const d = String(ddd || "").replace(/\D/g, "");
  let n = String(num || "").replace(/\D/g, "");
  if (!d && n.length >= 10) return formatarTel(n.slice(0, 2), n.slice(2));
  if (!n) return "";
  n = n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
  return d ? `(${d}) ${n}` : n;
}

async function buscar(url) {
  const r = await fetch(url, { headers: { "User-Agent": "CRM-Gade2B/1.0" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (r.status === 404) return { naoEncontrado: true };
  if (!r.ok) throw new Error("status " + r.status);
  return { dados: await r.json() };
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: u } = token ? await sb.auth.getUser(token) : { data: null };
  if (!u?.user) return Response.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  const cnpj = (new URL(req.url).searchParams.get("cnpj") || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return Response.json({ erro: "O CNPJ precisa ter 14 números." }, { status: 400 });

  // 1ª tentativa: BrasilAPI
  try {
    const r = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (r.naoEncontrado) return Response.json({ erro: "CNPJ não encontrado na Receita." }, { status: 404 });
    const d = r.dados;
    return Response.json({
      razao_social: titulo(d.razao_social),
      nome_fantasia: titulo(d.nome_fantasia),
      cnae: formatarCnae(d.cnae_fiscal),
      atividade: d.cnae_fiscal_descricao || "",
      telefone: formatarTel("", d.ddd_telefone_1),
      email: (d.email || "").toLowerCase(),
      cidade: titulo(d.municipio),
      uf: d.uf || "",
      situacao: d.descricao_situacao_cadastral || "",
      fonte: "BrasilAPI",
    });
  } catch (e) {
    console.error("BrasilAPI falhou:", e.message);
  }

  // 2ª tentativa: publica.cnpj.ws (limite de 3 consultas por minuto)
  try {
    const r = await buscar(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (r.naoEncontrado) return Response.json({ erro: "CNPJ não encontrado na Receita." }, { status: 404 });
    const d = r.dados, e = d.estabelecimento || {};
    const ap = e.atividade_principal || {};
    return Response.json({
      razao_social: titulo(d.razao_social),
      nome_fantasia: titulo(e.nome_fantasia),
      cnae: ap.subclasse || formatarCnae(ap.id),
      atividade: ap.descricao || "",
      telefone: formatarTel(e.ddd1, e.telefone1),
      email: (e.email || "").toLowerCase(),
      cidade: titulo(e.cidade?.nome),
      uf: e.estado?.sigla || "",
      situacao: (e.situacao_cadastral || "").toUpperCase(),
      fonte: "CNPJ.ws",
    });
  } catch (e) {
    console.error("CNPJ.ws falhou:", e.message);
  }

  return Response.json({ erro: "As consultas de CNPJ não responderam agora. Tente de novo em alguns minutos." }, { status: 502 });
}

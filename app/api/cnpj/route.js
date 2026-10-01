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
  const r = await fetch(url, { headers: { "User-Agent": "CRM-Vendas/1.0" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
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

  const brasilApi = async () => {
    const r = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (r.naoEncontrado) return { naoEncontrado: true };
    const d = r.dados;
    return {
      razao_social: titulo(d.razao_social),
      nome_fantasia: titulo(d.nome_fantasia),
      cnae: formatarCnae(d.cnae_fiscal),
      atividade: d.cnae_fiscal_descricao || "",
      telefone: formatarTel("", d.ddd_telefone_1) || formatarTel("", d.ddd_telefone_2),
      email: (d.email || "").trim().toLowerCase(),
      cidade: titulo(d.municipio),
      uf: d.uf || "",
      situacao: d.descricao_situacao_cadastral || "",
    };
  };
  const cnpjWs = async () => {
    const r = await buscar(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (r.naoEncontrado) return { naoEncontrado: true };
    const d = r.dados, e = d.estabelecimento || {};
    const ap = e.atividade_principal || {};
    return {
      razao_social: titulo(d.razao_social),
      nome_fantasia: titulo(e.nome_fantasia),
      cnae: ap.subclasse || formatarCnae(ap.id),
      atividade: ap.descricao || "",
      telefone: formatarTel(e.ddd1, e.telefone1) || formatarTel(e.ddd2, e.telefone2),
      email: (e.email || "").trim().toLowerCase(),
      cidade: titulo(e.cidade?.nome),
      uf: e.estado?.sigla || "",
      situacao: (e.situacao_cadastral || "").toUpperCase(),
    };
  };

  let dados = null;
  try { dados = await brasilApi(); } catch (e) { console.error("BrasilAPI falhou:", e.message); }

  // Se a BrasilAPI não respondeu, ou respondeu sem e-mail/telefone, tenta a CNPJ.ws para completar
  if (!dados || (!dados.naoEncontrado && (!dados.email || !dados.telefone))) {
    try {
      const extra = await cnpjWs();
      if (!dados) dados = extra;
      else if (!extra.naoEncontrado) {
        if (!dados.email) dados.email = extra.email;
        if (!dados.telefone) dados.telefone = extra.telefone;
      }
    } catch (e) { console.error("CNPJ.ws falhou:", e.message); }
  }

  if (!dados) return Response.json({ erro: "As consultas de CNPJ não responderam agora. Tente de novo em alguns minutos." }, { status: 502 });
  if (dados.naoEncontrado) return Response.json({ erro: "CNPJ não encontrado na Receita." }, { status: 404 });
  return Response.json(dados);
}

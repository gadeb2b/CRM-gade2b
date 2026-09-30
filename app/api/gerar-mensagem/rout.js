import { createClient } from "@supabase/supabase-js";

// Gera mensagens de venda com a API da Anthropic.
// Só funciona se a variável ANTHROPIC_API_KEY estiver configurada na Vercel (como Secret).
// Modelo padrão: Claude Haiku 4.5 (rápido e barato). Pode ser trocado pela variável ANTHROPIC_MODEL.

export async function GET() {
  return Response.json({ disponivel: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return Response.json({ erro: "A geração com IA ainda não foi configurada." }, { status: 503 });

  // Só usuários logados no CRM podem gerar mensagens.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: u, error: eu } = await sb.auth.getUser(token);
  if (eu || !u?.user) return Response.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  const { prompt } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 12000) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "Você responde somente com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    console.error("Anthropic", r.status, await r.text());
    const msg = r.status === 429 ? "Muitas gerações seguidas. Espere um pouco e tente de novo." : "A IA não respondeu agora. Tente de novo ou use o modelo.";
    return Response.json({ erro: msg }, { status: 502 });
  }

  const j = await r.json();
  const texto = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    const limpo = texto.replace(/```json|```/g, "").trim();
    const o = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1));
    if (!o.mensagem) throw new Error("sem mensagem");
    return Response.json({ mensagem: String(o.mensagem).trim(), assunto: String(o.assunto || "").trim() });
  } catch {
    return Response.json({ erro: "A IA devolveu uma resposta fora do formato. Tente de novo." }, { status: 502 });
  }
}

import { supabaseUrl, supabaseKey } from "../lib/supabase";

// Sempre verifica na hora (não guarda em cache), para o teste refletir a configuração atual.
export const dynamic = "force-dynamic";

async function verificarSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      texto:
        "Variáveis não encontradas. Confira NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY na Vercel e faça um novo deploy.",
    };
  }
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseKey },
      cache: "no-store",
    });
    if (r.ok) return { ok: true, texto: "Conectado ao Supabase." };
    return {
      ok: false,
      texto: `O Supabase respondeu com erro ${r.status}. Confira se a URL e a chave são do mesmo projeto.`,
    };
  } catch {
    return {
      ok: false,
      texto: "Não foi possível alcançar o Supabase. Confira se a URL está correta (https://xxxx.supabase.co).",
    };
  }
}

export default async function Home() {
  const status = await verificarSupabase();
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 32, margin: "0 0 8px" }}>CRM Gade2B</h1>
      <p style={{ color: "#5B6673", marginTop: 0 }}>
        Projeto criado e publicado. O CRM vai ser construído aqui.
      </p>
      <div
        style={{
          marginTop: 24,
          padding: "14px 16px",
          borderRadius: 8,
          background: status.ok ? "#E3F3E8" : "#FDECEA",
          color: status.ok ? "#15803D" : "#B42318",
          fontWeight: 600,
        }}
      >
        {status.ok ? "✓ " : "✗ "}
        {status.texto}
      </div>
    </main>
  );
}

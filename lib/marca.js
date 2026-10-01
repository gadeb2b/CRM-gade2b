// Aplica as cores da empresa no sistema inteiro (tudo usa as variáveis --brand e --gold)
const PADRAO = { cor_primaria: "#1FA56A", cor_secundaria: "#D8AE48" };

function luminancia(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const valida = (c) => /^#[0-9A-Fa-f]{6}$/.test(c || "");

export function aplicarMarca(empresa) {
  if (typeof document === "undefined") return;
  const p = valida(empresa?.cor_primaria) ? empresa.cor_primaria : PADRAO.cor_primaria;
  const s = valida(empresa?.cor_secundaria) ? empresa.cor_secundaria : PADRAO.cor_secundaria;
  const raiz = document.documentElement.style;
  raiz.setProperty("--brand", p);
  raiz.setProperty("--gold", s);
  // Texto dos botões principais: escuro em cores claras, branco em cores escuras
  raiz.setProperty("--brand-ink", luminancia(p) > 0.25 ? "#04140C" : "#FFFFFF");
}

export const marcaPadrao = { nome: "CRM de vendas", logo_url: "", ...PADRAO };

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function iso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export const hoje = () => iso(new Date());
export function parse(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export const diff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
export function fmtData(s) {
  if (!s) return "";
  const d = String(s).length > 10 ? new Date(s) : parse(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}
export const soDigitos = (s) => (s || "").replace(/\D/g, "");
export const temTel = (d) => soDigitos(d.telefone).length >= 10;
export const temMail = (d) => /.+@.+\..+/.test(d.email || "");
export function waLink(d) {
  let n = soDigitos(d.telefone);
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(d.msg_rascunho || "")}`;
}
export function mailLink(d) {
  return `mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent(d.assunto_rascunho || "")}&body=${encodeURIComponent(d.msg_rascunho || "")}`;
}

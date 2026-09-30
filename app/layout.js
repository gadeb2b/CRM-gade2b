export const metadata = {
  title: "CRM Gade2B",
  description: "CRM de vendas da Gade2B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#EDF0EE",
          color: "#17202B",
        }}
      >
        {children}
      </body>
    </html>
  );
}

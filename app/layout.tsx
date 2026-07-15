import type { Metadata } from "next";
import "./globals.css";
import "./prototype.css";
import "./polish.css";
import "./workflow-detail.css";
import "./workflow-management.css";

export const metadata: Metadata = {
  title: "Agenda Sítio Emanuel",
  description: "Gestão interna de reservas, clientes e pagamentos do Sítio Emanuel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

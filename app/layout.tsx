import type { Metadata } from "next";
import "./globals.css";
import "./prototype.css";
import "./polish.css";
import "./workflow-detail.css";
import "./workflow-management.css";
import "./final-mobile.css";
import "./refinement.css";

export const metadata: Metadata = {
  title: "Agenda Sítio Emanuel",
  description: "Gestão interna de reservas, clientes e pagamentos do Sítio Emanuel.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

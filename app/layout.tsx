import type { Metadata } from "next";
import "./globals.css";
import "./prototype.css";
import "./polish.css";
import "./workflow-detail.css";
import "./workflow-management.css";
import "./final-mobile.css";
import "./refinement.css";
import "./security.css";
import "./settings-v4.css";
import "./customer-history.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agenda Sítio Emanuel",
  description: "Gestão interna de reservas, clientes e pagamentos do Sítio Emanuel.",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
  referrer: "strict-origin-when-cross-origin",
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ContactRound,
  ListChecks,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAgenda } from "@/components/AgendaProvider";

const links = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/reservas", label: "Reservas", icon: ListChecks },
  { href: "/clientes", label: "Clientes", icon: ContactRound },
  { href: "/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/agenda") || pathname.startsWith("/dashboard")) return ["Agenda", "Controle dos fins de semana"];
  if (pathname.startsWith("/reservas/")) return ["Detalhes da reserva", "Dados e pagamentos"];
  if (pathname.startsWith("/reservas")) return ["Reservas", "Histórico e busca"];
  if (pathname.startsWith("/clientes")) return ["Clientes", "Contatos atendidos"];
  if (pathname.startsWith("/financeiro")) return ["Financeiro", "Sinais e saldos"];
  if (pathname.startsWith("/configuracoes")) return ["Configurações", "Acessos e integrações"];
  return ["Agenda", "Gestão interna"];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isDemo } = useAgenda();
  const [title, subtitle] = titleFromPath(pathname);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="app-shell">
      {open ? <button className="mobile-overlay" onClick={() => setOpen(false)} aria-label="Fechar menu" /> : null}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">SE</div>
          <div><h1>Agenda Emanuel</h1><p>Gestão do sítio</p></div>
        </div>

        <div className="nav-group-label">Menu principal</div>
        <nav className="nav-list">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/agenda" && pathname.startsWith(href)) || (href === "/agenda" && pathname.startsWith("/dashboard"));
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${active ? "active" : ""}`}>
                <Icon />{label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-mini-card"><CalendarDays /><div><strong>Próximo passo</strong><span>Selecione um fim de semana na agenda.</span></div></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={19} /></button>
            <div><div className="topbar-title">{title}</div><div className="topbar-subtitle">{subtitle}</div></div>
          </div>
          <div className="topbar-actions">
            {isDemo ? <span className="demo-chip">Demonstração</span> : <span className="connected-chip">Banco conectado</span>}
            <button className="icon-button" onClick={logout} title="Sair"><LogOut size={17} /></button>
          </div>
        </header>
        <div className="content">{children}</div>
      </section>
    </div>
  );
}

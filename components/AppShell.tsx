"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ContactRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAgenda } from "@/components/AgendaProvider";

const links = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/agenda", label: "Calendário", icon: CalendarDays },
  { href: "/reservas", label: "Reservas", icon: ListChecks },
  { href: "/clientes", label: "Clientes", icon: ContactRound },
  { href: "/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard")) return ["Visão geral", "Resumo da operação"];
  if (pathname.startsWith("/agenda")) return ["Calendário", "Agenda interna"];
  if (pathname.startsWith("/reservas/")) return ["Detalhes da reserva", "Dados e pagamentos"];
  if (pathname.startsWith("/reservas")) return ["Reservas", "Histórico e busca"];
  if (pathname.startsWith("/clientes")) return ["Clientes", "Contatos atendidos"];
  if (pathname.startsWith("/financeiro")) return ["Financeiro", "Sinais e saldos"];
  if (pathname.startsWith("/relatorios")) return ["Relatórios", "Indicadores e exportação"];
  if (pathname.startsWith("/configuracoes")) return ["Configurações", "Acessos e integrações"];
  return ["Agenda", "Gestão interna"];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isDemo, role } = useAgenda();
  const [title, subtitle] = titleFromPath(pathname);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="app-shell prototype-shell">
      {open ? (
        <button
          className="mobile-overlay"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        />
      ) : null}

      <aside className={`sidebar prototype-sidebar ${open ? "open" : ""}`}>
        <Link className="prototype-brand" href="/dashboard" onClick={() => setOpen(false)}>
          <span
            className="sitio-brand-logo"
            role="img"
            aria-label="Sítio Emanuel"
          />
          <span className="brand-caption">Agenda interna</span>
        </Link>

        <div className="nav-group-label">Menu principal</div>
        <nav className="nav-list">
          {links
            .filter((link) => !link.adminOnly || role === "ADMIN")
            .map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <Icon aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <button className="sidebar-logout" type="button" onClick={logout}>
          <LogOut aria-hidden="true" />
          Sair
        </button>
      </aside>

      <section className="main-area prototype-main-area">
        <header className="topbar prototype-topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu size={19} />
            </button>
            <div>
              <div className="topbar-title">{title}</div>
              <div className="topbar-subtitle">{subtitle}</div>
            </div>
          </div>

          <div className="topbar-actions">
            {isDemo ? (
              <span className="demo-chip">Demonstração</span>
            ) : (
              <span className="connected-chip">Banco conectado</span>
            )}
            <button className="icon-button" onClick={logout} title="Sair" aria-label="Sair">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="content prototype-content">{children}</div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  TentTree,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAgenda } from "@/components/AgendaProvider";

const links = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/reservas", label: "Reservas", icon: TentTree },
  { href: "/clientes", label: "Clientes", icon: ContactRound },
  { href: "/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/agenda")) return ["Agenda", "Calendário e períodos do sítio"];
  if (pathname.startsWith("/reservas/nova")) return ["Nova reserva", "Cadastro completo do evento"];
  if (pathname.startsWith("/reservas/")) return ["Detalhes da reserva", "Dados, pagamentos e histórico"];
  if (pathname.startsWith("/reservas")) return ["Reservas", "Pré-reservas e eventos confirmados"];
  if (pathname.startsWith("/clientes")) return ["Clientes", "Contatos e igrejas atendidas"];
  if (pathname.startsWith("/financeiro")) return ["Financeiro", "Pagamentos e valores pendentes"];
  if (pathname.startsWith("/configuracoes")) return ["Configurações", "Acessos e integrações"];
  return ["Visão geral", "O que precisa da sua atenção hoje"];
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
          <div>
            <h1>Agenda Sítio Emanuel</h1>
            <p>Gestão interna</p>
          </div>
        </div>
        <div className="nav-group-label">Organização</div>
        <nav className="nav-list">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${active ? "active" : ""}`}>
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-note">
            Agenda separada da landing page pública. Apenas pessoas autorizadas acessam os dados.
          </div>
        </div>
      </aside>
      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={19} /></button>
            <div>
              <div className="topbar-title">{title}</div>
              <div className="topbar-subtitle">{subtitle}</div>
            </div>
          </div>
          <div className="topbar-actions">
            {isDemo ? <span className="demo-chip">Modo demonstração</span> : null}
            <button className="icon-button" onClick={logout} title="Sair"><LogOut size={17} /></button>
          </div>
        </header>
        <div className="content">{children}</div>
      </section>
    </div>
  );
}

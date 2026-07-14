"use client";

import { CalendarDays } from "lucide-react";
import { CalendarWorkspace } from "@/components/CalendarWorkspace";
import { useAgenda } from "@/components/AgendaProvider";

export default function AgendaPage() {
  const { loading } = useAgenda();

  return (
    <main className="page agenda-page">
      <div className="page-head compact-page-head">
        <div>
          <span className="page-kicker"><CalendarDays /> Controle de reservas</span>
          <h2>Agenda do Sítio Emanuel</h2>
          <p>Clique em um fim de semana para cadastrar uma pré-reserva ou consultar quem já está agendado.</p>
        </div>
      </div>

      {loading ? <div className="loading-card">Carregando agenda...</div> : <CalendarWorkspace />}
    </main>
  );
}

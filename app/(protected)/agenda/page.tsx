"use client";

import { CalendarWorkspace } from "@/components/CalendarWorkspace";
import { useAgenda } from "@/components/AgendaProvider";

export default function AgendaPage() {
  const { loading } = useAgenda();

  return (
    <main className="page agenda-page prototype-agenda-page">
      {loading ? <div className="loading-card">Carregando agenda...</div> : <CalendarWorkspace />}
    </main>
  );
}

"use client";

import Link from "next/link";
import { CalendarPlus2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgenda } from "@/components/AgendaProvider";
import { ReservationCard } from "@/components/ReservationCard";
import type { ReservationStatus } from "@/lib/types";

const statuses: Array<{ value: "TODAS" | ReservationStatus; label: string }> = [
  { value: "TODAS", label: "Todas" },
  { value: "PRE_RESERVA", label: "Pré-reservas" },
  { value: "CONFIRMADA", label: "Confirmadas" },
  { value: "REALIZADA", label: "Realizadas" },
  { value: "CANCELADA", label: "Canceladas" },
];

export default function ReservasPage() {
  const { reservations, loading } = useAgenda();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"TODAS" | ReservationStatus>("TODAS");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reservations
      .filter((item) => status === "TODAS" || item.status === status)
      .filter((item) => {
        if (!normalized) return true;
        return [item.church_name, item.contact_name, item.phone, item.email]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }, [query, reservations, status]);

  return (
    <main className="page">
      <div className="page-head">
        <div><h2>Reservas</h2><p>Encontre rapidamente qualquer pré-reserva, evento confirmado ou atendimento antigo.</p></div>
        <div className="page-actions"><Link href="/reservas/nova" className="button button-primary"><CalendarPlus2 /> Nova reserva</Link></div>
      </div>
      <section className="panel">
        <div className="panel-header"><div><h3 className="panel-title">Todos os registros</h3><p className="panel-subtitle">Use a busca pelo nome, igreja, telefone ou e-mail.</p></div></div>
        <div className="panel-body">
          <div className="filter-bar" style={{marginBottom:18}}>
            <label className="search"><Search /><input className="input" placeholder="Buscar reserva..." value={query} onChange={(e)=>setQuery(e.target.value)} /></label>
            <select className="select" value={status} onChange={(e)=>setStatus(e.target.value as "TODAS" | ReservationStatus)} style={{maxWidth:190}}>{statuses.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </div>
          {loading ? <div className="empty">Carregando reservas...</div> : (
            <div className="reservation-list">
              {filtered.length ? filtered.map((item)=><ReservationCard key={item.id} reservation={item} />) : <div className="empty">Nenhuma reserva encontrada com esses filtros.</div>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

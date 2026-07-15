"use client";

import Link from "next/link";
import { CalendarPlus2, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
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
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<"TODAS" | ReservationStatus>("TODAS");

  const counts = useMemo(() => {
    const result: Record<"TODAS" | ReservationStatus, number> = {
      TODAS: reservations.length,
      PRE_RESERVA: 0,
      CONFIRMADA: 0,
      REALIZADA: 0,
      CANCELADA: 0,
    };
    reservations.forEach((reservation) => {
      result[reservation.status] += 1;
    });
    return result;
  }, [reservations]);

  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
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
  }, [deferredQuery, reservations, status]);

  return (
    <main className="page reservations-page">
      <div className="page-head reservations-head">
        <div>
          <h2>Reservas</h2>
          <p>Consulte, edite e acompanhe todos os eventos em um único lugar.</p>
        </div>
        <div className="page-actions">
          <Link href="/agenda" className="button button-primary"><CalendarPlus2 /> Nova reserva</Link>
        </div>
      </div>

      <section className="reservation-filter-panel">
        <label className="search reservation-search">
          <Search />
          <input
            className="input"
            placeholder="Buscar por igreja, responsável ou telefone..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="status-filter-tabs" role="tablist" aria-label="Filtrar reservas por situação">
          {statuses.map((item) => (
            <button
              type="button"
              key={item.value}
              className={status === item.value ? "active" : ""}
              onClick={() => setStatus(item.value)}
            >
              <span>{item.label}</span>
              <strong>{counts[item.value]}</strong>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="reservation-list-skeleton">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : filtered.length ? (
        <section className="reservation-list modern-reservation-list">
          {filtered.map((item) => <ReservationCard key={item.id} reservation={item} />)}
        </section>
      ) : (
        <section className="reservations-empty">
          <CalendarPlus2 />
          <h3>Nenhuma reserva encontrada</h3>
          <p>Altere os filtros ou cadastre uma nova reserva pela agenda.</p>
          <Link href="/agenda" className="button button-primary">Abrir agenda</Link>
        </section>
      )}
    </main>
  );
}

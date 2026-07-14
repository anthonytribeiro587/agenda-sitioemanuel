"use client";

import { useMemo, useState } from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BlockedPeriod, Reservation } from "@/lib/types";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function MonthCalendar({
  reservations,
  blockedPeriods,
}: {
  reservations: Reservation[];
  blockedPeriods: BlockedPeriod[];
}) {
  const [month, setMonth] = useState(() => new Date(2026, 6, 1));
  const cells = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    return days;
  }, [month]);

  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar">
        <h3>{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <div className="calendar-nav">
          <button className="button button-secondary button-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeft /></button>
          <button className="button button-secondary button-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRight /></button>
        </div>
      </div>
      <div className="calendar-weekdays">{weekdays.map((day) => <div key={day}>{day}</div>)}</div>
      <div className="calendar-grid">
        {cells.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const dayReservations = reservations.filter((reservation) => iso >= reservation.start_date && iso <= reservation.end_date && reservation.status !== "CANCELADA");
          const blocks = blockedPeriods.filter((period) => iso >= period.start_date && iso <= period.end_date);
          return (
            <div key={iso} className={`day-cell ${isSameMonth(day, month) ? "" : "outside"}`}>
              <div className="day-number">{format(day, "d")}</div>
              <div className="day-events">
                {dayReservations.slice(0, 2).map((reservation) => (
                  <div key={reservation.id} className={`day-event ${reservation.status.toLowerCase().replace("pre_reserva","pre")}`}>{reservation.church_name}</div>
                ))}
                {blocks.slice(0, 1).map((block) => <div key={block.id} className="day-event block">Bloqueado</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

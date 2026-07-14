"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BlockedPeriod, Reservation } from "@/lib/types";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type CalendarSelection = {
  start: string;
  end: string;
  reservationId?: string;
  blockId?: string;
};

function weekendFor(day: Date) {
  const dayOfWeek = day.getDay();
  const friday = addDays(day, dayOfWeek === 0 ? -2 : dayOfWeek === 6 ? -1 : 5 - dayOfWeek);
  return {
    start: format(friday, "yyyy-MM-dd"),
    end: format(addDays(friday, 2), "yyyy-MM-dd"),
  };
}

function overlaps(iso: string, start: string, end: string) {
  return iso >= start && iso <= end;
}

export function MonthCalendar({
  reservations,
  blockedPeriods,
  selectedStart,
  selectedEnd,
  onSelect,
}: {
  reservations: Reservation[];
  blockedPeriods: BlockedPeriod[];
  selectedStart?: string;
  selectedEnd?: string;
  onSelect?: (selection: CalendarSelection) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

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
        <div>
          <span className="eyebrow">Agenda mensal</span>
          <h3>{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        </div>
        <div className="calendar-nav">
          <button
            className="icon-control"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Mês anterior"
            type="button"
          >
            <ChevronLeft />
          </button>
          <button
            className="icon-control"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Próximo mês"
            type="button"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span><i className="legend-dot free" />Livre</span>
        <span><i className="legend-dot pre" />Pré-reserva</span>
        <span><i className="legend-dot confirmed" />Confirmada</span>
        <span><i className="legend-dot blocked" />Bloqueada</span>
      </div>

      <div className="calendar-weekdays">
        {weekdays.map((day, index) => (
          <div key={day} className={index >= 4 ? "weekend-heading" : ""}>{day}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const reservation = reservations.find(
            (item) => item.status !== "CANCELADA" && overlaps(iso, item.start_date, item.end_date)
          );
          const block = blockedPeriods.find((item) => overlaps(iso, item.start_date, item.end_date));
          const isWeekendDay = [5, 6, 0].includes(day.getDay());
          const isSelected = Boolean(selectedStart && selectedEnd && overlaps(iso, selectedStart, selectedEnd));
          const weekend = weekendFor(day);

          return (
            <button
              type="button"
              key={iso}
              className={[
                "day-cell",
                !isSameMonth(day, month) ? "outside" : "",
                isWeekendDay ? "weekend" : "",
                reservation ? `occupied ${reservation.status === "PRE_RESERVA" ? "pre" : "confirmed"}` : "",
                block ? "blocked" : "",
                isSelected ? "selected" : "",
                isToday(day) ? "today" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                if (!onSelect) return;
                if (reservation) {
                  onSelect({
                    start: reservation.start_date,
                    end: reservation.end_date,
                    reservationId: reservation.id,
                  });
                  return;
                }
                if (block) {
                  onSelect({ start: block.start_date, end: block.end_date, blockId: block.id });
                  return;
                }
                onSelect(weekend);
              }}
              aria-label={`${format(day, "dd 'de' MMMM", { locale: ptBR })}${reservation ? `, ${reservation.church_name}` : ""}`}
            >
              <div className="day-cell-top">
                <span className="day-number">{format(day, "d")}</span>
                {isToday(day) ? <span className="today-dot" /> : null}
              </div>

              {reservation ? (
                <div className="calendar-booking">
                  <strong>{reservation.church_name}</strong>
                  <span>{reservation.contact_name}</span>
                  <small>{reservation.guests_confirmed ?? reservation.guests_estimated} pessoas</small>
                </div>
              ) : block ? (
                <div className="calendar-booking block-copy">
                  <strong>Bloqueado</strong>
                  <span>{block.reason}</span>
                </div>
              ) : isWeekendDay && isSameMonth(day, month) ? (
                <span className="free-label">Livre</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

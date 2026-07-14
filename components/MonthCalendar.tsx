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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatRange } from "@/lib/format";
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

function overlapsDay(iso: string, start: string, end: string) {
  return iso >= start && iso <= end;
}

function overlapsRange(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function reservationTone(status: Reservation["status"]) {
  if (status === "PRE_RESERVA") return "pre";
  if (status === "REALIZADA") return "done";
  return "confirmed";
}

function monthLabel(date: Date) {
  const text = format(date, "MMMM 'de' yyyy", { locale: ptBR });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function MonthCalendar({
  reservations,
  blockedPeriods,
  selectedStart,
  selectedEnd,
  onSelect,
  onNewReservation,
}: {
  reservations: Reservation[];
  blockedPeriods: BlockedPeriod[];
  selectedStart?: string;
  selectedEnd?: string;
  onSelect?: (selection: CalendarSelection) => void;
  onNewReservation?: () => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const rows: Date[][] = [];
    let cursor = start;

    while (cursor <= end) {
      rows.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)));
      cursor = addDays(cursor, 7);
    }

    return rows;
  }, [month]);

  return (
    <div className="prototype-calendar">
      <div className="prototype-calendar-toolbar">
        <div className="prototype-calendar-controls">
          <button className="calendar-today-button" type="button" onClick={() => setMonth(startOfMonth(new Date()))}>
            Hoje
          </button>
          <button className="calendar-arrow" type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mês anterior">
            <ChevronLeft />
          </button>
          <button className="calendar-arrow" type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Próximo mês">
            <ChevronRight />
          </button>
        </div>

        <h2 className="prototype-month-title">{monthLabel(month)}</h2>

        <button className="prototype-new-button" type="button" onClick={onNewReservation}>
          <Plus /> Nova reserva
        </button>
      </div>

      <div className="prototype-weekdays">
        {weekdays.map((day, index) => (
          <div key={day} className={index >= 4 ? "weekend-heading" : ""}>{day}</div>
        ))}
      </div>

      <div className="prototype-calendar-body">
        {weeks.map((week) => {
          const weekStart = format(week[0], "yyyy-MM-dd");
          const weekEnd = format(week[6], "yyyy-MM-dd");
          const weekReservations = reservations.filter(
            (item) => item.status !== "CANCELADA" && overlapsRange(item.start_date, item.end_date, weekStart, weekEnd)
          );
          const weekBlocks = blockedPeriods.filter((item) => overlapsRange(item.start_date, item.end_date, weekStart, weekEnd));

          return (
            <div className="prototype-week-row" key={weekStart}>
              {week.map((day, index) => {
                const iso = format(day, "yyyy-MM-dd");
                const reservation = reservations.find(
                  (item) => item.status !== "CANCELADA" && overlapsDay(iso, item.start_date, item.end_date)
                );
                const block = blockedPeriods.find((item) => overlapsDay(iso, item.start_date, item.end_date));
                const isWeekendDay = index >= 4;
                const isSelected = Boolean(selectedStart && selectedEnd && overlapsDay(iso, selectedStart, selectedEnd));

                return (
                  <button
                    type="button"
                    key={iso}
                    className={[
                      "prototype-day-cell",
                      !isSameMonth(day, month) ? "outside" : "",
                      isWeekendDay ? "weekend" : "",
                      isSelected ? "selected" : "",
                      isToday(day) ? "today" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      if (!onSelect) return;
                      if (reservation) {
                        onSelect({ start: reservation.start_date, end: reservation.end_date, reservationId: reservation.id });
                        return;
                      }
                      if (block) {
                        onSelect({ start: block.start_date, end: block.end_date, blockId: block.id });
                        return;
                      }
                      if (isWeekendDay) onSelect(weekendFor(day));
                    }}
                    aria-label={format(day, "dd 'de' MMMM", { locale: ptBR })}
                  >
                    <span className="prototype-day-number">{format(day, "d")}</span>
                  </button>
                );
              })}

              {weekReservations.map((reservation) => {
                const startIndex = Math.max(0, week.findIndex((day) => format(day, "yyyy-MM-dd") >= reservation.start_date));
                const endIndexRaw = week.findLastIndex((day) => format(day, "yyyy-MM-dd") <= reservation.end_date);
                const endIndex = endIndexRaw < 0 ? 6 : endIndexRaw;

                return (
                  <button
                    type="button"
                    className={`prototype-booking-bar ${reservationTone(reservation.status)}`}
                    style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
                    key={reservation.id}
                    onClick={() => onSelect?.({ start: reservation.start_date, end: reservation.end_date, reservationId: reservation.id })}
                  >
                    <strong>{reservation.church_name}</strong>
                    <span>{formatRange(reservation.start_date, reservation.end_date)}</span>
                  </button>
                );
              })}

              {weekBlocks.map((block) => {
                const startIndex = Math.max(0, week.findIndex((day) => format(day, "yyyy-MM-dd") >= block.start_date));
                const endIndexRaw = week.findLastIndex((day) => format(day, "yyyy-MM-dd") <= block.end_date);
                const endIndex = endIndexRaw < 0 ? 6 : endIndexRaw;

                return (
                  <button
                    type="button"
                    className="prototype-booking-bar blocked"
                    style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
                    key={block.id}
                    onClick={() => onSelect?.({ start: block.start_date, end: block.end_date, blockId: block.id })}
                  >
                    <strong>Bloqueado</strong>
                    <span>{block.reason}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="prototype-calendar-legend" aria-label="Legenda do calendário">
        <span><i className="legend-square pre" />Pré-reserva</span>
        <span><i className="legend-square confirmed" />Confirmada</span>
        <span><i className="legend-square done" />Realizada</span>
        <span><i className="legend-square blocked" />Bloqueada</span>
      </div>
    </div>
  );
}

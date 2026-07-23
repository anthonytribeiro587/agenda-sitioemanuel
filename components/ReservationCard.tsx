import { memo } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, MessageCircle, UsersRound } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatRange,
  paymentTotal,
  reservationBalance,
  whatsappUrl,
} from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export const ReservationCard = memo(function ReservationCard({ reservation }: { reservation: Reservation }) {
  const hasTotal = reservation.total_amount > 0;
  const balance = reservationBalance(reservation);
  const paid = paymentTotal(reservation.payments);

  return (
    <article className="reservation-card modern-reservation-card">
      <div className="date-block modern-date-block">
        <strong>{formatDate(reservation.start_date, "dd")}</strong>
        <span>{formatDate(reservation.start_date, "MMM")}</span>
      </div>

      <div className="modern-reservation-main">
        <div className="reservation-title-row">
          <div>
            <h3>{reservation.church_name}</h3>
            <p>{reservation.contact_name}</p>
          </div>
          <StatusBadge status={reservation.status} />
        </div>
        <div className="reservation-meta modern-reservation-meta">
          <span>{formatRange(reservation.start_date, reservation.end_date)}</span>
          <span><MapPin />{reservation.group_city}/{reservation.group_state}</span>
          <span><UsersRound />{reservation.guests_confirmed ?? reservation.guests_estimated} pessoas</span>
          <span>{reservation.package_name || "Cardápio a definir"}</span>
        </div>
        <div className="reservation-card-actions">
          <Link className="button button-secondary button-sm" href={`/reservas/${reservation.id}`}>
            Abrir reserva <ArrowRight />
          </Link>
          <a className="button button-ghost button-sm" href={whatsappUrl(reservation)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
        </div>
      </div>

      <div className="reservation-finance modern-reservation-finance">
        <span>Recebido</span>
        <strong>{formatCurrency(paid)}</strong>
        <span>{hasTotal ? "Saldo pendente" : "Valor final"}</span>
        <strong className={hasTotal && balance > 0 ? "pending" : ""}>
          {hasTotal ? formatCurrency(balance) : "A definir"}
        </strong>
      </div>
    </article>
  );
});

import Link from "next/link";
import { MessageCircle, UsersRound } from "lucide-react";
import { formatCurrency, formatDate, formatRange, reservationBalance, whatsappUrl } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export function ReservationCard({ reservation }: { reservation: Reservation }) {
  const balance = reservationBalance(reservation);
  return (
    <article className="reservation-card">
      <div className="date-block">
        <strong>{formatDate(reservation.start_date, "dd")}</strong>
        <span>{formatDate(reservation.start_date, "MMM")}</span>
      </div>
      <div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <h3>{reservation.church_name}</h3>
          <StatusBadge status={reservation.status} />
        </div>
        <div className="reservation-meta">
          <span>{formatRange(reservation.start_date, reservation.end_date)}</span>
          <span><UsersRound size={13} style={{verticalAlign:"-2px",marginRight:4}} />{reservation.guests_confirmed ?? reservation.guests_estimated} pessoas</span>
          <span>{reservation.package_name || "Pacote a definir"}</span>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
          <Link className="button button-secondary button-sm" href={`/reservas/${reservation.id}`}>Ver reserva</Link>
          <a className="button button-secondary button-sm" href={whatsappUrl(reservation)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
        </div>
      </div>
      <div className="reservation-finance">
        <strong>{formatCurrency(balance)}</strong>
        <span>saldo pendente</span>
      </div>
    </article>
  );
}

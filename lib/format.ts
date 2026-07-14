import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Payment, Reservation, ReservationStatus } from "@/lib/types";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export function formatDate(value: string, pattern = "dd 'de' MMMM 'de' yyyy") {
  try {
    return format(parseISO(value), pattern, { locale: ptBR });
  } catch {
    return "—";
  }
}

export function formatShortDate(value: string) {
  return formatDate(value, "dd MMM");
}

export function formatRange(start: string, end: string) {
  try {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    if (
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear()
    ) {
      return `${format(startDate, "dd", { locale: ptBR })}–${format(endDate, "dd 'de' MMMM", {
        locale: ptBR,
      })}`;
    }
    return `${formatShortDate(start)}–${formatShortDate(end)}`;
  } catch {
    return "—";
  }
}

export function paymentTotal(payments: Payment[] | undefined) {
  return (payments ?? []).reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

export function reservationBalance(reservation: Reservation) {
  return Math.max(Number(reservation.total_amount || 0) - paymentTotal(reservation.payments), 0);
}

export function statusLabel(status: ReservationStatus) {
  const labels: Record<ReservationStatus, string> = {
    PRE_RESERVA: "Pré-reserva",
    CONFIRMADA: "Confirmada",
    REALIZADA: "Realizada",
    CANCELADA: "Cancelada",
  };
  return labels[status];
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function whatsappUrl(reservation: Reservation) {
  const message = `Olá, ${reservation.contact_name}! Sobre a reserva de ${formatRange(
    reservation.start_date,
    reservation.end_date
  )} no Sítio Emanuel.`;
  return `https://wa.me/${normalizePhone(reservation.phone)}?text=${encodeURIComponent(message)}`;
}

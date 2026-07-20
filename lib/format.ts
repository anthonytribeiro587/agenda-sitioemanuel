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
  return (payments ?? [])
    .filter((payment) => !payment.voided_at)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
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

export type WhatsappTemplateData = {
  contact_name: string;
  church_name: string;
  start_date: string;
  end_date: string;
  guests_estimated: number;
  package_name: string;
  total_amount: number;
  balance: number;
};

const DEFAULT_WHATSAPP_TEMPLATE =
  "Olá, {responsavel}! Sobre a reserva de {periodo} no Sítio Emanuel para {igreja}. Qualquer dúvida, estamos à disposição.";

export function renderWhatsappTemplate(
  template: string | null | undefined,
  data: WhatsappTemplateData
) {
  const values: Record<string, string> = {
    responsavel: data.contact_name || "responsável",
    igreja: data.church_name || "grupo",
    periodo: formatRange(data.start_date, data.end_date),
    pessoas: String(Number(data.guests_estimated || 0)),
    pacote: data.package_name || "A definir",
    valor: data.total_amount > 0 ? formatCurrency(data.total_amount) : "A definir",
    saldo: data.total_amount > 0 ? formatCurrency(data.balance) : "A definir",
  };

  return (template?.trim() || DEFAULT_WHATSAPP_TEMPLATE).replace(
    /\{(responsavel|igreja|periodo|pessoas|pacote|valor|saldo)\}/g,
    (_, key: string) => values[key] ?? ""
  );
}

export function whatsappUrl(reservation: Reservation, template?: string | null) {
  const message = renderWhatsappTemplate(template, {
    contact_name: reservation.contact_name,
    church_name: reservation.church_name,
    start_date: reservation.start_date,
    end_date: reservation.end_date,
    guests_estimated: reservation.guests_confirmed ?? reservation.guests_estimated,
    package_name: reservation.package_name,
    total_amount: Number(reservation.total_amount || 0),
    balance: reservationBalance(reservation),
  });
  return `https://wa.me/${normalizePhone(reservation.phone)}?text=${encodeURIComponent(message)}`;
}

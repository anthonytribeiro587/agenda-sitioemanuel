import { statusLabel } from "@/lib/format";
import type { ReservationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const className = {
    PRE_RESERVA: "status status-pre",
    CONFIRMADA: "status status-confirmada",
    REALIZADA: "status status-realizada",
    CANCELADA: "status status-cancelada",
  }[status];

  return <span className={className}>{statusLabel(status)}</span>;
}

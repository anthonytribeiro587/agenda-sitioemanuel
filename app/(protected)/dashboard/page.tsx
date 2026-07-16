"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";
import { useAgenda } from "@/components/AgendaProvider";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatCurrency,
  formatRange,
  paymentTotal,
  reservationBalance,
} from "@/lib/format";

export default function DashboardPage() {
  const { reservations, blockedPeriods, loading } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);

  const data = useMemo(() => {
    const active = reservations.filter((item) =>
      ["PRE_RESERVA", "CONFIRMADA"].includes(item.status)
    );
    const upcoming = active
      .filter((item) => item.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const pending = active
      .filter((item) => item.total_amount > 0 && reservationBalance(item) > 0)
      .sort((a, b) => reservationBalance(b) - reservationBalance(a));
    const received = reservations.reduce(
      (total, item) => total + paymentTotal(item.payments),
      0
    );
    const openBalance = pending.reduce(
      (total, item) => total + reservationBalance(item),
      0
    );
    const confirmedGuests = upcoming.reduce(
      (total, item) => total + (item.guests_confirmed ?? item.guests_estimated),
      0
    );

    return { active, upcoming, pending, received, openBalance, confirmedGuests };
  }, [reservations, today]);

  if (loading) {
    return <main className="page"><div className="loading-card">Carregando visão geral...</div></main>;
  }

  return (
    <main className="page dashboard-page refined-dashboard">
      <div className="page-head dashboard-head">
        <div>
          <span className="page-kicker"><CalendarCheck2 /> Gestão interna</span>
          <h2>Visão geral</h2>
          <p>O que precisa de atenção agora, sem excesso de informação.</p>
        </div>
        <div className="page-actions">
          <Link href="/agenda" className="button button-primary"><Plus /> Nova reserva</Link>
        </div>
      </div>

      <section className="dashboard-metrics-grid" aria-label="Indicadores principais">
        <article className="dashboard-metric-card">
          <div className="dashboard-metric-icon"><CalendarDays /></div>
          <div><span>Reservas ativas</span><strong>{data.active.length}</strong><small>Pré-reservas e confirmadas</small></div>
        </article>
        <article className="dashboard-metric-card">
          <div className="dashboard-metric-icon"><UsersRound /></div>
          <div><span>Pessoas previstas</span><strong>{data.confirmedGuests}</strong><small>Próximos eventos</small></div>
        </article>
        <article className="dashboard-metric-card">
          <div className="dashboard-metric-icon"><CircleDollarSign /></div>
          <div><span>Total recebido</span><strong>{formatCurrency(data.received)}</strong><small>Todos os pagamentos</small></div>
        </article>
        <article className="dashboard-metric-card attention">
          <div className="dashboard-metric-icon"><AlertCircle /></div>
          <div><span>Saldo em aberto</span><strong>{formatCurrency(data.openBalance)}</strong><small>{data.pending.length} reserva(s) pendente(s)</small></div>
        </article>
      </section>

      <div className="dashboard-content-grid">
        <section className="panel compact-panel dashboard-upcoming-panel">
          <div className="panel-header">
            <div><h3 className="panel-title">Próximas reservas</h3><p className="panel-subtitle">Eventos futuros em ordem de data.</p></div>
            <Link href="/reservas" className="text-link">Ver todas <ArrowRight /></Link>
          </div>
          <div className="panel-body dashboard-list-body">
            {data.upcoming.length ? data.upcoming.slice(0, 6).map((reservation) => (
              <Link className="dashboard-reservation-row" href={`/reservas/${reservation.id}`} key={reservation.id}>
                <div className="dashboard-date-tile"><strong>{reservation.start_date.slice(8, 10)}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${reservation.start_date}T12:00:00Z`)).replace(".", "")}</span></div>
                <div className="dashboard-reservation-copy">
                  <div><strong>{reservation.church_name}</strong><StatusBadge status={reservation.status} /></div>
                  <span>{formatRange(reservation.start_date, reservation.end_date)} • {reservation.guests_confirmed ?? reservation.guests_estimated} pessoas</span>
                </div>
                <ArrowRight className="row-arrow" />
              </Link>
            )) : <div className="empty compact-empty">Nenhuma reserva futura cadastrada.</div>}
          </div>
        </section>

        <aside className="dashboard-side-stack">
          <section className="panel compact-panel">
            <div className="panel-header"><div><h3 className="panel-title">Pendências financeiras</h3><p className="panel-subtitle">Reservas com saldo definido.</p></div></div>
            <div className="panel-body dashboard-pending-list">
              {data.pending.length ? data.pending.slice(0, 5).map((reservation) => (
                <Link href={`/reservas/${reservation.id}`} key={reservation.id}>
                  <div><strong>{reservation.church_name}</strong><span>{formatRange(reservation.start_date, reservation.end_date)}</span></div>
                  <strong>{formatCurrency(reservationBalance(reservation))}</strong>
                </Link>
              )) : <div className="empty compact-empty">Nenhum saldo pendente.</div>}
              <Link href="/financeiro" className="button button-secondary button-wide">Abrir financeiro <ArrowRight /></Link>
            </div>
          </section>

          <section className="panel compact-panel dashboard-block-panel">
            <div className="panel-header"><div><h3 className="panel-title">Datas bloqueadas</h3><p className="panel-subtitle">Manutenções e indisponibilidades.</p></div></div>
            <div className="panel-body">
              {blockedPeriods.filter((item) => item.end_date >= today).slice(0, 3).map((period) => (
                <div className="dashboard-block-row" key={period.id}>
                  <Clock3 /><div><strong>{formatRange(period.start_date, period.end_date)}</strong><span>{period.reason}</span></div>
                </div>
              ))}
              {!blockedPeriods.some((item) => item.end_date >= today) ? <div className="empty compact-empty">Nenhum bloqueio futuro.</div> : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

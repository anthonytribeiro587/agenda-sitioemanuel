"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus2,
  CircleDollarSign,
  Clock3,
  ContactRound,
  MapPinned,
  WalletCards,
} from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { MetricCard } from "@/components/MetricCard";
import { MonthCalendar } from "@/components/MonthCalendar";
import { ReservationCard } from "@/components/ReservationCard";
import { formatCurrency, formatRange, reservationBalance } from "@/lib/format";

export default function DashboardPage() {
  const { loading, reservations, blockedPeriods } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);
  const pending = reservations.filter((item) => item.status === "PRE_RESERVA" && item.end_date >= today);
  const confirmed = reservations.filter((item) => item.status === "CONFIRMADA" && item.end_date >= today).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const nextReservation = confirmed[0] ?? null;
  const receivable = reservations.filter((item)=>["PRE_RESERVA","CONFIRMADA"].includes(item.status)).reduce((total,item)=>total+reservationBalance(item),0);
  const upcoming = [...pending, ...confirmed].sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,4);

  if (loading) return <div className="page"><div className="panel"><div className="panel-body">Carregando agenda...</div></div></div>;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h2>Bom dia! O que precisa de atenção?</h2>
          <p>Uma visão simples das próximas reservas, valores pendentes e datas importantes.</p>
        </div>
        <div className="page-actions">
          <Link href="/reservas/nova" className="button button-primary"><CalendarPlus2 /> Nova reserva</Link>
          <Link href="/agenda" className="button button-ghost"><MapPinned /> Abrir agenda</Link>
        </div>
      </div>

      <section className="panel">
        <div className="panel-body">
          <div className="grid-4">
            <MetricCard label="Pré-reservas" value={String(pending.length)} helper="Aguardando confirmação ou sinal" icon={Clock3} />
            <MetricCard label="Reservas futuras" value={String(confirmed.length)} helper="Eventos já confirmados" icon={CalendarClock} />
            <MetricCard label="A receber" value={formatCurrency(receivable)} helper="Saldo das reservas em aberto" icon={WalletCards} />
            <MetricCard label="Próximo evento" value={nextReservation ? formatRange(nextReservation.start_date,nextReservation.end_date) : "Sem data"} helper={nextReservation?.church_name ?? "Nenhuma reserva confirmada"} icon={CircleDollarSign} />
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><h3 className="panel-title">Próximas reservas</h3><p className="panel-subtitle">Eventos que estão chegando e pré-reservas que precisam de retorno.</p></div>
            <Link href="/reservas" className="button button-secondary button-sm">Ver todas <ArrowRight /></Link>
          </div>
          <div className="panel-body">
            <div className="reservation-list">
              {upcoming.length ? upcoming.map((item)=><ReservationCard key={item.id} reservation={item} />) : <div className="empty">Nenhuma reserva futura cadastrada.</div>}
            </div>
          </div>
        </section>

        <div style={{display:"grid",gap:18}}>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Ações rápidas</h3><p className="panel-subtitle">Atalhos para as tarefas mais usadas.</p></div></div>
            <div className="panel-body">
              <div className="quick-grid">
                <Link href="/reservas/nova" className="quick-action"><CalendarPlus2 /><strong>Criar reserva</strong><span>Cadastre o contato, período e valor.</span></Link>
                <Link href="/clientes" className="quick-action"><ContactRound /><strong>Novo cliente</strong><span>Guarde os dados de uma igreja ou responsável.</span></Link>
                <Link href="/financeiro" className="quick-action"><WalletCards /><strong>Registrar pagamento</strong><span>Atualize sinal, parcelas e saldo.</span></Link>
                <Link href="/agenda" className="quick-action"><MapPinned /><strong>Bloquear uma data</strong><span>Reserve um período para manutenção ou uso interno.</span></Link>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Resumo do próximo evento</h3><p className="panel-subtitle">Informações importantes sem abrir a reserva.</p></div></div>
            <div className="panel-body">
              {nextReservation ? (
                <div className="info-grid">
                  <div className="info-item"><span>Evento</span><strong>{nextReservation.church_name}</strong></div>
                  <div className="info-item"><span>Período</span><strong>{formatRange(nextReservation.start_date,nextReservation.end_date)}</strong></div>
                  <div className="info-item"><span>Pessoas</span><strong>{nextReservation.guests_confirmed ?? nextReservation.guests_estimated}</strong></div>
                  <div className="info-item"><span>Cardápio</span><strong>{nextReservation.package_name}</strong></div>
                </div>
              ) : <div className="empty">Nenhum evento confirmado.</div>}
            </div>
          </section>
        </div>
      </div>

      <section className="panel" style={{marginTop:18}}>
        <div className="panel-header"><div><h3 className="panel-title">Agenda do mês</h3><p className="panel-subtitle">Visualize rapidamente reservas e períodos bloqueados.</p></div></div>
        <div className="panel-body"><MonthCalendar reservations={reservations} blockedPeriods={blockedPeriods} /></div>
      </section>
    </main>
  );
}

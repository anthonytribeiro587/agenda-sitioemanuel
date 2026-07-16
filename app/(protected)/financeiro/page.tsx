"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDollarSign, PiggyBank, ReceiptText, WalletCards } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency, formatDate, paymentTotal, reservationBalance } from "@/lib/format";

export default function FinanceiroPage() {
  const { reservations } = useAgenda();
  const active = reservations.filter((item) => ["PRE_RESERVA", "CONFIRMADA"].includes(item.status));
  const withConfirmedTotal = active.filter((item) => Number(item.total_amount) > 0);
  const contracted = withConfirmedTotal.reduce((total, item) => total + Number(item.total_amount), 0);
  const received = reservations.reduce((total, item) => total + paymentTotal(item.payments), 0);
  const receivable = withConfirmedTotal.reduce((total, item) => total + reservationBalance(item), 0);
  const cancelledWithReceipts = reservations
    .filter((item) => item.status === "CANCELADA" && paymentTotal(item.payments) > 0)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const cancelledReceived = cancelledWithReceipts.reduce(
    (total, item) => total + paymentTotal(item.payments),
    0
  );
  const payments = reservations
    .flatMap((reservation) => (reservation.payments ?? []).filter((payment) => !payment.voided_at).map((payment) => ({ payment, reservation })))
    .sort((a, b) => b.payment.payment_date.localeCompare(a.payment.payment_date));

  return (
    <main className="page">
      <div className="page-head compact-page-head">
        <div><span className="page-kicker"><WalletCards /> Controle financeiro</span><h2>Financeiro</h2><p>Sinais, pagamentos recebidos e saldos das reservas com valor final confirmado.</p></div>
      </div>

      <section className="panel compact-panel"><div className="panel-body"><div className="grid-3">
        <MetricCard label="Valores confirmados" value={formatCurrency(contracted)} helper="Somente reservas com total definido" icon={ReceiptText} />
        <MetricCard label="Total recebido" value={formatCurrency(received)} helper="Sinais e pagamentos registrados" icon={PiggyBank} />
        <MetricCard label="Saldo a receber" value={formatCurrency(receivable)} helper="Total confirmado menos pagamentos" icon={WalletCards} />
      </div></div></section>

      {cancelledWithReceipts.length ? (
        <section className="panel compact-panel financial-exception-panel">
          <div className="panel-header"><div><h3 className="panel-title">Canceladas com recebimentos</h3><p className="panel-subtitle">Esses valores não entram no saldo a receber e precisam de conferência de devolução, crédito ou retenção.</p></div><AlertTriangle /></div>
          <div className="panel-body">
            <div className="security-notice-inline"><AlertTriangle /> {cancelledWithReceipts.length} reserva(s) cancelada(s), total recebido de {formatCurrency(cancelledReceived)}.</div>
            <div className="reservation-list">
              {cancelledWithReceipts.map((reservation) => (
                <article className="reservation-card finance-card" key={reservation.id}>
                  <div><h3>{reservation.church_name}</h3><div className="reservation-meta"><span>{formatDate(reservation.start_date, "dd/MM/yyyy")}</span><span>Recebido: {formatCurrency(paymentTotal(reservation.payments))}</span><span>Cancelada</span></div></div>
                  <div className="reservation-finance"><strong>{formatCurrency(paymentTotal(reservation.payments))}</strong><span>conferir destino</span><Link href={`/reservas/${reservation.id}`} className="button button-secondary button-sm">Abrir <ArrowRight /></Link></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="finance-grid">
        <section className="panel compact-panel">
          <div className="panel-header"><div><h3 className="panel-title">Reservas em aberto</h3><p className="panel-subtitle">As reservas sem valor final continuam aparecendo, mas sem gerar saldo artificial.</p></div></div>
          <div className="panel-body">
            <div className="reservation-list">
              {active.length ? active.sort((a, b) => a.start_date.localeCompare(b.start_date)).map((reservation) => (
                <article className="reservation-card finance-card" key={reservation.id}>
                  <div><h3>{reservation.church_name}</h3><div className="reservation-meta"><span>{formatDate(reservation.start_date, "dd/MM/yyyy")}</span><span>Pago: {formatCurrency(paymentTotal(reservation.payments))}</span><span>{reservation.total_amount > 0 ? `Total: ${formatCurrency(reservation.total_amount)}` : "Total ainda não definido"}</span></div></div>
                  <div className="reservation-finance"><strong>{reservation.total_amount > 0 ? formatCurrency(reservationBalance(reservation)) : "A definir"}</strong><span>{reservation.total_amount > 0 ? "saldo" : "valor final"}</span><Link href={`/reservas/${reservation.id}`} className="button button-secondary button-sm">Abrir <ArrowRight /></Link></div>
                </article>
              )) : <div className="empty compact-empty">Nenhuma reserva financeira em aberto.</div>}
            </div>
          </div>
        </section>

        <section className="panel compact-panel">
          <div className="panel-header"><div><h3 className="panel-title">Últimos pagamentos</h3><p className="panel-subtitle">Sinais e demais recebimentos.</p></div></div>
          <div className="panel-body">
            {payments.length ? payments.slice(0, 10).map(({ payment, reservation }) => (
              <div key={payment.id} className="payment-row"><div><strong>{formatCurrency(payment.amount)}</strong><span>{reservation.church_name}</span></div><span>{formatDate(payment.payment_date, "dd/MM/yyyy")}<br />{payment.method}</span></div>
            )) : <div className="empty compact-empty"><CircleDollarSign />Nenhum pagamento registrado.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

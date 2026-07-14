"use client";

import Link from "next/link";
import { ArrowRight, CircleDollarSign, PiggyBank, ReceiptText, WalletCards } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency, formatDate, paymentTotal, reservationBalance } from "@/lib/format";

export default function FinanceiroPage() {
  const { reservations } = useAgenda();
  const active = reservations.filter((item)=>["PRE_RESERVA","CONFIRMADA"].includes(item.status));
  const contracted = active.reduce((total,item)=>total+Number(item.total_amount||0),0);
  const received = reservations.reduce((total,item)=>total+paymentTotal(item.payments),0);
  const receivable = active.reduce((total,item)=>total+reservationBalance(item),0);
  const payments = reservations.flatMap((reservation)=>(reservation.payments??[]).map((payment)=>({payment,reservation}))).sort((a,b)=>b.payment.payment_date.localeCompare(a.payment.payment_date));

  return <main className="page">
    <div className="page-head"><div><h2>Financeiro</h2><p>Acompanhe valores combinados, pagamentos recebidos e saldos pendentes.</p></div></div>
    <section className="panel"><div className="panel-body"><div className="grid-3"><MetricCard label="Contratado em aberto" value={formatCurrency(contracted)} helper="Pré-reservas e reservas confirmadas" icon={ReceiptText}/><MetricCard label="Total recebido" value={formatCurrency(received)} helper="Soma dos pagamentos registrados" icon={PiggyBank}/><MetricCard label="Saldo a receber" value={formatCurrency(receivable)} helper="Valor que ainda falta receber" icon={WalletCards}/></div></div></section>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Saldos por reserva</h3><p className="panel-subtitle">Eventos com valores ainda pendentes.</p></div></div><div className="panel-body"><div className="reservation-list">{active.sort((a,b)=>reservationBalance(b)-reservationBalance(a)).map((reservation)=><article className="reservation-card" key={reservation.id} style={{gridTemplateColumns:'minmax(0,1fr) auto'}}><div><h3>{reservation.church_name}</h3><div className="reservation-meta"><span>{formatDate(reservation.start_date)}</span><span>Total: {formatCurrency(reservation.total_amount)}</span><span>Pago: {formatCurrency(paymentTotal(reservation.payments))}</span></div></div><div className="reservation-finance"><strong>{formatCurrency(reservationBalance(reservation))}</strong><span>pendente</span><Link href={`/reservas/${reservation.id}`} className="button button-secondary button-sm" style={{marginTop:8}}>Abrir <ArrowRight /></Link></div></article>)}</div></div></section>
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Últimos pagamentos</h3><p className="panel-subtitle">Movimentações registradas recentemente.</p></div></div><div className="panel-body">{payments.length ? payments.slice(0,10).map(({payment,reservation})=><div key={payment.id} className="payment-row"><div><strong>{formatCurrency(payment.amount)}</strong><span style={{display:'block',marginTop:3}}>{reservation.church_name}</span></div><span>{formatDate(payment.payment_date)}<br/>{payment.method}</span></div>) : <div className="empty"><CircleDollarSign/>Nenhum pagamento registrado.</div>}</div></section>
    </div>
  </main>;
}

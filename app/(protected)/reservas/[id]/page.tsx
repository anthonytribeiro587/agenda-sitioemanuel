"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Save, WalletCards } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatCurrency,
  formatDate,
  formatRange,
  paymentTotal,
  reservationBalance,
  whatsappUrl,
} from "@/lib/format";
import type { PaymentMethod, ReservationStatus } from "@/lib/types";

export default function ReservationDetailsPage() {
  const params = useParams<{ id: string }>();
  const { reservations, loading, updateReservation, addPayment } = useAgenda();
  const reservation = useMemo(
    () => reservations.find((item) => item.id === params.id) ?? null,
    [params.id, reservations]
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading) return <main className="page"><div className="panel"><div className="panel-body">Carregando reserva...</div></div></main>;
  if (!reservation) return <main className="page"><div className="panel"><div className="panel-body"><div className="empty">Reserva não encontrada.</div></div></div></main>;

  const currentReservation = reservation;
  const paid = paymentTotal(currentReservation.payments);
  const balance = reservationBalance(currentReservation);

  async function changeStatus(status: ReservationStatus) {
    setSaving(true);
    try { await updateReservation(currentReservation.id, { status }); } finally { setSaving(false); }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await addPayment({
        reservation_id: currentReservation.id,
        amount: Number(amount),
        payment_date: date,
        method,
        notes,
      });
      setAmount("");
      setNotes("");
    } finally { setSaving(false); }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div style={{marginBottom:10}}><StatusBadge status={reservation.status} /></div>
          <h2>{reservation.church_name}</h2>
          <p>{formatRange(reservation.start_date, reservation.end_date)} • {reservation.contact_name}</p>
        </div>
        <div className="page-actions">
          <a className="button button-ghost" href={whatsappUrl(reservation)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
          {reservation.status === "PRE_RESERVA" ? <button className="button button-primary" onClick={()=>changeStatus("CONFIRMADA")} disabled={saving}><CheckCircle2 /> Confirmar</button> : null}
        </div>
      </div>

      <div className="detail-grid">
        <div style={{display:"grid",gap:18}}>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Dados da reserva</h3><p className="panel-subtitle">Tudo que foi combinado com o responsável.</p></div></div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item"><span>Responsável</span><strong>{reservation.contact_name}</strong></div>
                <div className="info-item"><span>WhatsApp</span><strong>{reservation.phone}</strong></div>
                <div className="info-item"><span>E-mail</span><strong>{reservation.email || "Não informado"}</strong></div>
                <div className="info-item"><span>Período</span><strong>{formatRange(reservation.start_date,reservation.end_date)}</strong></div>
                <div className="info-item"><span>Pessoas estimadas</span><strong>{reservation.guests_estimated}</strong></div>
                <div className="info-item"><span>Pessoas confirmadas</span><strong>{reservation.guests_confirmed ?? "A confirmar"}</strong></div>
                <div className="info-item"><span>Cardápio / pacote</span><strong>{reservation.package_name}</strong></div>
                <div className="info-item"><span>Cadastro</span><strong>{formatDate(reservation.created_at.slice(0,10))}</strong></div>
              </div>
              <div className="form-section" style={{marginTop:14}}><h3>Observações</h3><p style={{margin:0,color:"var(--muted)",lineHeight:1.65,fontSize:13}}>{reservation.notes || "Nenhuma observação registrada."}</p></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Pagamentos registrados</h3><p className="panel-subtitle">Histórico do sinal e das parcelas recebidas.</p></div></div>
            <div className="panel-body">
              {(reservation.payments ?? []).length ? reservation.payments?.sort((a,b)=>b.payment_date.localeCompare(a.payment_date)).map((payment)=><div key={payment.id} className="payment-row"><div><strong>{formatCurrency(payment.amount)}</strong><span style={{display:"block",marginTop:3}}>{formatDate(payment.payment_date)} • {payment.method}</span></div><span>{payment.notes || "Pagamento"}</span></div>) : <div className="empty"><WalletCards />Nenhum pagamento registrado.</div>}
            </div>
          </section>
        </div>

        <div style={{display:"grid",gap:18}}>
          <section className="panel">
            <div className="panel-body">
              <div className="finance-summary">
                <div style={{fontSize:12,color:"rgba(255,255,255,.68)",textTransform:"uppercase",letterSpacing:'.08em',fontWeight:800}}>Resumo financeiro</div>
                <div className="finance-summary-row"><span>Valor combinado</span><strong>{formatCurrency(reservation.total_amount)}</strong></div>
                <div className="finance-summary-row"><span>Total recebido</span><strong>{formatCurrency(paid)}</strong></div>
                <div className="finance-summary-row total"><span>Saldo pendente</span><strong>{formatCurrency(balance)}</strong></div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Registrar pagamento</h3><p className="panel-subtitle">O saldo é atualizado automaticamente.</p></div></div>
            <div className="panel-body">
              <form onSubmit={submitPayment} className="form-grid" style={{gridTemplateColumns:"1fr"}}>
                <label className="field"><span className="label">Valor recebido</span><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} required /></label>
                <label className="field"><span className="label">Data</span><input className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} required /></label>
                <label className="field"><span className="label">Forma</span><select className="select" value={method} onChange={(e)=>setMethod(e.target.value as PaymentMethod)}><option>PIX</option><option>DINHEIRO</option><option>CARTAO</option><option>TRANSFERENCIA</option><option>OUTRO</option></select></label>
                <label className="field"><span className="label">Observação</span><input className="input" value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Ex.: sinal inicial" /></label>
                <button className="button button-primary" disabled={saving}><Save /> {saving ? "Salvando..." : "Registrar pagamento"}</button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Alterar situação</h3><p className="panel-subtitle">Atualize o andamento do evento.</p></div></div>
            <div className="panel-body"><div className="form-grid" style={{gridTemplateColumns:"1fr"}}><select className="select" value={reservation.status} onChange={(e)=>changeStatus(e.target.value as ReservationStatus)} disabled={saving}><option value="PRE_RESERVA">Pré-reserva</option><option value="CONFIRMADA">Confirmada</option><option value="REALIZADA">Realizada</option><option value="CANCELADA">Cancelada</option></select></div></div>
          </section>
        </div>
      </div>
    </main>
  );
}

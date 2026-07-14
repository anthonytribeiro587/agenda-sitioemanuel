"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  const [combinedValues, setCombinedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  if (loading) {
    return (
      <main className="page reservation-detail-page">
        <div className="panel"><div className="panel-body">Carregando reserva...</div></div>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="page reservation-detail-page">
        <div className="panel"><div className="panel-body"><div className="empty">Reserva não encontrada.</div></div></div>
      </main>
    );
  }

  const currentReservation = reservation;
  const paid = paymentTotal(currentReservation.payments);
  const hasCombinedValue = currentReservation.total_amount > 0;
  const balance = reservationBalance(currentReservation);
  const combinedValue = combinedValues[currentReservation.id] ?? (currentReservation.total_amount > 0 ? String(currentReservation.total_amount) : "");

  async function changeStatus(status: ReservationStatus) {
    setSaving(true);
    setFeedback("");
    try {
      await updateReservation(currentReservation.id, { status });
      setFeedback("Situação atualizada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível alterar a situação.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCombinedValue(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(combinedValue || 0);

    if (value > 0 && value < paid) {
      setFeedback("O valor combinado não pode ser menor que o total já recebido.");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      await updateReservation(currentReservation.id, { total_amount: value });
      setFeedback(value > 0 ? "Valor combinado atualizado." : "Valor combinado removido.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o valor combinado.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

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
      setFeedback("Pagamento registrado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível registrar o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page reservation-detail-page">
      <div className="page-head reservation-detail-head">
        <div>
          <div className="detail-status"><StatusBadge status={currentReservation.status} /></div>
          <h2>{currentReservation.church_name}</h2>
          <p>{formatRange(currentReservation.start_date, currentReservation.end_date)} • {currentReservation.contact_name}</p>
        </div>

        <div className="page-actions">
          <a className="button button-ghost" href={whatsappUrl(currentReservation)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
          {currentReservation.status === "PRE_RESERVA" ? (
            <button className="button button-primary" onClick={() => changeStatus("CONFIRMADA")} disabled={saving}>
              <CheckCircle2 /> Confirmar
            </button>
          ) : null}
        </div>
      </div>

      {feedback ? <div className="detail-feedback">{feedback}</div> : null}

      <div className="detail-grid">
        <div className="detail-main-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Dados da reserva</h3>
                <p className="panel-subtitle">Tudo que foi combinado com o responsável.</p>
              </div>
            </div>

            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item"><span>Responsável</span><strong>{currentReservation.contact_name}</strong></div>
                <div className="info-item"><span>WhatsApp</span><strong>{currentReservation.phone}</strong></div>
                <div className="info-item"><span>E-mail</span><strong>{currentReservation.email || "Não informado"}</strong></div>
                <div className="info-item"><span>Período</span><strong>{formatRange(currentReservation.start_date, currentReservation.end_date)}</strong></div>
                <div className="info-item"><span>Pessoas estimadas</span><strong>{currentReservation.guests_estimated}</strong></div>
                <div className="info-item"><span>Pessoas confirmadas</span><strong>{currentReservation.guests_confirmed ?? "A confirmar"}</strong></div>
                <div className="info-item"><span>Cardápio / pacote</span><strong>{currentReservation.package_name}</strong></div>
                <div className="info-item"><span>Cadastro</span><strong>{formatDate(currentReservation.created_at.slice(0, 10))}</strong></div>
              </div>

              <div className="form-section detail-notes">
                <h3>Observações</h3>
                <p>{currentReservation.notes || "Nenhuma observação registrada."}</p>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Pagamentos registrados</h3>
                <p className="panel-subtitle">Histórico do sinal e das parcelas recebidas.</p>
              </div>
            </div>

            <div className="panel-body">
              {(currentReservation.payments ?? []).length ? (
                [...(currentReservation.payments ?? [])]
                  .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
                  .map((payment) => (
                    <div key={payment.id} className="payment-row">
                      <div>
                        <strong>{formatCurrency(payment.amount)}</strong>
                        <span>{formatDate(payment.payment_date)} • {payment.method}</span>
                      </div>
                      <span>{payment.notes || "Pagamento"}</span>
                    </div>
                  ))
              ) : (
                <div className="empty"><WalletCards />Nenhum pagamento registrado.</div>
              )}
            </div>
          </section>
        </div>

        <div className="detail-side-column">
          <section className="panel">
            <div className="panel-body">
              <div className="finance-summary">
                <div className="finance-summary-title">Resumo financeiro</div>
                <div className="finance-summary-row">
                  <span>Valor combinado</span>
                  <strong>{hasCombinedValue ? formatCurrency(currentReservation.total_amount) : "A definir"}</strong>
                </div>
                <div className="finance-summary-row">
                  <span>Total recebido</span>
                  <strong>{formatCurrency(paid)}</strong>
                </div>
                <div className="finance-summary-row total">
                  <span>Saldo pendente</span>
                  <strong>{hasCombinedValue ? formatCurrency(balance) : "A definir"}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Valor combinado</h3>
                <p className="panel-subtitle">Preencha quando o valor final do evento estiver definido.</p>
              </div>
            </div>
            <div className="panel-body">
              <form onSubmit={saveCombinedValue} className="single-column-form">
                <label className="field">
                  <span className="label">Valor final negociado</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={combinedValue}
                    onChange={(event) => setCombinedValues((current) => ({ ...current, [currentReservation.id]: event.target.value }))}
                    placeholder="Ex.: 12000,00"
                  />
                </label>
                <button className="button button-primary" disabled={saving}>
                  <Save /> {saving ? "Salvando..." : "Salvar valor combinado"}
                </button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Registrar pagamento</h3>
                <p className="panel-subtitle">O sinal e os demais recebimentos ficam no histórico.</p>
              </div>
            </div>

            <div className="panel-body">
              <form onSubmit={submitPayment} className="single-column-form">
                <label className="field">
                  <span className="label">Valor recebido</span>
                  <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                </label>
                <label className="field">
                  <span className="label">Data</span>
                  <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </label>
                <label className="field">
                  <span className="label">Forma</span>
                  <select className="select" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="TRANSFERENCIA">Transferência</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">Observação</span>
                  <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: sinal inicial" />
                </label>
                <button className="button button-primary" disabled={saving}>
                  <Save /> {saving ? "Salvando..." : "Registrar pagamento"}
                </button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Alterar situação</h3>
                <p className="panel-subtitle">Atualize o andamento do evento.</p>
              </div>
            </div>
            <div className="panel-body">
              <select
                className="select"
                value={currentReservation.status}
                onChange={(event) => changeStatus(event.target.value as ReservationStatus)}
                disabled={saving}
              >
                <option value="PRE_RESERVA">Pré-reserva</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="REALIZADA">Realizada</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

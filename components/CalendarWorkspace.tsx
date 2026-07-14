"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, format, nextFriday } from "date-fns";
import {
  Ban,
  CalendarCheck2,
  Check,
  Clock3,
  ExternalLink,
  MessageCircle,
  Save,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { MonthCalendar } from "@/components/MonthCalendar";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatCurrency,
  formatRange,
  paymentTotal,
  reservationBalance,
  whatsappUrl,
} from "@/lib/format";
import type { PaymentMethod, ReservationStatus } from "@/lib/types";

function initialWeekend() {
  const today = new Date();
  const friday = today.getDay() === 5 ? today : nextFriday(today);
  return {
    start: format(friday, "yyyy-MM-dd"),
    end: format(addDays(friday, 2), "yyyy-MM-dd"),
  };
}

const blankForm = {
  church_name: "",
  contact_name: "",
  phone: "",
  email: "",
  guests_estimated: "",
  package_name: "A definir",
  notes: "",
  deposit_amount: "",
  total_amount: "",
  payment_date: format(new Date(), "yyyy-MM-dd"),
  payment_method: "PIX" as PaymentMethod,
  status: "PRE_RESERVA" as ReservationStatus,
};

export function CalendarWorkspace() {
  const {
    reservations,
    blockedPeriods,
    createReservation,
    updateReservation,
    addPayment,
    addBlockedPeriod,
    removeBlockedPeriod,
  } = useAgenda();
  const initial = useMemo(() => initialWeekend(), []);
  const [selectedStart, setSelectedStart] = useState(initial.start);
  const [selectedEnd, setSelectedEnd] = useState(initial.end);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [mode, setMode] = useState<"reservation" | "block">("reservation");
  const [form, setForm] = useState(blankForm);
  const [blockReason, setBlockReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [confirmedTotal, setConfirmedTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;
  const selectedBlock = blockedPeriods.find((item) => item.id === selectedBlockId) ?? null;

  function updateForm<K extends keyof typeof blankForm>(key: K, value: (typeof blankForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function select(selection: {
    start: string;
    end: string;
    reservationId?: string;
    blockId?: string;
  }) {
    setSelectedStart(selection.start);
    setSelectedEnd(selection.end);
    setSelectedReservationId(selection.reservationId ?? null);
    setSelectedBlockId(selection.blockId ?? null);
    setMode("reservation");
    setMessage("");

    const reservation = reservations.find((item) => item.id === selection.reservationId);
    setConfirmedTotal(reservation?.total_amount ? String(reservation.total_amount) : "");
    setPaymentAmount("");
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const created = await createReservation({
        customer_id: null,
        church_name: form.church_name.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        start_date: selectedStart,
        end_date: selectedEnd,
        guests_estimated: Number(form.guests_estimated || 1),
        guests_confirmed: null,
        package_name: form.package_name.trim() || "A definir",
        total_amount: Number(form.total_amount || 0),
        status: form.status,
        notes: form.notes.trim(),
      });

      if (Number(form.deposit_amount) > 0) {
        await addPayment({
          reservation_id: created.id,
          amount: Number(form.deposit_amount),
          payment_date: form.payment_date,
          method: form.payment_method,
          notes: "Sinal da reserva",
        });
      }

      setSelectedReservationId(created.id);
      setForm(blankForm);
      setMessage("Reserva salva com sucesso.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível salvar a reserva.";
      setMessage(
        text.includes("overlap") || text.includes("conflict")
          ? "Este período já possui uma reserva ou bloqueio."
          : text
      );
    } finally {
      setSaving(false);
    }
  }

  async function block(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const created = await addBlockedPeriod({
        start_date: selectedStart,
        end_date: selectedEnd,
        reason: blockReason.trim(),
      });
      setSelectedBlockId(created.id);
      setBlockReason("");
      setMessage("Período bloqueado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível bloquear o período.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmReservation() {
    if (!selectedReservation) return;
    setSaving(true);
    try {
      await updateReservation(selectedReservation.id, { status: "CONFIRMADA" });
      setMessage("Reserva confirmada.");
    } finally {
      setSaving(false);
    }
  }

  async function saveFinancialUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedReservation) return;
    setSaving(true);
    setMessage("");
    try {
      if (confirmedTotal !== "") {
        await updateReservation(selectedReservation.id, { total_amount: Number(confirmedTotal) });
      }
      if (Number(paymentAmount) > 0) {
        await addPayment({
          reservation_id: selectedReservation.id,
          amount: Number(paymentAmount),
          payment_date: format(new Date(), "yyyy-MM-dd"),
          method: "PIX",
          notes: selectedReservation.payments?.length ? "Pagamento adicional" : "Sinal da reserva",
        });
        setPaymentAmount("");
      }
      setMessage("Valores atualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os valores.");
    } finally {
      setSaving(false);
    }
  }

  const periodLabel = formatRange(selectedStart, selectedEnd);

  return (
    <div className="workspace-grid">
      <section className="calendar-card">
        <MonthCalendar
          reservations={reservations}
          blockedPeriods={blockedPeriods}
          selectedStart={selectedStart}
          selectedEnd={selectedEnd}
          onSelect={select}
        />
      </section>

      <aside className="agenda-side-panel">
        <div className="selected-period">
          <span>Fim de semana selecionado</span>
          <strong>{periodLabel}</strong>
        </div>

        {message ? <div className={message.includes("sucesso") || message.includes("confirmada") || message.includes("atualizados") || message.includes("bloqueado") || message.includes("removido") ? "success-box" : "error-box"}>{message}</div> : null}

        {selectedReservation ? (
          <div className="side-panel-content">
            <div className="side-panel-heading">
              <div>
                <StatusBadge status={selectedReservation.status} />
                <h2>{selectedReservation.church_name}</h2>
                <p>{selectedReservation.contact_name}</p>
              </div>
              <CalendarCheck2 />
            </div>

            <div className="compact-info-grid">
              <div><span>Contato</span><strong>{selectedReservation.phone}</strong></div>
              <div><span>Pessoas</span><strong>{selectedReservation.guests_confirmed ?? selectedReservation.guests_estimated}</strong></div>
              <div><span>Cardápio</span><strong>{selectedReservation.package_name}</strong></div>
              <div><span>Recebido</span><strong>{formatCurrency(paymentTotal(selectedReservation.payments))}</strong></div>
            </div>

            <div className="side-actions">
              <a className="button button-secondary" href={whatsappUrl(selectedReservation)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
              <Link className="button button-secondary" href={`/reservas/${selectedReservation.id}`}>
                <ExternalLink /> Detalhes
              </Link>
              {selectedReservation.status === "PRE_RESERVA" ? (
                <button className="button button-primary" type="button" onClick={confirmReservation} disabled={saving}>
                  <Check /> Confirmar
                </button>
              ) : null}
            </div>

            <form className="mini-finance-form" onSubmit={saveFinancialUpdate}>
              <div className="mini-section-title">
                <WalletCards />
                <div><strong>Valores da reserva</strong><span>O total pode ser informado somente depois da negociação.</span></div>
              </div>
              <label className="field">
                <span className="label">Valor total confirmado</span>
                <input className="input" type="number" min="0" step="0.01" placeholder="Ainda não definido" value={confirmedTotal} onChange={(event) => setConfirmedTotal(event.target.value)} />
              </label>
              <label className="field">
                <span className="label">Novo pagamento / sinal</span>
                <input className="input" type="number" min="0" step="0.01" placeholder="R$ 0,00" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </label>
              {selectedReservation.total_amount > 0 ? (
                <div className="balance-line">
                  <span>Saldo restante</span>
                  <strong>{formatCurrency(reservationBalance(selectedReservation))}</strong>
                </div>
              ) : (
                <div className="pending-total-note"><Clock3 /> Total ainda não confirmado.</div>
              )}
              <button className="button button-primary" disabled={saving}>
                <Save /> {saving ? "Salvando..." : "Atualizar valores"}
              </button>
            </form>
          </div>
        ) : selectedBlock ? (
          <div className="side-panel-content">
            <div className="side-panel-heading blocked-heading">
              <div><span className="eyebrow">Período indisponível</span><h2>Data bloqueada</h2><p>{selectedBlock.reason}</p></div>
              <Ban />
            </div>
            <button
              className="button button-danger"
              type="button"
              onClick={async () => {
                await removeBlockedPeriod(selectedBlock.id);
                setSelectedBlockId(null);
                setMessage("Bloqueio removido.");
              }}
            >
              <Trash2 /> Remover bloqueio
            </button>
          </div>
        ) : (
          <div className="side-panel-content">
            <div className="mode-tabs">
              <button type="button" className={mode === "reservation" ? "active" : ""} onClick={() => setMode("reservation")}>Nova reserva</button>
              <button type="button" className={mode === "block" ? "active" : ""} onClick={() => setMode("block")}>Bloquear data</button>
            </div>

            {mode === "reservation" ? (
              <form onSubmit={create} className="calendar-reservation-form">
                <div className="form-intro">
                  <strong>Quem está agendando?</strong>
                  <span>Cadastre primeiro a pré-reserva e o sinal. O valor total pode ficar para depois.</span>
                </div>
                <div className="form-grid compact-form-grid">
                  <label className="field field-full"><span className="label">Igreja / grupo</span><input className="input" value={form.church_name} onChange={(event) => updateForm("church_name", event.target.value)} required /></label>
                  <label className="field"><span className="label">Responsável</span><input className="input" value={form.contact_name} onChange={(event) => updateForm("contact_name", event.target.value)} required /></label>
                  <label className="field"><span className="label">WhatsApp</span><input className="input" inputMode="tel" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} required /></label>
                  <label className="field"><span className="label">Pessoas estimadas</span><input className="input" type="number" min="1" value={form.guests_estimated} onChange={(event) => updateForm("guests_estimated", event.target.value)} required /></label>
                  <label className="field"><span className="label">Cardápio</span><input className="input" value={form.package_name} onChange={(event) => updateForm("package_name", event.target.value)} /></label>
                  <label className="field"><span className="label">Valor do sinal</span><input className="input" type="number" min="0" step="0.01" placeholder="R$ 0,00" value={form.deposit_amount} onChange={(event) => updateForm("deposit_amount", event.target.value)} /></label>
                  <label className="field"><span className="label">Data do sinal</span><input className="input" type="date" value={form.payment_date} onChange={(event) => updateForm("payment_date", event.target.value)} /></label>
                  <label className="field field-full"><span className="label">Valor total confirmado <em>opcional</em></span><input className="input" type="number" min="0" step="0.01" placeholder="Preencher quando o valor final for definido" value={form.total_amount} onChange={(event) => updateForm("total_amount", event.target.value)} /></label>
                  <label className="field field-full"><span className="label">Observações</span><textarea className="textarea compact-textarea" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Horários, necessidades especiais e detalhes combinados..." /></label>
                </div>
                <button className="button button-primary button-wide" disabled={saving}>
                  <Save /> {saving ? "Salvando..." : "Salvar pré-reserva"}
                </button>
              </form>
            ) : (
              <form onSubmit={block} className="calendar-reservation-form">
                <div className="form-intro"><strong>Bloquear este fim de semana</strong><span>Use para manutenção, eventos internos ou indisponibilidade.</span></div>
                <label className="field"><span className="label">Motivo</span><textarea className="textarea compact-textarea" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} required /></label>
                <button className="button button-primary button-wide" disabled={saving}><Ban /> Bloquear período</button>
              </form>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

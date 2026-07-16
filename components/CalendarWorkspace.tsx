"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  UserRoundSearch,
  WalletCards,
  X,
} from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  customer_id: "",
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
    customers,
    blockedPeriods,
    role,
    createReservationWithPayment,
    updateReservation,
    updateReservationFinancial,
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
  const [financialReason, setFinancialReason] = useState("");
  const [blockDeleteReason, setBlockDeleteReason] = useState("");
  const [blockDeleteOpen, setBlockDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;
  const selectedBlock = blockedPeriods.find((item) => item.id === selectedBlockId) ?? null;
  const canManageReservations = role === "ADMIN" || role === "GESTOR";
  const canManageFinance = role === "ADMIN" || role === "FINANCEIRO";

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modalOpen]);

  function updateForm<K extends keyof typeof blankForm>(key: K, value: (typeof blankForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    setForm((current) => customer ? {
      ...current,
      customer_id: customer.id,
      church_name: customer.organization,
      contact_name: customer.name,
      phone: customer.phone,
      email: customer.email,
    } : { ...current, customer_id: "" });
  }

  function openNewReservation() {
    if (!canManageReservations) return;
    const next = initialWeekend();
    setSelectedStart(next.start);
    setSelectedEnd(next.end);
    setSelectedReservationId(null);
    setSelectedBlockId(null);
    setMode("reservation");
    setForm(blankForm);
    setMessage("");
    setModalOpen(true);
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
    setFinancialReason("");
    if (!reservation && !selection.blockId) setForm(blankForm);
    setModalOpen(true);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (selectedEnd < selectedStart) {
      setMessage("A data final não pode ser anterior à data inicial.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (!canManageReservations) throw new Error("Seu perfil não pode criar reservas.");
      const totalAmount = canManageFinance ? Number(form.total_amount || 0) : 0;
      const depositAmount = canManageFinance ? Number(form.deposit_amount || 0) : 0;
      const result = await createReservationWithPayment(
        {
          customer_id: form.customer_id || null,
          church_name: form.church_name.trim(),
          contact_name: form.contact_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          start_date: selectedStart,
          end_date: selectedEnd,
          guests_estimated: Number(form.guests_estimated || 1),
          guests_confirmed: null,
          package_name: form.package_name.trim() || "A definir",
          total_amount: totalAmount,
          status: form.status,
          notes: form.notes.trim(),
        },
        depositAmount > 0
          ? {
              amount: depositAmount,
              payment_date: form.payment_date,
              method: form.payment_method,
              notes: "Sinal da reserva",
            }
          : null
      );
      const created = result.reservation;

      setSelectedReservationId(created.id);
      setSelectedBlockId(null);
      setForm(blankForm);
      setConfirmedTotal(created.total_amount ? String(created.total_amount) : "");
      setMessage("Reserva salva com sucesso.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível salvar a reserva.";
      setMessage(
        text.includes("overlap") || text.includes("conflict") || text.includes("CONFLICT")
          ? "Este período já possui uma reserva ou bloqueio."
          : text
      );
    } finally {
      setSaving(false);
    }
  }

  async function block(event: React.FormEvent) {
    event.preventDefault();
    if (selectedEnd < selectedStart) {
      setMessage("A data final não pode ser anterior à data inicial.");
      return;
    }
    if (!canManageReservations) {
      setMessage("Seu perfil não pode bloquear períodos.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const created = await addBlockedPeriod({
        start_date: selectedStart,
        end_date: selectedEnd,
        reason: blockReason.trim(),
      });
      setSelectedBlockId(created.id);
      setSelectedReservationId(null);
      setBlockReason("");
      setMessage("Período bloqueado.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível bloquear o período.";
      setMessage(text.includes("CONFLICT") || text.includes("conflict") ? "Este período já possui uma reserva ou bloqueio." : text);
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível confirmar a reserva.");
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
      if (!canManageFinance) throw new Error("Seu perfil não pode alterar valores financeiros.");
      const nextTotal = confirmedTotal === "" ? selectedReservation.total_amount : Number(confirmedTotal);
      const totalChanged = nextTotal !== selectedReservation.total_amount;
      await updateReservationFinancial(selectedReservation.id, {
        ...(totalChanged
          ? { total_amount: nextTotal, total_reason: financialReason.trim() }
          : {}),
        ...(Number(paymentAmount) > 0
          ? {
              payment: {
                amount: Number(paymentAmount),
                payment_date: format(new Date(), "yyyy-MM-dd"),
                method: "PIX",
                notes: selectedReservation.payments?.length ? "Pagamento adicional" : "Sinal da reserva",
              },
            }
          : {}),
      });
      setPaymentAmount("");
      setFinancialReason("");
      setMessage("Valores atualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os valores.");
    } finally {
      setSaving(false);
    }
  }

  const periodLabel = formatRange(selectedStart, selectedEnd);
  const successMessage = message.includes("sucesso") || message.includes("confirmada") || message.includes("atualizados") || message.includes("bloqueado") || message.includes("removido");

  return (
    <>
      <MonthCalendar
        reservations={reservations}
        blockedPeriods={blockedPeriods}
        selectedStart={selectedStart}
        selectedEnd={selectedEnd}
        onSelect={select}
        onNewReservation={openNewReservation}
        canCreate={canManageReservations}
      />

      {modalOpen && typeof document !== "undefined" ? createPortal(
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setModalOpen(false);
        }}>
          <section className="prototype-modal" role="dialog" aria-modal="true" aria-label="Gerenciar reserva">
            <header className="prototype-modal-header">
              <div>
                <span className="modal-kicker">{selectedReservation ? "Reserva cadastrada" : selectedBlock ? "Indisponibilidade" : "Agenda do sítio"}</span>
                <h2>{selectedReservation ? selectedReservation.church_name : selectedBlock ? "Período bloqueado" : "Nova reserva"}</h2>
                <p>{periodLabel}</p>
              </div>
              <button type="button" className="prototype-modal-close" onClick={() => setModalOpen(false)} aria-label="Fechar">
                <X />
              </button>
            </header>

            <div className="prototype-modal-body">
              {message ? <div className={successMessage ? "success-box" : "error-box"}>{message}</div> : null}

              {selectedReservation ? (
                <div className="prototype-reservation-modal-grid">
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
                        <ExternalLink /> Ver detalhes
                      </Link>
                      {canManageReservations && selectedReservation.status === "PRE_RESERVA" ? (
                        <button className="button button-primary" type="button" onClick={confirmReservation} disabled={saving}>
                          <Check /> Confirmar
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {canManageFinance ? (
                  <form className="mini-finance-form" onSubmit={saveFinancialUpdate}>
                    <div className="mini-section-title">
                      <WalletCards />
                      <div><strong>Financeiro</strong><span>Atualização rápida de valor e recebimento.</span></div>
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
                    {Number(confirmedTotal || 0) !== selectedReservation.total_amount ? (
                      <label className="field">
                        <span className="label">Motivo da alteração do valor</span>
                        <textarea className="textarea compact-textarea" maxLength={500} value={financialReason} onChange={(event) => setFinancialReason(event.target.value)} placeholder="Ex.: valor final confirmado com o cliente" />
                      </label>
                    ) : null}
                    <button className="button button-primary button-wide" disabled={saving || (Number(confirmedTotal || 0) !== selectedReservation.total_amount && financialReason.trim().length < 5)}>
                      <Save /> {saving ? "Salvando..." : "Atualizar valores"}
                    </button>
                  </form>
                  ) : <div className="permission-note">Seu perfil possui acesso somente para consulta.</div>}
                </div>
              ) : selectedBlock ? (
                <div className="side-panel-content">
                  <div className="side-panel-heading blocked-heading">
                    <div><span className="eyebrow">Período indisponível</span><h2>Data bloqueada</h2><p>{selectedBlock.reason}</p></div>
                    <Ban />
                  </div>
                  {canManageReservations ? (
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => { setBlockDeleteReason(""); setBlockDeleteOpen(true); }}
                    >
                      <Trash2 /> Remover bloqueio
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mode-tabs">
                    <button type="button" className={mode === "reservation" ? "active" : ""} onClick={() => setMode("reservation")}>Nova reserva</button>
                    <button type="button" className={mode === "block" ? "active" : ""} onClick={() => setMode("block")}>Bloquear data</button>
                  </div>

                  <div className="calendar-period-fields">
                    <label className="field"><span className="label">Data inicial</span><input className="input" type="date" value={selectedStart} onChange={(event) => { setSelectedStart(event.target.value); if (selectedEnd < event.target.value) setSelectedEnd(event.target.value); }} required /></label>
                    <label className="field"><span className="label">Data final</span><input className="input" type="date" min={selectedStart} value={selectedEnd} onChange={(event) => setSelectedEnd(event.target.value)} required /></label>
                  </div>

                  {mode === "reservation" ? (
                    <form onSubmit={create} className="calendar-reservation-form">
                      <div className="form-intro">
                        <strong>Dados da pré-reserva</strong>
                        <span>Use um cliente existente ou preencha um novo contato.</span>
                      </div>
                      <div className="form-grid compact-form-grid">
                        <label className="field field-full customer-select-field"><span className="label"><UserRoundSearch /> Cliente cadastrado <em>opcional</em></span><select className="select" value={form.customer_id} onChange={(event) => applyCustomer(event.target.value)}><option value="">Preencher novo contato</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.organization} — {customer.name}</option>)}</select></label>
                        <label className="field field-full"><span className="label">Igreja / grupo</span><input className="input" value={form.church_name} onChange={(event) => updateForm("church_name", event.target.value)} required /></label>
                        <label className="field"><span className="label">Responsável</span><input className="input" value={form.contact_name} onChange={(event) => updateForm("contact_name", event.target.value)} required /></label>
                        <label className="field"><span className="label">WhatsApp</span><input className="input" inputMode="tel" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} required /></label>
                        <label className="field"><span className="label">E-mail <em>opcional</em></span><input className="input" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} /></label>
                        <label className="field"><span className="label">Pessoas estimadas</span><input className="input" type="number" min="1" max="500" value={form.guests_estimated} onChange={(event) => updateForm("guests_estimated", event.target.value)} required /></label>
                        <label className="field"><span className="label">Cardápio / pacote</span><input className="input" value={form.package_name} onChange={(event) => updateForm("package_name", event.target.value)} /></label>
                        <label className="field"><span className="label">Situação inicial</span><select className="select" value={form.status} onChange={(event) => updateForm("status", event.target.value as ReservationStatus)}><option value="PRE_RESERVA">Pré-reserva</option><option value="CONFIRMADA">Confirmada</option></select></label>
                        {canManageFinance ? (
                          <>
                            <label className="field"><span className="label">Valor do sinal</span><input className="input" type="number" min="0" step="0.01" placeholder="R$ 0,00" value={form.deposit_amount} onChange={(event) => updateForm("deposit_amount", event.target.value)} /></label>
                            <label className="field"><span className="label">Data do sinal</span><input className="input" type="date" value={form.payment_date} onChange={(event) => updateForm("payment_date", event.target.value)} /></label>
                            <label className="field"><span className="label">Forma do sinal</span><select className="select" value={form.payment_method} onChange={(event) => updateForm("payment_method", event.target.value as PaymentMethod)}><option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="CARTAO">Cartão</option><option value="TRANSFERENCIA">Transferência</option><option value="OUTRO">Outro</option></select></label>
                            <label className="field"><span className="label">Valor total <em>opcional</em></span><input className="input" type="number" min="0" step="0.01" placeholder="Pode ser definido depois" value={form.total_amount} onChange={(event) => updateForm("total_amount", event.target.value)} /></label>
                          </>
                        ) : null}
                        <label className="field field-full"><span className="label">Observações</span><textarea className="textarea compact-textarea" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Horários, necessidades especiais e detalhes combinados..." /></label>
                      </div>
                      <button className="button button-primary button-wide" disabled={saving}>
                        <Save /> {saving ? "Salvando..." : form.status === "CONFIRMADA" ? "Salvar reserva" : "Salvar pré-reserva"}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={block} className="calendar-reservation-form">
                      <div className="form-intro"><strong>Bloquear este período</strong><span>Use para manutenção, eventos internos ou indisponibilidade.</span></div>
                      <label className="field"><span className="label">Motivo</span><textarea className="textarea compact-textarea" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} required /></label>
                      <button className="button button-primary button-wide" disabled={saving}><Ban /> Bloquear período</button>
                    </form>
                  )}
                </>
              )}
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      <ConfirmDialog
        open={blockDeleteOpen && selectedBlock !== null}
        title="Remover este bloqueio?"
        description="A data voltará a ficar disponível. Informe o motivo para preservar a trilha de auditoria."
        confirmLabel="Remover bloqueio"
        busy={saving}
        confirmDisabled={blockDeleteReason.trim().length < 5}
        onCancel={() => { setBlockDeleteOpen(false); setBlockDeleteReason(""); }}
        onConfirm={async () => {
          if (!selectedBlock) return;
          setSaving(true);
          try {
            await removeBlockedPeriod(selectedBlock.id, blockDeleteReason.trim());
            setSelectedBlockId(null);
            setBlockDeleteOpen(false);
            setBlockDeleteReason("");
            setMessage("Bloqueio removido.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Não foi possível remover o bloqueio.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="field">
          <span className="label">Motivo da remoção</span>
          <textarea className="textarea" maxLength={500} value={blockDeleteReason} onChange={(event) => setBlockDeleteReason(event.target.value)} placeholder="Ex.: manutenção cancelada" autoFocus />
        </label>
      </ConfirmDialog>
    </>
  );
}

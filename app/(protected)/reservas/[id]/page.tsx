"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Edit3,
  History,
  MessageCircle,
  Printer,
  Save,
  Trash2,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import type { PaymentMethod, Reservation, ReservationStatus } from "@/lib/types";

type DetailTab = "resumo" | "financeiro" | "dados" | "historico";
type PendingAction = "cancel" | "delete" | null;

type ReservationDraft = {
  church_name: string;
  contact_name: string;
  phone: string;
  email: string;
  start_date: string;
  end_date: string;
  guests_estimated: string;
  guests_confirmed: string;
  package_name: string;
  total_amount: string;
  notes: string;
};

function draftFromReservation(reservation: Reservation): ReservationDraft {
  return {
    church_name: reservation.church_name,
    contact_name: reservation.contact_name,
    phone: reservation.phone,
    email: reservation.email,
    start_date: reservation.start_date,
    end_date: reservation.end_date,
    guests_estimated: String(reservation.guests_estimated),
    guests_confirmed: reservation.guests_confirmed ? String(reservation.guests_confirmed) : "",
    package_name: reservation.package_name,
    total_amount: reservation.total_amount > 0 ? String(reservation.total_amount) : "",
    notes: reservation.notes,
  };
}

const tabs: Array<{ value: DetailTab; label: string; icon: typeof CalendarDays }> = [
  { value: "resumo", label: "Resumo", icon: CalendarDays },
  { value: "financeiro", label: "Financeiro", icon: CircleDollarSign },
  { value: "dados", label: "Dados", icon: Edit3 },
  { value: "historico", label: "Histórico", icon: History },
];

export default function ReservationDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    reservations,
    loading,
    role,
    updateReservation,
    deleteReservation,
    addPayment,
    deletePayment,
  } = useAgenda();

  const reservation = useMemo(
    () => reservations.find((item) => item.id === params.id) ?? null,
    [params.id, reservations]
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("resumo");
  const [drafts, setDrafts] = useState<Record<string, ReservationDraft>>({});
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [financialReason, setFinancialReason] = useState("");
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [paymentVoidReason, setPaymentVoidReason] = useState("");

  const historyItems = useMemo(() => {
    if (!reservation) return [];

    const paymentItems = (reservation.payments ?? []).map((payment) => ({
      id: `payment-${payment.id}`,
      date: (payment.voided_at ?? payment.payment_date).slice(0, 10),
      title: payment.voided_at
        ? `${formatCurrency(payment.amount)} anulado`
        : `${formatCurrency(payment.amount)} recebido`,
      description: payment.voided_at
        ? `Motivo: ${payment.void_reason || "Não informado"}`
        : `${payment.method}${payment.notes ? ` • ${payment.notes}` : ""}`,
      tone: payment.voided_at ? ("status" as const) : ("payment" as const),
    }));

    return [
      {
        id: "created",
        date: reservation.created_at.slice(0, 10),
        title: "Reserva cadastrada",
        description: `Pré-reserva criada para ${reservation.church_name}.`,
        tone: "created" as const,
      },
      ...paymentItems,
      {
        id: "status",
        date: reservation.updated_at.slice(0, 10),
        title: "Situação atualizada",
        description: `Situação atual: ${reservation.status.replace("_", " ").toLowerCase()}.`,
        tone: "status" as const,
      },
    ].sort((a, b) => b.date.localeCompare(a.date));
  }, [reservation]);

  if (loading) {
    return (
      <main className="page reservation-detail-page">
        <div className="detail-skeleton">
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="skeleton-card" />
        </div>
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
  const draft = drafts[currentReservation.id] ?? draftFromReservation(currentReservation);
  const paid = paymentTotal(currentReservation.payments);
  const hasCombinedValue = currentReservation.total_amount > 0;
  const balance = reservationBalance(currentReservation);
  const canManageReservations = role === "ADMIN" || role === "GESTOR";
  const canManageFinance = role === "ADMIN" || role === "FINANCEIRO";
  const canDeleteReservation = role === "ADMIN";
  const visibleTabs = tabs.filter((tab) => tab.value !== "dados" || canManageReservations);

  function updateDraft<K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [currentReservation.id]: { ...draft, [key]: value },
    }));
  }

  async function changeStatus(status: ReservationStatus) {
    if (!canManageReservations) {
      setFeedback("Seu perfil não pode alterar a situação da reserva.");
      return;
    }
    if (status === "CANCELADA") {
      setCancelReason("");
      setPendingAction("cancel");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await updateReservation(currentReservation.id, { status });
      setFeedback("Situação atualizada com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível alterar a situação.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCombinedValue(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(draft.total_amount || 0);

    if (value > 0 && value < paid) {
      setFeedback("O valor combinado não pode ser menor que o total já recebido.");
      return;
    }

    if (!canManageFinance) {
      setFeedback("Seu perfil não pode alterar valores financeiros.");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      await updateReservation(currentReservation.id, { total_amount: value }, {
        reason: financialReason.trim(),
      });
      setFinancialReason("");
      setFeedback(value > 0 ? "Valor combinado atualizado." : "Valor combinado removido.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o valor combinado.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReservationData(event: React.FormEvent) {
    event.preventDefault();

    if (!canManageReservations) {
      setFeedback("Seu perfil não pode editar os dados da reserva.");
      return;
    }

    if (draft.end_date < draft.start_date) {
      setFeedback("A data final não pode ser anterior à data inicial.");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      await updateReservation(currentReservation.id, {
        customer_id: currentReservation.customer_id,
        church_name: draft.church_name.trim(),
        contact_name: draft.contact_name.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        start_date: draft.start_date,
        end_date: draft.end_date,
        guests_estimated: Number(draft.guests_estimated || 1),
        guests_confirmed: draft.guests_confirmed ? Number(draft.guests_confirmed) : null,
        package_name: draft.package_name.trim() || "A definir",
        notes: draft.notes.trim(),
      });
      setFeedback("Dados da reserva atualizados.");
      setActiveTab("resumo");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível editar a reserva.";
      setFeedback(message.includes("overlap") ? "O novo período entra em conflito com outra reserva." : message);
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!canManageFinance) {
      setFeedback("Seu perfil não pode registrar pagamentos.");
      return;
    }
    setSaving(true);
    setFeedback("");

    try {
      await addPayment({
        reservation_id: currentReservation.id,
        amount: Number(amount),
        payment_date: date,
        method,
        notes: notes.trim(),
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

  async function confirmPendingAction() {
    if (!pendingAction) return;
    setSaving(true);
    setFeedback("");

    try {
      if (pendingAction === "cancel") {
        await updateReservation(
          currentReservation.id,
          { status: "CANCELADA" },
          { reason: cancelReason.trim() }
        );
        setFeedback("Reserva cancelada. O período voltou a ficar disponível.");
        setPendingAction(null);
        setCancelReason("");
        return;
      }

      await deleteReservation(currentReservation.id, deleteReason.trim());
      router.replace("/reservas");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
      setPendingAction(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeletePayment() {
    if (!paymentToDelete) return;
    setSaving(true);
    try {
      await deletePayment(
        paymentToDelete,
        currentReservation.id,
        paymentVoidReason.trim()
      );
      setFeedback("Pagamento anulado e preservado na auditoria.");
      setPaymentToDelete(null);
      setPaymentVoidReason("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível remover o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page reservation-detail-page modern-detail-page">
      <header className="modern-detail-header">
        <div className="modern-detail-title">
          <Link href="/reservas" className="detail-back-link"><ArrowLeft /> Voltar para reservas</Link>
          <div className="detail-title-status"><StatusBadge status={currentReservation.status} /></div>
          <h1>{currentReservation.church_name}</h1>
          <p>{formatRange(currentReservation.start_date, currentReservation.end_date)} • {currentReservation.contact_name}</p>
        </div>

        <div className="modern-detail-actions">
          <button className="button button-secondary" type="button" onClick={() => window.print()}>
            <Printer /> Imprimir / PDF
          </button>
          <a className="button button-secondary" href={whatsappUrl(currentReservation)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
          {canManageReservations ? (
            <button className="button button-secondary" type="button" onClick={() => setActiveTab("dados")}>
              <Edit3 /> Editar
            </button>
          ) : null}
          {canManageReservations && currentReservation.status === "PRE_RESERVA" ? (
            <button className="button button-primary" type="button" onClick={() => void changeStatus("CONFIRMADA")} disabled={saving}>
              <CheckCircle2 /> Confirmar
            </button>
          ) : null}
        </div>
      </header>

      {feedback ? <div className="detail-feedback" role="status">{feedback}</div> : null}

      <nav className="detail-tabs" aria-label="Seções da reserva">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.value}
              className={activeTab === tab.value ? "active" : ""}
              onClick={() => setActiveTab(tab.value)}
            >
              <Icon /> {tab.label}
            </button>
          );
        })}
      </nav>

      <section className="detail-tab-content">
        {activeTab === "resumo" ? (
          <div className="summary-layout">
            <div className="summary-main">
              <div className="detail-metrics">
                <article className="detail-metric">
                  <span>Valor combinado</span>
                  <strong>{hasCombinedValue ? formatCurrency(currentReservation.total_amount) : "A definir"}</strong>
                </article>
                <article className="detail-metric">
                  <span>Total recebido</span>
                  <strong>{formatCurrency(paid)}</strong>
                </article>
                <article className="detail-metric emphasis">
                  <span>Saldo pendente</span>
                  <strong>{hasCombinedValue ? formatCurrency(balance) : "A definir"}</strong>
                </article>
              </div>

              <section className="detail-section-card">
                <div className="detail-section-heading">
                  <UserRound />
                  <div><h2>Contato e evento</h2><p>Informações principais para o atendimento.</p></div>
                </div>
                <div className="summary-info-grid">
                  <div><span>Responsável</span><strong>{currentReservation.contact_name}</strong></div>
                  <div><span>WhatsApp</span><strong>{currentReservation.phone}</strong></div>
                  <div><span>E-mail</span><strong>{currentReservation.email || "Não informado"}</strong></div>
                  <div><span>Período</span><strong>{formatRange(currentReservation.start_date, currentReservation.end_date)}</strong></div>
                  <div><span>Pessoas estimadas</span><strong>{currentReservation.guests_estimated}</strong></div>
                  <div><span>Pessoas confirmadas</span><strong>{currentReservation.guests_confirmed ?? "A confirmar"}</strong></div>
                  <div><span>Cardápio / pacote</span><strong>{currentReservation.package_name || "A definir"}</strong></div>
                  <div><span>Cadastrada em</span><strong>{formatDate(currentReservation.created_at.slice(0, 10))}</strong></div>
                </div>
              </section>

              <section className="detail-section-card detail-observation-card">
                <div className="detail-section-heading">
                  <Clock3 />
                  <div><h2>Observações</h2><p>Detalhes importantes combinados com o grupo.</p></div>
                </div>
                <p>{currentReservation.notes || "Nenhuma observação registrada."}</p>
              </section>
            </div>

            <aside className="summary-side">
              <section className="detail-section-card quick-status-card">
                <h2>Situação da reserva</h2>
                <p>Atualize o andamento sem precisar editar todos os dados.</p>
                <select
                  className="select"
                  value={currentReservation.status}
                  onChange={(event) => void changeStatus(event.target.value as ReservationStatus)}
                  disabled={saving || !canManageReservations}
                >
                  <option value={currentReservation.status}>
                    {currentReservation.status === "PRE_RESERVA" ? "Pré-reserva" : currentReservation.status === "CONFIRMADA" ? "Confirmada" : currentReservation.status === "REALIZADA" ? "Realizada" : "Cancelada"}
                  </option>
                  {currentReservation.status === "PRE_RESERVA" ? <option value="CONFIRMADA">Confirmada</option> : null}
                  {currentReservation.status === "CONFIRMADA" ? <option value="REALIZADA">Realizada</option> : null}
                </select>
              </section>

              <section className="detail-section-card quick-actions-card">
                <h2>Ações rápidas</h2>
                {canManageFinance ? (
                  <button className="quick-detail-action" type="button" onClick={() => setActiveTab("financeiro")}>
                    <WalletCards /><span><strong>Registrar pagamento</strong><small>Adicionar sinal ou parcela.</small></span>
                  </button>
                ) : null}
                {canManageReservations ? (
                  <button className="quick-detail-action" type="button" onClick={() => setActiveTab("dados")}>
                    <Edit3 /><span><strong>Editar dados</strong><small>Datas, pessoas e informações.</small></span>
                  </button>
                ) : null}
                <button className="quick-detail-action" type="button" onClick={() => setActiveTab("historico")}>
                  <History /><span><strong>Ver histórico</strong><small>Pagamentos e alterações.</small></span>
                </button>
              </section>
            </aside>
          </div>
        ) : null}

        {activeTab === "financeiro" ? (
          <div className="finance-tab-layout">
            <section className="detail-section-card finance-overview-card">
              <div className="detail-section-heading">
                <CircleDollarSign />
                <div><h2>Resumo financeiro</h2><p>Valor negociado, recebimentos e saldo.</p></div>
              </div>
              <div className="finance-big-summary">
                <div><span>Combinado</span><strong>{hasCombinedValue ? formatCurrency(currentReservation.total_amount) : "A definir"}</strong></div>
                <div><span>Recebido</span><strong>{formatCurrency(paid)}</strong></div>
                <div className="balance"><span>Saldo</span><strong>{hasCombinedValue ? formatCurrency(balance) : "A definir"}</strong></div>
              </div>
              {canManageFinance ? (
                <form className="compact-finance-form" onSubmit={saveCombinedValue}>
                  <label className="field">
                    <span className="label">Valor final combinado</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={draft.total_amount}
                      onChange={(event) => updateDraft("total_amount", event.target.value)}
                      placeholder="Preencher após a negociação"
                    />
                  </label>
                  <label className="field">
                    <span className="label">Motivo da alteração</span>
                    <textarea
                      className="textarea compact-textarea"
                      value={financialReason}
                      maxLength={500}
                      onChange={(event) => setFinancialReason(event.target.value)}
                      placeholder="Ex.: valor final confirmado ou correção após conferência"
                    />
                  </label>
                  <button className="button button-primary" disabled={saving || financialReason.trim().length < 5}><Save /> Salvar valor</button>
                </form>
              ) : (
                <p className="permission-note">Apenas o administrador ou o financeiro pode alterar valores.</p>
              )}
            </section>

            <section className="detail-section-card payment-form-card">
              <div className="detail-section-heading">
                <WalletCards />
                <div><h2>Novo pagamento</h2><p>Registre o sinal ou qualquer valor recebido.</p></div>
              </div>
              {canManageFinance && currentReservation.status !== "CANCELADA" ? (
              <form onSubmit={submitPayment} className="payment-form-grid">
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
                <label className="field field-full">
                  <span className="label">Observação</span>
                  <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: sinal inicial" />
                </label>
                <button className="button button-primary field-full" disabled={saving}><Save /> Registrar pagamento</button>
              </form>
              ) : (
                <p className="permission-note">{currentReservation.status === "CANCELADA" ? "Reservas canceladas não aceitam novos pagamentos." : "Seu perfil possui acesso somente para consulta financeira."}</p>
              )}
            </section>

            <section className="detail-section-card payment-history-card">
              <div className="detail-section-heading">
                <History />
                <div><h2>Pagamentos registrados</h2><p>Histórico completo dos recebimentos.</p></div>
              </div>
              {(currentReservation.payments ?? []).length ? (
                <div className="modern-payment-list">
                  {[...(currentReservation.payments ?? [])]
                    .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
                    .map((payment) => (
                      <article className={`modern-payment-row ${payment.voided_at ? "voided" : ""}`} key={payment.id}>
                        <div className="payment-icon"><CircleDollarSign /></div>
                        <div className="payment-main"><strong>{formatCurrency(payment.amount)}</strong><span>{payment.voided_at ? `Anulado: ${payment.void_reason || "motivo não informado"}` : payment.notes || "Pagamento"}</span></div>
                        <div className="payment-meta"><strong>{formatDate(payment.payment_date)}</strong><span>{payment.voided_at ? "ANULADO" : payment.method}</span></div>
                        {canManageFinance && !payment.voided_at ? (
                          <button
                            className="icon-danger-button"
                            type="button"
                            onClick={() => { setPaymentVoidReason(""); setPaymentToDelete(payment.id); }}
                            aria-label="Anular pagamento"
                            title="Anular pagamento com registro de auditoria"
                          ><Trash2 /></button>
                        ) : null}
                      </article>
                    ))}
                </div>
              ) : (
                <div className="empty"><WalletCards />Nenhum pagamento registrado.</div>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "dados" ? (
          <div className="data-tab-layout">
            <form className="detail-section-card reservation-edit-form" onSubmit={saveReservationData}>
              <div className="detail-section-heading">
                <Edit3 />
                <div><h2>Editar reserva</h2><p>Atualize os dados sem perder o histórico financeiro.</p></div>
              </div>
              <div className="form-grid modern-form-grid">
                <label className="field field-full"><span className="label">Igreja / grupo</span><input className="input" value={draft.church_name} onChange={(event) => updateDraft("church_name", event.target.value)} required /></label>
                <label className="field"><span className="label">Responsável</span><input className="input" value={draft.contact_name} onChange={(event) => updateDraft("contact_name", event.target.value)} required /></label>
                <label className="field"><span className="label">WhatsApp</span><input className="input" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} required /></label>
                <label className="field"><span className="label">E-mail</span><input className="input" type="email" value={draft.email} onChange={(event) => updateDraft("email", event.target.value)} /></label>
                <label className="field"><span className="label">Cardápio / pacote</span><input className="input" value={draft.package_name} onChange={(event) => updateDraft("package_name", event.target.value)} /></label>
                <label className="field"><span className="label">Data inicial</span><input className="input" type="date" value={draft.start_date} onChange={(event) => updateDraft("start_date", event.target.value)} required /></label>
                <label className="field"><span className="label">Data final</span><input className="input" type="date" min={draft.start_date} value={draft.end_date} onChange={(event) => updateDraft("end_date", event.target.value)} required /></label>
                <label className="field"><span className="label">Pessoas estimadas</span><input className="input" type="number" min="1" max="500" value={draft.guests_estimated} onChange={(event) => updateDraft("guests_estimated", event.target.value)} required /></label>
                <label className="field"><span className="label">Pessoas confirmadas</span><input className="input" type="number" min="1" max="500" value={draft.guests_confirmed} onChange={(event) => updateDraft("guests_confirmed", event.target.value)} placeholder="Ainda não informado" /></label>
                <label className="field field-full"><span className="label">Observações</span><textarea className="textarea" value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} /></label>
              </div>
              <div className="edit-form-actions">
                <button className="button button-secondary" type="button" onClick={() => setDrafts((current) => {
                  const next = { ...current };
                  delete next[currentReservation.id];
                  return next;
                })}>Descartar alterações</button>
                <button className="button button-primary" disabled={saving}><Save /> Salvar alterações</button>
              </div>
            </form>

            <aside className="detail-section-card danger-zone">
              <h2>Gerenciar reserva</h2>
              <p>Cancelar mantém o histórico e libera a data. A exclusão é restrita ao administrador, somente para pré-reserva duplicada criada há menos de 24 horas e sem pagamentos.</p>
              {canManageReservations && currentReservation.status !== "CANCELADA" ? (
                <button className="button button-warning" type="button" onClick={() => { setCancelReason(""); setPendingAction("cancel"); }}>
                  <XCircle /> Cancelar reserva
                </button>
              ) : null}
              {canDeleteReservation ? (
                <button className="button button-danger" type="button" onClick={() => { setDeleteReason(""); setPendingAction("delete"); }}>
                  <Trash2 /> Excluir cadastro duplicado
                </button>
              ) : null}
            </aside>
          </div>
        ) : null}

        {activeTab === "historico" ? (
          <section className="detail-section-card history-tab-card">
            <div className="detail-section-heading">
              <History />
              <div><h2>Histórico da reserva</h2><p>Resumo cronológico do cadastro e dos recebimentos.</p></div>
            </div>
            <div className="history-timeline">
              {historyItems.map((item) => (
                <article className="history-item" key={item.id}>
                  <div className={`history-dot ${item.tone}`} />
                  <div><strong>{item.title}</strong><p>{item.description}</p></div>
                  <time>{formatDate(item.date)}</time>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "delete" ? "Excluir esta reserva?" : "Cancelar esta reserva?"}
        description={
          pendingAction === "delete"
            ? "Somente uma pré-reserva recente, duplicada e sem histórico financeiro pode ser excluída."
            : "A reserva continuará no histórico como cancelada. Informe o motivo para manter a trilha de auditoria."
        }
        confirmLabel={pendingAction === "delete" ? "Excluir reserva" : "Cancelar reserva"}
        tone={pendingAction === "delete" ? "danger" : "warning"}
        busy={saving}
        confirmDisabled={
          (pendingAction === "cancel" && cancelReason.trim().length < 5) ||
          (pendingAction === "delete" && deleteReason.trim().length < 5)
        }
        onCancel={() => { setPendingAction(null); setCancelReason(""); setDeleteReason(""); }}
        onConfirm={confirmPendingAction}
      >
        {pendingAction === "cancel" ? (
          <label className="field">
            <span className="label">Motivo do cancelamento</span>
            <textarea
              className="textarea"
              value={cancelReason}
              maxLength={500}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Ex.: cliente desistiu do período"
              autoFocus
            />
          </label>
        ) : pendingAction === "delete" ? (
          <label className="field">
            <span className="label">Motivo da exclusão</span>
            <textarea
              className="textarea"
              value={deleteReason}
              maxLength={500}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Ex.: pré-reserva criada em duplicidade"
              autoFocus
            />
          </label>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={paymentToDelete !== null}
        title="Anular este pagamento?"
        description="O lançamento não será apagado. Ele ficará anulado, com o motivo e o responsável preservados na auditoria."
        confirmLabel="Anular pagamento"
        busy={saving}
        confirmDisabled={paymentVoidReason.trim().length < 5}
        onCancel={() => { setPaymentToDelete(null); setPaymentVoidReason(""); }}
        onConfirm={confirmDeletePayment}
      >
        <label className="field">
          <span className="label">Motivo da anulação</span>
          <textarea
            className="textarea"
            value={paymentVoidReason}
            maxLength={500}
            onChange={(event) => setPaymentVoidReason(event.target.value)}
            placeholder="Ex.: lançamento duplicado ou valor informado incorretamente"
            autoFocus
          />
        </label>
      </ConfirmDialog>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CalendarPlus2,
  ChevronRight,
  Clock3,
  Edit3,
  FileText,
  History,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAgenda } from "@/components/AgendaProvider";
import { formatCurrency, formatRange, normalizePhone } from "@/lib/format";
import type { Customer, CustomerInput, Reservation, ReservationStatus } from "@/lib/types";

const emptyForm: CustomerInput = {
  name: "",
  organization: "",
  phone: "",
  email: "",
  notes: "",
};

const statusLabels: Record<ReservationStatus, string> = {
  PRE_RESERVA: "Pré-reserva",
  CONFIRMADA: "Confirmada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

function statusClass(status: ReservationStatus) {
  if (status === "CANCELADA") return "customer-history-status cancelled";
  if (status === "PRE_RESERVA") return "customer-history-status pending";
  return "customer-history-status";
}

function initials(customer: Customer) {
  const source = customer.organization.trim() || customer.name.trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function reservationPeople(reservation: Reservation) {
  return reservation.guests_confirmed ?? reservation.guests_estimated;
}

function historyForCustomer(reservations: Reservation[], customerId: string) {
  return reservations
    .filter((reservation) => reservation.customer_id === customerId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
}

export default function ClientesPage() {
  const {
    customers,
    reservations,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    refresh,
    role,
  } = useAgenda();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const canManageCustomers = role === "ADMIN" || role === "GESTOR";
  const canDeleteCustomers = role === "ADMIN";

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!formOpen && !detailCustomerId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [detailCustomerId, formOpen]);

  const reservationsByCustomer = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    reservations.forEach((reservation) => {
      if (!reservation.customer_id) return;
      const current = map.get(reservation.customer_id) ?? [];
      current.push(reservation);
      map.set(reservation.customer_id, current);
    });
    map.forEach((items) => items.sort((a, b) => b.start_date.localeCompare(a.start_date)));
    return map;
  }, [reservations]);

  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return customers.filter((customer) => {
      if (!normalized) return true;
      return [customer.name, customer.organization, customer.phone, customer.email]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [customers, deferredQuery]);

  const selectedCustomer =
    customers.find((customer) => customer.id === detailCustomerId) ?? null;
  const selectedHistory = selectedCustomer
    ? historyForCustomer(reservations, selectedCustomer.id)
    : [];
  const realizedHistory = selectedHistory.filter((reservation) => reservation.status === "REALIZADA");
  const lastRetreat = realizedHistory[0] ?? null;
  const totalParticipants = realizedHistory.reduce(
    (total, reservation) => total + reservationPeople(reservation),
    0
  );
  const realizedRevenue = realizedHistory.reduce(
    (total, reservation) => total + Number(reservation.total_amount || 0),
    0
  );
  const averagePerParticipant = totalParticipants > 0 ? realizedRevenue / totalParticipants : 0;
  const latestReservation = selectedHistory[0] ?? null;

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback("");
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setDetailCustomerId(null);
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      organization: customer.organization,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
    });
    setFeedback("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateField<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      if (editingId) {
        await updateCustomer(editingId, form);
        setFeedback("Cliente atualizado.");
      } else {
        await createCustomer(form);
        setFeedback("Cliente cadastrado.");
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setFeedback("");
    try {
      await deleteCustomer(deleteTarget.id, deleteReason.trim());
      setFeedback("Cliente removido com registro de auditoria.");
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível remover o cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page customers-page">
      <div className="page-head customers-head">
        <div>
          <h2>Clientes e históricos</h2>
          <p>Cada igreja ou grupo reúne seus contatos, pré-reservas e retiros em uma única ficha.</p>
        </div>
        {canManageCustomers ? (
          <div className="page-actions">
            <Link href="/agenda" className="button button-primary">
              <CalendarPlus2 /> Nova pré-reserva
            </Link>
            <button className="button button-secondary" type="button" onClick={openCreate}>
              <Plus /> Novo cliente
            </button>
          </div>
        ) : null}
      </div>

      <div className="customer-history-banner">
        <History />
        <div>
          <strong>O histórico começa na primeira pré-reserva.</strong>
          <span>
            Quando um grupo ainda não está cadastrado, o sistema cria a ficha do cliente e vincula
            automaticamente a nova reserva.
          </span>
        </div>
      </div>

      {feedback ? <div className="detail-feedback" role="status">{feedback}</div> : null}

      <section className="customers-toolbar">
        <label className="search customer-search">
          <Search />
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, igreja, telefone ou e-mail..."
          />
        </label>
        <div className="customer-total">
          <UserRound />
          <span><strong>{customers.length}</strong> cliente{customers.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      {filtered.length ? (
        <section className="customer-history-grid">
          {filtered.map((customer) => {
            const history = reservationsByCustomer.get(customer.id) ?? [];
            const completed = history.filter((reservation) => reservation.status === "REALIZADA");
            const last = completed[0] ?? history[0] ?? null;

            return (
              <article className="customer-history-card" key={customer.id}>
                <div className="customer-avatar">{initials(customer)}</div>
                <button
                  className="customer-history-card-main"
                  type="button"
                  onClick={() => setDetailCustomerId(customer.id)}
                >
                  <h3>{customer.organization}</h3>
                  <p>{customer.name}</p>
                  <div className="customer-history-card-meta">
                    <span><Phone />{customer.phone}</span>
                    <span><CalendarDays />{history.length} registro{history.length === 1 ? "" : "s"}</span>
                  </div>
                </button>

                <div className="customer-history-card-stats">
                  <div>
                    <span>Retiros realizados</span>
                    <strong>{completed.length}</strong>
                  </div>
                  <div>
                    <span>Último registro</span>
                    <strong>{last ? formatRange(last.start_date, last.end_date) : "Nenhum"}</strong>
                  </div>
                </div>

                <div className="customer-history-card-actions">
                  <button
                    className="customer-history-card-arrow"
                    type="button"
                    onClick={() => setDetailCustomerId(customer.id)}
                    aria-label={`Abrir histórico de ${customer.organization}`}
                  >
                    <ChevronRight />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="customers-empty">
          <UserRound />
          <h3>Nenhum cliente encontrado</h3>
          <p>Cadastre o primeiro contato ou altere os termos da busca.</p>
          {canManageCustomers ? (
            <button className="button button-primary" type="button" onClick={openCreate}>
              <Plus /> Novo cliente
            </button>
          ) : null}
        </div>
      )}

      {selectedCustomer ? (
        <div
          className="customer-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDetailCustomerId(null);
          }}
        >
          <section
            className="customer-history-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Histórico de ${selectedCustomer.organization}`}
          >
            <header className="customer-history-modal-header">
              <div>
                <small>Cliente e histórico</small>
                <h2>{selectedCustomer.organization}</h2>
                <p>{selectedCustomer.name} · {selectedCustomer.phone}</p>
              </div>
              <div className="customer-history-modal-actions">
                {canManageCustomers ? (
                  <>
                    <Link href="/agenda" className="button button-primary">
                      <CalendarPlus2 /> Nova reserva
                    </Link>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => openEdit(selectedCustomer)}
                    >
                      <Edit3 /> Editar ficha
                    </button>
                  </>
                ) : null}
                <button
                  className="confirm-close"
                  type="button"
                  onClick={() => setDetailCustomerId(null)}
                  aria-label="Fechar histórico"
                >
                  <X />
                </button>
              </div>
            </header>

            <div className="customer-history-modal-body">
              <div className="customer-history-metrics">
                <div className="customer-history-metric">
                  <CalendarDays />
                  <div><span>Retiros realizados</span><strong>{realizedHistory.length}</strong></div>
                </div>
                <div className="customer-history-metric">
                  <Clock3 />
                  <div><span>Último retiro</span><strong>{lastRetreat ? formatRange(lastRetreat.start_date, lastRetreat.end_date) : "Ainda não realizado"}</strong></div>
                </div>
                <div className="customer-history-metric">
                  <UsersRound />
                  <div><span>Total de participantes</span><strong>{totalParticipants}</strong></div>
                </div>
                <div className="customer-history-metric">
                  <WalletCards />
                  <div><span>Média por participante</span><strong>{formatCurrency(averagePerParticipant)}</strong></div>
                </div>
              </div>

              <div className="customer-history-layout">
                <section className="customer-history-panel">
                  <div className="customer-history-panel-head">
                    <h3>Histórico de reservas</h3>
                    <p>Pré-reservas, eventos confirmados, realizados e cancelados deste cliente.</p>
                  </div>
                  {selectedHistory.length ? (
                    <div className="customer-history-list">
                      {selectedHistory.map((reservation) => (
                        <Link
                          href={`/reservas/${reservation.id}`}
                          className="customer-history-entry"
                          key={reservation.id}
                        >
                          <div>
                            <strong>{formatRange(reservation.start_date, reservation.end_date)}</strong>
                            <small>{reservation.contact_name}</small>
                          </div>
                          <div>
                            <strong>{reservationPeople(reservation)}</strong>
                            <small>pessoas</small>
                          </div>
                          <div>
                            <strong>{reservation.package_name || "A definir"}</strong>
                            <small>{reservation.email || reservation.phone}</small>
                          </div>
                          <div>
                            <strong>{formatCurrency(reservation.total_amount)}</strong>
                            <small>valor combinado</small>
                          </div>
                          <div>
                            <span className={statusClass(reservation.status)}>
                              {statusLabels[reservation.status]}
                            </span>
                          </div>
                          {reservation.notes ? (
                            <p className="customer-history-entry-notes">{reservation.notes}</p>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="customer-history-empty">
                      O cliente está cadastrado, mas ainda não possui reservas vinculadas.
                    </div>
                  )}
                </section>

                <aside className="customer-history-aside">
                  <section className="customer-history-note-card">
                    <h3>Informações recorrentes</h3>
                    <div className="customer-history-note-item">
                      <FileText />
                      <div>
                        <strong>Observações da ficha</strong>
                        <span>{selectedCustomer.notes || "Nenhuma preferência recorrente registrada."}</span>
                      </div>
                    </div>
                    <div className="customer-history-note-item">
                      <UserRound />
                      <div>
                        <strong>Responsável principal</strong>
                        <span>{selectedCustomer.name}</span>
                      </div>
                    </div>
                    <div className="customer-history-note-item">
                      <Building2 />
                      <div>
                        <strong>Último pacote utilizado</strong>
                        <span>{latestReservation?.package_name || "Ainda não informado"}</span>
                      </div>
                    </div>
                  </section>

                  <section className="customer-history-note-card">
                    <h3>Contato</h3>
                    <div className="customer-history-note-item">
                      <Phone />
                      <div><strong>WhatsApp</strong><span>{selectedCustomer.phone}</span></div>
                    </div>
                    <div className="customer-history-note-item">
                      <Mail />
                      <div><strong>E-mail</strong><span>{selectedCustomer.email || "Não informado"}</span></div>
                    </div>
                    <a
                      className="button button-primary button-wide"
                      href={`https://wa.me/${normalizePhone(selectedCustomer.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle /> Abrir WhatsApp
                    </a>
                  </section>
                </aside>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {formOpen && canManageCustomers ? (
        <div
          className="customer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeForm();
          }}
        >
          <section
            className="customer-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? "Editar cliente" : "Novo cliente"}
          >
            <header className="customer-modal-header">
              <div>
                <span>{editingId ? "Atualizar contato" : "Novo contato"}</span>
                <h2>{editingId ? "Editar cliente" : "Cadastrar cliente"}</h2>
                <p>Dados da igreja, grupo ou responsável pelo evento.</p>
              </div>
              <button className="confirm-close" type="button" onClick={closeForm} aria-label="Fechar">
                <X />
              </button>
            </header>

            <form className="customer-modal-form" onSubmit={submit}>
              <div className="form-grid modern-form-grid">
                <label className="field">
                  <span className="label">Responsável</span>
                  <input className="input" value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
                </label>
                <label className="field">
                  <span className="label">Igreja / organização</span>
                  <input className="input" value={form.organization} onChange={(event) => updateField("organization", event.target.value)} required />
                </label>
                <label className="field">
                  <span className="label">WhatsApp</span>
                  <input className="input" inputMode="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
                </label>
                <label className="field">
                  <span className="label">E-mail</span>
                  <input className="input" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                </label>
                <label className="field field-full">
                  <span className="label">Observações recorrentes</span>
                  <textarea
                    className="textarea"
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    placeholder="Preferências de quartos, alimentação, horários e informações úteis para os próximos retiros..."
                  />
                </label>
              </div>
              <div className="customer-modal-actions">
                <button className="button button-secondary" type="button" onClick={closeForm}>Cancelar</button>
                <button className="button button-primary" disabled={saving}>
                  {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar cliente"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir este cliente?"
        description="A exclusão só é permitida para contatos sem reservas vinculadas e ficará registrada na auditoria."
        confirmLabel="Excluir cliente"
        busy={saving}
        confirmDisabled={deleteReason.trim().length < 5}
        onCancel={() => { setDeleteTarget(null); setDeleteReason(""); }}
        onConfirm={confirmDelete}
      >
        <label className="field">
          <span className="label">Motivo da exclusão</span>
          <textarea
            className="textarea"
            value={deleteReason}
            maxLength={500}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="Ex.: cadastro criado em duplicidade"
            autoFocus
          />
        </label>
      </ConfirmDialog>
    </main>
  );
}

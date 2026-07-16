"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  CalendarDays,
  Edit3,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAgenda } from "@/components/AgendaProvider";
import { normalizePhone } from "@/lib/format";
import type { Customer, CustomerInput } from "@/lib/types";

const emptyForm: CustomerInput = {
  name: "",
  organization: "",
  phone: "",
  email: "",
  notes: "",
};

export default function ClientesPage() {
  const {
    customers,
    reservations,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    role,
  } = useAgenda();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const canManageCustomers = role === "ADMIN" || role === "GESTOR";
  const canDeleteCustomers = role === "ADMIN";

  const reservationCountByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    reservations.forEach((reservation) => {
      if (!reservation.customer_id) return;
      counts.set(reservation.customer_id, (counts.get(reservation.customer_id) ?? 0) + 1);
    });
    return counts;
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

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback("");
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
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
          <h2>Clientes e igrejas</h2>
          <p>Contatos organizados para reutilizar nas próximas reservas.</p>
        </div>
        {canManageCustomers ? (
          <div className="page-actions">
            <button className="button button-primary" type="button" onClick={openCreate}>
              <Plus /> Novo cliente
            </button>
          </div>
        ) : null}
      </div>

      {feedback ? <div className="detail-feedback" role="status">{feedback}</div> : null}

      <section className="customers-toolbar">
        <label className="search customer-search">
          <Search />
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, igreja, telefone ou e-mail..."
          />
        </label>
        <div className="customer-total">
          <UserRound />
          <span><strong>{customers.length}</strong> contato{customers.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      {filtered.length ? (
        <section className="customer-card-grid">
          {filtered.map((customer) => {
            const reservationCount = reservationCountByCustomer.get(customer.id) ?? 0;
            return (
              <article className="customer-card" key={customer.id}>
                <div className="customer-card-top">
                  <div className="customer-avatar">{customer.organization.slice(0, 2).toUpperCase()}</div>
                  <div className="customer-title">
                    <h3>{customer.organization}</h3>
                    <p>{customer.name}</p>
                  </div>
                  {canManageCustomers ? (
                    <div className="customer-card-actions">
                      <button className="icon-action-button" type="button" onClick={() => openEdit(customer)} aria-label="Editar cliente">
                        <Edit3 />
                      </button>
                      {canDeleteCustomers ? (
                        <button className="icon-action-button danger" type="button" onClick={() => { setDeleteReason(""); setDeleteTarget(customer); }} aria-label="Excluir cliente">
                          <Trash2 />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="customer-contact-list">
                  <div><Phone /><span>{customer.phone}</span></div>
                  <div><Mail /><span>{customer.email || "Sem e-mail informado"}</span></div>
                  <div><CalendarDays /><span>{reservationCount} reserva{reservationCount === 1 ? "" : "s"}</span></div>
                </div>

                {customer.notes ? <p className="customer-notes">{customer.notes}</p> : null}

                <div className="customer-card-footer">
                  <a
                    className="button button-secondary button-sm"
                    href={`https://wa.me/${normalizePhone(customer.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> WhatsApp
                  </a>
                  {canManageCustomers ? (
                    <button className="button button-ghost button-sm" type="button" onClick={() => openEdit(customer)}>
                      <Edit3 /> Editar dados
                    </button>
                  ) : null}
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
          {canManageCustomers ? <button className="button button-primary" type="button" onClick={openCreate}><Plus /> Novo cliente</button> : null}
        </div>
      )}

      {formOpen && canManageCustomers ? (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeForm();
        }}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-label={editingId ? "Editar cliente" : "Novo cliente"}>
            <header className="customer-modal-header">
              <div>
                <span>{editingId ? "Atualizar contato" : "Novo contato"}</span>
                <h2>{editingId ? "Editar cliente" : "Cadastrar cliente"}</h2>
                <p>Dados da igreja, grupo ou responsável pelo evento.</p>
              </div>
              <button className="confirm-close" type="button" onClick={closeForm} aria-label="Fechar"><X /></button>
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
                  <span className="label">Observações</span>
                  <textarea className="textarea" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="Preferências, histórico e informações úteis..." />
                </label>
              </div>
              <div className="customer-modal-actions">
                <button className="button button-secondary" type="button" onClick={closeForm}>Cancelar</button>
                <button className="button button-primary" disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar cliente"}</button>
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

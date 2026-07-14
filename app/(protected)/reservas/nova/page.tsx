"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Save } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import type { ReservationStatus } from "@/lib/types";

const blank = {
  customer_id: null as string | null,
  church_name: "",
  contact_name: "",
  phone: "",
  email: "",
  start_date: "",
  end_date: "",
  guests_estimated: 40,
  guests_confirmed: null as number | null,
  package_name: "A definir",
  total_amount: 0,
  status: "PRE_RESERVA" as ReservationStatus,
  notes: "",
};

export default function NovaReservaPage() {
  const router = useRouter();
  const { customers, createReservation } = useAgenda();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) {
      update("customer_id", null);
      return;
    }
    setForm((current) => ({
      ...current,
      customer_id: customer.id,
      church_name: customer.organization,
      contact_name: customer.name,
      phone: customer.phone,
      email: customer.email,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createReservation(form);
      router.push(`/reservas/${created.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível criar a reserva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head"><div><h2>Nova reserva</h2><p>Cadastre o período, contato, quantidade de pessoas e condições financeiras.</p></div></div>
      <form onSubmit={submit} className="detail-grid">
        <section className="panel">
          <div className="panel-header"><div><h3 className="panel-title">Dados da reserva</h3><p className="panel-subtitle">As informações que hoje ficam no calendário e no caderno.</p></div></div>
          <div className="panel-body">
            {error ? <div className="error-box">{error}</div> : null}
            <div className="form-section">
              <h3>Cliente e responsável</h3>
              <div className="form-grid">
                <label className="field field-full"><span className="label">Usar cliente cadastrado</span><select className="select" value={form.customer_id ?? ""} onChange={(e)=>selectCustomer(e.target.value)}><option value="">Preencher manualmente</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.organization} — {customer.name}</option>)}</select></label>
                <label className="field"><span className="label">Igreja / grupo</span><input className="input" value={form.church_name} onChange={(e)=>update("church_name",e.target.value)} required /></label>
                <label className="field"><span className="label">Responsável</span><input className="input" value={form.contact_name} onChange={(e)=>update("contact_name",e.target.value)} required /></label>
                <label className="field"><span className="label">WhatsApp</span><input className="input" inputMode="tel" value={form.phone} onChange={(e)=>update("phone",e.target.value)} required /></label>
                <label className="field"><span className="label">E-mail</span><input className="input" type="email" value={form.email} onChange={(e)=>update("email",e.target.value)} /></label>
              </div>
            </div>
            <div className="form-section">
              <h3>Período e evento</h3>
              <div className="form-grid">
                <label className="field"><span className="label">Entrada</span><input className="input" type="date" value={form.start_date} onChange={(e)=>update("start_date",e.target.value)} required /></label>
                <label className="field"><span className="label">Saída</span><input className="input" type="date" min={form.start_date} value={form.end_date} onChange={(e)=>update("end_date",e.target.value)} required /></label>
                <label className="field"><span className="label">Pessoas estimadas</span><input className="input" type="number" min={1} value={form.guests_estimated} onChange={(e)=>update("guests_estimated",Number(e.target.value))} required /></label>
                <label className="field"><span className="label">Cardápio / pacote</span><input className="input" value={form.package_name} onChange={(e)=>update("package_name",e.target.value)} /></label>
                <label className="field field-full"><span className="label">Observações</span><textarea className="textarea" value={form.notes} onChange={(e)=>update("notes",e.target.value)} placeholder="Horário de chegada, necessidades especiais, detalhes combinados..." /></label>
              </div>
            </div>
          </div>
        </section>
        <div style={{display:"grid",gap:18}}>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Situação e valores</h3><p className="panel-subtitle">O sistema calculará automaticamente o saldo conforme os pagamentos.</p></div></div>
            <div className="panel-body">
              <div className="form-grid" style={{gridTemplateColumns:"1fr"}}>
                <label className="field"><span className="label">Status inicial</span><select className="select" value={form.status} onChange={(e)=>update("status",e.target.value as ReservationStatus)}><option value="PRE_RESERVA">Pré-reserva</option><option value="CONFIRMADA">Confirmada</option></select></label>
                <label className="field"><span className="label">Valor total combinado</span><input className="input" type="number" min={0} step="0.01" value={form.total_amount} onChange={(e)=>update("total_amount",Number(e.target.value))} /></label>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-body">
              <div className="empty" style={{textAlign:"left"}}><CalendarCheck2 /><strong style={{display:"block",color:"var(--ink)",marginBottom:6}}>Depois de salvar</strong>Você poderá registrar o sinal e outros pagamentos, atualizar a quantidade final e conversar pelo WhatsApp.</div>
              <button className="button button-primary" style={{width:"100%",marginTop:14}} disabled={saving}><Save /> {saving ? "Salvando..." : "Salvar reserva"}</button>
            </div>
          </section>
        </div>
      </form>
    </main>
  );
}

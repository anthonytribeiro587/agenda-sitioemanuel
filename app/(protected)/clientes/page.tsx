"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Plus, Search } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { normalizePhone } from "@/lib/format";

export default function ClientesPage() {
  const { customers, reservations, createCustomer } = useAgenda();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", organization:"", phone:"", email:"", notes:"" });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((customer)=>!q || [customer.name,customer.organization,customer.phone,customer.email].join(" ").toLowerCase().includes(q));
  }, [customers, query]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      await createCustomer(form);
      setForm({ name:"", organization:"", phone:"", email:"", notes:"" });
      setShowForm(false);
    } finally { setSaving(false); }
  }

  return (
    <main className="page">
      <div className="page-head"><div><h2>Clientes e igrejas</h2><p>Dados de contato organizados para reutilizar em novas reservas.</p></div><div className="page-actions"><button className="button button-primary" onClick={()=>setShowForm((v)=>!v)}><Plus /> Novo cliente</button></div></div>
      {showForm ? <section className="panel" style={{marginBottom:18}}><div className="panel-header"><div><h3 className="panel-title">Cadastrar cliente</h3><p className="panel-subtitle">Igreja, responsável e informações úteis para o próximo atendimento.</p></div></div><div className="panel-body"><form className="form-grid" onSubmit={submit}><label className="field"><span className="label">Responsável</span><input className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required /></label><label className="field"><span className="label">Igreja / organização</span><input className="input" value={form.organization} onChange={(e)=>setForm({...form,organization:e.target.value})} required /></label><label className="field"><span className="label">WhatsApp</span><input className="input" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} required /></label><label className="field"><span className="label">E-mail</span><input className="input" type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></label><label className="field field-full"><span className="label">Observações</span><textarea className="textarea" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></label><div className="field-full" style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" className="button button-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving?"Salvando...":"Salvar cliente"}</button></div></form></div></section> : null}
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Contatos cadastrados</h3><p className="panel-subtitle">{customers.length} clientes no cadastro.</p></div></div><div className="panel-body"><label className="search" style={{display:"block",marginBottom:18}}><Search /><input className="input" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar por nome, igreja ou telefone..." /></label><div className="grid-3">{filtered.map((customer)=>{const count=reservations.filter((item)=>item.customer_id===customer.id).length;return <article className="form-section" key={customer.id} style={{margin:0}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><div><h3 style={{margin:0}}>{customer.organization}</h3><p style={{margin:'6px 0 0',color:'var(--muted)',fontSize:13}}>{customer.name}</p></div><a className="button button-secondary button-sm" href={`https://wa.me/${normalizePhone(customer.phone)}`} target="_blank" rel="noreferrer"><MessageCircle /></a></div><div className="reservation-meta" style={{marginTop:14,display:'grid',gap:6}}><span>{customer.phone}</span><span>{customer.email || "Sem e-mail"}</span><span>{count} reserva{count===1?"":"s"}</span></div>{customer.notes ? <p style={{margin:'14px 0 0',color:'var(--muted)',fontSize:12,lineHeight:1.55}}>{customer.notes}</p> : null}</article>})}</div></div></section>
    </main>
  );
}

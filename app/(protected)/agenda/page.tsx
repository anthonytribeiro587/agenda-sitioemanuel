"use client";

import { useState } from "react";
import { Ban, CalendarPlus2, Trash2 } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { MonthCalendar } from "@/components/MonthCalendar";
import { formatDate } from "@/lib/format";

export default function AgendaPage() {
  const { reservations, blockedPeriods, addBlockedPeriod, removeBlockedPeriod } = useAgenda();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function block(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await addBlockedPeriod({ start_date:start, end_date:end || start, reason });
      setStart(""); setEnd(""); setReason("");
    } finally { setSaving(false); }
  }

  return (
    <main className="page">
      <div className="page-head"><div><h2>Agenda do Sítio</h2><p>Consulte reservas, pré-reservas e bloqueios em um calendário único.</p></div></div>
      <div className="detail-grid">
        <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Calendário</h3><p className="panel-subtitle">Começa na segunda-feira e mostra todos os dias ocupados.</p></div></div><div className="panel-body"><MonthCalendar reservations={reservations} blockedPeriods={blockedPeriods} /></div></section>
        <div style={{display:"grid",gap:18}}>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Bloquear período</h3><p className="panel-subtitle">Use para manutenção, eventos internos ou indisponibilidade.</p></div></div>
            <div className="panel-body">
              <form onSubmit={block} className="form-grid" style={{gridTemplateColumns:"1fr"}}>
                <label className="field"><span className="label">Data inicial</span><input className="input" type="date" value={start} onChange={(e)=>setStart(e.target.value)} required /></label>
                <label className="field"><span className="label">Data final</span><input className="input" type="date" min={start} value={end} onChange={(e)=>setEnd(e.target.value)} /></label>
                <label className="field"><span className="label">Motivo</span><textarea className="textarea" value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Ex.: manutenção geral" required /></label>
                <button className="button button-primary" disabled={saving}><Ban /> {saving ? "Salvando..." : "Bloquear período"}</button>
              </form>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Períodos bloqueados</h3><p className="panel-subtitle">Datas indisponíveis sem uma reserva.</p></div></div>
            <div className="panel-body">
              <div className="reservation-list">
                {blockedPeriods.length ? blockedPeriods.map((period)=><div key={period.id} className="reservation-card" style={{gridTemplateColumns:"1fr auto"}}><div><h3>{period.reason}</h3><div className="reservation-meta"><span>{formatDate(period.start_date)} até {formatDate(period.end_date)}</span></div></div><button className="button button-danger button-sm" onClick={()=>removeBlockedPeriod(period.id)}><Trash2 /> Remover</button></div>) : <div className="empty"><CalendarPlus2 />Nenhum período bloqueado.</div>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

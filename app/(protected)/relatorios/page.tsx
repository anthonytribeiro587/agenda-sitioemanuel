"use client";

import { Download, FileBarChart, Filter, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgenda } from "@/components/AgendaProvider";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatCurrency,
  formatDate,
  paymentTotal,
  reservationBalance,
  statusLabel,
} from "@/lib/format";
import type { ReservationStatus } from "@/lib/types";

const currentYear = new Date().getFullYear();
const defaultStart = `${currentYear}-01-01`;
const defaultEnd = `${currentYear}-12-31`;

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function RelatoriosPage() {
  const { reservations, loading } = useAgenda();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [status, setStatus] = useState<"TODAS" | ReservationStatus>("TODAS");

  const filtered = useMemo(() => reservations
    .filter((item) => item.start_date <= endDate && item.end_date >= startDate)
    .filter((item) => status === "TODAS" || item.status === status)
    .sort((a, b) => a.start_date.localeCompare(b.start_date)), [endDate, reservations, startDate, status]);

  const totals = useMemo(() => {
    const contracted = filtered.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const received = filtered.reduce((sum, item) => sum + paymentTotal(item.payments), 0);
    const pending = filtered.reduce((sum, item) => sum + reservationBalance(item), 0);
    const guests = filtered.reduce((sum, item) => sum + (item.guests_confirmed ?? item.guests_estimated), 0);
    return { contracted, received, pending, guests };
  }, [filtered]);

  function exportCsv() {
    const header = ["Igreja/Grupo", "Responsável", "Início", "Fim", "Status", "Pessoas", "Valor total", "Recebido", "Saldo"];
    const rows = filtered.map((item) => [
      item.church_name,
      item.contact_name,
      item.start_date,
      item.end_date,
      statusLabel(item.status),
      item.guests_confirmed ?? item.guests_estimated,
      item.total_amount,
      paymentTotal(item.payments),
      reservationBalance(item),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-reservas-${startDate}-${endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <main className="page"><div className="loading-card">Carregando relatórios...</div></main>;

  return (
    <main className="page reports-page">
      <div className="page-head reports-head">
        <div><span className="page-kicker"><FileBarChart /> Gestão e conferência</span><h2>Relatórios</h2><p>Filtre a operação por período e exporte os dados para conferência.</p></div>
        <div className="page-actions"><button className="button button-primary" type="button" onClick={exportCsv} disabled={!filtered.length}><Download /> Exportar CSV</button></div>
      </div>

      <section className="panel compact-panel report-filter-panel">
        <div className="panel-body report-filter-grid">
          <div className="report-filter-title"><Filter /><div><strong>Filtros</strong><span>O período considera qualquer reserva que ocupe as datas selecionadas.</span></div></div>
          <label className="field"><span className="label">Data inicial</span><input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="field"><span className="label">Data final</span><input className="input" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="field"><span className="label">Situação</span><select className="select" value={status} onChange={(event) => setStatus(event.target.value as "TODAS" | ReservationStatus)}><option value="TODAS">Todas</option><option value="PRE_RESERVA">Pré-reservas</option><option value="CONFIRMADA">Confirmadas</option><option value="REALIZADA">Realizadas</option><option value="CANCELADA">Canceladas</option></select></label>
        </div>
      </section>

      <section className="report-summary-grid">
        <article><span>Reservas</span><strong>{filtered.length}</strong><small>{totals.guests} pessoas previstas</small></article>
        <article><span>Valor contratado</span><strong>{formatCurrency(totals.contracted)}</strong><small>Totais definidos</small></article>
        <article><span>Total recebido</span><strong>{formatCurrency(totals.received)}</strong><small>Pagamentos registrados</small></article>
        <article className="attention"><span>Saldo pendente</span><strong>{formatCurrency(totals.pending)}</strong><small>A receber no período</small></article>
      </section>

      <section className="panel compact-panel report-table-panel">
        <div className="panel-header"><div><h3 className="panel-title">Reservas do período</h3><p className="panel-subtitle">{filtered.length} resultado(s) entre {formatDate(startDate, "dd/MM/yyyy")} e {formatDate(endDate, "dd/MM/yyyy")}.</p></div><ReceiptText /></div>
        <div className="report-table-wrap">
          {filtered.length ? (
            <table className="report-table">
              <thead><tr><th>Reserva</th><th>Período</th><th>Status</th><th>Pessoas</th><th>Total</th><th>Recebido</th><th>Saldo</th></tr></thead>
              <tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.church_name}</strong><span>{item.contact_name}</span></td><td>{formatDate(item.start_date, "dd/MM/yyyy")}<span>até {formatDate(item.end_date, "dd/MM/yyyy")}</span></td><td><StatusBadge status={item.status} /></td><td>{item.guests_confirmed ?? item.guests_estimated}</td><td>{item.total_amount > 0 ? formatCurrency(item.total_amount) : "A definir"}</td><td>{formatCurrency(paymentTotal(item.payments))}</td><td className={reservationBalance(item) > 0 ? "pending-cell" : ""}>{item.total_amount > 0 ? formatCurrency(reservationBalance(item)) : "—"}</td></tr>)}</tbody>
            </table>
          ) : <div className="empty report-empty">Nenhuma reserva encontrada para os filtros informados.</div>}
        </div>
      </section>
    </main>
  );
}

import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon"><Icon size={18} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-helper">{helper}</div>
    </article>
  );
}

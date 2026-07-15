"use client";

import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "warning";
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
    >
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="confirm-close" type="button" onClick={onCancel} disabled={busy} aria-label="Fechar">
          <X />
        </button>
        <div className={`confirm-icon ${tone}`}><AlertTriangle /></div>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="confirm-actions">
          <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>
            Voltar
          </button>
          <button
            className={tone === "danger" ? "button button-danger" : "button button-primary"}
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? "Aguarde..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

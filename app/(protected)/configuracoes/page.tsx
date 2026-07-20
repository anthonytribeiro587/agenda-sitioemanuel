"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  MessageCircle,
  Save,
  Settings2,
  ShieldAlert,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { useSettings, type AppSettings } from "@/components/SettingsProvider";
import { formatCurrency, renderWhatsappTemplate } from "@/lib/format";

export default function ConfiguracoesPage() {
  const { role } = useAgenda();
  const { settings, loading, saving, error, updateSettings } = useSettings();
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [feedback, setFeedback] = useState("");
  const form = useMemo(() => ({ ...settings, ...draft }), [draft, settings]);

  const preview = useMemo(
    () =>
      renderWhatsappTemplate(form.whatsapp_template, {
        contact_name: "Mariana",
        church_name: "Igreja Exemplo",
        start_date: "2026-08-14",
        end_date: "2026-08-16",
        guests_estimated: form.default_guests_estimated,
        package_name: form.default_package_name,
        total_amount: 2500,
        balance: 1500,
      }),
    [form]
  );

  function updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback("");
    try {
      await updateSettings(form);
      setDraft({});
      setFeedback("Parametrizações salvas. Os padrões serão usados somente em novas reservas.");
    } catch (saveError) {
      setFeedback(saveError instanceof Error ? saveError.message : "Não foi possível salvar as parametrizações.");
    }
  }

  if (role !== "ADMIN") {
    return (
      <main className="page settings-v4-page">
        <section className="settings-access-denied">
          <ShieldAlert />
          <h2>Acesso restrito</h2>
          <p>Somente administradores podem visualizar ou alterar as parametrizações do sistema.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page settings-v4-page">
      <div className="page-head settings-v4-head">
        <div>
          <span className="settings-kicker"><Settings2 /> Administração</span>
          <h2>Parametrizações</h2>
          <p>Defina os valores iniciais usados ao cadastrar novas reservas. Registros existentes não são alterados.</p>
        </div>
        <div className="settings-security-chip"><CheckCircle2 /> Alterações protegidas e auditadas</div>
      </div>

      {error ? <div className="error-box settings-feedback" role="alert">{error}</div> : null}
      {feedback ? <div className="success-box settings-feedback" role="status">{feedback}</div> : null}

      <form className="settings-v4-layout" onSubmit={submit}>
        <div className="settings-v4-main">
          <section className="settings-v4-card">
            <div className="settings-v4-card-head">
              <div className="settings-v4-icon"><UsersRound /></div>
              <div><h3>Padrões da reserva</h3><p>Campos preenchidos automaticamente ao abrir uma nova reserva.</p></div>
            </div>
            <div className="form-grid settings-form-grid">
              <label className="field field-full">
                <span className="label">Cardápio / pacote padrão</span>
                <input className="input" maxLength={120} value={form.default_package_name} onChange={(event) => updateField("default_package_name", event.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Quantidade estimada de pessoas</span>
                <input className="input" type="number" min="1" max="500" value={form.default_guests_estimated} onChange={(event) => updateField("default_guests_estimated", Number(event.target.value || 1))} required />
              </label>
              <label className="field">
                <span className="label">Situação inicial</span>
                <select className="select" value={form.default_status} onChange={(event) => updateField("default_status", event.target.value as AppSettings["default_status"])}>
                  <option value="PRE_RESERVA">Pré-reserva</option>
                  <option value="CONFIRMADA">Confirmada</option>
                </select>
              </label>
            </div>
          </section>

          <section className="settings-v4-card">
            <div className="settings-v4-card-head">
              <div className="settings-v4-icon"><WalletCards /></div>
              <div><h3>Padrões financeiros</h3><p>Forma e descrição inicial usadas quando houver sinal.</p></div>
            </div>
            <div className="form-grid settings-form-grid">
              <label className="field">
                <span className="label">Forma de pagamento padrão</span>
                <select className="select" value={form.default_payment_method} onChange={(event) => updateField("default_payment_method", event.target.value as AppSettings["default_payment_method"])}>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Descrição padrão do sinal</span>
                <input className="input" maxLength={500} value={form.default_deposit_note} onChange={(event) => updateField("default_deposit_note", event.target.value)} required />
              </label>
            </div>
          </section>

          <section className="settings-v4-card">
            <div className="settings-v4-card-head">
              <div className="settings-v4-icon"><MessageCircle /></div>
              <div><h3>Mensagem de WhatsApp</h3><p>Personalize o texto utilizado nas reservas.</p></div>
            </div>
            <label className="field">
              <span className="label">Modelo da mensagem</span>
              <textarea className="textarea settings-template" maxLength={1200} value={form.whatsapp_template} onChange={(event) => updateField("whatsapp_template", event.target.value)} required />
            </label>
            <div className="settings-placeholders">
              <strong>Campos disponíveis:</strong>
              <code>{"{responsavel}"}</code><code>{"{igreja}"}</code><code>{"{periodo}"}</code><code>{"{pessoas}"}</code><code>{"{pacote}"}</code><code>{"{valor}"}</code><code>{"{saldo}"}</code>
            </div>
          </section>
        </div>

        <aside className="settings-v4-side">
          <section className="settings-preview-card">
            <div className="settings-preview-head"><Eye /><div><h3>Prévia</h3><p>Exemplo da mensagem pronta.</p></div></div>
            <div className="whatsapp-preview">
              <div className="whatsapp-preview-bubble">{preview}</div>
            </div>
          </section>

          <section className="settings-summary-card">
            <h3>Resumo dos padrões</h3>
            <div><span>Pacote</span><strong>{form.default_package_name || "A definir"}</strong></div>
            <div><span>Pessoas</span><strong>{form.default_guests_estimated}</strong></div>
            <div><span>Situação</span><strong>{form.default_status === "CONFIRMADA" ? "Confirmada" : "Pré-reserva"}</strong></div>
            <div><span>Pagamento</span><strong>{form.default_payment_method}</strong></div>
            <div><span>Exemplo financeiro</span><strong>{formatCurrency(2500)}</strong></div>
          </section>

          <button className="button button-primary settings-save-button" disabled={saving || loading}>
            <Save /> {saving ? "Salvando..." : loading ? "Carregando..." : "Salvar parametrizações"}
          </button>
        </aside>
      </form>
    </main>
  );
}

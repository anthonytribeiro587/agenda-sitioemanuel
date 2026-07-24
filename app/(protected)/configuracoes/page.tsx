"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageCircle,
  Save,
  Settings2,
  ShieldAlert,
  Trash2,
  UploadCloud,
  UsersRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";
import { useSettings, type AppSettings } from "@/components/SettingsProvider";
import { formatCurrency, renderWhatsappTemplate } from "@/lib/format";

type SettingsTab = "reservation" | "financial" | "whatsapp" | "contract";

const tabs: Array<{
  id: SettingsTab;
  label: string;
  description: string;
  icon: typeof CalendarRange;
}> = [
  {
    id: "reservation",
    label: "Padrões da reserva",
    description: "Valores iniciais do cadastro",
    icon: CalendarRange,
  },
  {
    id: "financial",
    label: "Financeiro",
    description: "Sinal e forma de pagamento",
    icon: WalletCards,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Mensagem pronta ao cliente",
    icon: MessageCircle,
  },
  {
    id: "contract",
    label: "Contrato base",
    description: "Modelo privado de locação",
    icon: FileText,
  },
];

function formatFileSize(bytes: number | null) {
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export default function ConfiguracoesPage() {
  const { role, isDemo } = useAgenda();
  const { settings, loading, saving, error, updateSettings, reloadSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>("reservation");
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [feedback, setFeedback] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function uploadContract() {
    if (!selectedFile) {
      setFeedback("Selecione o contrato base antes de enviar.");
      return;
    }
    if (isDemo) {
      setFeedback("O contrato base só pode ser enviado quando o banco estiver conectado.");
      return;
    }

    setContractBusy(true);
    setFeedback("");
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      const response = await fetch("/api/settings/contract-template", {
        method: "POST",
        body,
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível enviar o contrato base.");

      await reloadSettings();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFeedback("Contrato base armazenado com acesso privado e registro de auditoria.");
    } catch (uploadError) {
      setFeedback(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o contrato base.");
    } finally {
      setContractBusy(false);
    }
  }

  async function openContract() {
    setContractBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/settings/contract-template", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "Não foi possível abrir o contrato base.");
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setFeedback(openError instanceof Error ? openError.message : "Não foi possível abrir o contrato base.");
    } finally {
      setContractBusy(false);
    }
  }

  async function removeContract() {
    if (!window.confirm("Remover o contrato base atual? A ação ficará registrada na auditoria.")) return;

    setContractBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/settings/contract-template", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível remover o contrato base.");
      await reloadSettings();
      setFeedback("Contrato base removido.");
    } catch (removeError) {
      setFeedback(removeError instanceof Error ? removeError.message : "Não foi possível remover o contrato base.");
    } finally {
      setContractBusy(false);
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

  const hasContract = Boolean(settings.contract_template_path);

  return (
    <main className="page settings-v4-page">
      <div className="page-head settings-v4-head">
        <div>
          <span className="settings-kicker"><Settings2 /> Administração</span>
          <h2>Parametrizações</h2>
          <p>Organize o comportamento padrão do sistema por área. As alterações afetam novas reservas e não modificam registros antigos.</p>
        </div>
        <div className="settings-security-chip"><CheckCircle2 /> Alterações protegidas e auditadas</div>
      </div>

      <nav className="settings-tabs" role="tablist" aria-label="Áreas das parametrizações">
        {tabs.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={activeTab === id ? "active" : ""}
            onClick={() => {
              setActiveTab(id);
              setFeedback("");
            }}
          >
            <Icon />
            <span><strong>{label}</strong><small>{description}</small></span>
          </button>
        ))}
      </nav>

      {error ? <div className="error-box settings-feedback" role="alert">{error}</div> : null}
      {feedback ? <div className="success-box settings-feedback" role="status">{feedback}</div> : null}

      <form className="settings-v4-layout" onSubmit={submit}>
        <div className="settings-v4-main">
          {activeTab === "reservation" ? (
            <section className="settings-v4-card" role="tabpanel">
              <div className="settings-v4-card-head">
                <div className="settings-v4-icon"><UsersRound /></div>
                <div><h3>Padrões da reserva</h3><p>Estes dados aparecem preenchidos ao abrir uma nova reserva e podem ser alterados antes de salvar.</p></div>
              </div>
              <div className="settings-explainer">
                <CheckCircle2 /> Use esta área para reduzir digitação repetitiva. Nada aqui altera reservas que já existem.
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
          ) : null}

          {activeTab === "financial" ? (
            <section className="settings-v4-card" role="tabpanel">
              <div className="settings-v4-card-head">
                <div className="settings-v4-icon"><WalletCards /></div>
                <div><h3>Padrões financeiros</h3><p>Defina como o sistema sugere o lançamento inicial quando houver pagamento de sinal.</p></div>
              </div>
              <div className="settings-explainer">
                <CheckCircle2 /> O valor do sinal continua sendo informado em cada reserva. Aqui ficam apenas o método e a descrição sugeridos.
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
          ) : null}

          {activeTab === "whatsapp" ? (
            <section className="settings-v4-card" role="tabpanel">
              <div className="settings-v4-card-head">
                <div className="settings-v4-icon"><MessageCircle /></div>
                <div><h3>Mensagem de WhatsApp</h3><p>Personalize o texto sugerido ao conversar com o responsável pela reserva.</p></div>
              </div>
              <label className="field">
                <span className="label">Modelo da mensagem</span>
                <textarea className="textarea settings-template" maxLength={1200} value={form.whatsapp_template} onChange={(event) => updateField("whatsapp_template", event.target.value)} required />
              </label>
              <div className="settings-placeholders">
                <strong>Campos preenchidos automaticamente:</strong>
                <code>{"{responsavel}"}</code><code>{"{igreja}"}</code><code>{"{periodo}"}</code><code>{"{pessoas}"}</code><code>{"{pacote}"}</code><code>{"{valor}"}</code><code>{"{saldo}"}</code>
              </div>
            </section>
          ) : null}

          {activeTab === "contract" ? (
            <>
              <section className="settings-v4-card contract-upload-card" role="tabpanel">
                <div className="settings-v4-card-head">
                  <div className="settings-v4-icon"><FileText /></div>
                  <div><h3>Contrato base de locação</h3><p>Anexe o documento oficial que será usado como referência para os contratos das reservas confirmadas.</p></div>
                </div>

                <div className="contract-security-note">
                  <LockKeyhole />
                  <div><strong>Arquivo privado</strong><span>O contrato não recebe link público. A abertura usa um endereço temporário e exige login administrativo.</span></div>
                </div>

                {hasContract ? (
                  <div className="contract-current-file">
                    <div className="contract-file-icon"><FileCheck2 /></div>
                    <div className="contract-file-copy">
                      <span>Contrato base atual</span>
                      <strong>{settings.contract_template_name}</strong>
                      <small>{formatFileSize(settings.contract_template_size)} · Atualizado em {formatDateTime(settings.contract_template_updated_at)}</small>
                    </div>
                    <div className="contract-file-actions">
                      <button className="button button-secondary" type="button" onClick={openContract} disabled={contractBusy}>
                        <Download /> Abrir
                      </button>
                      <button className="button button-danger" type="button" onClick={removeContract} disabled={contractBusy}>
                        <Trash2 /> Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="contract-empty-state">
                    <UploadCloud />
                    <strong>Nenhum contrato base anexado</strong>
                    <span>Envie um PDF ou DOCX de até 4 MB. O arquivo ficará guardado em armazenamento privado.</span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  className="contract-file-input"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />

                <div className="contract-upload-row">
                  <button className="button button-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={contractBusy || isDemo}>
                    <FileText /> {hasContract ? "Substituir arquivo" : "Selecionar arquivo"}
                  </button>
                  <div className="contract-selected-file">
                    {selectedFile ? <><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)}</span></> : <span>Nenhum novo arquivo selecionado.</span>}
                  </div>
                  <button className="button button-primary" type="button" onClick={uploadContract} disabled={!selectedFile || contractBusy || isDemo}>
                    <UploadCloud /> {contractBusy ? "Processando..." : "Enviar contrato base"}
                  </button>
                </div>
              </section>

              <section className="settings-v4-card contract-automation-card">
                <div className="settings-v4-card-head">
                  <div className="settings-v4-icon"><Workflow /></div>
                  <div><h3>Geração automática do contrato</h3><p>Fluxo planejado para transformar os dados da reserva em um PDF individual.</p></div>
                </div>
                <div className="contract-flow">
                  <div><span>1</span><strong>Reserva confirmada</strong><small>O sistema valida os dados obrigatórios.</small></div>
                  <div><span>2</span><strong>Modelo preenchido</strong><small>Os campos do contrato recebem os dados da reserva.</small></div>
                  <div><span>3</span><strong>PDF armazenado</strong><small>O documento final fica vinculado ao histórico.</small></div>
                </div>
                <div className="contract-info-box">
                  <CheckCircle2 />
                  <div><strong>Não precisa de inteligência artificial.</strong><span>A geração pode ser feita com campos fixos e regras determinísticas. Primeiro precisamos mapear no contrato base quais informações serão substituídas.</span></div>
                </div>
                <div className="contract-pending-box">
                  <ShieldAlert />
                  <div><strong>Antes de ativar a geração</strong><span>O modelo pode exigir CPF/CNPJ, RG e outros dados que ainda não existem no cadastro atual. A automação será ligada somente depois de incluir e validar esses campos.</span></div>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <aside className="settings-v4-side">
          {activeTab === "whatsapp" ? (
            <section className="settings-preview-card">
              <div className="settings-preview-head"><Eye /><div><h3>Prévia da mensagem</h3><p>Exemplo com dados preenchidos.</p></div></div>
              <div className="whatsapp-preview">
                <div className="whatsapp-preview-bubble">{preview}</div>
              </div>
            </section>
          ) : null}

          {activeTab === "contract" ? (
            <section className="settings-summary-card contract-summary-card">
              <h3>Status do contrato</h3>
              <div><span>Modelo anexado</span><strong>{hasContract ? "Sim" : "Não"}</strong></div>
              <div><span>Armazenamento</span><strong>Privado</strong></div>
              <div><span>Formatos</span><strong>PDF ou DOCX</strong></div>
              <div><span>Limite</span><strong>4 MB</strong></div>
              <div><span>Geração automática</span><strong className="contract-status-pending">Aguardando mapeamento</strong></div>
            </section>
          ) : (
            <section className="settings-summary-card">
              <h3>Resumo dos padrões</h3>
              <div><span>Pacote</span><strong>{form.default_package_name || "A definir"}</strong></div>
              <div><span>Pessoas</span><strong>{form.default_guests_estimated}</strong></div>
              <div><span>Situação</span><strong>{form.default_status === "CONFIRMADA" ? "Confirmada" : "Pré-reserva"}</strong></div>
              <div><span>Pagamento</span><strong>{form.default_payment_method}</strong></div>
              <div><span>Exemplo financeiro</span><strong>{formatCurrency(2500)}</strong></div>
            </section>
          )}

          {activeTab !== "contract" ? (
            <button className="button button-primary settings-save-button" disabled={saving || loading}>
              <Save /> {saving ? "Salvando..." : loading ? "Carregando..." : "Salvar esta área"}
            </button>
          ) : null}
        </aside>
      </form>
    </main>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { useAgenda } from "@/components/AgendaProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PaymentMethod, ReservationStatus } from "@/lib/types";

export type AppSettings = {
  default_package_name: string;
  default_guests_estimated: number;
  default_status: Extract<ReservationStatus, "PRE_RESERVA" | "CONFIRMADA">;
  default_payment_method: PaymentMethod;
  default_deposit_note: string;
  whatsapp_template: string;
  contract_template_path: string | null;
  contract_template_name: string | null;
  contract_template_mime: string | null;
  contract_template_size: number | null;
  contract_template_updated_at: string | null;
  updated_at?: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  default_package_name: "A definir",
  default_guests_estimated: 30,
  default_status: "PRE_RESERVA",
  default_payment_method: "PIX",
  default_deposit_note: "Sinal da reserva",
  whatsapp_template:
    "Olá, {responsavel}! Sobre a reserva de {periodo} no Sítio Emanuel para {igreja}. Qualquer dúvida, estamos à disposição.",
  contract_template_path: null,
  contract_template_name: null,
  contract_template_mime: null,
  contract_template_size: null,
  contract_template_updated_at: null,
};

const nullableShortText = z.string().trim().max(500).nullable();

const settingsSchema = z.object({
  default_package_name: z.string().trim().min(1).max(120),
  default_guests_estimated: z.coerce.number().int().min(1).max(500),
  default_status: z.enum(["PRE_RESERVA", "CONFIRMADA"]),
  default_payment_method: z.enum(["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"]),
  default_deposit_note: z.string().trim().min(1).max(500),
  whatsapp_template: z.string().trim().min(10).max(1200),
  contract_template_path: nullableShortText,
  contract_template_name: z.string().trim().max(180).nullable(),
  contract_template_mime: z.string().trim().max(120).nullable(),
  contract_template_size: z.coerce.number().int().nonnegative().nullable(),
  contract_template_updated_at: nullableShortText,
  updated_at: z.string().optional(),
});

type SettingsContextValue = {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  error: string;
  updateSettings: (next: AppSettings) => Promise<void>;
  reloadSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);
const DEMO_STORAGE_KEY = "agenda-sitio-emanuel-settings-v1";

function normalizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(value ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isDemo, role } = useAgenda();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reloadSettings = useCallback(async () => {
    if (!role) return;

    setLoading(true);
    setError("");
    try {
      if (isDemo) {
        const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
        setSettings(normalizeSettings(raw ? JSON.parse(raw) : null));
        return;
      }
      if (!supabase) throw new Error("Banco indisponível.");
      const { data, error: rpcError } = await supabase.rpc("get_app_settings_secure");
      if (rpcError) throw new Error(rpcError.message);
      const row = Array.isArray(data) ? data[0] : data;
      setSettings(normalizeSettings(row as Partial<AppSettings>));
    } catch (loadError) {
      console.error("settings load failed", loadError);
      setSettings(DEFAULT_SETTINGS);
      setError("As parametrizações ainda não foram ativadas no banco.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, role, supabase]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  const updateSettings = useCallback(
    async (next: AppSettings) => {
      if (role !== "ADMIN") throw new Error("Somente o administrador pode alterar parametrizações.");
      const parsed = settingsSchema.parse(next) as AppSettings;
      setSaving(true);
      setError("");
      try {
        if (isDemo) {
          window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(parsed));
          setSettings(parsed);
          return;
        }
        if (!supabase) throw new Error("Banco indisponível.");
        const { data, error: rpcError } = await supabase.rpc("update_app_settings_secure", {
          p_request_id: crypto.randomUUID(),
          p_default_package_name: parsed.default_package_name,
          p_default_guests_estimated: parsed.default_guests_estimated,
          p_default_status: parsed.default_status,
          p_default_payment_method: parsed.default_payment_method,
          p_default_deposit_note: parsed.default_deposit_note,
          p_whatsapp_template: parsed.whatsapp_template,
        });
        if (rpcError) throw new Error(rpcError.message);
        const row = Array.isArray(data) ? data[0] : data;
        setSettings(normalizeSettings(row as Partial<AppSettings>));
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : "Não foi possível salvar as parametrizações.";
        setError(message.includes("ADMIN_REQUIRED") ? "Somente o administrador pode alterar parametrizações." : message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [isDemo, role, supabase]
  );

  const value = useMemo(
    () => ({ settings, loading, saving, error, updateSettings, reloadSettings }),
    [error, loading, reloadSettings, saving, settings, updateSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings precisa estar dentro de SettingsProvider");
  return context;
}

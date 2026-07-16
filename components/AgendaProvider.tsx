"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  demoBlockedPeriods,
  demoCustomers,
  demoPayments,
  demoReservations,
} from "@/lib/demo-data";
import {
  createSupabaseBrowserClient,
  isDemoModeEnabled,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import {
  parseAuditReason,
  parseBlockedPeriodInput,
  parseCustomerInput,
  parsePaymentInput,
  parseReservationFinancialUpdate,
  parseReservationInput,
  validationMessage,
} from "@/lib/validation";
import type {
  BlockedPeriod,
  BlockedPeriodInput,
  Customer,
  CustomerInput,
  MutationOptions,
  Payment,
  PaymentDraftInput,
  PaymentInput,
  ProfileRole,
  Reservation,
  ReservationCreationResult,
  ReservationFinancialUpdate,
  ReservationInput,
} from "@/lib/types";

type AgendaContextValue = {
  loading: boolean;
  isDemo: boolean;
  role: ProfileRole | null;
  reservations: Reservation[];
  customers: Customer[];
  blockedPeriods: BlockedPeriod[];
  refresh: () => Promise<void>;
  createReservation: (input: ReservationInput) => Promise<Reservation>;
  createReservationWithPayment: (
    input: ReservationInput,
    payment?: PaymentDraftInput | null
  ) => Promise<ReservationCreationResult>;
  updateReservation: (
    id: string,
    input: Partial<ReservationInput>,
    options?: MutationOptions
  ) => Promise<void>;
  updateReservationFinancial: (
    id: string,
    input: ReservationFinancialUpdate
  ) => Promise<ReservationCreationResult>;
  deleteReservation: (id: string, reason: string) => Promise<void>;
  createCustomer: (input: CustomerInput) => Promise<Customer>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<void>;
  deleteCustomer: (id: string, reason: string) => Promise<void>;
  addPayment: (input: PaymentInput) => Promise<Payment>;
  deletePayment: (id: string, reservationId: string, reason: string) => Promise<void>;
  addBlockedPeriod: (input: BlockedPeriodInput) => Promise<BlockedPeriod>;
  removeBlockedPeriod: (id: string, reason: string) => Promise<void>;
};

const AgendaContext = createContext<AgendaContextValue | null>(null);
const STORAGE_KEY = "agenda-sitio-emanuel-demo-v3";

const RESERVATION_DETAIL_KEYS = new Set<keyof ReservationInput>([
  "customer_id",
  "church_name",
  "contact_name",
  "phone",
  "email",
  "start_date",
  "end_date",
  "guests_estimated",
  "guests_confirmed",
  "package_name",
  "notes",
]);

type StoredDemo = {
  reservations: Reservation[];
  customers: Customer[];
  blockedPeriods: BlockedPeriod[];
};

type BootstrapResponse = {
  ok?: boolean;
  role?: ProfileRole;
  error?: string;
};

function randomId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function isBlockingStatus(status: Reservation["status"]) {
  return status === "PRE_RESERVA" || status === "CONFIRMADA";
}

function normalizePayment(payment: Payment): Payment {
  return { ...payment, amount: Number(payment.amount ?? 0) };
}

function normalizeReservation(reservation: Reservation): Reservation {
  return {
    ...reservation,
    total_amount: Number(reservation.total_amount ?? 0),
    guests_estimated: Number(reservation.guests_estimated ?? 1),
    guests_confirmed:
      reservation.guests_confirmed === null || reservation.guests_confirmed === undefined
        ? null
        : Number(reservation.guests_confirmed),
    payments: (reservation.payments ?? []).map(normalizePayment),
  };
}

function hydrateReservations(
  reservations: Reservation[],
  customers: Customer[],
  payments: Payment[]
) {
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const paymentsByReservation = new Map<string, Payment[]>();

  payments.forEach((payment) => {
      const normalized = normalizePayment(payment);
      const current = paymentsByReservation.get(payment.reservation_id) ?? [];
      current.push(normalized);
      paymentsByReservation.set(payment.reservation_id, current);
    });

  return reservations.map((reservation) =>
    normalizeReservation({
      ...reservation,
      customer: reservation.customer_id
        ? customerById.get(reservation.customer_id) ?? reservation.customer ?? null
        : null,
      payments: paymentsByReservation.get(reservation.id) ?? [],
    })
  );
}

function initialDemo(): StoredDemo {
  return {
    reservations: hydrateReservations(demoReservations, demoCustomers, demoPayments),
    customers: demoCustomers,
    blockedPeriods: demoBlockedPeriods,
  };
}

function reservationInputFromRow(reservation: Reservation): ReservationInput {
  return {
    customer_id: reservation.customer_id,
    church_name: reservation.church_name,
    contact_name: reservation.contact_name,
    phone: reservation.phone,
    email: reservation.email,
    start_date: reservation.start_date,
    end_date: reservation.end_date,
    guests_estimated: reservation.guests_estimated,
    guests_confirmed: reservation.guests_confirmed,
    package_name: reservation.package_name,
    total_amount: reservation.total_amount,
    status: reservation.status,
    notes: reservation.notes,
  };
}

function rpcRow<T>(data: T | T[] | null): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("A operação não retornou os dados esperados.");
  return row;
}

function rpcCreationResult(data: unknown): ReservationCreationResult {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") {
    throw new Error("A operação não retornou os dados esperados.");
  }
  const result = value as { reservation?: Reservation; payment?: Payment | null };
  if (!result.reservation) {
    throw new Error("A operação não retornou a reserva esperada.");
  }
  return {
    reservation: normalizeReservation(result.reservation),
    payment: result.payment ? normalizePayment(result.payment) : null,
  };
}

function databaseMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const messages: Array<[string, string]> = [
    ["CUSTOMER_WRITE_FORBIDDEN", "Seu perfil não pode alterar clientes."],
    ["RESERVATION_WRITE_FORBIDDEN", "Seu perfil não pode alterar reservas."],
    ["FINANCE_ROLE_REQUIRED", "Apenas o administrador ou o financeiro pode alterar valores."],
    ["ADMIN_REQUIRED", "Esta ação exige perfil de administrador."],
    ["STALE_RESERVATION", "A reserva foi alterada em outra tela. Atualize a página antes de salvar."],
    ["RESERVATION_CONFLICTS_WITH_BLOCK", "O período está bloqueado."],
    ["reservations_no_active_overlap", "O período entra em conflito com outra reserva."],
    ["blocked_periods_no_overlap", "Já existe um bloqueio nesse período."],
    ["TOTAL_BELOW_RECEIVED", "O valor combinado não pode ser menor que o total recebido."],
    ["PAYMENT_EXCEEDS_BALANCE", "O pagamento excede o saldo atual da reserva."],
    ["RESERVATION_TOTAL_REQUIRED", "Defina o valor combinado antes de registrar pagamentos."],
    ["CANCEL_REASON_REQUIRED", "Informe um motivo com pelo menos 5 caracteres."],
    ["VOID_REASON_REQUIRED", "Informe o motivo da anulação do pagamento."],
    ["ADMIN_REQUIRED_FOR_OLD_PAYMENT_VOID", "Somente o administrador pode anular pagamentos antigos."],
    ["PAYMENT_DELETE_FORBIDDEN", "Pagamentos não podem ser apagados; somente anulados com motivo."],
    ["RESERVATION_DELETE_WINDOW_CLOSED", "Após 24 horas, a reserva deve ser cancelada e não excluída."],
    ["RESERVATION_HAS_FINANCIAL_HISTORY", "Reservas com histórico financeiro não podem ser excluídas."],
    ["CUSTOMER_HAS_RESERVATIONS", "Este cliente possui reservas e não pode ser excluído."],
    ["INVALID_STATUS_TRANSITION", "Essa mudança de situação não é permitida."],
    ["RESERVATION_DATE_OUT_OF_RANGE", "A data informada está fora do período permitido."],
    ["PAYMENT_DATE_OUT_OF_RANGE", "A data do pagamento é inválida ou está no futuro."],
    ["IDEMPOTENCY_KEY_REUSE", "A solicitação foi repetida com dados diferentes e foi bloqueada."],
    ["REQUEST_KEY_CONFLICT", "A chave da solicitação já pertence a outra operação."],
    ["FINANCIAL_REASON_REQUIRED", "Informe o motivo da alteração financeira."],
    ["STATUS_CORRECTION_REASON_REQUIRED", "Informe o motivo da correção de situação."],
    ["CANCELLED_RESERVATION_PAYMENT_FORBIDDEN", "Não é permitido lançar pagamento em reserva cancelada."],
    ["MIXED_RESERVATION_MUTATION", "Salve dados, situação e financeiro em operações separadas."],
  ];

  const translated = messages.find(([token]) => raw.includes(token));
  return translated?.[1] ?? "A operação foi bloqueada pelas regras de segurança.";
}

async function readBootstrap(response: Response): Promise<BootstrapResponse> {
  try {
    return (await response.json()) as BootstrapResponse;
  } catch {
    return { error: "Não foi possível autorizar este usuário." };
  }
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const isDemo = !configured && isDemoModeEnabled();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const profileReady = useRef(false);
  const loaded = useRef(false);
  const reservationsRef = useRef<Reservation[]>([]);
  const customersRef = useRef<Customer[]>([]);
  const blockedPeriodsRef = useRef<BlockedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<ProfileRole | null>(isDemo ? "ADMIN" : null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);

  const applySnapshot = useCallback(
    (next: StoredDemo, persist = isDemo) => {
      reservationsRef.current = next.reservations;
      customersRef.current = next.customers;
      blockedPeriodsRef.current = next.blockedPeriods;
      setReservations(next.reservations);
      setCustomers(next.customers);
      setBlockedPeriods(next.blockedPeriods);

      if (persist) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    },
    [isDemo]
  );

  const ensureProfile = useCallback(async () => {
    if (isDemo || profileReady.current) return;
    if (!configured) throw new Error("O sistema está sem configuração de banco e foi bloqueado.");

    const response = await fetch("/api/profile/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const body = await readBootstrap(response);
    if (!response.ok) throw new Error(body.error ?? "Não foi possível autorizar este usuário.");

    setRole(body.role ?? null);
    profileReady.current = true;
  }, [configured, isDemo]);

  const refresh = useCallback(async () => {
    const isInitialLoad = !loaded.current;
    if (isInitialLoad) setLoading(true);

    try {
      if (isDemo) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            applySnapshot(JSON.parse(raw) as StoredDemo);
          } catch {
            applySnapshot(initialDemo());
          }
        } else {
          applySnapshot(initialDemo());
        }
        return;
      }

      if (!configured || !supabase) {
        throw new Error("O sistema está sem configuração de banco e foi bloqueado.");
      }

      await ensureProfile();

      const [reservationResult, customerResult, paymentResult, blockResult] = await Promise.all([
        supabase.from("reservations").select("*").order("start_date"),
        supabase.from("customers").select("*").order("name"),
        supabase
          .from("payments")
          .select("*")
          .order("payment_date", { ascending: false }),
        supabase.from("blocked_periods").select("*").order("start_date"),
      ]);

      const error =
        reservationResult.error || customerResult.error || paymentResult.error || blockResult.error;
      if (error) throw new Error(databaseMessage(error));

      const fetchedCustomers = (customerResult.data ?? []) as Customer[];
      const fetchedPayments = (paymentResult.data ?? []) as Payment[];
      applySnapshot(
        {
          customers: fetchedCustomers,
          reservations: hydrateReservations(
            (reservationResult.data ?? []) as Reservation[],
            fetchedCustomers,
            fetchedPayments
          ),
          blockedPeriods: (blockResult.data ?? []) as BlockedPeriod[],
        },
        false
      );
    } finally {
      loaded.current = true;
      setLoading(false);
    }
  }, [applySnapshot, configured, ensureProfile, isDemo, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        console.error("agenda refresh failed", error);
        loaded.current = true;
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createReservation = useCallback(
    async (rawInput: ReservationInput) => {
      let input: ReservationInput;
      try {
        input = parseReservationInput(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      const now = new Date().toISOString();
      let created: Reservation;

      if (isDemo) {
        const conflictsReservation =
          isBlockingStatus(input.status) &&
          reservationsRef.current.some(
            (reservation) =>
              isBlockingStatus(reservation.status) &&
              rangesOverlap(
                input.start_date,
                input.end_date,
                reservation.start_date,
                reservation.end_date
              )
          );
        const conflictsBlock =
          isBlockingStatus(input.status) &&
          blockedPeriodsRef.current.some((period) =>
            rangesOverlap(input.start_date, input.end_date, period.start_date, period.end_date)
          );
        if (conflictsReservation || conflictsBlock) throw new Error("RESERVATION_CONFLICT");

        created = normalizeReservation({
          ...input,
          id: randomId("reservation"),
          created_at: now,
          updated_at: now,
          customer: input.customer_id
            ? customersRef.current.find((customer) => customer.id === input.customer_id) ?? null
            : null,
          payments: [],
        });
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { data, error } = await supabase.rpc("create_reservation_secure", {
          p_request_id: crypto.randomUUID(),
          p_customer_id: input.customer_id,
          p_church_name: input.church_name,
          p_contact_name: input.contact_name,
          p_phone: input.phone,
          p_email: input.email,
          p_start_date: input.start_date,
          p_end_date: input.end_date,
          p_guests_estimated: input.guests_estimated,
          p_guests_confirmed: input.guests_confirmed,
          p_package_name: input.package_name,
          p_total_amount: input.total_amount,
          p_status: input.status,
          p_notes: input.notes,
        });
        if (error) throw new Error(databaseMessage(error));
        const row = rpcRow(data as Reservation | Reservation[] | null);
        created = normalizeReservation({
          ...row,
          customer: row.customer_id
            ? customersRef.current.find((customer) => customer.id === row.customer_id) ?? null
            : null,
          payments: [],
        });
      }

      applySnapshot({
        reservations: [...reservationsRef.current, created].sort((a, b) =>
          a.start_date.localeCompare(b.start_date)
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
      return created;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const createReservationWithPayment = useCallback(
    async (
      rawInput: ReservationInput,
      rawPayment: PaymentDraftInput | null = null
    ): Promise<ReservationCreationResult> => {
      let input: ReservationInput;
      let payment: PaymentDraftInput | null;
      try {
        input = parseReservationInput(rawInput);
        const parsed = parseReservationFinancialUpdate({ payment: rawPayment });
        payment = parsed.payment ?? null;
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      const paymentAmount = Number(payment?.amount ?? 0);
      if (paymentAmount > 0 && input.total_amount <= 0) {
        throw new Error("Defina o valor total antes de registrar o sinal.");
      }
      if (paymentAmount > input.total_amount) {
        throw new Error("O sinal não pode ser maior que o valor total da reserva.");
      }

      let result: ReservationCreationResult;
      if (isDemo) {
        const conflictsReservation =
          isBlockingStatus(input.status) &&
          reservationsRef.current.some(
            (reservation) =>
              isBlockingStatus(reservation.status) &&
              rangesOverlap(
                input.start_date,
                input.end_date,
                reservation.start_date,
                reservation.end_date
              )
          );
        const conflictsBlock =
          isBlockingStatus(input.status) &&
          blockedPeriodsRef.current.some((period) =>
            rangesOverlap(input.start_date, input.end_date, period.start_date, period.end_date)
          );
        if (conflictsReservation || conflictsBlock) throw new Error("RESERVATION_CONFLICT");

        const now = new Date().toISOString();
        const reservation = normalizeReservation({
          ...input,
          id: randomId("reservation"),
          request_key: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
          customer: input.customer_id
            ? customersRef.current.find((customer) => customer.id === input.customer_id) ?? null
            : null,
          payments: [],
        });
        const createdPayment = payment
          ? normalizePayment({
              ...payment,
              reservation_id: reservation.id,
              id: randomId("payment"),
              request_key: crypto.randomUUID(),
              created_at: now,
            })
          : null;
        reservation.payments = createdPayment ? [createdPayment] : [];
        result = { reservation, payment: createdPayment };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const requestKey = crypto.randomUUID();
        const { data, error } = await supabase.rpc("create_reservation_with_payment_secure", {
          p_request_key: requestKey,
          p_customer_id: input.customer_id,
          p_church_name: input.church_name,
          p_contact_name: input.contact_name,
          p_phone: input.phone,
          p_email: input.email,
          p_start_date: input.start_date,
          p_end_date: input.end_date,
          p_guests_estimated: input.guests_estimated,
          p_guests_confirmed: input.guests_confirmed,
          p_package_name: input.package_name,
          p_total_amount: input.total_amount,
          p_status: input.status,
          p_notes: input.notes,
          p_payment_amount: payment?.amount ?? null,
          p_payment_date: payment?.payment_date ?? null,
          p_payment_method: payment?.method ?? null,
          p_payment_notes: payment?.notes ?? "",
          p_payment_request_key: payment ? crypto.randomUUID() : null,
        });
        if (error) throw new Error(databaseMessage(error));
        result = rpcCreationResult(data);
        result.reservation = normalizeReservation({
          ...result.reservation,
          customer: result.reservation.customer_id
            ? customersRef.current.find(
                (customer) => customer.id === result.reservation.customer_id
              ) ?? null
            : null,
          payments: result.payment ? [result.payment] : [],
        });
      }

      applySnapshot({
        reservations: [...reservationsRef.current, result.reservation].sort((a, b) =>
          a.start_date.localeCompare(b.start_date)
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
      return result;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const updateReservation = useCallback(
    async (
      id: string,
      input: Partial<ReservationInput>,
      options: MutationOptions = {}
    ) => {
      const current = reservationsRef.current.find((reservation) => reservation.id === id);
      if (!current) throw new Error("Reserva não encontrada.");

      let merged: ReservationInput;
      try {
        merged = parseReservationInput({ ...reservationInputFromRow(current), ...input });
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      let updated: Reservation;

      if (isDemo) {
        const conflictsReservation =
          isBlockingStatus(merged.status) &&
          reservationsRef.current.some(
            (reservation) =>
              reservation.id !== id &&
              isBlockingStatus(reservation.status) &&
              rangesOverlap(
                merged.start_date,
                merged.end_date,
                reservation.start_date,
                reservation.end_date
              )
          );
        const conflictsBlock =
          isBlockingStatus(merged.status) &&
          blockedPeriodsRef.current.some((period) =>
            rangesOverlap(merged.start_date, merged.end_date, period.start_date, period.end_date)
          );
        if (conflictsReservation || conflictsBlock) throw new Error("RESERVATION_CONFLICT");

        updated = normalizeReservation({
          ...current,
          ...merged,
          updated_at: new Date().toISOString(),
        });
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        let row = current;
        const requestId = crypto.randomUUID();
        const hasDetailChanges = Object.keys(input).some((key) =>
          RESERVATION_DETAIL_KEYS.has(key as keyof ReservationInput)
        );
        const hasTotalChange =
          input.total_amount !== undefined && merged.total_amount !== Number(current.total_amount);
        const hasStatusChange =
          input.status !== undefined && merged.status !== current.status;
        const mutationKinds = [hasDetailChanges, hasTotalChange, hasStatusChange].filter(Boolean).length;
        if (mutationKinds > 1) {
          throw new Error("Salve dados, situação e financeiro em operações separadas.");
        }

        if (hasDetailChanges) {
          const { data, error } = await supabase.rpc("update_reservation_details_secure", {
            p_request_id: requestId,
            p_id: id,
            p_expected_updated_at: row.updated_at,
            p_customer_id: merged.customer_id,
            p_church_name: merged.church_name,
            p_contact_name: merged.contact_name,
            p_phone: merged.phone,
            p_email: merged.email,
            p_start_date: merged.start_date,
            p_end_date: merged.end_date,
            p_guests_estimated: merged.guests_estimated,
            p_guests_confirmed: merged.guests_confirmed,
            p_package_name: merged.package_name,
            p_notes: merged.notes,
          });
          if (error) throw new Error(databaseMessage(error));
          row = rpcRow(data as Reservation | Reservation[] | null);
        }

        if (hasTotalChange) {
          let reason: string;
          try {
            reason = parseAuditReason(options.reason ?? "");
          } catch (error) {
            throw new Error(validationMessage(error));
          }
          const { data, error } = await supabase.rpc("set_reservation_total_secure", {
            p_request_id: requestId,
            p_id: id,
            p_expected_updated_at: row.updated_at,
            p_total_amount: merged.total_amount,
            p_reason: reason,
          });
          if (error) throw new Error(databaseMessage(error));
          row = rpcRow(data as Reservation | Reservation[] | null);
        }

        if (hasStatusChange) {
          let reason: string | null = null;
          if (options.reason) {
            try {
              reason = parseAuditReason(options.reason);
            } catch (error) {
              throw new Error(validationMessage(error));
            }
          }
          if (merged.status === "CANCELADA" && !reason) {
            throw new Error("Informe o motivo do cancelamento.");
          }
          const { data, error } = await supabase.rpc("change_reservation_status_secure", {
            p_request_id: requestId,
            p_id: id,
            p_expected_updated_at: row.updated_at,
            p_status: merged.status,
            p_reason: reason,
          });
          if (error) throw new Error(databaseMessage(error));
          row = rpcRow(data as Reservation | Reservation[] | null);
        }

        updated = normalizeReservation({
          ...current,
          ...row,
          customer: row.customer_id
            ? customersRef.current.find((customer) => customer.id === row.customer_id) ?? null
            : null,
          payments: current.payments ?? [],
        });
      }

      applySnapshot({
        reservations: reservationsRef.current.map((reservation) =>
          reservation.id === id ? updated : reservation
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const updateReservationFinancial = useCallback(
    async (
      id: string,
      rawInput: ReservationFinancialUpdate
    ): Promise<ReservationCreationResult> => {
      const current = reservationsRef.current.find((reservation) => reservation.id === id);
      if (!current) throw new Error("Reserva não encontrada.");

      let input: ReservationFinancialUpdate;
      try {
        input = parseReservationFinancialUpdate(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      const currentPaid = (current.payments ?? []).reduce(
        (total, payment) => total + Number(payment.amount),
        0
      );
      const nextTotal = input.total_amount ?? current.total_amount;
      const paymentAmount = Number(input.payment?.amount ?? 0);
      if (nextTotal < currentPaid) {
        throw new Error("O valor combinado não pode ser menor que o total recebido.");
      }
      if (paymentAmount > nextTotal - currentPaid) {
        throw new Error("O pagamento excede o saldo atual da reserva.");
      }

      let result: ReservationCreationResult;
      if (isDemo) {
        const updatedReservation = normalizeReservation({
          ...current,
          total_amount: nextTotal,
          updated_at: new Date().toISOString(),
        });
        const createdPayment = input.payment
          ? normalizePayment({
              ...input.payment,
              reservation_id: id,
              id: randomId("payment"),
              request_key: crypto.randomUUID(),
              created_at: new Date().toISOString(),
            })
          : null;
        updatedReservation.payments = createdPayment
          ? [...(current.payments ?? []), createdPayment]
          : current.payments ?? [];
        result = { reservation: updatedReservation, payment: createdPayment };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const totalChanged =
          input.total_amount !== undefined && input.total_amount !== current.total_amount;
        const { data, error } = await supabase.rpc("update_reservation_financial_secure", {
          p_request_id: crypto.randomUUID(),
          p_id: id,
          p_expected_updated_at: current.updated_at,
          p_total_amount: totalChanged ? input.total_amount : null,
          p_total_reason: totalChanged ? input.total_reason ?? null : null,
          p_payment_amount: input.payment?.amount ?? null,
          p_payment_date: input.payment?.payment_date ?? null,
          p_payment_method: input.payment?.method ?? null,
          p_payment_notes: input.payment?.notes ?? "",
          p_payment_request_key: input.payment ? crypto.randomUUID() : null,
        });
        if (error) throw new Error(databaseMessage(error));
        result = rpcCreationResult(data);
        result.reservation = normalizeReservation({
          ...current,
          ...result.reservation,
          customer: current.customer ?? null,
          payments: result.payment
            ? [...(current.payments ?? []), result.payment]
            : current.payments ?? [],
        });
      }

      applySnapshot({
        reservations: reservationsRef.current.map((reservation) =>
          reservation.id === id ? result.reservation : reservation
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
      return result;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const deleteReservation = useCallback(
    async (id: string, rawReason: string) => {
      let reason: string;
      try {
        reason = parseAuditReason(rawReason);
      } catch (error) {
        throw new Error(validationMessage(error));
      }
      if (!isDemo) {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { error } = await supabase.rpc("delete_reservation_secure", {
          p_request_id: crypto.randomUUID(),
          p_id: id,
          p_reason: reason,
        });
        if (error) throw new Error(databaseMessage(error));
      }

      applySnapshot({
        reservations: reservationsRef.current.filter((reservation) => reservation.id !== id),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const createCustomer = useCallback(
    async (rawInput: CustomerInput) => {
      let input: CustomerInput;
      try {
        input = parseCustomerInput(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      let created: Customer;
      if (isDemo) {
        created = { ...input, id: randomId("customer"), created_at: new Date().toISOString() };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { data, error } = await supabase.rpc("create_customer_secure", {
          p_request_id: crypto.randomUUID(),
          p_name: input.name,
          p_organization: input.organization,
          p_phone: input.phone,
          p_email: input.email,
          p_notes: input.notes,
        });
        if (error) throw new Error(databaseMessage(error));
        created = rpcRow(data as Customer | Customer[] | null);
      }

      applySnapshot({
        reservations: reservationsRef.current,
        customers: [...customersRef.current, created].sort((a, b) => a.name.localeCompare(b.name)),
        blockedPeriods: blockedPeriodsRef.current,
      });
      return created;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const updateCustomer = useCallback(
    async (id: string, rawInput: CustomerInput) => {
      let input: CustomerInput;
      try {
        input = parseCustomerInput(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      let updated: Customer;
      if (isDemo) {
        const current = customersRef.current.find((customer) => customer.id === id);
        if (!current) throw new Error("Cliente não encontrado.");
        updated = { ...current, ...input };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { data, error } = await supabase.rpc("update_customer_secure", {
          p_request_id: crypto.randomUUID(),
          p_id: id,
          p_name: input.name,
          p_organization: input.organization,
          p_phone: input.phone,
          p_email: input.email,
          p_notes: input.notes,
        });
        if (error) throw new Error(databaseMessage(error));
        updated = rpcRow(data as Customer | Customer[] | null);
      }

      applySnapshot({
        customers: customersRef.current
          .map((customer) => (customer.id === id ? updated : customer))
          .sort((a, b) => a.name.localeCompare(b.name)),
        reservations: reservationsRef.current.map((reservation) =>
          reservation.customer_id === id ? { ...reservation, customer: updated } : reservation
        ),
        blockedPeriods: blockedPeriodsRef.current,
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const deleteCustomer = useCallback(
    async (id: string, rawReason: string) => {
      let reason: string;
      try {
        reason = parseAuditReason(rawReason);
      } catch (error) {
        throw new Error(validationMessage(error));
      }
      if (!isDemo) {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { error } = await supabase.rpc("delete_customer_secure", {
          p_request_id: crypto.randomUUID(),
          p_id: id,
          p_reason: reason,
        });
        if (error) throw new Error(databaseMessage(error));
      }

      applySnapshot({
        customers: customersRef.current.filter((customer) => customer.id !== id),
        reservations: reservationsRef.current.map((reservation) =>
          reservation.customer_id === id
            ? { ...reservation, customer_id: null, customer: null }
            : reservation
        ),
        blockedPeriods: blockedPeriodsRef.current,
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const addPayment = useCallback(
    async (rawInput: PaymentInput) => {
      let input: PaymentInput;
      try {
        input = parsePaymentInput(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      let created: Payment;
      if (isDemo) {
        created = normalizePayment({
          ...input,
          id: randomId("payment"),
          created_at: new Date().toISOString(),
        });
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const requestKey = crypto.randomUUID();
        const { data, error } = await supabase.rpc("record_payment_secure", {
          p_request_key: requestKey,
          p_reservation_id: input.reservation_id,
          p_amount: input.amount,
          p_payment_date: input.payment_date,
          p_method: input.method,
          p_notes: input.notes,
        });
        if (error) throw new Error(databaseMessage(error));
        created = normalizePayment(rpcRow(data as Payment | Payment[] | null));
      }

      applySnapshot({
        reservations: reservationsRef.current.map((reservation) =>
          reservation.id === input.reservation_id
            ? { ...reservation, payments: [...(reservation.payments ?? []), created] }
            : reservation
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
      return created;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const deletePayment = useCallback(
    async (
      id: string,
      reservationId: string,
      rawReason: string
    ) => {
      let reason: string;
      try {
        reason = parseAuditReason(rawReason);
      } catch (error) {
        throw new Error(validationMessage(error));
      }
      let voidedPayment: Payment;
      if (isDemo) {
        const currentPayment = reservationsRef.current
          .find((reservation) => reservation.id === reservationId)
          ?.payments?.find((payment) => payment.id === id);
        if (!currentPayment) throw new Error("Pagamento não encontrado.");
        voidedPayment = {
          ...currentPayment,
          voided_at: new Date().toISOString(),
          void_reason: reason,
          voided_by: "demo-admin",
        };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { data, error } = await supabase.rpc("void_payment_secure", {
          p_request_id: crypto.randomUUID(),
          p_payment_id: id,
          p_reason: reason,
        });
        if (error) throw new Error(databaseMessage(error));
        voidedPayment = normalizePayment(rpcRow(data as Payment | Payment[] | null));
      }

      applySnapshot({
        reservations: reservationsRef.current.map((reservation) =>
          reservation.id === reservationId
            ? {
                ...reservation,
                payments: (reservation.payments ?? []).map((payment) =>
                  payment.id === id ? voidedPayment : payment
                ),
              }
            : reservation
        ),
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current,
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const addBlockedPeriod = useCallback(
    async (rawInput: BlockedPeriodInput) => {
      let input: BlockedPeriodInput;
      try {
        input = parseBlockedPeriodInput(rawInput);
      } catch (error) {
        throw new Error(validationMessage(error));
      }

      let created: BlockedPeriod;
      if (isDemo) {
        const conflictsReservation = reservationsRef.current.some(
          (reservation) =>
            isBlockingStatus(reservation.status) &&
            rangesOverlap(
              input.start_date,
              input.end_date,
              reservation.start_date,
              reservation.end_date
            )
        );
        const conflictsBlock = blockedPeriodsRef.current.some((period) =>
          rangesOverlap(input.start_date, input.end_date, period.start_date, period.end_date)
        );
        if (conflictsReservation || conflictsBlock) throw new Error("BLOCK_CONFLICT");

        created = {
          ...input,
          id: randomId("block"),
          created_at: new Date().toISOString(),
        };
      } else {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { data, error } = await supabase.rpc("create_blocked_period_secure", {
          p_request_id: crypto.randomUUID(),
          p_start_date: input.start_date,
          p_end_date: input.end_date,
          p_reason: input.reason,
        });
        if (error) throw new Error(databaseMessage(error));
        created = rpcRow(data as BlockedPeriod | BlockedPeriod[] | null);
      }

      applySnapshot({
        reservations: reservationsRef.current,
        customers: customersRef.current,
        blockedPeriods: [...blockedPeriodsRef.current, created].sort((a, b) =>
          a.start_date.localeCompare(b.start_date)
        ),
      });
      return created;
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const removeBlockedPeriod = useCallback(
    async (id: string, rawReason: string) => {
      let reason: string;
      try {
        reason = parseAuditReason(rawReason);
      } catch (error) {
        throw new Error(validationMessage(error));
      }
      if (!isDemo) {
        if (!supabase) throw new Error("Banco indisponível.");
        await ensureProfile();
        const { error } = await supabase.rpc("delete_blocked_period_secure", {
          p_request_id: crypto.randomUUID(),
          p_id: id,
          p_reason: reason,
        });
        if (error) throw new Error(databaseMessage(error));
      }

      applySnapshot({
        reservations: reservationsRef.current,
        customers: customersRef.current,
        blockedPeriods: blockedPeriodsRef.current.filter((period) => period.id !== id),
      });
    },
    [applySnapshot, ensureProfile, isDemo, supabase]
  );

  const value = useMemo<AgendaContextValue>(
    () => ({
      loading,
      isDemo,
      role,
      reservations,
      customers,
      blockedPeriods,
      refresh,
      createReservation,
      createReservationWithPayment,
      updateReservation,
      updateReservationFinancial,
      deleteReservation,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      addPayment,
      deletePayment,
      addBlockedPeriod,
      removeBlockedPeriod,
    }),
    [
      addBlockedPeriod,
      addPayment,
      blockedPeriods,
      createCustomer,
      createReservation,
      createReservationWithPayment,
      customers,
      deleteCustomer,
      deletePayment,
      deleteReservation,
      isDemo,
      loading,
      refresh,
      removeBlockedPeriod,
      reservations,
      role,
      updateCustomer,
      updateReservation,
      updateReservationFinancial,
    ]
  );

  return <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>;
}

export function useAgenda() {
  const context = useContext(AgendaContext);
  if (!context) throw new Error("useAgenda precisa estar dentro de AgendaProvider");
  return context;
}

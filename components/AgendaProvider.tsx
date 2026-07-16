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
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";
import type {
  BlockedPeriod,
  BlockedPeriodInput,
  Customer,
  CustomerInput,
  Payment,
  PaymentInput,
  Reservation,
  ReservationInput,
} from "@/lib/types";

type AgendaContextValue = {
  loading: boolean;
  isDemo: boolean;
  reservations: Reservation[];
  customers: Customer[];
  blockedPeriods: BlockedPeriod[];
  refresh: () => Promise<void>;
  createReservation: (input: ReservationInput) => Promise<Reservation>;
  updateReservation: (id: string, input: Partial<ReservationInput>) => Promise<void>;
  deleteReservation: (id: string) => Promise<void>;
  createCustomer: (input: CustomerInput) => Promise<Customer>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addPayment: (input: PaymentInput) => Promise<Payment>;
  deletePayment: (id: string, reservationId: string) => Promise<void>;
  addBlockedPeriod: (input: BlockedPeriodInput) => Promise<BlockedPeriod>;
  removeBlockedPeriod: (id: string) => Promise<void>;
};

const AgendaContext = createContext<AgendaContextValue | null>(null);
const STORAGE_KEY = "agenda-sitio-emanuel-demo-v3";

type StoredDemo = {
  reservations: Reservation[];
  customers: Customer[];
  blockedPeriods: BlockedPeriod[];
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

async function readJsonMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Não foi possível autorizar este usuário.";
  } catch {
    return "Não foi possível autorizar este usuário.";
  }
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const isDemo = !isSupabaseConfigured();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const profileReady = useRef(false);
  const loaded = useRef(false);
  const reservationsRef = useRef<Reservation[]>([]);
  const customersRef = useRef<Customer[]>([]);
  const blockedPeriodsRef = useRef<BlockedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
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
    const response = await fetch("/api/profile/bootstrap", { method: "POST" });
    if (!response.ok) throw new Error(await readJsonMessage(response));
    profileReady.current = true;
  }, [isDemo]);

  const refresh = useCallback(async () => {
    const isInitialLoad = !loaded.current;
    if (isInitialLoad) setLoading(true);

    try {
      if (isDemo || !supabase) {
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

      await ensureProfile();

      const [reservationResult, customerResult, paymentResult, blockResult] = await Promise.all([
        supabase.from("reservations").select("*").order("start_date"),
        supabase.from("customers").select("*").order("name"),
        supabase.from("payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("blocked_periods").select("*").order("start_date"),
      ]);

      const error =
        reservationResult.error || customerResult.error || paymentResult.error || blockResult.error;
      if (error) throw new Error(error.message);

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
  }, [applySnapshot, ensureProfile, isDemo, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        console.error(error);
        loaded.current = true;
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createReservation = useCallback(
    async (input: ReservationInput) => {
      const now = new Date().toISOString();
      let created: Reservation;

      if (isDemo || !supabase) {
        const conflictsReservation = isBlockingStatus(input.status) && reservationsRef.current.some((reservation) =>
          isBlockingStatus(reservation.status) &&
          rangesOverlap(input.start_date, input.end_date, reservation.start_date, reservation.end_date)
        );
        const conflictsBlock = isBlockingStatus(input.status) && blockedPeriodsRef.current.some((period) =>
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
        await ensureProfile();
        const { data, error } = await supabase.from("reservations").insert(input).select("*").single();
        if (error) throw new Error(error.message);
        created = normalizeReservation({
          ...(data as Reservation),
          customer: input.customer_id
            ? customersRef.current.find((customer) => customer.id === input.customer_id) ?? null
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

  const updateReservation = useCallback(
    async (id: string, input: Partial<ReservationInput>) => {
      const current = reservationsRef.current.find((reservation) => reservation.id === id);
      if (!current) throw new Error("Reserva não encontrada.");
      let updated: Reservation;

      if (isDemo || !supabase) {
        const next = { ...current, ...input };
        const conflictsReservation = isBlockingStatus(next.status) && reservationsRef.current.some((reservation) =>
          reservation.id !== id &&
          isBlockingStatus(reservation.status) &&
          rangesOverlap(next.start_date, next.end_date, reservation.start_date, reservation.end_date)
        );
        const conflictsBlock = isBlockingStatus(next.status) && blockedPeriodsRef.current.some((period) =>
          rangesOverlap(next.start_date, next.end_date, period.start_date, period.end_date)
        );
        if (conflictsReservation || conflictsBlock) throw new Error("RESERVATION_CONFLICT");

        updated = normalizeReservation({
          ...next,
          updated_at: new Date().toISOString(),
        });
      } else {
        await ensureProfile();
        const { data, error } = await supabase
          .from("reservations")
          .update(input)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const row = data as Reservation;
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

  const deleteReservation = useCallback(
    async (id: string) => {
      if (!isDemo && supabase) {
        await ensureProfile();
        const { error } = await supabase.from("reservations").delete().eq("id", id);
        if (error) throw new Error(error.message);
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
    async (input: CustomerInput) => {
      let created: Customer;

      if (isDemo || !supabase) {
        created = { ...input, id: randomId("customer"), created_at: new Date().toISOString() };
      } else {
        await ensureProfile();
        const { data, error } = await supabase.from("customers").insert(input).select("*").single();
        if (error) throw new Error(error.message);
        created = data as Customer;
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
    async (id: string, input: CustomerInput) => {
      let updated: Customer;

      if (isDemo || !supabase) {
        const current = customersRef.current.find((customer) => customer.id === id);
        if (!current) throw new Error("Cliente não encontrado.");
        updated = { ...current, ...input };
      } else {
        await ensureProfile();
        const { data, error } = await supabase
          .from("customers")
          .update(input)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        updated = data as Customer;
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
    async (id: string) => {
      if (!isDemo && supabase) {
        await ensureProfile();
        const { error } = await supabase.from("customers").delete().eq("id", id);
        if (error) throw new Error(error.message);
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
    async (input: PaymentInput) => {
      let created: Payment;

      if (isDemo || !supabase) {
        created = normalizePayment({
          ...input,
          id: randomId("payment"),
          created_at: new Date().toISOString(),
        });
      } else {
        await ensureProfile();
        const { data, error } = await supabase.from("payments").insert(input).select("*").single();
        if (error) throw new Error(error.message);
        created = normalizePayment(data as Payment);
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
    async (id: string, reservationId: string) => {
      if (!isDemo && supabase) {
        await ensureProfile();
        const { error } = await supabase.from("payments").delete().eq("id", id);
        if (error) throw new Error(error.message);
      }

      applySnapshot({
        reservations: reservationsRef.current.map((reservation) =>
          reservation.id === reservationId
            ? {
                ...reservation,
                payments: (reservation.payments ?? []).filter((payment) => payment.id !== id),
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
    async (input: BlockedPeriodInput) => {
      let created: BlockedPeriod;

      if (isDemo || !supabase) {
        const conflictsReservation = reservationsRef.current.some((reservation) =>
          isBlockingStatus(reservation.status) &&
          rangesOverlap(input.start_date, input.end_date, reservation.start_date, reservation.end_date)
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
        await ensureProfile();
        const { data, error } = await supabase
          .from("blocked_periods")
          .insert(input)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        created = data as BlockedPeriod;
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
    async (id: string) => {
      if (!isDemo && supabase) {
        await ensureProfile();
        const { error } = await supabase.from("blocked_periods").delete().eq("id", id);
        if (error) throw new Error(error.message);
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
      reservations,
      customers,
      blockedPeriods,
      refresh,
      createReservation,
      updateReservation,
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
      customers,
      deleteCustomer,
      deletePayment,
      deleteReservation,
      isDemo,
      loading,
      refresh,
      removeBlockedPeriod,
      reservations,
      updateCustomer,
      updateReservation,
    ]
  );

  return <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>;
}

export function useAgenda() {
  const context = useContext(AgendaContext);
  if (!context) throw new Error("useAgenda precisa estar dentro de AgendaProvider");
  return context;
}

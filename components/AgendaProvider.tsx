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
  createCustomer: (input: CustomerInput) => Promise<Customer>;
  addPayment: (input: PaymentInput) => Promise<Payment>;
  addBlockedPeriod: (input: BlockedPeriodInput) => Promise<BlockedPeriod>;
  removeBlockedPeriod: (id: string) => Promise<void>;
};

const AgendaContext = createContext<AgendaContextValue | null>(null);
const STORAGE_KEY = "agenda-sitio-emanuel-demo-v2";

type StoredDemo = {
  reservations: Reservation[];
  customers: Customer[];
  blockedPeriods: BlockedPeriod[];
};

function randomId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hydrateReservations(
  reservations: Reservation[],
  customers: Customer[],
  payments: Payment[]
) {
  return reservations.map((reservation) => ({
    ...reservation,
    customer:
      customers.find((customer) => customer.id === reservation.customer_id) ??
      reservation.customer ??
      null,
    payments: payments.filter((payment) => payment.reservation_id === reservation.id),
  }));
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
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);

  const persistDemo = useCallback((next: StoredDemo) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setReservations(next.reservations);
    setCustomers(next.customers);
    setBlockedPeriods(next.blockedPeriods);
  }, []);

  const ensureProfile = useCallback(async () => {
    if (isDemo || profileReady.current) return;
    const response = await fetch("/api/profile/bootstrap", { method: "POST" });
    if (!response.ok) throw new Error(await readJsonMessage(response));
    profileReady.current = true;
  }, [isDemo]);

  const refresh = useCallback(async () => {
    setLoading(true);

    if (isDemo || !supabase) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredDemo;
          setReservations(parsed.reservations);
          setCustomers(parsed.customers);
          setBlockedPeriods(parsed.blockedPeriods);
        } catch {
          persistDemo(initialDemo());
        }
      } else {
        persistDemo(initialDemo());
      }
      setLoading(false);
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
    setCustomers(fetchedCustomers);
    setReservations(
      hydrateReservations(
        (reservationResult.data ?? []) as Reservation[],
        fetchedCustomers,
        fetchedPayments
      )
    );
    setBlockedPeriods((blockResult.data ?? []) as BlockedPeriod[]);
    setLoading(false);
  }, [ensureProfile, isDemo, persistDemo, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        console.error(error);
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createReservation = useCallback(
    async (input: ReservationInput) => {
      if (isDemo || !supabase) {
        const now = new Date().toISOString();
        const created: Reservation = {
          ...input,
          id: randomId("reservation"),
          created_at: now,
          updated_at: now,
          customer: customers.find((customer) => customer.id === input.customer_id) ?? null,
          payments: [],
        };
        persistDemo({ reservations: [...reservations, created], customers, blockedPeriods });
        return created;
      }

      await ensureProfile();
      const { data, error } = await supabase.from("reservations").insert(input).select("*").single();
      if (error) throw new Error(error.message);
      await refresh();
      return data as Reservation;
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
  );

  const updateReservation = useCallback(
    async (id: string, input: Partial<ReservationInput>) => {
      if (isDemo || !supabase) {
        const next = reservations.map((reservation) =>
          reservation.id === id ? { ...reservation, ...input, updated_at: new Date().toISOString() } : reservation
        );
        persistDemo({ reservations: next, customers, blockedPeriods });
        return;
      }

      await ensureProfile();
      const { error } = await supabase.from("reservations").update(input).eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
  );

  const createCustomer = useCallback(
    async (input: CustomerInput) => {
      if (isDemo || !supabase) {
        const created: Customer = { ...input, id: randomId("customer"), created_at: new Date().toISOString() };
        persistDemo({ reservations, customers: [...customers, created], blockedPeriods });
        return created;
      }

      await ensureProfile();
      const { data, error } = await supabase.from("customers").insert(input).select("*").single();
      if (error) throw new Error(error.message);
      await refresh();
      return data as Customer;
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
  );

  const addPayment = useCallback(
    async (input: PaymentInput) => {
      if (isDemo || !supabase) {
        const created: Payment = { ...input, id: randomId("payment"), created_at: new Date().toISOString() };
        const nextReservations = reservations.map((reservation) =>
          reservation.id === input.reservation_id
            ? { ...reservation, payments: [...(reservation.payments ?? []), created] }
            : reservation
        );
        persistDemo({ reservations: nextReservations, customers, blockedPeriods });
        return created;
      }

      await ensureProfile();
      const { data, error } = await supabase.from("payments").insert(input).select("*").single();
      if (error) throw new Error(error.message);
      await refresh();
      return data as Payment;
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
  );

  const addBlockedPeriod = useCallback(
    async (input: BlockedPeriodInput) => {
      if (isDemo || !supabase) {
        const created: BlockedPeriod = { ...input, id: randomId("block"), created_at: new Date().toISOString() };
        persistDemo({ reservations, customers, blockedPeriods: [...blockedPeriods, created] });
        return created;
      }

      await ensureProfile();
      const { data, error } = await supabase.from("blocked_periods").insert(input).select("*").single();
      if (error) throw new Error(error.message);
      await refresh();
      return data as BlockedPeriod;
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
  );

  const removeBlockedPeriod = useCallback(
    async (id: string) => {
      if (isDemo || !supabase) {
        persistDemo({ reservations, customers, blockedPeriods: blockedPeriods.filter((period) => period.id !== id) });
        return;
      }

      await ensureProfile();
      const { error } = await supabase.from("blocked_periods").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [blockedPeriods, customers, ensureProfile, isDemo, persistDemo, refresh, reservations, supabase]
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
      createCustomer,
      addPayment,
      addBlockedPeriod,
      removeBlockedPeriod,
    }),
    [addBlockedPeriod, addPayment, blockedPeriods, createCustomer, createReservation, customers, isDemo, loading, refresh, removeBlockedPeriod, reservations, updateReservation]
  );

  return <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>;
}

export function useAgenda() {
  const context = useContext(AgendaContext);
  if (!context) throw new Error("useAgenda precisa estar dentro de AgendaProvider");
  return context;
}

export type ReservationStatus =
  | "PRE_RESERVA"
  | "CONFIRMADA"
  | "REALIZADA"
  | "CANCELADA";

export type PaymentMethod = "PIX" | "DINHEIRO" | "CARTAO" | "TRANSFERENCIA" | "OUTRO";
export type ProfileRole = "ADMIN" | "GESTOR" | "FINANCEIRO" | "LEITURA";

export type Customer = {
  id: string;
  name: string;
  organization: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
  updated_at?: string;
};

export type Payment = {
  id: string;
  reservation_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  notes: string;
  created_at: string;
  request_key?: string;
  voided_at?: string | null;
  void_reason?: string | null;
  voided_by?: string | null;
};

export type Reservation = {
  id: string;
  customer_id: string | null;
  church_name: string;
  contact_name: string;
  phone: string;
  email: string;
  start_date: string;
  end_date: string;
  guests_estimated: number;
  guests_confirmed: number | null;
  package_name: string;
  total_amount: number;
  status: ReservationStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  customer?: Customer | null;
  payments?: Payment[];
};

export type BlockedPeriod = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
};

export type ReservationInput = Omit<
  Reservation,
  | "id"
  | "created_at"
  | "updated_at"
  | "payments"
  | "customer"
  | "cancelled_at"
  | "cancel_reason"
  | "cancelled_by"
>;

export type CustomerInput = Omit<Customer, "id" | "created_at" | "updated_at">;
export type PaymentInput = Omit<
  Payment,
  "id" | "created_at" | "request_key" | "voided_at" | "void_reason" | "voided_by"
>;
export type BlockedPeriodInput = Omit<BlockedPeriod, "id" | "created_at">;

export type MutationOptions = {
  reason?: string;
};

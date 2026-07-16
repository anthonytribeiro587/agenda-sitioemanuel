import { z } from "zod";
import type {
  BlockedPeriodInput,
  CustomerInput,
  PaymentInput,
  ReservationFinancialUpdate,
  ReservationInput,
} from "@/lib/types";

const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Informe ao menos ${min} caracteres.`)
    .max(max, `Use no máximo ${max} caracteres.`);

const optionalText = (max: number) => z.string().trim().max(max);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const uuidOrNull = z.string().uuid().nullable();
const phone = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length >= 10 && value.length <= 15, "Telefone inválido.");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (value) => value === "" || /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(value),
    "E-mail inválido."
  );
const money = z.coerce.number().finite().min(0).max(1_000_000);

export const customerInputSchema = z.object({
  name: safeText(2, 120),
  organization: safeText(2, 160),
  phone,
  email,
  notes: optionalText(1500),
});

export const reservationInputSchema = z
  .object({
    customer_id: uuidOrNull,
    church_name: safeText(2, 160),
    contact_name: safeText(2, 120),
    phone,
    email,
    start_date: dateString,
    end_date: dateString,
    guests_estimated: z.coerce.number().int().min(1).max(500),
    guests_confirmed: z.coerce.number().int().min(1).max(500).nullable(),
    package_name: z.string().trim().max(120).transform((value) => value || "A definir"),
    total_amount: money,
    status: z.enum(["PRE_RESERVA", "CONFIRMADA", "REALIZADA", "CANCELADA"]),
    notes: optionalText(3000),
  })
  .superRefine((value, context) => {
    if (value.end_date < value.start_date) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "A data final não pode ser anterior à data inicial.",
      });
    }
  });

export const paymentInputSchema = z.object({
  reservation_id: z.string().uuid(),
  amount: z.coerce.number().finite().positive().max(1_000_000),
  payment_date: dateString,
  method: z.enum(["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"]),
  notes: optionalText(500),
});


export const auditReasonSchema = safeText(5, 500);

export const reservationFinancialUpdateSchema = z
  .object({
    total_amount: money.optional(),
    total_reason: z.string().trim().max(500).optional(),
    payment: paymentInputSchema.omit({ reservation_id: true }).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.total_amount === undefined && !value.payment) {
      context.addIssue({
        code: "custom",
        message: "Informe um valor ou um pagamento para atualizar.",
      });
    }
    if (value.total_amount !== undefined && (value.total_reason ?? "").trim().length < 5) {
      context.addIssue({
        code: "custom",
        path: ["total_reason"],
        message: "Informe o motivo da alteração financeira com pelo menos 5 caracteres.",
      });
    }
  });

export const blockedPeriodInputSchema = z
  .object({
    start_date: dateString,
    end_date: dateString,
    reason: safeText(5, 500),
  })
  .superRefine((value, context) => {
    if (value.end_date < value.start_date) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "A data final não pode ser anterior à data inicial.",
      });
    }
  });

export function parseCustomerInput(input: CustomerInput): CustomerInput {
  return customerInputSchema.parse(input) as CustomerInput;
}

export function parseReservationInput(input: ReservationInput): ReservationInput {
  return reservationInputSchema.parse(input) as ReservationInput;
}

export function parsePaymentInput(input: PaymentInput): PaymentInput {
  return paymentInputSchema.parse(input) as PaymentInput;
}

export function parseBlockedPeriodInput(input: BlockedPeriodInput): BlockedPeriodInput {
  return blockedPeriodInputSchema.parse(input) as BlockedPeriodInput;
}

export function parseAuditReason(input: string): string {
  return auditReasonSchema.parse(input);
}

export function parseReservationFinancialUpdate(
  input: ReservationFinancialUpdate
): ReservationFinancialUpdate {
  return reservationFinancialUpdateSchema.parse(input) as ReservationFinancialUpdate;
}

export function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Dados inválidos.";
  }
  return error instanceof Error ? error.message : "Não foi possível validar os dados.";
}

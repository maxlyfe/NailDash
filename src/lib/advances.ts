import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single source of truth for advance ("adiantamento") bookkeeping.
 *
 * The appointment row is authoritative: `appointments.advance_amount` is what the
 * client actually paid. The matching `transactions` row exists only so the advance
 * shows up in the Receitas history — it must always mirror the appointment, 1:1.
 *
 * Every write goes through here so a screen can never see two rows for the same
 * advance, a row for an advance that was reduced/zeroed, or a row still dated to
 * the old month after the appointment was rescheduled.
 */

export const ADVANCE_CATEGORY = 'adiantamento';

const PAYMENT_COLUMNS = ['payment_pix', 'payment_cash', 'payment_card', 'payment_transfer'] as const;

export type AdvanceSyncInput = {
  salonId: string;
  appointmentId: string;
  clientId?: string | null;
  professionalId?: string | null;
  description: string;
  /** Value currently stored on the appointment. 0 or less removes the transaction. */
  amount: number;
  paymentMethod?: string | null;
  /** Appointment `starts_at` — drives `transaction_date` so remarcações follow along. */
  appointmentDate: string;
};

/** Zeroes every payment column and puts the full amount on the one that was used. */
function paymentSplit(method: string | null | undefined, amount: number) {
  const split: Record<string, number> = {};
  for (const col of PAYMENT_COLUMNS) split[col] = 0;
  const target = `payment_${method || 'pix'}`;
  split[PAYMENT_COLUMNS.includes(target as any) ? target : 'payment_pix'] = amount;
  return split;
}

function round2(v: number) {
  return Math.round((v || 0) * 100) / 100;
}

/**
 * Makes the advance transaction match the appointment exactly.
 *
 * Idempotent: safe to call on every save, however many times, whether the advance
 * was created, changed, zeroed, or the appointment was moved to another date.
 * Also self-heals duplicates left behind by the previous insert-only code.
 */
export async function syncAdvanceTransaction(
  supabase: SupabaseClient,
  input: AdvanceSyncInput,
): Promise<void> {
  const { data } = await supabase
    .from('transactions')
    .select('id, registered_at')
    .eq('appointment_id', input.appointmentId)
    .eq('category', ADVANCE_CATEGORY)
    .order('created_at', { ascending: true });

  const existing = data || [];
  const amount = round2(input.amount);

  // Advance removed or zeroed — drop every row, don't leave money hanging around.
  if (amount <= 0) {
    if (existing.length > 0) {
      await supabase.from('transactions').delete().in('id', existing.map((r: any) => r.id));
    }
    return;
  }

  const payload: Record<string, unknown> = {
    salon_id: input.salonId,
    type: 'sale',
    appointment_id: input.appointmentId,
    client_id: input.clientId ?? null,
    professional_id: input.professionalId ?? null,
    description: input.description,
    total_amount: amount,
    service_price: 0,
    discount: 0,
    tax: 0,
    tips: 0,
    category: ADVANCE_CATEGORY,
    ...paymentSplit(input.paymentMethod, amount),
    transaction_date: input.appointmentDate,
  };

  if (existing.length === 0) {
    await supabase.from('transactions').insert({ ...payload, registered_at: new Date().toISOString() });
    return;
  }

  // Keep the oldest row so `registered_at` stays the date the money actually came in.
  await supabase.from('transactions').update(payload).eq('id', existing[0].id);

  if (existing.length > 1) {
    await supabase.from('transactions').delete().in('id', existing.slice(1).map((r: any) => r.id));
  }
}

/** Removes the advance transaction — used when an appointment is cancelled. */
export async function deleteAdvanceTransactions(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  await supabase
    .from('transactions')
    .delete()
    .eq('appointment_id', appointmentId)
    .eq('category', ADVANCE_CATEGORY);
}

/**
 * Removes every transaction tied to an appointment (advance + turno).
 * Used when the appointment itself is deleted — otherwise the rows stay orphaned
 * and keep inflating the financial totals forever.
 */
export async function deleteAppointmentTransactions(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  await supabase.from('transactions').delete().eq('appointment_id', appointmentId);
}

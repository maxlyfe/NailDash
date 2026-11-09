/**
 * Totais de uma cliente a partir do histórico de atendimentos.
 *
 * Existe porque as colunas denormalizadas `clients.total_spent`,
 * `clients.visit_count` e `clients.last_visit_at` nunca são escritas pelo app
 * — nada no código grava nelas e não há gatilho no banco — então ficam
 * zeradas, ou paradas no valor que veio da importação inicial. Quem precisa
 * dos números soma o histórico, que é a fonte real.
 */

export type HistoryLike = {
  status: string;
  starts_at: string;
  total_amount: number | string | null;
};

export type ClientTotals = {
  /** Atendimentos concluídos. */
  visits: number;
  totalSpent: number;
  /** Mais recente dos concluídos, ou null se não houver nenhum. */
  lastVisitAt: string | null;
};

/** Converte com segurança: numeric do Postgres pode chegar como string. */
function amountOf(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function clientTotals(history: HistoryLike[]): ClientTotals {
  let visits = 0;
  let totalSpent = 0;
  let lastVisitAt: string | null = null;

  for (const a of history) {
    if (a.status !== 'completed') continue;
    visits += 1;
    totalSpent += amountOf(a.total_amount);
    if (!lastVisitAt || new Date(a.starts_at).getTime() > new Date(lastVisitAt).getTime()) {
      lastVisitAt = a.starts_at;
    }
  }

  return { visits, totalSpent, lastVisitAt };
}

/**
 * Clientes fixas — recorrência por blocos de período.
 *
 * Uma cliente é "fixa" numa cadência C e profundidade k se tem ao menos um
 * atendimento concluído em CADA um dos k blocos de C dias contados de hoje
 * pra trás. Está "em risco" se cobre os blocos 1..k (a janela anterior) mas
 * falhou justamente no bloco mais recente.
 *
 * Toda fronteira de bloco é meia-noite no fuso do salão (America/Sao_Paulo),
 * construída com spInstant — nunca com aritmética de milissegundos — para que
 * o dia certo seja o dia certo independente de DST.
 */

import { spInstant, spNow, spParts } from './dates';

export type Cadence = 21 | 30 | 60;

export const CADENCES: Cadence[] = [21, 30, 60];

/** Profundidades (em blocos) oferecidas para cada cadência. */
export const CADENCE_DEPTHS: Record<Cadence, number[]> = {
  21: [1, 2, 3], //  21 /  42 /  63 dias
  30: [2, 3, 4], //  60 /  90 / 120 dias
  60: [1, 2, 3], //  60 / 120 / 180 dias
};

/** Maior janela que qualquer combinação pode exigir: 60 × (3 + 1) = 240 dias. */
export const MAX_LOOKBACK_DAYS = 240;

export type Visit = {
  clientId: string;
  at: string; // ISO instant (appointments.starts_at)
  amount: number;
};

export type RegularRow = {
  clientId: string;
  visits: number;
  totalSpent: number;
  avgTicket: number;
  lastVisitAt: string;
  /** Dias cheios desde a última visita, no calendário do salão. */
  daysSinceLastVisit: number;
};

export type Classification = {
  regulars: RegularRow[];
  atRisk: RegularRow[];
};

/**
 * Fronteiras dos blocos, do mais recente para o mais antigo.
 * Devolve `blocks + 1` timestamps: o primeiro é meia-noite SP de amanhã (para
 * o dia de hoje contar inteiro) e cada seguinte recua `cadence` dias.
 * O bloco `i` é o intervalo [ boundaries[i + 1], boundaries[i] ).
 */
export function blockBoundaries(cadence: Cadence, blocks: number): number[] {
  const now = spNow();
  const out: number[] = [];
  for (let i = 0; i <= blocks; i++) {
    out.push(spInstant(now.year, now.month, now.day + 1 - i * cadence).getTime());
  }
  return out;
}

/** Índice do bloco que contém `ts`, ou -1 se cair fora da janela coberta. */
function blockIndexOf(ts: number, boundaries: number[]): number {
  if (ts >= boundaries[0]) return -1; // no futuro
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (ts >= boundaries[i + 1] && ts < boundaries[i]) return i;
  }
  return -1; // antes do início da janela
}

/**
 * Dias de calendário entre o dia da visita e hoje, no fuso do salão: visita de
 * ontem é 1, de hoje é 0 — independente da hora em que o atendimento ocorreu.
 */
function calendarDaysSince(at: string, todayStart: number): number {
  const p = spParts(at);
  const visitDayStart = spInstant(p.year, p.month, p.day).getTime();
  return Math.max(0, Math.round((todayStart - visitDayStart) / 86_400_000));
}

type Entry = { idx: number; at: string; amount: number };

type Bucket = {
  blocks: Set<number>;
  entries: Entry[];
};

/**
 * Monta a linha somando apenas as visitas dos blocos [from, to] — a janela que
 * de fato qualificou a cliente, que é diferente para fixas (0..depth-1) e para
 * quem está em risco (1..depth).
 */
function buildRow(
  clientId: string, b: Bucket, from: number, to: number, todayStart: number,
): RegularRow {
  let visits = 0;
  let totalSpent = 0;
  let lastVisitAt = '';

  for (const e of b.entries) {
    if (e.idx < from || e.idx > to) continue;
    visits += 1;
    totalSpent += e.amount || 0;
    if (!lastVisitAt || new Date(e.at).getTime() > new Date(lastVisitAt).getTime()) {
      lastVisitAt = e.at;
    }
  }

  return {
    clientId,
    visits,
    totalSpent,
    avgTicket: visits > 0 ? totalSpent / visits : 0,
    lastVisitAt,
    daysSinceLastVisit: lastVisitAt ? calendarDaysSince(lastVisitAt, todayStart) : 0,
  };
}

/**
 * Separa quem cumpre a régua de quem acabou de furá-la.
 *
 * `depth` é o número de blocos exigidos. Para detectar os "em risco" avalia-se
 * um bloco extra, então `visits` deve cobrir ao menos (depth + 1) × cadence dias.
 */
export function classify(visits: Visit[], cadence: Cadence, depth: number): Classification {
  // depth + 1 blocos: o extra existe só para julgar os "em risco".
  const boundaries = blockBoundaries(cadence, depth + 1);
  const todayStart = boundaries[0] - 86_400_000; // meia-noite SP de hoje
  const buckets = new Map<string, Bucket>();

  for (const v of visits) {
    const ts = new Date(v.at).getTime();
    if (!Number.isFinite(ts)) continue;
    const idx = blockIndexOf(ts, boundaries);
    if (idx < 0) continue;

    let b = buckets.get(v.clientId);
    if (!b) {
      b = { blocks: new Set(), entries: [] };
      buckets.set(v.clientId, b);
    }
    b.blocks.add(idx);
    b.entries.push({ idx, at: v.at, amount: v.amount });
  }

  const regulars: RegularRow[] = [];
  const atRisk: RegularRow[] = [];

  buckets.forEach((b, clientId) => {
    // Fixa: cobre todos os blocos 0..depth-1.
    let coversCurrent = true;
    for (let i = 0; i < depth; i++) {
      if (!b.blocks.has(i)) { coversCurrent = false; break; }
    }
    if (coversCurrent) {
      regulars.push(buildRow(clientId, b, 0, depth - 1, todayStart));
      return;
    }

    // Em risco: cobria a janela anterior (blocos 1..depth) e furou só o bloco 0.
    if (b.blocks.has(0)) return;
    let coveredPrevious = true;
    for (let i = 1; i <= depth; i++) {
      if (!b.blocks.has(i)) { coveredPrevious = false; break; }
    }
    if (coveredPrevious) atRisk.push(buildRow(clientId, b, 1, depth, todayStart));
  });

  const byValue = (a: RegularRow, b: RegularRow) => b.totalSpent - a.totalSpent;
  regulars.sort(byValue);
  atRisk.sort(byValue);

  return { regulars, atRisk };
}

/** Quantas fixas em cada profundidade oferecida para a cadência. */
export function countsByDepth(visits: Visit[], cadence: Cadence): Record<number, number> {
  const out: Record<number, number> = {};
  for (const depth of CADENCE_DEPTHS[cadence]) {
    out[depth] = classify(visits, cadence, depth).regulars.length;
  }
  return out;
}

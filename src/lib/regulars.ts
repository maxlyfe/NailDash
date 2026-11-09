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

import { spInstant, spNow, spParts, spDateKey, isDateKey } from './dates';

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

/* ─── Período livre ─── */

export type PeriodSort = 'recent' | 'spent' | 'visits';

export const PERIOD_SORTS: PeriodSort[] = ['recent', 'spent', 'visits'];

/**
 * Visita no modo período. `key` identifica a pessoa: o id da cliente quando há
 * cadastro, ou uma chave sintética para o atendimento avulso (walk-in).
 */
export type PeriodVisit = { key: string; at: string; amount: number };

export type PeriodRow = {
  key: string;
  visits: number;
  totalSpent: number;
  avgTicket: number;
  lastVisitAt: string;
  daysSinceLastVisit: number;
};

/**
 * Agrupa os atendimentos de um intervalo por pessoa. Diferente de `classify`,
 * não há régua nenhuma: quem tem ao menos um atendimento no intervalo entra.
 */
export function aggregatePeriod(visits: PeriodVisit[], sort: PeriodSort): PeriodRow[] {
  const now = spNow();
  const todayStart = spInstant(now.year, now.month, now.day).getTime();

  const acc = new Map<string, { visits: number; totalSpent: number; lastVisitAt: string }>();

  for (const v of visits) {
    const cur = acc.get(v.key);
    if (!cur) {
      acc.set(v.key, { visits: 1, totalSpent: v.amount || 0, lastVisitAt: v.at });
      continue;
    }
    cur.visits += 1;
    cur.totalSpent += v.amount || 0;
    if (new Date(v.at).getTime() > new Date(cur.lastVisitAt).getTime()) {
      cur.lastVisitAt = v.at;
    }
  }

  const rows: PeriodRow[] = [];
  acc.forEach((a, key) => {
    rows.push({
      key,
      visits: a.visits,
      totalSpent: a.totalSpent,
      avgTicket: a.visits > 0 ? a.totalSpent / a.visits : 0,
      lastVisitAt: a.lastVisitAt,
      daysSinceLastVisit: calendarDaysSince(a.lastVisitAt, todayStart),
    });
  });

  rows.sort((x, y) => {
    if (sort === 'spent') return y.totalSpent - x.totalSpent;
    if (sort === 'visits') return y.visits - x.visits || y.totalSpent - x.totalSpent;
    // 'recent'
    return new Date(y.lastVisitAt).getTime() - new Date(x.lastVisitAt).getTime();
  });

  return rows;
}

export type PeriodSummary = {
  /** Pessoas distintas atendidas. */
  clients: number;
  /** Turnos (atendimentos concluídos) no intervalo. */
  appointments: number;
  totalRevenue: number;
  avgTicket: number;
  /** Dias de calendário do intervalo, incluindo as duas pontas. */
  calendarDays: number;
  /** Dias em que houve ao menos um atendimento. */
  activeDays: number;
  /** Receita ÷ dias de calendário. */
  perCalendarDay: number;
  /** Receita ÷ dias com movimento — ignora os dias fechados. */
  perActiveDay: number;
};

/** Dias de calendário entre duas chaves "YYYY-MM-DD", contando as duas pontas. */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  // Chaves digitadas pelo usuário podem vir vazias ou pela metade; sem isso o
  // cálculo devolve NaN e vaza para a tela.
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return 0;
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const a = spInstant(fy, fm, fd).getTime();
  const b = spInstant(ty, tm, td).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Números do cabeçalho do modo período. `perCalendarDay` e `perActiveDay`
 * existem os dois de propósito: a média sobre o calendário dilui os dias
 * fechados, a média sobre os dias com movimento mostra o ritmo real de trabalho.
 */
export function summarizePeriod(
  visits: PeriodVisit[], fromKey: string, toKey: string,
): PeriodSummary {
  const people = new Set<string>();
  const activeDayKeys = new Set<string>();
  let totalRevenue = 0;

  for (const v of visits) {
    people.add(v.key);
    activeDayKeys.add(spDateKey(v.at));
    totalRevenue += v.amount || 0;
  }

  const appointments = visits.length;
  const calendarDays = daysBetweenKeys(fromKey, toKey);
  const activeDays = activeDayKeys.size;

  return {
    clients: people.size,
    appointments,
    totalRevenue,
    avgTicket: appointments > 0 ? totalRevenue / appointments : 0,
    calendarDays,
    activeDays,
    perCalendarDay: calendarDays > 0 ? totalRevenue / calendarDays : 0,
    perActiveDay: activeDays > 0 ? totalRevenue / activeDays : 0,
  };
}

/** Quantas fixas em cada profundidade oferecida para a cadência. */
export function countsByDepth(visits: Visit[], cadence: Cadence): Record<number, number> {
  const out: Record<number, number> = {};
  for (const depth of CADENCE_DEPTHS[cadence]) {
    out[depth] = classify(visits, cadence, depth).regulars.length;
  }
  return out;
}

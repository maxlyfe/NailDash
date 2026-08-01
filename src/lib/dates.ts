/**
 * Every date in the app is anchored to the salon's timezone.
 *
 * Instants are stored in UTC (correct — an instant has no timezone), but *which
 * day or month a lançamento belongs to* must always be decided in Brasília time.
 * Relying on the device clock meant a turno at 21h on the 31st was filed into the
 * next month, and a phone travelling with a different timezone saw different
 * numbers than the computer.
 *
 * Two directions, both explicit:
 *   instant → wall clock : spParts, spDateKey, spMonthKey, spInputValue, spFormat*
 *   wall clock → instant : spInstant, spFromInput, spMonthRange, spDayKeyRange
 */

export const SALON_TZ = 'America/Sao_Paulo';

type WallClock = {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
};

let formatter: Intl.DateTimeFormat | null = null;

function getFormatter(): Intl.DateTimeFormat {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: SALON_TZ,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  return formatter;
}

function toTimestamp(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function partsAt(ts: number): WallClock {
  const out: Record<string, number> = {};
  for (const part of getFormatter().formatToParts(new Date(ts))) {
    if (part.type !== 'literal') out[part.type] = parseInt(part.value, 10);
  }
  // Some engines render midnight as hour 24 under hour12:false
  if (out.hour === 24) out.hour = 0;
  return {
    year: out.year, month: out.month, day: out.day,
    hour: out.hour, minute: out.minute, second: out.second,
  };
}

/** How far ahead of UTC the salon timezone is, at a given instant, in ms. */
function offsetMs(ts: number): number {
  const p = partsAt(ts);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/* ─── instant → São Paulo wall clock ─── */

export function spParts(value: string | number | Date): WallClock {
  return partsAt(toTimestamp(value));
}

/** "2026-08-31" — the calendar day this instant falls on in São Paulo. */
export function spDateKey(value: string | number | Date): string {
  const p = spParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-08" — the month this instant belongs to in São Paulo. */
export function spMonthKey(value: string | number | Date): string {
  const p = spParts(value);
  return `${p.year}-${pad(p.month)}`;
}

/** Minutes since midnight São Paulo — used to position turnos on the grid. */
export function spMinutesOfDay(value: string | number | Date): number {
  const p = spParts(value);
  return p.hour * 60 + p.minute;
}

/** "2026-08-31T14:30" for <input type="datetime-local">. */
export function spInputValue(value: string | number | Date): string {
  const p = spParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * A device-local Date carrying São Paulo's calendar day.
 *
 * The calendar grid does layout math with getDate()/getDay(), which read the
 * device clock. Feeding it this keeps that math correct on any device.
 */
export function spCalendarDate(value: string | number | Date): Date {
  const p = spParts(value);
  return new Date(p.year, p.month - 1, p.day);
}

/* ─── São Paulo wall clock → instant ─── */

/** The instant at which the given wall-clock moment happens in São Paulo. */
export function spInstant(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0, ms = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Two passes so a DST edge settles (Brazil has no DST today, but may again)
  let ts = wall - offsetMs(wall);
  ts = wall - offsetMs(ts);
  return new Date(ts);
}

/** "2026-08-31T14:30" (as typed by the user) → ISO instant. */
export function spFromInput(value: string): string {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return spInstant(y, m, d, h || 0, mi || 0).toISOString();
}

/** "2026-08-31" + "14:30" → ISO instant. */
export function spFromDateAndTime(dateKey: string, time: string): string {
  return spFromInput(`${dateKey}T${time}`);
}

/** Noon São Paulo on the given day — a safe anchor for date-only fields. */
export function spFromDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return spInstant(y, m, d, 12).toISOString();
}

/* ─── query ranges (ISO instants, exact on both ends) ─── */

export function spMonthRange(year: number, month: number): { start: string; end: string } {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: spInstant(year, month, 1).toISOString(),
    end: new Date(spInstant(nextYear, nextMonth, 1).getTime() - 1).toISOString(),
  };
}

/** Inclusive range covering both calendar days, e.g. "2026-08-01".."2026-08-31". */
export function spDayKeyRange(startKey: string, endKey: string): { start: string; end: string } {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  return {
    start: spInstant(sy, sm, sd).toISOString(),
    end: new Date(spInstant(ey, em, ed + 1).getTime() - 1).toISOString(),
  };
}

export function spYearRange(year: number): { start: string; end: string } {
  return {
    start: spInstant(year, 1, 1).toISOString(),
    end: new Date(spInstant(year + 1, 1, 1).getTime() - 1).toISOString(),
  };
}

/* ─── "now", in São Paulo ─── */

export function spNow(): WallClock {
  return spParts(Date.now());
}

export function spTodayKey(): string {
  return spDateKey(Date.now());
}

export function spTodayMonthKey(): string {
  return spMonthKey(Date.now());
}

/** Today as a device-local Date carrying São Paulo's calendar day. */
export function spTodayDate(): Date {
  return spCalendarDate(Date.now());
}

export function spNowMinutes(): number {
  return spMinutesOfDay(Date.now());
}

/* ─── display ─── */

export function spFormatDate(
  value: string | number | Date,
  locale: string,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(toTimestamp(value)).toLocaleDateString(locale, { timeZone: SALON_TZ, ...opts });
}

export function spFormatTime(
  value: string | number | Date,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  return new Date(toTimestamp(value)).toLocaleTimeString(locale, { timeZone: SALON_TZ, ...opts });
}

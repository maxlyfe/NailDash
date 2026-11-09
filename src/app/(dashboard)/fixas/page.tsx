'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { useLiveData } from '@/lib/live-data';
import {
  spNow, spInstant, spFormatDate, spTodayKey, spDayKeyRange, spFromDateKey,
} from '@/lib/dates';
import { waLink } from '@/lib/phone';
import {
  CADENCES, CADENCE_DEPTHS, MAX_LOOKBACK_DAYS, PERIOD_SORTS,
  classify, countsByDepth, aggregatePeriod, summarizePeriod,
  type Cadence, type Visit, type PeriodVisit, type PeriodSort,
} from '@/lib/regulars';
import ClientDetail from '@/components/ClientDetail';
import {
  Repeat, Users, MessageCircle, Loader2, AlertTriangle, TrendingUp,
  ChevronDown, CalendarRange, Users2, CalendarCheck, DollarSign, BarChart3,
} from 'lucide-react';

type ApptRow = {
  client_id: string | null;
  client_name?: string | null;
  starts_at: string;
  total_amount: number | null;
  client: { name: string | null; phone: string | null }
    | { name: string | null; phone: string | null }[]
    | null;
};

/** Identidade de uma pessoa na lista; clientId nulo = atendimento avulso. */
type PersonInfo = { name: string; phone: string | null; clientId: string | null };

/** Linha pronta para render, igual nos dois modos. */
type DisplayRow = {
  key: string;
  clientId: string | null;
  name: string;
  phone: string | null;
  visits: number;
  totalSpent: number;
  avgTicket: number;
  lastVisitAt: string;
  badge?: string;
  /** true = aviso (amarelo); false/ausente = neutro. */
  badgeWarn?: boolean;
};

function firstOfThisMonthKey(): string {
  const now = spNow();
  return `${now.year}-${String(now.month).padStart(2, '0')}-01`;
}

export default function FixasPage() {
  const { salon, loading: authLoading } = useAuth();
  const { t, locale } = useT();
  const supabase = useSupabase();

  const [mode, setMode] = useState<'cadence' | 'period'>('cadence');
  const [openId, setOpenId] = useState<string | null>(null);

  /* ── Modo cadência ── */
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clientInfo, setClientInfo] = useState<Map<string, PersonInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [cadence, setCadence] = useState<Cadence>(30);
  const [depth, setDepth] = useState<number>(CADENCE_DEPTHS[30][1]); // 90 dias
  const [tab, setTab] = useState<'regulars' | 'atRisk'>('regulars');

  /* ── Modo período ── */
  const [fromKey, setFromKey] = useState<string>(firstOfThisMonthKey);
  const [toKey, setToKey] = useState<string>(spTodayKey);
  const [sort, setSort] = useState<PeriodSort>('recent');
  const [periodVisits, setPeriodVisits] = useState<PeriodVisit[]>([]);
  const [periodInfo, setPeriodInfo] = useState<Map<string, PersonInfo>>(new Map());
  const [periodLoading, setPeriodLoading] = useState(false);

  const rangeInvalid = fromKey > toKey;

  const fetchVisits = useCallback(async (silent = false) => {
    if (!salon?.id) return;
    if (!silent) setLoading(true);

    const now = spNow();
    const start = spInstant(now.year, now.month, now.day + 1 - MAX_LOOKBACK_DAYS).toISOString();

    const { data, error } = await supabase
      .from('appointments')
      .select('client_id, starts_at, total_amount, client:clients(name, phone)')
      .eq('salon_id', salon.id)
      .eq('status', 'completed')
      .not('client_id', 'is', null)
      .gte('starts_at', start)
      .order('starts_at', { ascending: false });

    if (!error && data) {
      const rows = data as ApptRow[];
      const info = new Map<string, PersonInfo>();
      const list: Visit[] = [];

      for (const r of rows) {
        if (!r.client_id) continue;
        list.push({ clientId: r.client_id, at: r.starts_at, amount: r.total_amount || 0 });
        if (!info.has(r.client_id)) {
          const c = Array.isArray(r.client) ? r.client[0] : r.client;
          info.set(r.client_id, {
            name: c?.name || '—',
            phone: c?.phone || null,
            clientId: r.client_id,
          });
        }
      }

      setVisits(list);
      setClientInfo(info);
    }

    setLoading(false);
  }, [salon?.id, supabase]);

  /** Atendimentos do intervalo escolhido, walk-ins incluídos. */
  const fetchPeriod = useCallback(async (silent = false) => {
    if (!salon?.id || fromKey > toKey) return;
    if (!silent) setPeriodLoading(true);

    const { start, end } = spDayKeyRange(fromKey, toKey);

    const { data, error } = await supabase
      .from('appointments')
      .select('client_id, client_name, starts_at, total_amount, client:clients(name, phone)')
      .eq('salon_id', salon.id)
      .eq('status', 'completed')
      .gte('starts_at', start)
      .lte('starts_at', end)
      .order('starts_at', { ascending: false });

    if (!error && data) {
      const rows = data as ApptRow[];
      const info = new Map<string, PersonInfo>();
      const list: PeriodVisit[] = [];

      for (const r of rows) {
        const c = Array.isArray(r.client) ? r.client[0] : r.client;
        const walkInName = (r.client_name || '').trim();

        // Cliente cadastrada vira o próprio id; avulso agrupa pelo nome digitado.
        const key = r.client_id
          ? r.client_id
          : walkInName
            ? `walkin:${walkInName.toLowerCase()}`
            : 'walkin:__sem_nome__';

        list.push({ key, at: r.starts_at, amount: r.total_amount || 0 });

        if (!info.has(key)) {
          info.set(key, {
            name: (r.client_id ? c?.name : walkInName) || '—',
            phone: r.client_id ? c?.phone || null : null,
            clientId: r.client_id,
          });
        }
      }

      setPeriodVisits(list);
      setPeriodInfo(info);
    }

    setPeriodLoading(false);
  }, [salon?.id, supabase, fromKey, toKey]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  // Só busca o intervalo quando o modo período está à vista.
  useEffect(() => {
    if (mode === 'period') fetchPeriod();
  }, [mode, fetchPeriod]);

  useLiveData(supabase, salon?.id, ['appointments'], () => {
    fetchVisits(true);
    if (mode === 'period') fetchPeriod(true);
  });

  // Trocar cadência reposiciona a profundidade para a do meio da nova escala.
  const pickCadence = (c: Cadence) => {
    setCadence(c);
    setOpenId(null);
    const opts = CADENCE_DEPTHS[c];
    setDepth(opts[Math.min(1, opts.length - 1)]);
  };

  const counts = useMemo(() => countsByDepth(visits, cadence), [visits, cadence]);
  const { regulars, atRisk } = useMemo(
    () => classify(visits, cadence, depth),
    [visits, cadence, depth],
  );
  const periodRows = useMemo(
    () => aggregatePeriod(periodVisits, sort),
    [periodVisits, sort],
  );
  const summary = useMemo(
    () => summarizePeriod(periodVisits, fromKey, toKey),
    [periodVisits, fromKey, toKey],
  );

  const formatCurrency = (v: number) =>
    v.toLocaleString(locale, { style: 'currency', currency: t.currency });

  /* ── Linhas a exibir, normalizadas ── */
  const rows: DisplayRow[] = useMemo(() => {
    if (mode === 'period') {
      return periodRows.map(r => {
        const info = periodInfo.get(r.key);
        return {
          key: r.key,
          clientId: info?.clientId ?? null,
          name: info?.name || '—',
          phone: info?.phone ?? null,
          visits: r.visits,
          totalSpent: r.totalSpent,
          avgTicket: r.avgTicket,
          lastVisitAt: r.lastVisitAt,
          badge: info?.clientId ? undefined : t.walkIn,
          badgeWarn: false,
        };
      });
    }

    const source = tab === 'regulars' ? regulars : atRisk;
    return source.map(r => {
      const info = clientInfo.get(r.clientId);
      return {
        key: r.clientId,
        clientId: r.clientId,
        name: info?.name || '—',
        phone: info?.phone ?? null,
        visits: r.visits,
        totalSpent: r.totalSpent,
        avgTicket: r.avgTicket,
        lastVisitAt: r.lastVisitAt,
        badge: tab === 'atRisk'
          ? t.daysAgo.replace('{n}', String(r.daysSinceLastVisit))
          : undefined,
        badgeWarn: true,
      };
    });
  }, [mode, periodRows, periodInfo, tab, regulars, atRisk, clientInfo, t]);

  const walkInCount = useMemo(
    () => (mode === 'period' ? rows.filter(r => !r.clientId).length : 0),
    [mode, rows],
  );

  const busy = mode === 'period' ? periodLoading : loading;

  const ruleText = mode === 'period'
    ? `${spFormatDate(spFromDateKey(fromKey), locale)} — ${spFormatDate(spFromDateKey(toKey), locale)}`
    : t.regularsRule
      .replace('{c}', String(cadence))
      .replace('{w}', `${cadence * depth} ${t.days}`);

  const sortLabel: Record<PeriodSort, string> = {
    recent: t.sortRecent,
    spent: t.sortSpent,
    visits: t.sortVisits,
  };

  if (authLoading) {
    return (
      <div className="card p-10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">{mode === 'period' ? t.servedTitle : t.regulars}</h1>
        <p className="text-nd-muted text-sm mt-1">{busy ? '…' : ruleText}</p>
      </div>

      {/* Modo */}
      <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5 w-full sm:w-fit">
        {([
          { id: 'cadence' as const, label: t.byCadence, icon: Repeat },
          { id: 'period' as const, label: t.byPeriod, icon: CalendarRange },
        ]).map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setOpenId(null); }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 sm:flex-none whitespace-nowrap flex items-center justify-center gap-1.5 ${
                mode === m.id
                  ? 'bg-white shadow-soft text-nd-heading font-semibold'
                  : 'text-nd-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Controles do modo cadência ── */}
      {mode === 'cadence' && (
        <>
          <div className="space-y-2">
            <p className="section-label">{t.cadence}</p>
            <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5 w-full sm:w-fit">
              {CADENCES.map(c => (
                <button
                  key={c}
                  onClick={() => pickCadence(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 sm:flex-none whitespace-nowrap ${
                    cadence === c
                      ? 'bg-white shadow-soft text-nd-heading font-semibold'
                      : 'text-nd-muted'
                  }`}
                >
                  {t.cadenceEvery} {c} {t.days}
                </button>
              ))}
            </div>
          </div>

          {/* Contadores por faixa */}
          <div className="grid grid-cols-3 gap-3">
            {CADENCE_DEPTHS[cadence].map(d => {
              const selected = d === depth;
              return (
                <button
                  key={d}
                  onClick={() => { setDepth(d); setOpenId(null); }}
                  className={`card-glow p-4 text-left transition-all ${
                    selected ? 'ring-2 ring-nd-accent' : 'hover:bg-nd-surface/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selected ? 'bg-nd-accent/10' : 'bg-nd-surface'
                    }`}>
                      <Repeat className={`w-4 h-4 ${selected ? 'text-nd-accent' : 'text-nd-muted'}`} />
                    </div>
                    <span className="section-label">{cadence * d} {t.days}</span>
                  </div>
                  <p className={`text-sm sm:text-xl font-bold truncate ${
                    selected ? 'text-nd-accent' : 'text-nd-heading'
                  }`}>
                    {loading ? '—' : counts[d] ?? 0}
                  </p>
                  <p className="text-[10px] text-nd-muted mt-0.5 truncate">{t.regularsCount}</p>
                </button>
              );
            })}
          </div>

          {/* Fixas / Em risco */}
          <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5 w-full sm:w-fit">
            {([
              { id: 'regulars' as const, label: t.regularsTab, n: regulars.length },
              { id: 'atRisk' as const, label: t.atRiskTab, n: atRisk.length },
            ]).map(tb => (
              <button
                key={tb.id}
                onClick={() => { setTab(tb.id); setOpenId(null); }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 sm:flex-none whitespace-nowrap ${
                  tab === tb.id
                    ? 'bg-white shadow-soft text-nd-heading font-semibold'
                    : 'text-nd-muted'
                }`}
              >
                {tb.label} ({tb.n})
              </button>
            ))}
          </div>

          {tab === 'atRisk' && !loading && atRisk.length > 0 && (
            <p className="text-xs text-nd-muted flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-nd-warning" />
              {t.atRiskHint}
            </p>
          )}
        </>
      )}

      {/* ── Controles do modo período ── */}
      {mode === 'period' && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="section-label mb-1.5 block">{t.dateFrom}</label>
              <input
                type="date"
                value={fromKey}
                max={toKey}
                onChange={e => { setFromKey(e.target.value); setOpenId(null); }}
                className="input-field"
              />
            </div>
            <div>
              <label className="section-label mb-1.5 block">{t.until}</label>
              <input
                type="date"
                value={toKey}
                min={fromKey}
                onChange={e => { setToKey(e.target.value); setOpenId(null); }}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <p className="section-label mb-1.5">{t.sortBy}</p>
            <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5 w-full sm:w-fit">
              {PERIOD_SORTS.map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 sm:flex-none whitespace-nowrap ${
                    sort === s
                      ? 'bg-white shadow-soft text-nd-heading font-semibold'
                      : 'text-nd-muted'
                  }`}
                >
                  {sortLabel[s]}
                </button>
              ))}
            </div>
          </div>

          {rangeInvalid && (
            <p className="text-xs text-nd-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {t.invalidRange}
            </p>
          )}
        </div>
      )}

      {/* Resumo do período */}
      {mode === 'period' && !rangeInvalid && !periodLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label={t.clients}
            value={String(summary.clients)}
            hint={walkInCount > 0 ? t.walkInsIncluded.replace('{n}', String(walkInCount)) : undefined}
            icon={Users2}
            color="text-nd-accent"
            iconBg="bg-nd-accent/10"
          />
          <SummaryCard
            label={t.turns}
            value={String(summary.appointments)}
            hint={t.activeDaysOf
              .replace('{a}', String(summary.activeDays))
              .replace('{c}', String(summary.calendarDays))}
            icon={CalendarCheck}
            color="text-nd-heading"
            iconBg="bg-nd-surface"
          />
          <SummaryCard
            label={t.total}
            value={formatCurrency(summary.totalRevenue)}
            hint={`${t.avgTicket} ${formatCurrency(summary.avgTicket)}`}
            icon={DollarSign}
            color="text-nd-success"
            iconBg="bg-nd-success/10"
          />
          <SummaryCard
            label={t.perDay}
            value={formatCurrency(summary.perCalendarDay)}
            hint={`${formatCurrency(summary.perActiveDay)} ${t.perActiveDayHint}`}
            icon={BarChart3}
            color="text-nd-highlight"
            iconBg="bg-nd-highlight/10"
          />
        </div>
      )}

      {/* Loading */}
      {busy && (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      )}

      {/* Vazio */}
      {!busy && !rangeInvalid && rows.length === 0 && (
        <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[220px]">
          <div className="w-16 h-16 rounded-2xl bg-nd-surface flex items-center justify-center mb-5">
            <Users className="w-8 h-8 text-nd-muted/30" />
          </div>
          <p className="text-sm font-semibold text-nd-text">
            {mode === 'period'
              ? t.noneServedInPeriod
              : tab === 'regulars' ? t.noRegularsYet : t.noAtRisk}
          </p>
          {mode === 'cadence' && tab === 'regulars' && (
            <p className="text-sm text-nd-muted mt-2">{t.noRegularsHint}</p>
          )}
        </div>
      )}

      {/* Lista */}
      {!busy && !rangeInvalid && rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-nd-border/50">
            {rows.map(row => {
              const expanded = openId === row.key;
              return (
                <div key={row.key}>
                  <ClientRow
                    row={row}
                    expanded={expanded}
                    onToggle={row.clientId
                      ? () => setOpenId(expanded ? null : row.key)
                      : undefined}
                    formatCurrency={formatCurrency}
                    locale={locale}
                    t={t}
                  />
                  {expanded && row.clientId && (
                    <div className="border-t border-nd-border/50 bg-nd-surface/30">
                      <ClientDetail clientId={row.clientId} variant="inline" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Total do grupo — no modo período isso já está no card Total */}
      {mode === 'cadence' && !busy && rows.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-nd-muted">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> {t.totalInWindow}
          </span>
          <span className="mono-value text-nd-heading">
            {formatCurrency(rows.reduce((s, r) => s + r.totalSpent, 0))}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function SummaryCard({ label, value, hint, icon: Icon, color, iconBg }: {
  label: string; value: string; hint?: string;
  icon: any; color: string; iconBg: string;
}) {
  return (
    <div className="card-glow p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <span className="section-label">{label}</span>
      </div>
      <p className={`text-sm sm:text-xl font-bold ${color} truncate`}>{value}</p>
      {hint && <p className="text-[10px] text-nd-muted mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

function ClientRow({ row, expanded, onToggle, formatCurrency, locale, t }: {
  row: DisplayRow;
  expanded: boolean;
  /** Ausente para atendimento avulso: não há ficha para abrir. */
  onToggle?: () => void;
  formatCurrency: (v: number) => string;
  locale: string;
  t: Record<string, string>;
}) {
  const link = waLink(row.phone);

  const inner = (
    <>
      <div className="w-10 h-10 rounded-xl bg-nd-accent/10 flex items-center justify-center shrink-0">
        <span className="text-sm font-semibold text-nd-accent">
          {row.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-nd-heading truncate">{row.name}</p>
          {row.badge && (
            <span className={`badge shrink-0 ${row.badgeWarn ? 'badge-warning' : 'badge-muted'}`}>
              {row.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-nd-muted truncate">
          {row.visits} {t.visitsShort}
          {' · '}
          {t.avgTicket} {formatCurrency(row.avgTicket)}
          {row.lastVisitAt && (
            <> {' · '}{spFormatDate(row.lastVisitAt, locale, { day: '2-digit', month: '2-digit' })}</>
          )}
        </p>
      </div>

      <span className="mono-value text-sm text-nd-heading shrink-0">
        {formatCurrency(row.totalSpent)}
      </span>
    </>
  );

  return (
    <div className="flex items-center gap-2 pr-3">
      {/* O link do WhatsApp fica FORA do botão: <a> dentro de <button> é HTML inválido. */}
      {onToggle ? (
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-3 flex-1 min-w-0 p-4 text-left hover:bg-nd-surface/40 transition-colors"
        >
          {inner}
          <ChevronDown
            className={`w-4 h-4 text-nd-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0 p-4">
          {inner}
          <span className="w-4 shrink-0" />
        </div>
      )}

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          title={t.openWhatsapp}
          aria-label={t.openWhatsapp}
          className="btn-ghost p-2 shrink-0"
        >
          <MessageCircle className="w-4 h-4 text-nd-success" />
        </a>
      )}
    </div>
  );
}

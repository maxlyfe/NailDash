'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { useLiveData } from '@/lib/live-data';
import { spNow, spInstant, spFormatDate } from '@/lib/dates';
import { waLink } from '@/lib/phone';
import {
  CADENCES, CADENCE_DEPTHS, MAX_LOOKBACK_DAYS,
  classify, countsByDepth,
  type Cadence, type Visit, type RegularRow,
} from '@/lib/regulars';
import ClientDetail from '@/components/ClientDetail';
import {
  Repeat, Users, MessageCircle, Loader2, AlertTriangle, TrendingUp, ChevronDown,
} from 'lucide-react';

type Row = {
  client_id: string | null;
  starts_at: string;
  total_amount: number | null;
  client: { name: string | null; phone: string | null }
    | { name: string | null; phone: string | null }[]
    | null;
};

type ClientInfo = { name: string; phone: string | null };

export default function FixasPage() {
  const { salon, loading: authLoading } = useAuth();
  const { t, locale } = useT();
  const supabase = useSupabase();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [clientInfo, setClientInfo] = useState<Map<string, ClientInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  const [cadence, setCadence] = useState<Cadence>(30);
  const [depth, setDepth] = useState<number>(CADENCE_DEPTHS[30][1]); // 90 dias
  const [tab, setTab] = useState<'regulars' | 'atRisk'>('regulars');
  // Acordeão: só uma ficha aberta por vez.
  const [openId, setOpenId] = useState<string | null>(null);

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
      const rows = data as Row[];
      const info = new Map<string, ClientInfo>();
      const list: Visit[] = [];

      for (const r of rows) {
        if (!r.client_id) continue;
        list.push({
          clientId: r.client_id,
          at: r.starts_at,
          amount: r.total_amount || 0,
        });
        if (!info.has(r.client_id)) {
          const c = Array.isArray(r.client) ? r.client[0] : r.client;
          info.set(r.client_id, { name: c?.name || '—', phone: c?.phone || null });
        }
      }

      setVisits(list);
      setClientInfo(info);
    }

    setLoading(false);
  }, [salon?.id, supabase]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);
  useLiveData(supabase, salon?.id, ['appointments'], () => fetchVisits(true));

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

  const rows = tab === 'regulars' ? regulars : atRisk;

  const formatCurrency = (v: number) =>
    v.toLocaleString(locale, { style: 'currency', currency: t.currency });

  const ruleText = t.regularsRule
    .replace('{c}', String(cadence))
    .replace('{w}', `${cadence * depth} ${t.days}`);

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
        <h1 className="page-title">{t.regulars}</h1>
        <p className="text-nd-muted text-sm mt-1">{ruleText}</p>
      </div>

      {/* Cadência */}
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

      {/* Loading */}
      {loading && (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      )}

      {/* Vazio */}
      {!loading && rows.length === 0 && (
        <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[220px]">
          <div className="w-16 h-16 rounded-2xl bg-nd-surface flex items-center justify-center mb-5">
            <Users className="w-8 h-8 text-nd-muted/30" />
          </div>
          <p className="text-sm font-semibold text-nd-text">
            {tab === 'regulars' ? t.noRegularsYet : t.noAtRisk}
          </p>
          {tab === 'regulars' && (
            <p className="text-sm text-nd-muted mt-2">{t.noRegularsHint}</p>
          )}
        </div>
      )}

      {/* Lista */}
      {!loading && rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-nd-border/50">
            {rows.map(row => {
              const expanded = openId === row.clientId;
              return (
                <div key={row.clientId}>
                  <ClientRow
                    row={row}
                    info={clientInfo.get(row.clientId)}
                    atRisk={tab === 'atRisk'}
                    expanded={expanded}
                    onToggle={() => setOpenId(expanded ? null : row.clientId)}
                    formatCurrency={formatCurrency}
                    locale={locale}
                    t={t}
                  />
                  {expanded && (
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

      {/* Total do grupo */}
      {!loading && rows.length > 0 && (
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

function ClientRow({ row, info, atRisk, expanded, onToggle, formatCurrency, locale, t }: {
  row: RegularRow;
  info?: ClientInfo;
  atRisk: boolean;
  expanded: boolean;
  onToggle: () => void;
  formatCurrency: (v: number) => string;
  locale: string;
  t: Record<string, string>;
}) {
  const name = info?.name || '—';
  const link = waLink(info?.phone);

  return (
    <div className="flex items-center gap-2 pr-3">
      {/* O link do WhatsApp fica FORA deste botão: <a> dentro de <button> é HTML inválido. */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex items-center gap-3 flex-1 min-w-0 p-4 text-left hover:bg-nd-surface/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-nd-accent/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-nd-accent">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-nd-heading truncate">{name}</p>
            {atRisk && (
              <span className="badge badge-warning shrink-0">
                {t.daysAgo.replace('{n}', String(row.daysSinceLastVisit))}
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

        <ChevronDown
          className={`w-4 h-4 text-nd-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

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

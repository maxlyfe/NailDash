'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import {
  CalendarDays, DollarSign, TrendingUp, Users,
  ArrowUpRight, Clock, Sparkles, Loader2,
  CheckCircle2, CircleDot, BarChart3,
} from 'lucide-react';

type Stats = {
  revenueToday: number;
  revenueTurnos: number;
  revenueAdvances: number;
  totalClients: number;
  avgTicket: number;
  appointmentsToday: number;
  appointmentsOpen: number;
  appointmentsClosed: number;
};

type RecentTransaction = {
  id: string;
  description: string | null;
  total_amount: number;
  transaction_date: string;
  client: { name: string } | { name: string }[] | null;
  professional: { name: string } | { name: string }[] | null;
};

export default function DashboardPage() {
  const { user, salon, loading: authLoading } = useAuth();
  const { t, locale } = useT();
  const supabase = useSupabase();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || '';

  const [greeting, setGreeting] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting(t.greeting_morning);
    else if (h < 18) setGreeting(t.greeting_afternoon);
    else setGreeting(t.greeting_evening);

    setDateStr(new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
  }, [t, locale]);

  const [stats, setStats] = useState<Stats>({
    revenueToday: 0, revenueTurnos: 0, revenueAdvances: 0,
    totalClients: 0, avgTicket: 0,
    appointmentsToday: 0, appointmentsOpen: 0, appointmentsClosed: 0,
  });
  const [recent, setRecent] = useState<RecentTransaction[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ label: string; completed: number; pending: number; revenue: number; pendingRevenue: number }[]>([]);
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!salon?.id) return; // Wait for salon — don't show zeros
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const [salesRes, clientsRes, recentRes, apptsRes, monthApptsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('total_amount, category')
        .eq('salon_id', salon.id)
        .eq('type', 'sale')
        .gte('transaction_date', todayStart.toISOString()),
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', salon.id),
      supabase
        .from('transactions')
        .select('id, description, total_amount, transaction_date, client:clients(name), professional:professionals(name)')
        .eq('salon_id', salon.id)
        .eq('type', 'sale')
        .order('transaction_date', { ascending: false })
        .limit(5),
      supabase
        .from('appointments')
        .select('id, status, closed_at')
        .eq('salon_id', salon.id)
        .gte('starts_at', todayStart.toISOString())
        .lte('starts_at', todayEnd.toISOString())
        .neq('status', 'cancelled'),
      supabase
        .from('appointments')
        .select('id, starts_at, status, closed_at, total_amount')
        .eq('salon_id', salon.id)
        .gte('starts_at', monthStart.toISOString())
        .lte('starts_at', monthEnd.toISOString())
        .neq('status', 'cancelled'),
    ]);

    const todaySales = salesRes.data || [];
    const revenueAdvances = todaySales.filter((t: any) => t.category === 'adiantamento').reduce((s: number, t: any) => s + t.total_amount, 0);
    const revenueTurnos = todaySales.filter((t: any) => t.category !== 'adiantamento').reduce((s: number, t: any) => s + t.total_amount, 0);
    const revenueToday = revenueTurnos; // Adiantamentos are held funds, not revenue
    const totalClients = clientsRes.count || 0;
    const turnoSales = todaySales.filter((t: any) => t.category !== 'adiantamento');
    const avgTicket = turnoSales.length > 0 ? revenueTurnos / turnoSales.length : 0;

    const todayAppts = apptsRes.data || [];
    const appointmentsToday = todayAppts.length;
    const appointmentsClosed = todayAppts.filter((a: any) => a.status === 'completed').length;
    const appointmentsOpen = appointmentsToday - appointmentsClosed;

    setStats({
      revenueToday,
      revenueTurnos,
      revenueAdvances,
      totalClients,
      avgTicket,
      appointmentsToday,
      appointmentsOpen,
      appointmentsClosed,
    });
    setRecent((recentRes.data || []) as unknown as RecentTransaction[]);

    // Process monthly appointments into weekly buckets
    const monthAppts = (monthApptsRes.data || []) as any[];
    const weeks: { label: string; completed: number; pending: number; revenue: number; pendingRevenue: number }[] = [];
    // Get week boundaries for the month
    const d = new Date(monthStart);
    while (d <= monthEnd) {
      const wStart = new Date(d);
      const wEnd = new Date(d);
      wEnd.setDate(wEnd.getDate() + 6);
      if (wEnd > monthEnd) wEnd.setTime(monthEnd.getTime());
      const label = `${wStart.getDate()}-${wEnd.getDate()}`;
      const weekAppts = monthAppts.filter((a: any) => {
        const ad = new Date(a.starts_at);
        return ad >= wStart && ad <= wEnd;
      });
      const completed = weekAppts.filter((a: any) => a.status === 'completed').length;
      const pending = weekAppts.length - completed;
      const revenue = weekAppts
        .filter((a: any) => a.status === 'completed')
        .reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
      const pendingRevenue = weekAppts
        .filter((a: any) => a.status !== 'completed')
        .reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
      weeks.push({ label, completed, pending, revenue, pendingRevenue });
      d.setDate(d.getDate() + 7);
    }
    setWeeklyData(weeks);

    setLoading(false);
  }, [salon?.id]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const formatCurrency = (v: number) =>
    v.toLocaleString(locale, { style: 'currency', currency: t.currency });

  const STATS_CONFIG = [
    { label: t.shiftsToday, value: stats.appointmentsToday.toString(), icon: CalendarDays, accent: 'text-nd-accent bg-nd-accent/10' },
    { label: t.open, value: stats.appointmentsOpen.toString(), icon: CircleDot, accent: 'text-nd-warning bg-nd-warning/10' },
    { label: t.closed, value: stats.appointmentsClosed.toString(), icon: CheckCircle2, accent: 'text-nd-success bg-nd-success/10' },
    { label: t.clients, value: stats.totalClients.toString(), icon: Users, accent: 'text-nd-highlight bg-nd-highlight/10' },
    { label: t.avgTicket, value: formatCurrency(stats.avgTicket), icon: TrendingUp, accent: 'text-nd-warning bg-nd-warning/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          {greeting}{firstName ? `, ${firstName}` : ''} <span className="text-lg">&#10024;</span>
        </h1>
        <p className="text-nd-muted text-sm mt-1">
          {salon?.name || '...'} &middot; {dateStr}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Revenue card with breakdown */}
        <div className="card-glow p-4 group col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-nd-success bg-nd-success/10">
              <DollarSign className="w-4 h-4" />
            </div>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-nd-muted/30" />}
          </div>
          <p className="text-xl font-bold text-nd-heading">{loading ? '...' : formatCurrency(stats.revenueToday)}</p>
          <p className="text-[11px] text-nd-muted mt-0.5">{t.revenueToday}</p>
          {!loading && (stats.revenueTurnos > 0 || stats.revenueAdvances > 0) && (
            <div className="mt-2 pt-2 border-t border-nd-border/50 space-y-1">
              {stats.revenueTurnos > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-nd-muted flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-nd-success" />
                    {t.revenueTurnos}
                  </span>
                  <span className="text-[10px] font-semibold text-nd-success">{formatCurrency(stats.revenueTurnos)}</span>
                </div>
              )}
              {stats.revenueAdvances > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-nd-muted flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-nd-accent" />
                    {t.revenueAdvances}
                  </span>
                  <span className="text-[10px] font-semibold text-nd-accent">{formatCurrency(stats.revenueAdvances)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {STATS_CONFIG.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card-glow p-4 group">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-nd-muted/30" />}
              </div>
              <p className="text-xl font-bold text-nd-heading">{loading ? '...' : stat.value}</p>
              <p className="text-[11px] text-nd-muted mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Monthly Chart */}
      {!loading && weeklyData.length > 0 && (() => {
        const maxVal = Math.max(...weeklyData.map(w => w.completed + w.pending), 1);
        const chartH = 140;
        const monthName = new Date().toLocaleDateString(locale, { month: 'long' });
        return (
          <div className="card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <BarChart3 className="w-4 h-4 text-nd-accent" />
              <h2 className="text-sm font-semibold text-nd-heading capitalize">{t.monthlyOverview} — {monthName}</h2>
            </div>
            <div className="flex items-center gap-4 mb-3 text-[11px] text-nd-muted">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-nd-success/70" />{t.closed}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-nd-accent/30" />{t.forecast}</span>
            </div>
            {/* Bar chart */}
            <div className="relative pt-24">
              <div className="flex items-end gap-1.5 sm:gap-4 justify-around" style={{ height: `${chartH + 40}px` }}
                onMouseLeave={() => setActiveBar(null)}>
                {weeklyData.map((w, i) => {
                  const total = w.completed + w.pending;
                  const completedPct = total > 0 ? (w.completed / maxVal) * 100 : 0;
                  const pendingPct = total > 0 ? (w.pending / maxVal) * 100 : 0;
                  const isActive = activeBar === i;
                  const isFirst = i === 0;
                  const isLast = i === weeklyData.length - 1;
                  const tooltipAlign = isFirst ? 'left-0' : isLast ? 'right-0' : 'left-1/2 -translate-x-1/2';
                  const arrowAlign = isFirst ? 'left-4' : isLast ? 'right-4' : 'left-1/2 -translate-x-1/2';
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center relative min-w-0"
                      onMouseEnter={() => setActiveBar(i)}
                      onTouchStart={() => setActiveBar(isActive ? null : i)}>
                      {/* Tooltip */}
                      {isActive && (
                        <div className={`absolute -top-2 ${tooltipAlign} -translate-y-full z-20
                          bg-nd-heading text-white rounded-xl px-3 py-2 text-[10px] sm:text-[11px] shadow-lg whitespace-nowrap
                          pointer-events-none animate-fade-in`}>
                          <div className="font-bold mb-1">{t.weekView} {w.label}</div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-sm bg-nd-success" />
                              {t.closed}: {w.completed}
                            </span>
                            <span className="font-bold text-green-300">{formatCurrency(w.revenue)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-sm bg-nd-accent/50" />
                              {t.forecast}: {w.pending}
                            </span>
                            <span className="font-medium text-amber-300">{formatCurrency(w.pendingRevenue)}</span>
                          </div>
                          <div className="mt-1 pt-1 border-t border-white/20 flex justify-between">
                            <span className="font-medium">{t.total}</span>
                            <span className="font-bold">{formatCurrency(w.revenue + w.pendingRevenue)}</span>
                          </div>
                          <div className={`absolute ${arrowAlign} top-full w-0 h-0
                            border-l-[5px] border-r-[5px] border-t-[5px]
                            border-l-transparent border-r-transparent border-t-nd-heading`} />
                        </div>
                      )}
                      {/* Bars container */}
                      <div className="flex gap-0.5 sm:gap-1 items-end w-full" style={{ height: `${chartH}px` }}>
                        {/* Completed bar */}
                        <div className={`flex-1 rounded-t-md transition-all duration-200 ${isActive ? 'bg-nd-success' : 'bg-nd-success/70'}`}
                          style={{ height: `${Math.max(completedPct, total > 0 ? 4 : 0)}%` }} />
                        {/* Pending bar */}
                        <div className={`flex-1 rounded-t-md transition-all duration-200 ${isActive ? 'bg-nd-accent/50' : 'bg-nd-accent/25'}`}
                          style={{ height: `${Math.max(pendingPct, w.pending > 0 ? 4 : 0)}%` }} />
                      </div>
                      {/* Week label */}
                      <span className={`text-[9px] sm:text-[10px] mt-1 transition-colors ${isActive ? 'text-nd-heading font-bold' : 'text-nd-muted'}`}>
                        {w.label}
                      </span>
                      {/* Total count */}
                      <span className={`text-[8px] sm:text-[9px] ${isActive ? 'text-nd-accent font-medium' : 'text-nd-muted/60'}`}>
                        {total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent transactions */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-nd-border/50">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-nd-accent" />
              <h2 className="text-sm font-semibold text-nd-heading">{t.recentSales}</h2>
            </div>
            <a href="/financeiro" className="badge-info cursor-pointer hover:bg-nd-accent/20 transition-colors">{t.seeAll}</a>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
            </div>
          ) : recent.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-nd-surface flex items-center justify-center mb-4">
                <CalendarDays className="w-7 h-7 text-nd-muted/30" />
              </div>
              <p className="text-sm font-medium text-nd-muted">{t.noSalesRecorded}</p>
              <p className="text-xs text-nd-muted/60 mt-1.5 max-w-xs">
                {t.salesAppearHere}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-nd-border/50">
              {recent.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-nd-surface/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-nd-success/10 flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4 text-nd-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-nd-text truncate">
                      {(Array.isArray(tx.client) ? tx.client[0]?.name : tx.client?.name) || tx.description || t.revenue}
                    </p>
                    <p className="text-xs text-nd-muted">
                      {(() => { const pn = Array.isArray(tx.professional) ? tx.professional[0]?.name : tx.professional?.name; return pn ? `${pn} · ` : ''; })()}
                      {new Date(tx.transaction_date).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-nd-success shrink-0">
                    {formatCurrency(tx.total_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-nd-border/50">
            <Sparkles className="w-4 h-4 text-nd-accent" />
            <h2 className="text-sm font-semibold text-nd-heading">{t.quickActions}</h2>
          </div>
          <div className="p-3 space-y-1">
            {[
              { icon: CalendarDays, label: t.newAppointment, sub: t.scheduleService, href: '/agenda', color: 'text-nd-accent bg-nd-accent/10' },
              { icon: Users, label: t.addClient, sub: t.newRecord, href: '/clientes', color: 'text-nd-highlight bg-nd-highlight/10' },
              { icon: DollarSign, label: t.viewFinancial, sub: t.revenueAndExpenses, href: '/financeiro', color: 'text-nd-success bg-nd-success/10' },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <a key={action.href} href={action.href}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-nd-surface transition-all group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-nd-text">{action.label}</p>
                    <p className="text-xs text-nd-muted">{action.sub}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-nd-muted/30 group-hover:text-nd-accent transition-colors" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

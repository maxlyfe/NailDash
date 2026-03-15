'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import {
  CalendarDays, DollarSign, TrendingUp, Users,
  ArrowUpRight, Clock, Sparkles, Loader2,
  CheckCircle2, CircleDot,
} from 'lucide-react';

type Stats = {
  revenueToday: number;
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
  const supabase = useSupabase();
  const greeting = getGreeting();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || '';

  const [stats, setStats] = useState<Stats>({
    revenueToday: 0, totalClients: 0, avgTicket: 0,
    appointmentsToday: 0, appointmentsOpen: 0, appointmentsClosed: 0,
  });
  const [recent, setRecent] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!salon) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [salesRes, clientsRes, recentRes, apptsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('total_amount')
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
    ]);

    const todaySales = salesRes.data || [];
    const revenueToday = todaySales.reduce((s, t) => s + t.total_amount, 0);
    const totalClients = clientsRes.count || 0;
    const avgTicket = todaySales.length > 0 ? revenueToday / todaySales.length : 0;

    const todayAppts = apptsRes.data || [];
    const appointmentsToday = todayAppts.length;
    const appointmentsClosed = todayAppts.filter(a => a.closed_at || a.status === 'completed').length;
    const appointmentsOpen = appointmentsToday - appointmentsClosed;

    setStats({
      revenueToday,
      totalClients,
      avgTicket,
      appointmentsToday,
      appointmentsOpen,
      appointmentsClosed,
    });
    setRecent((recentRes.data || []) as unknown as RecentTransaction[]);
    setLoading(false);
  }, [salon?.id, authLoading]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const STATS_CONFIG = [
    { label: 'Receita hoje', value: formatCurrency(stats.revenueToday), icon: DollarSign, accent: 'text-nd-success bg-nd-success/10' },
    { label: 'Turnos hoje', value: stats.appointmentsToday.toString(), icon: CalendarDays, accent: 'text-nd-accent bg-nd-accent/10' },
    { label: 'Abertos', value: stats.appointmentsOpen.toString(), icon: CircleDot, accent: 'text-nd-warning bg-nd-warning/10' },
    { label: 'Fechados', value: stats.appointmentsClosed.toString(), icon: CheckCircle2, accent: 'text-nd-success bg-nd-success/10' },
    { label: 'Clientes', value: stats.totalClients.toString(), icon: Users, accent: 'text-nd-highlight bg-nd-highlight/10' },
    { label: 'Ticket médio', value: formatCurrency(stats.avgTicket), icon: TrendingUp, accent: 'text-nd-warning bg-nd-warning/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          {greeting}{firstName ? `, ${firstName}` : ''} <span className="text-lg">&#10024;</span>
        </h1>
        <p className="text-nd-muted text-sm mt-1">
          {salon?.name || '...'} &middot; {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent transactions */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-nd-border/50">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-nd-accent" />
              <h2 className="text-sm font-semibold text-nd-heading">Últimas Vendas</h2>
            </div>
            <a href="/financeiro" className="badge-info cursor-pointer hover:bg-nd-accent/20 transition-colors">Ver tudo</a>
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
              <p className="text-sm font-medium text-nd-muted">Sem vendas registradas</p>
              <p className="text-xs text-nd-muted/60 mt-1.5 max-w-xs">
                As vendas aparecerão aqui conforme os turnos forem fechados.
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
                      {(Array.isArray(tx.client) ? tx.client[0]?.name : tx.client?.name) || tx.description || 'Venda'}
                    </p>
                    <p className="text-xs text-nd-muted">
                      {(() => { const pn = Array.isArray(tx.professional) ? tx.professional[0]?.name : tx.professional?.name; return pn ? `${pn} · ` : ''; })()}
                      {new Date(tx.transaction_date).toLocaleDateString('pt-BR')}
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
            <h2 className="text-sm font-semibold text-nd-heading">Ações Rápidas</h2>
          </div>
          <div className="p-3 space-y-1">
            {[
              { icon: CalendarDays, label: 'Novo Agendamento', sub: 'Agendar serviço', href: '/agenda', color: 'text-nd-accent bg-nd-accent/10' },
              { icon: Users, label: 'Adicionar Cliente', sub: 'Novo cadastro', href: '/clientes', color: 'text-nd-highlight bg-nd-highlight/10' },
              { icon: DollarSign, label: 'Ver Financeiro', sub: 'Receitas e despesas', href: '/financeiro', color: 'text-nd-success bg-nd-success/10' },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <a key={action.label} href={action.href}
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import {
  DollarSign, TrendingUp, TrendingDown, Loader2,
  Plus, X, Save, Trash2, CreditCard, Banknote, Smartphone,
  ArrowRightLeft, ChevronLeft, ChevronRight,
  PiggyBank, UserCheck, AlertTriangle,
} from 'lucide-react';

type TabView = 'resumo' | 'receitas' | 'despesas' | 'fechamento';
type TxModalMode = 'closed' | 'receita' | 'despesa';

type TxRow = {
  id: string;
  type: string;
  description: string | null;
  total_amount: number;
  payment_card: number;
  payment_cash: number;
  payment_transfer: number;
  payment_pix: number;
  transaction_date: string;
  category: string | null;
  installment_number: number | null;
  installment_total: number | null;
  client_id?: string | null;
  professional_id?: string | null;
  client?: any;
  professional?: any;
};

type MonthlyClosing = {
  id: string;
  month: string;
  starting_balance: number;
  starting_cash: number;
  starting_bank: number;
  is_closed: boolean;
  notes: string | null;
};

export default function FinanceiroPage() {
  const { salon, loading: authLoading } = useAuth();
  const supabase = useSupabase();

  const [tab, setTab] = useState<TabView>('resumo');
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [closing, setClosing] = useState<MonthlyClosing | null>(null);
  const [prevClosing, setPrevClosing] = useState<MonthlyClosing | null>(null);
  const [nextMonthAdvances, setNextMonthAdvances] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<TxModalMode>('closed');
  const [saving, setSaving] = useState(false);

  // Current month navigation
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthStart = `${monthDate}-01`;
  const monthLabel = (() => {
    const [y, m] = monthDate.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  })();

  const monthEndDate = (() => {
    const [y, m] = monthDate.split('-');
    const d = new Date(parseInt(y), parseInt(m), 0);
    return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Previous month start date
  const prevMonthStart = (() => {
    const [y, m] = monthDate.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  // Next month date range (for advances that are in the bank but belong to next month)
  const nextMonthRange = (() => {
    const [y, m] = monthDate.split('-').map(Number);
    const start = new Date(y, m, 1); // first day of next month
    const end = new Date(y, m + 1, 0); // last day of next month
    return {
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
      end: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
    };
  })();

  // Form
  const [form, setForm] = useState({
    description: '', total_amount: '', category: '',
    payment_method: 'pix' as 'pix' | 'cash' | 'card' | 'transfer',
    installments: '1', transaction_date: new Date().toISOString().split('T')[0],
  });

  const navigateMonth = (delta: number) => {
    const [y, m] = monthDate.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const fetchData = useCallback(async () => {
    if (!salon?.id) return; // Wait for salon — don't show zeros
    setLoading(true);
    try {
      // Load transactions WITHOUT joins first (fast) — names loaded on demand
      const [txRes, closingRes, prevClosingRes, nextAdvRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, description, total_amount, payment_card, payment_cash, payment_transfer, payment_pix, transaction_date, category, installment_number, installment_total, client_id, professional_id')
          .eq('salon_id', salon.id)
          .gte('transaction_date', `${monthStart}T00:00:00`)
          .lte('transaction_date', `${monthEndDate}T23:59:59`)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('monthly_closings')
          .select('*')
          .eq('salon_id', salon.id)
          .eq('month', monthStart)
          .maybeSingle(),
        supabase
          .from('monthly_closings')
          .select('*')
          .eq('salon_id', salon.id)
          .eq('month', prevMonthStart)
          .maybeSingle(),
        supabase
          .from('transactions')
          .select('id, type, description, total_amount, payment_card, payment_cash, payment_transfer, payment_pix, transaction_date, category, installment_number, installment_total')
          .eq('salon_id', salon.id)
          .eq('category', 'adiantamento')
          .gte('transaction_date', `${nextMonthRange.start}T00:00:00`)
          .lte('transaction_date', `${nextMonthRange.end}T23:59:59`)
          .gte('registered_at', `${monthStart}T00:00:00`)
          .lte('registered_at', `${monthEndDate}T23:59:59`),
      ]);
      setTransactions((txRes.data || []) as TxRow[]);
      setClosing(closingRes.data as MonthlyClosing | null);
      setPrevClosing(prevClosingRes.data as MonthlyClosing | null);
      setNextMonthAdvances((nextAdvRes.data || []) as TxRow[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [salon?.id, monthDate]);

  // Lazy-load client/professional names only when viewing receitas/despesas tabs
  const [namesLoaded, setNamesLoaded] = useState(false);
  useEffect(() => {
    if ((tab !== 'receitas' && tab !== 'despesas') || namesLoaded || !salon?.id || transactions.length === 0) return;
    const loadNames = async () => {
      const txWithJoins = await supabase
        .from('transactions')
        .select('id, client:clients(name), professional:professionals(name)')
        .eq('salon_id', salon.id)
        .gte('transaction_date', `${monthStart}T00:00:00`)
        .lte('transaction_date', `${monthEndDate}T23:59:59`);
      if (txWithJoins.data) {
        const nameMap = new Map<string, { client: any; professional: any }>(txWithJoins.data.map((t: any) => [t.id, { client: t.client, professional: t.professional }]));
        setTransactions(prev => prev.map(tx => {
          const names = nameMap.get(tx.id);
          return names ? { ...tx, client: names.client, professional: names.professional } : tx;
        }));
        setNamesLoaded(true);
      }
    };
    loadNames();
  }, [tab, namesLoaded, salon?.id, transactions.length]);

  // Reset namesLoaded when month changes
  useEffect(() => { setNamesLoaded(false); }, [monthDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Computed
  const sales = transactions.filter(t => t.type === 'sale');
  const expenses = transactions.filter(t => t.type === 'expense');

  const totalRevenue = sales.reduce((s, t) => s + t.total_amount, 0);
  const revenuePix = sales.reduce((s, t) => s + t.payment_pix, 0);
  const revenueCash = sales.reduce((s, t) => s + t.payment_cash, 0);
  const revenueCard = sales.reduce((s, t) => s + t.payment_card, 0);
  const revenueTransfer = sales.reduce((s, t) => s + t.payment_transfer, 0);

  const totalExpenses = expenses.reduce((s, t) => s + t.total_amount, 0);
  const expensePix = expenses.reduce((s, t) => s + t.payment_pix, 0);
  const expenseCash = expenses.reduce((s, t) => s + t.payment_cash, 0);
  const expenseCard = expenses.reduce((s, t) => s + t.payment_card, 0);
  const expenseTransfer = expenses.reduce((s, t) => s + t.payment_transfer, 0);

  // Salaries are expenses with category containing 'salario' or 'salário' or type 'salary'
  const salaryExpenses = expenses.filter(t =>
    t.type === 'salary' || (t.category && /sal[aá]ri/i.test(t.category))
  );
  const totalSalaries = salaryExpenses.reduce((s, t) => s + t.total_amount, 0);

  // Next month advances (money physically in bank but belongs to future)
  const totalNextAdvances = nextMonthAdvances.reduce((s, t) => s + t.total_amount, 0);
  const nextAdvPix = nextMonthAdvances.reduce((s, t) => s + t.payment_pix, 0);
  const nextAdvCash = nextMonthAdvances.reduce((s, t) => s + t.payment_cash, 0);
  const nextAdvCard = nextMonthAdvances.reduce((s, t) => s + t.payment_card, 0);
  const nextAdvTransfer = nextMonthAdvances.reduce((s, t) => s + t.payment_transfer, 0);

  // Auto-calculate previous month's remaining balance
  const prevMonthBalance = (() => {
    if (!prevClosing) return 0;
    // We need to compute what the previous month ended with
    // But we don't have previous month transactions here
    // So we use the stored closing balance
    return prevClosing.starting_balance || 0;
  })();

  const startingBalance = closing?.starting_balance ?? prevMonthBalance;
  const fundoCaixa = startingBalance + totalRevenue - totalExpenses;

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Save transaction
  const handleSave = async () => {
    if (!salon?.id || !form.description.trim() || !form.total_amount) return;
    setSaving(true);
    try {
      const amount = parseFloat(form.total_amount) || 0;
      const installments = parseInt(form.installments) || 1;
      const type = modal === 'receita' ? 'sale' : 'expense';

      for (let i = 0; i < installments; i++) {
        const installmentAmount = installments > 1 ? amount / installments : amount;
        const txDate = new Date(form.transaction_date);
        txDate.setMonth(txDate.getMonth() + i);

        const payload: any = {
          salon_id: salon.id,
          type,
          description: form.description.trim(),
          total_amount: installmentAmount,
          category: form.category.trim() || null,
          transaction_date: txDate.toISOString(),
          payment_pix: form.payment_method === 'pix' ? installmentAmount : 0,
          payment_cash: form.payment_method === 'cash' ? installmentAmount : 0,
          payment_card: form.payment_method === 'card' ? installmentAmount : 0,
          payment_transfer: form.payment_method === 'transfer' ? installmentAmount : 0,
          installment_number: installments > 1 ? i + 1 : null,
          installment_total: installments > 1 ? installments : null,
        };

        const { error } = await supabase.from('transactions').insert(payload);
        if (error) { alert(`Erro: ${error.message}`); break; }
      }

      setModal('closed');
      await fetchData();
    } catch (e: any) { alert(`Erro: ${e.message}`); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta transação?')) return;
    await supabase.from('transactions').delete().eq('id', id);
    fetchData();
  };

  // Save monthly closing
  const saveClosing = async (field: string, value: number) => {
    if (!salon?.id) return;
    if (closing) {
      await supabase.from('monthly_closings').update({ [field]: value }).eq('id', closing.id);
    } else {
      await supabase.from('monthly_closings').insert({
        salon_id: salon.id,
        month: monthStart,
        [field]: value,
      });
    }
    fetchData();
  };

  // Auto-fill starting balance from previous month's result
  const autoFillStartingBalance = async () => {
    if (!salon?.id) return;
    // Fetch previous month transactions to calculate the actual ending balance
    const [y, m] = monthDate.split('-').map(Number);
    const prevStart = new Date(y, m - 2, 1);
    const prevEnd = new Date(y, m - 1, 0);
    const prevStartStr = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}-01`;
    const prevEndStr = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}`;

    const [prevTxRes, prevClRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('type, total_amount')
        .eq('salon_id', salon.id)
        .gte('transaction_date', `${prevStartStr}T00:00:00`)
        .lte('transaction_date', `${prevEndStr}T23:59:59`),
      supabase
        .from('monthly_closings')
        .select('starting_balance')
        .eq('salon_id', salon.id)
        .eq('month', prevStartStr)
        .maybeSingle(),
    ]);

    const prevTxs = prevTxRes.data || [];
    const prevStartBal = prevClRes.data?.starting_balance || 0;
    const prevRevenue = prevTxs.filter((t: any) => t.type === 'sale').reduce((s: number, t: any) => s + t.total_amount, 0);
    const prevExpense = prevTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.total_amount, 0);
    const calculatedBalance = prevStartBal + prevRevenue - prevExpense;

    await saveClosing('starting_balance', calculatedBalance);
  };

  const openModal = (type: TxModalMode) => {
    setForm({
      description: '', total_amount: '', category: '',
      payment_method: 'pix', installments: '1',
      transaction_date: new Date().toISOString().split('T')[0],
    });
    setModal(type);
  };

  const TABS: { id: TabView; label: string }[] = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'receitas', label: 'Receitas' },
    { id: 'despesas', label: 'Despesas' },
    { id: 'fechamento', label: 'Fechamento' },
  ];

  const modalTitles: Record<TxModalMode, string> = {
    receita: 'Nova Receita', despesa: 'Nova Despesa', closed: '',
  };

  const getClientName = (tx: TxRow) => {
    if (!tx.client) return null;
    return Array.isArray(tx.client) ? tx.client[0]?.name : tx.client?.name;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="text-nd-muted text-sm mt-1">Controle financeiro completo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openModal('receita')} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Receita</span>
          </button>
          <button onClick={() => openModal('despesa')} className="btn-secondary text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Despesa</span>
          </button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)} className="btn-ghost p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-nd-heading capitalize min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => navigateMonth(1)} className="btn-ghost p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5 w-full sm:w-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 sm:flex-none ${tab === t.id ? 'bg-white shadow-soft text-nd-heading font-semibold' : 'text-nd-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      ) : (
        <>
          {/* RESUMO */}
          {tab === 'resumo' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Faturamento" value={fmt(totalRevenue)} color="text-nd-success" icon={TrendingUp} iconBg="bg-nd-success/10" />
                <StatCard label="Despesas" value={fmt(totalExpenses)} color="text-nd-danger" icon={TrendingDown} iconBg="bg-nd-danger/10" />
                <StatCard label="Salários" value={fmt(totalSalaries)} color="text-nd-warning" icon={UserCheck} iconBg="bg-nd-warning/10" />
                <StatCard label="Saldo" value={fmt(fundoCaixa)} color={fundoCaixa >= 0 ? 'text-nd-accent' : 'text-nd-danger'} icon={PiggyBank} iconBg="bg-nd-accent/10" />
              </div>

              {/* Revenue breakdown */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="card p-5">
                  <h3 className="section-label mb-3">Faturamento por forma</h3>
                  <div className="space-y-2">
                    <PayRow icon={Smartphone} label="PIX" value={fmt(revenuePix)} />
                    <PayRow icon={Banknote} label="Dinheiro" value={fmt(revenueCash)} />
                    <PayRow icon={CreditCard} label="Cartão" value={fmt(revenueCard)} />
                    <PayRow icon={ArrowRightLeft} label="Transferência" value={fmt(revenueTransfer)} />
                  </div>
                  <div className="divider mt-3 pt-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-nd-heading">Em banco (PIX+Cartão+TED)</span>
                      <span className="text-nd-accent">{fmt(revenuePix + revenueCard + revenueTransfer)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold mt-1">
                      <span className="text-nd-heading">Em dinheiro</span>
                      <span className="text-nd-success">{fmt(revenueCash)}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="section-label mb-3">Despesas por forma</h3>
                  <div className="space-y-2">
                    <PayRow icon={Smartphone} label="PIX" value={fmt(expensePix)} />
                    <PayRow icon={Banknote} label="Dinheiro" value={fmt(expenseCash)} />
                    <PayRow icon={CreditCard} label="Cartão" value={fmt(expenseCard)} />
                    <PayRow icon={ArrowRightLeft} label="Transferência" value={fmt(expenseTransfer)} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* RECEITAS */}
          {tab === 'receitas' && (
            <TxList
              items={sales}
              emptyLabel="Nenhuma receita registrada"
              colorClass="text-nd-success"
              prefix="+"
              fmt={fmt}
              onDelete={handleDelete}
              getClientName={getClientName}
            />
          )}

          {/* DESPESAS */}
          {tab === 'despesas' && (
            <TxList
              items={expenses}
              emptyLabel="Nenhuma despesa registrada"
              colorClass="text-nd-danger"
              prefix="-"
              fmt={fmt}
              onDelete={handleDelete}
              getClientName={getClientName}
            />
          )}

          {/* FECHAMENTO */}
          {tab === 'fechamento' && (
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-nd-heading mb-4">Fechamento de Caixa — {monthLabel}</h3>

                <div className="space-y-3">
                  {/* Fundo de caixa inicial */}
                  <div className="flex items-center justify-between py-2 gap-2">
                    <span className="text-xs sm:text-sm text-nd-text font-medium">Fundo de caixa inicial</span>
                    <div className="flex items-center gap-2">
                      <ClosingValue
                        value={startingBalance}
                        onSave={(v) => saveClosing('starting_balance', v)}
                        fmt={fmt}
                      />
                      <button
                        onClick={autoFillStartingBalance}
                        className="text-[10px] text-nd-accent hover:underline shrink-0"
                        title="Auto-preencher com o saldo do mês anterior"
                      >
                        auto
                      </button>
                    </div>
                  </div>

                  <div className="divider" />

                  {/* Faturamento */}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-nd-success font-medium">+ Faturamento do mês</span>
                    <span className="text-sm font-bold text-nd-success">{fmt(totalRevenue)}</span>
                  </div>
                  <div className="pl-4 space-y-1">
                    <MiniRow label="PIX" value={fmt(revenuePix)} />
                    <MiniRow label="Dinheiro" value={fmt(revenueCash)} />
                    <MiniRow label="Cartão" value={fmt(revenueCard)} />
                    <MiniRow label="Transferência" value={fmt(revenueTransfer)} />
                  </div>

                  <div className="divider" />

                  {/* Despesas */}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-nd-danger font-medium">- Despesas do mês</span>
                    <span className="text-sm font-bold text-nd-danger">{fmt(totalExpenses)}</span>
                  </div>
                  <div className="pl-4 space-y-1">
                    <MiniRow label="PIX" value={fmt(expensePix)} />
                    <MiniRow label="Dinheiro" value={fmt(expenseCash)} />
                    <MiniRow label="Cartão" value={fmt(expenseCard)} />
                    <MiniRow label="Transferência" value={fmt(expenseTransfer)} />
                  </div>

                  <div className="divider" />

                  {/* Resultado */}
                  <div className="flex justify-between items-center py-2 bg-nd-surface/50 rounded-xl px-4 -mx-1">
                    <span className="text-sm font-bold text-nd-heading">= Saldo do mês</span>
                    <span className={`text-lg font-bold ${fundoCaixa >= 0 ? 'text-nd-accent' : 'text-nd-danger'}`}>
                      {fmt(fundoCaixa)}
                    </span>
                  </div>

                  {/* Adiantamentos do próximo mês */}
                  {totalNextAdvances > 0 && (
                    <>
                      <div className="divider" />
                      <div className="p-4 rounded-xl bg-nd-warning/5 border border-nd-warning/15 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-nd-warning shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-nd-heading">Adiantamentos do próximo mês</p>
                            <p className="text-[11px] text-nd-muted mt-0.5">
                              Dinheiro recebido este mês como sinal/garantia de turnos futuros.
                              Está fisicamente na conta mas pertence ao mês seguinte.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1 pl-6">
                          {nextMonthAdvances.map(adv => (
                            <div key={adv.id} className="flex justify-between text-xs">
                              <span className="text-nd-muted truncate mr-2">{adv.description}</span>
                              <span className="text-nd-warning font-medium shrink-0">{fmt(adv.total_amount)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-nd-warning/15">
                          <span className="text-sm font-semibold text-nd-warning">Total adiantamentos</span>
                          <span className="text-sm font-bold text-nd-warning">{fmt(totalNextAdvances)}</span>
                        </div>
                        <div className="pl-6 space-y-1">
                          {nextAdvPix > 0 && <MiniRow label="PIX" value={fmt(nextAdvPix)} />}
                          {nextAdvCash > 0 && <MiniRow label="Dinheiro" value={fmt(nextAdvCash)} />}
                          {nextAdvCard > 0 && <MiniRow label="Cartão" value={fmt(nextAdvCard)} />}
                          {nextAdvTransfer > 0 && <MiniRow label="Transferência" value={fmt(nextAdvTransfer)} />}
                        </div>
                      </div>

                      {/* Reconciliation */}
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 space-y-2">
                        <p className="text-xs font-semibold text-blue-800">Conciliação bancária</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">Saldo do mês</span>
                          <span className="text-blue-800 font-semibold">{fmt(fundoCaixa)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">+ Adiantamentos futuros na conta</span>
                          <span className="text-blue-800 font-semibold">{fmt(totalNextAdvances)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold border-t border-blue-200 pt-2">
                          <span className="text-blue-900">Valor real na conta/caixa</span>
                          <span className="text-blue-900">{fmt(fundoCaixa + totalNextAdvances)}</span>
                        </div>
                        <p className="text-[10px] text-blue-600 mt-1">
                          Este valor deve bater com o saldo bancário + dinheiro físico.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL */}
      {modal !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <h2 className="text-base font-semibold text-nd-heading">{modalTitles[modal]}</h2>
              <button onClick={() => setModal('closed')} className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="section-label mb-1.5 block">Descrição *</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição"
                  className="input-field" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label mb-1.5 block">Valor (R$) *</label>
                  <input type="number" value={form.total_amount}
                    onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                    placeholder="0,00" step="0.01" min="0" className="input-field" />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Data</label>
                  <input type="date" value={form.transaction_date}
                    onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                    className="input-field" />
                </div>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Forma de pagamento</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { id: 'pix', label: 'PIX', icon: Smartphone },
                    { id: 'cash', label: 'Dinheiro', icon: Banknote },
                    { id: 'card', label: 'Cartão', icon: CreditCard },
                    { id: 'transfer', label: 'TED', icon: ArrowRightLeft },
                  ] as const).map(pm => (
                    <button key={pm.id}
                      onClick={() => setForm(f => ({ ...f, payment_method: pm.id }))}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all ${
                        form.payment_method === pm.id
                          ? 'border-nd-accent/40 bg-nd-accent/5 text-nd-accent'
                          : 'border-nd-border text-nd-muted hover:border-nd-accent/20'
                      }`}>
                      <pm.icon className="w-4 h-4" />
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {modal === 'despesa' && form.payment_method === 'card' && (
                <div>
                  <label className="section-label mb-1.5 block">Parcelas</label>
                  <input type="number" value={form.installments}
                    onChange={e => setForm(f => ({ ...f, installments: e.target.value }))}
                    placeholder="1" min="1" max="24" className="input-field" />
                  {parseInt(form.installments) > 1 && form.total_amount && (
                    <p className="text-xs text-nd-muted mt-1">
                      {form.installments}x de {fmt(parseFloat(form.total_amount) / parseInt(form.installments))} — parcelas futuras serão lançadas nos meses seguintes
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="section-label mb-1.5 block">Categoria</label>
                <input type="text" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Ex: Material, Aluguel, Salário..."
                  className="input-field" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.description.trim() || !form.total_amount}
                  className="btn-primary text-sm flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, color, icon: Icon, iconBg }: {
  label: string; value: string; color: string; icon: any; iconBg: string;
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
    </div>
  );
}

function PayRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-nd-muted flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="text-sm font-medium text-nd-heading">{value}</span>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-nd-muted">• {label}</span>
      <span className="text-xs text-nd-text">{value}</span>
    </div>
  );
}

function ClosingValue({ value, onSave, fmt }: {
  value: number; onSave: (v: number) => void; fmt: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value.toString());

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input type="number" value={val} onChange={e => setVal(e.target.value)}
          className="input-field w-32 text-right text-sm py-1" autoFocus
          onKeyDown={e => { if (e.key === 'Enter') { onSave(parseFloat(val) || 0); setEditing(false); } }}
        />
        <button onClick={() => { onSave(parseFloat(val) || 0); setEditing(false); }}
          className="btn-primary text-xs px-2 py-1"><Save className="w-3 h-3" /></button>
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-2 py-1">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => { setVal(value.toString()); setEditing(true); }}
      className="text-sm font-bold text-nd-heading hover:text-nd-accent cursor-pointer">
      {fmt(value)} <span className="text-[10px] text-nd-muted ml-1">editar</span>
    </button>
  );
}

function TxList({ items, emptyLabel, colorClass, prefix, fmt, onDelete, getClientName }: {
  items: TxRow[]; emptyLabel: string; colorClass: string; prefix: string;
  fmt: (v: number) => string; onDelete: (id: string) => void; getClientName: (tx: TxRow) => string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="card p-10 flex flex-col items-center justify-center text-center">
        <DollarSign className="w-8 h-8 text-nd-muted/30 mb-3" />
        <p className="text-sm text-nd-muted">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-nd-border/50 max-h-[500px] overflow-y-auto">
        {items.map(tx => (
          <div key={tx.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 hover:bg-nd-surface/50 transition-colors group">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-nd-text truncate">
                {tx.description || tx.type}
                {tx.installment_total && tx.installment_total > 1 && (
                  <span className="text-[10px] text-nd-muted ml-1">
                    ({tx.installment_number}/{tx.installment_total})
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                {getClientName(tx) && <span className="text-[10px] sm:text-xs text-nd-muted">{getClientName(tx)}</span>}
                {tx.category && <span className="badge-muted text-[9px]">{tx.category}</span>}
                <span className="text-[10px] sm:text-xs text-nd-muted/60">
                  {new Date(tx.transaction_date).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            <span className={`text-xs sm:text-sm font-semibold ${colorClass} shrink-0`}>
              {prefix} {fmt(tx.total_amount)}
            </span>
            <button onClick={() => onDelete(tx.id)}
              className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-nd-danger/10 text-nd-muted hover:text-nd-danger transition-all shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

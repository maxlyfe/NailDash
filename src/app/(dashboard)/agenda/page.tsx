'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import {
  CalendarDays, Plus, X, Loader2, Save, Trash2,
  ChevronLeft, ChevronRight, User, Clock, Search,
  DollarSign, CreditCard, Banknote, ArrowDownLeft,
  Check,
} from 'lucide-react';

/* ─── Types ─── */
type PickClient = { id: string; name: string };
type PickProf = { id: string; name: string };
type PickService = { id: string; name: string; duration_minutes: number; price: number };
type ViewMode = 'week' | 'day';
type ModalMode = 'closed' | 'create' | 'edit' | 'confirm_advance' | 'close_shift';
type DayHours = { open: string; close: string } | null;
type BusinessHours = Record<string, DayHours>;

type ApptRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  professional_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  payment_method: string | null;
  discount: number;
  extras: number;
  extras_description: string | null;
  advance_amount: number;
  advance_payment_method: string | null;
  advance_paid_at: string | null;
  total_amount: number;
  closed_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-nd-accent/15 border-nd-accent/30 text-nd-accent',
  confirmed: 'bg-blue-50 border-blue-200 text-blue-700',
  in_progress: 'bg-nd-warning/15 border-nd-warning/30 text-nd-warning',
  completed: 'bg-nd-success/10 border-nd-success/20 text-nd-success',
  cancelled: 'bg-nd-danger/10 border-nd-danger/20 text-nd-danger line-through',
  no_show: 'bg-nd-muted/10 border-nd-muted/20 text-nd-muted',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado', in_progress: 'Em andamento',
  completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Não compareceu',
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX', icon: Banknote },
  { value: 'cash', label: 'Dinheiro', icon: DollarSign },
  { value: 'card', label: 'Cartão', icon: CreditCard },
  { value: 'transfer', label: 'Transferência', icon: ArrowDownLeft },
];

const DAY_NAMES_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const DEFAULT_BH: BusinessHours = {
  '0': null,
  '1': { open: '09:00', close: '18:00' },
  '2': { open: '09:00', close: '18:00' },
  '3': { open: '09:00', close: '18:00' },
  '4': { open: '09:00', close: '18:00' },
  '5': { open: '09:00', close: '18:00' },
  '6': { open: '09:00', close: '13:00' },
};

/* ─── Helpers ─── */
function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseHour(timeStr: string): number {
  return parseInt(timeStr.split(':')[0], 10);
}

/* ─── Component ─── */
export default function AgendaPage() {
  const { salon, user, loading: authLoading } = useAuth();
  const supabase = useSupabase();

  const bh: BusinessHours = (salon?.business_hours as BusinessHours) || DEFAULT_BH;

  // Earliest business hour for auto-scroll
  const scrollToHour = useMemo(() => {
    let minOpen = 9;
    for (let i = 0; i < 7; i++) {
      const dh = bh[String(i)];
      if (dh) {
        const o = parseHour(dh.open);
        if (o < minOpen) minOpen = o;
      }
    }
    return minOpen;
  }, [salon?.id]);

  const SLOT_HEIGHT = 70; // px per hour
  const TOTAL_HOURS = 24; // show all 24 hours

  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [clients, setClients] = useState<PickClient[]>([]);
  const [professionals, setProfessionals] = useState<PickProf[]>([]);
  const [services, setServices] = useState<PickService[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [profMap, setProfMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [modal, setModal] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<ApptRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    client_id: '' as string,
    client_name: '',
    professional_id: '',
    service_ids: [] as string[],
    starts_at: '',
    ends_at: '',
    status: 'scheduled',
    notes: '',
    advance_amount: '0',
    advance_payment_method: 'pix',
  });

  // Advance (confirmation) form
  const [advanceForm, setAdvanceForm] = useState({
    amount: '0',
    payment_method: 'pix',
  });

  // Close shift form
  const [closeForm, setCloseForm] = useState({
    payment_method: 'pix',
    discount: '0',
    extras: '0',
    extras_description: '',
  });

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  // Service search
  const [serviceSearch, setServiceSearch] = useState('');

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  // Load dropdown data
  useEffect(() => {
    if (!salon?.id) return;
    const load = async () => {
      const [cRes, pRes, sRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('salon_id', salon.id).order('name'),
        supabase.from('professionals').select('id, name').eq('salon_id', salon.id).eq('is_active', true).order('name'),
        supabase.from('services').select('id, name, duration_minutes, price').eq('salon_id', salon.id).eq('is_active', true).order('name'),
      ]);
      const cl = cRes.data || [];
      const pr = pRes.data || [];
      setClients(cl);
      setProfessionals(pr);
      setServices((sRes.data || []) as PickService[]);
      const cm: Record<string, string> = {};
      cl.forEach(c => { cm[c.id] = c.name; });
      setClientMap(cm);
      const pm: Record<string, string> = {};
      pr.forEach(p => { pm[p.id] = p.name; });
      setProfMap(pm);
    };
    load();
  }, [salon?.id]);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    if (!salon?.id) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    const rangeStart = viewMode === 'week'
      ? `${toDateStr(weekStart)}T00:00:00`
      : `${toDateStr(currentDate)}T00:00:00`;
    const rangeEnd = viewMode === 'week'
      ? `${toDateStr(weekEnd)}T23:59:59`
      : `${toDateStr(currentDate)}T23:59:59`;

    const { data } = await supabase
      .from('appointments')
      .select('id, client_id, client_name, professional_id, status, starts_at, ends_at, notes, payment_method, discount, extras, extras_description, advance_amount, advance_payment_method, advance_paid_at, total_amount, closed_at')
      .eq('salon_id', salon.id)
      .gte('starts_at', rangeStart)
      .lte('starts_at', rangeEnd)
      .neq('status', 'cancelled')
      .order('starts_at');

    setAppointments(data || []);
    setLoading(false);
  }, [salon?.id, viewMode, toDateStr(weekStart), toDateStr(currentDate), authLoading]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Navigation
  const navigate = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (viewMode === 'week' ? delta * 7 : delta));
    setCurrentDate(d);
  };

  const getApptForDay = (day: Date) => {
    const ds = toDateStr(day);
    return appointments.filter(a => a.starts_at.startsWith(ds));
  };

  const getApptStyle = (appt: ApptRow) => {
    const start = new Date(appt.starts_at);
    const end = new Date(appt.ends_at);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const top = (startMin / 60) * SLOT_HEIGHT;
    const height = Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, 24);
    return { top: `${top}px`, height: `${height}px` };
  };

  const getApptDisplayName = (appt: ApptRow) => {
    if (appt.client_id && clientMap[appt.client_id]) return clientMap[appt.client_id];
    if (appt.client_name) return appt.client_name;
    return 'Cliente';
  };

  // Auto-calculate end time based on selected services
  const calcEndTime = (startStr: string, svcIds: string[]) => {
    if (!startStr) return '';
    const totalMin = svcIds.reduce((sum, id) => {
      const svc = services.find(s => s.id === id);
      return sum + (svc?.duration_minutes || 0);
    }, 0) || 60;
    const start = new Date(startStr);
    start.setMinutes(start.getMinutes() + totalMin);
    const h = String(start.getHours()).padStart(2, '0');
    const m = String(start.getMinutes()).padStart(2, '0');
    return `${toDateStr(start)}T${h}:${m}`;
  };

  // Open create
  const openCreateAt = (day: Date, hour: number) => {
    const ds = toDateStr(day);
    const h = String(hour).padStart(2, '0');
    setForm({
      client_id: '', client_name: '', professional_id: '',
      service_ids: [],
      starts_at: `${ds}T${h}:00`,
      ends_at: `${ds}T${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`,
      status: 'scheduled', notes: '',
      advance_amount: '0', advance_payment_method: 'pix',
    });
    setClientSearch('');
    setServiceSearch('');
    setSelected(null);
    setModal('create');
  };

  const openEdit = (appt: ApptRow) => {
    setForm({
      client_id: appt.client_id || '',
      client_name: appt.client_name || '',
      professional_id: appt.professional_id,
      service_ids: [],
      starts_at: appt.starts_at.slice(0, 16),
      ends_at: appt.ends_at.slice(0, 16),
      status: appt.status,
      notes: appt.notes || '',
      advance_amount: String(appt.advance_amount || 0),
      advance_payment_method: appt.advance_payment_method || 'pix',
    });
    setClientSearch(appt.client_id ? (clientMap[appt.client_id] || '') : (appt.client_name || ''));
    setServiceSearch('');
    setSelected(appt);
    setModal('edit');
  };

  const openConfirmAdvance = (appt: ApptRow) => {
    // Always use fresh data from appointments array
    const fresh = appointments.find(a => a.id === appt.id) || appt;
    setSelected(fresh);
    setAdvanceForm({
      amount: String(fresh.advance_amount || 0),
      payment_method: fresh.advance_payment_method || 'pix',
    });
    setModal('confirm_advance');
  };

  const openCloseShift = (appt: ApptRow) => {
    // Always use fresh data from appointments array
    const fresh = appointments.find(a => a.id === appt.id) || appt;
    setSelected(fresh);
    setCloseForm({
      payment_method: fresh.payment_method || 'pix',
      discount: String(fresh.discount || 0),
      extras: String(fresh.extras || 0),
      extras_description: fresh.extras_description || '',
    });
    setModal('close_shift');
  };

  const handleSave = async () => {
    if (!salon?.id || !form.professional_id || !form.starts_at) return;
    if (!form.client_id && !form.client_name.trim()) return;
    setSaving(true);

    const advanceAmt = parseFloat(form.advance_amount) || 0;
    const payload: Record<string, unknown> = {
      salon_id: salon.id,
      client_id: form.client_id || null,
      client_name: form.client_name.trim() || null,
      professional_id: form.professional_id,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : new Date(form.starts_at).toISOString(),
      status: form.status,
      notes: form.notes.trim() || null,
      created_by: user?.id || null,
    };

    // Calculate total from selected services
    if (form.service_ids.length > 0) {
      const total = form.service_ids.reduce((sum, id) => {
        const svc = services.find(s => s.id === id);
        return sum + (svc?.price || 0);
      }, 0);
      payload.total_amount = total;
    }

    // Include advance data
    if (modal === 'create' && advanceAmt > 0) {
      payload.advance_amount = advanceAmt;
      payload.advance_payment_method = form.advance_payment_method;
      payload.advance_paid_at = new Date().toISOString();
      payload.status = 'confirmed';
    } else if (modal === 'edit' && selected) {
      // On edit, update advance if changed
      const prevAdvance = selected.advance_amount || 0;
      if (advanceAmt !== prevAdvance) {
        payload.advance_amount = advanceAmt;
        payload.advance_payment_method = advanceAmt > 0 ? form.advance_payment_method : null;
        payload.advance_paid_at = advanceAmt > 0 ? new Date().toISOString() : null;
      }
    }

    if (modal === 'create') {
      const { error: err } = await supabase.from('appointments').insert(payload);
      if (err) { alert(`Erro: ${err.message}`); setSaving(false); return; }
      // Insert appointment_services + advance transaction
      const { data: newAppt } = await supabase
        .from('appointments')
        .select('id')
        .eq('salon_id', salon.id)
        .eq('starts_at', payload.starts_at)
        .eq('professional_id', payload.professional_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (newAppt) {
        if (form.service_ids.length > 0) {
          const svcRows = form.service_ids.map(sid => {
            const svc = services.find(s => s.id === sid)!;
            return {
              appointment_id: newAppt.id,
              service_id: sid,
              price: svc.price,
              duration_minutes: svc.duration_minutes,
            };
          });
          await supabase.from('appointment_services').insert(svcRows);
        }
        // Create advance transaction (transaction_date = appointment date, not today)
        if (advanceAmt > 0) {
          await supabase.from('transactions').insert({
            salon_id: salon.id,
            type: 'sale',
            appointment_id: newAppt.id,
            client_id: form.client_id || null,
            professional_id: form.professional_id,
            description: `Adiantamento: ${form.client_name.trim() || 'Cliente'}`,
            total_amount: advanceAmt,
            service_price: 0, discount: 0, tax: 0, tips: 0,
            category: 'adiantamento',
            [`payment_${form.advance_payment_method}`]: advanceAmt,
            transaction_date: new Date(form.starts_at).toISOString(),
            registered_at: new Date().toISOString(),
          });
        }
      }
    } else if (selected) {
      const { error: err } = await supabase.from('appointments').update(payload).eq('id', selected.id);
      if (err) { alert(`Erro: ${err.message}`); setSaving(false); return; }
      // If advance was added/changed during edit (transaction_date = appointment date)
      const prevAdvance = selected.advance_amount || 0;
      if (advanceAmt > 0 && advanceAmt !== prevAdvance) {
        await supabase.from('transactions').insert({
          salon_id: salon.id,
          type: 'sale',
          appointment_id: selected.id,
          client_id: form.client_id || null,
          professional_id: form.professional_id,
          description: `Adiantamento: ${getApptDisplayName(selected)}`,
          total_amount: advanceAmt,
          service_price: 0, discount: 0, tax: 0, tips: 0,
          category: 'adiantamento',
          [`payment_${form.advance_payment_method}`]: advanceAmt,
          transaction_date: new Date(form.starts_at).toISOString(),
          registered_at: new Date().toISOString(),
        });
      }
    }

    setModal('closed');
    await fetchAppointments();
    setSaving(false);
  };

  const handleConfirmAdvance = async () => {
    if (!selected || !salon?.id) return;
    setSaving(true);
    const amount = parseFloat(advanceForm.amount) || 0;

    const updateData: Record<string, unknown> = {
      status: 'confirmed',
      advance_amount: amount,
      advance_payment_method: amount > 0 ? advanceForm.payment_method : null,
      advance_paid_at: amount > 0 ? new Date().toISOString() : null,
    };

    const { error: err } = await supabase.from('appointments').update(updateData).eq('id', selected.id);
    if (err) { alert(`Erro: ${err.message}`); setSaving(false); return; }

    // Register advance as transaction (transaction_date = appointment date, not today)
    if (amount > 0) {
      await supabase.from('transactions').insert({
        salon_id: salon.id,
        type: 'sale',
        appointment_id: selected.id,
        client_id: selected.client_id || null,
        professional_id: selected.professional_id,
        description: `Adiantamento: ${getApptDisplayName(selected)}`,
        total_amount: amount,
        service_price: 0,
        discount: 0,
        tax: 0,
        tips: 0,
        category: 'adiantamento',
        [`payment_${advanceForm.payment_method}`]: amount,
        transaction_date: new Date(selected.starts_at).toISOString(),
        registered_at: new Date().toISOString(),
      });
    }

    setModal('closed');
    await fetchAppointments();
    setSaving(false);
  };

  const handleCloseShift = async () => {
    if (!selected || !salon?.id) return;
    setSaving(true);
    const discount = parseFloat(closeForm.discount) || 0;
    const extras = parseFloat(closeForm.extras) || 0;
    const advanceAlreadyPaid = selected.advance_amount || 0;
    const baseTotal = selected.total_amount || 0;
    const finalTotal = baseTotal - discount + extras;
    const remaining = finalTotal - advanceAlreadyPaid;

    const { error: err } = await supabase.from('appointments').update({
      status: 'completed',
      payment_method: closeForm.payment_method,
      discount,
      extras,
      extras_description: closeForm.extras_description.trim() || null,
      total_amount: finalTotal,
      closed_at: new Date().toISOString(),
    }).eq('id', selected.id);

    if (err) { alert(`Erro: ${err.message}`); setSaving(false); return; }

    // Create transaction for the remaining amount (total - advance already paid)
    await supabase.from('transactions').insert({
      salon_id: salon.id,
      type: 'sale',
      appointment_id: selected.id,
      client_id: selected.client_id || null,
      professional_id: selected.professional_id,
      description: `Turno: ${getApptDisplayName(selected)}`,
      total_amount: finalTotal,
      service_price: baseTotal,
      discount,
      tax: 0,
      tips: extras,
      category: 'turno',
      [`payment_${closeForm.payment_method}`]: Math.max(remaining, 0),
      transaction_date: new Date().toISOString(),
      registered_at: new Date().toISOString(),
    });

    setModal('closed');
    await fetchAppointments();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este agendamento?')) return;
    await supabase.from('appointment_services').delete().eq('appointment_id', id);
    await supabase.from('appointments').delete().eq('id', id);
    setModal('closed');
    fetchAppointments();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from('appointments').update({ status }).eq('id', id);
    fetchAppointments();
  };

  // Client search logic
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    const q = clientSearch.toLowerCase();
    return clients.filter(c => c.name.toLowerCase().includes(q)).slice(0, 10);
  }, [clientSearch, clients]);

  const selectClient = (client: PickClient) => {
    setForm(f => ({ ...f, client_id: client.id, client_name: client.name }));
    setClientSearch(client.name);
    setShowClientDropdown(false);
  };

  const handleClientSearchChange = (val: string) => {
    setClientSearch(val);
    setForm(f => ({ ...f, client_id: '', client_name: val }));
    setShowClientDropdown(true);
  };

  // Service toggle
  const toggleService = (id: string) => {
    setForm(f => {
      const newIds = f.service_ids.includes(id)
        ? f.service_ids.filter(s => s !== id)
        : [...f.service_ids, id];
      const newEnd = calcEndTime(f.starts_at, newIds);
      return { ...f, service_ids: newIds, ends_at: newEnd || f.ends_at };
    });
  };

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase();
    return services.filter(s => s.name.toLowerCase().includes(q));
  }, [serviceSearch, services]);

  const selectedServicesTotal = form.service_ids.reduce((sum, id) => {
    const svc = services.find(s => s.id === id);
    return sum + (svc?.price || 0);
  }, 0);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const isCurrentWeek = isSameDay(weekDays[0], getWeekDays(new Date())[0]);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i);

  const headerLabel = viewMode === 'week'
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} de ${weekEnd.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
    : currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Scroll to business hours start on mount
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && gridRef.current) {
      const scrollTo = Math.max(0, scrollToHour * SLOT_HEIGHT - 20);
      gridRef.current.scrollTop = scrollTo;
    }
  }, [loading, viewMode]);

  return (
    <div className="space-y-3 animate-fade-in h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h1 className="page-title">Agenda</h1>
        </div>
        <button onClick={() => openCreateAt(currentDate, new Date().getHours())} className="btn-primary text-sm shrink-0">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* Nav bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="btn-ghost text-xs px-3 py-1.5">Hoje</button>
          <button onClick={() => navigate(1)} className="btn-ghost p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-nd-heading capitalize ml-1">{headerLabel}</span>
        </div>
        <div className="flex gap-1 bg-nd-surface rounded-xl p-0.5">
          <button onClick={() => setViewMode('week')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${viewMode === 'week' ? 'bg-white shadow-soft text-nd-heading font-semibold' : 'text-nd-muted'}`}>
            Semana
          </button>
          <button onClick={() => setViewMode('day')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${viewMode === 'day' ? 'bg-white shadow-soft text-nd-heading font-semibold' : 'text-nd-muted'}`}>
            Dia
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-10 flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      ) : viewMode === 'week' ? (
        /* ════ WEEK VIEW ════ */
        <div className="card overflow-hidden flex-1 flex flex-col min-h-0">
          {/* Day headers */}
          <div className="grid border-b border-nd-border/50 shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
            <div className="border-r border-nd-border/30" />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, new Date());
              const dayBh = bh[String(day.getDay())];
              const isClosed = !dayBh;
              const dayApptCount = getApptForDay(day).length;
              return (
                <button
                  key={i}
                  onClick={() => { setCurrentDate(day); setViewMode('day'); }}
                  className={`py-2.5 text-center border-r border-nd-border/30 last:border-r-0 hover:bg-nd-surface/50 transition-colors ${isToday ? 'bg-nd-accent/5' : ''}`}
                >
                  <p className={`text-[10px] uppercase tracking-wider ${isToday ? 'text-nd-accent font-bold' : 'text-nd-muted'}`}>
                    {DAY_NAMES_SHORT[i]}
                  </p>
                  <p className={`text-lg font-bold ${isToday ? 'text-nd-accent' : 'text-nd-heading'}`}>
                    {day.getDate()}
                  </p>
                  {isClosed && <span className="text-[9px] text-nd-muted/50 italic">Fechado</span>}
                  {!isClosed && dayApptCount > 0 && (
                    <span className="text-[9px] text-nd-accent font-medium">{dayApptCount} turno{dayApptCount > 1 ? 's' : ''}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Time grid */}
          <div ref={gridRef} className="overflow-auto flex-1">
            <div className="grid relative" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              {hours.map(hour => (
                <div key={hour} className="contents">
                  <div className="border-r border-nd-border/30 text-right pr-1.5 relative" style={{ height: `${SLOT_HEIGHT}px` }}>
                    <span className="text-[10px] text-nd-muted absolute -top-2 right-1.5">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                  {weekDays.map((day, di) => {
                    const dayBh = bh[String(day.getDay())];
                    const isClosed = !dayBh;
                    const isOutside = dayBh ? (hour < parseHour(dayBh.open) || hour >= parseHour(dayBh.close)) : true;
                    const isBusinessHour = !isClosed && !isOutside;
                    return (
                      <div
                        key={di}
                        onClick={() => openCreateAt(day, hour)}
                        className={`border-r border-b border-nd-border/15 last:border-r-0 transition-colors relative cursor-pointer hover:bg-nd-accent/5 ${
                          isBusinessHour
                            ? isSameDay(day, new Date()) ? 'bg-nd-accent/[0.03]' : 'bg-white'
                            : isClosed ? 'bg-nd-surface/40' : 'bg-nd-surface/20'
                        }`}
                        style={{ height: `${SLOT_HEIGHT}px` }}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Appointment blocks */}
              {weekDays.map((day, di) => {
                const dayAppts = getApptForDay(day);
                return dayAppts.map(appt => {
                  const style = getApptStyle(appt);
                  const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
                  const isClosed = !!appt.closed_at;
                  return (
                    <div
                      key={appt.id}
                      onClick={(e) => { e.stopPropagation(); isClosed ? openEdit(appt) : openEdit(appt); }}
                      className={`absolute rounded-lg border px-1.5 py-1 overflow-hidden cursor-pointer hover:shadow-soft transition-shadow z-10 ${colors}`}
                      style={{
                        top: style.top,
                        height: style.height,
                        left: `calc(48px + (100% - 48px) / 7 * ${di} + 2px)`,
                        width: `calc((100% - 48px) / 7 - 4px)`,
                      }}
                    >
                      <p className="text-[11px] font-semibold truncate leading-tight">
                        {getApptDisplayName(appt)}
                      </p>
                      <p className="text-[9px] opacity-70 truncate">
                        {profMap[appt.professional_id] || ''} {formatTime(appt.starts_at)}-{formatTime(appt.ends_at)}
                      </p>
                      {isClosed && <Check className="w-3 h-3 absolute top-1 right-1 opacity-50" />}
                    </div>
                  );
                });
              })}

              {/* Current time indicator */}
              {isCurrentWeek && (() => {
                const now = new Date();
                const mins = now.getHours() * 60 + now.getMinutes();
                const top = (mins / 60) * SLOT_HEIGHT;
                const dayIndex = now.getDay();
                return (
                  <div
                    className="absolute h-0.5 bg-nd-danger z-20 pointer-events-none"
                    style={{
                      top: `${top}px`,
                      left: `calc(48px + (100% - 48px) / 7 * ${dayIndex})`,
                      width: `calc((100% - 48px) / 7)`,
                    }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-nd-danger absolute -left-1 -top-1" />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        /* ════ DAY VIEW ════ */
        <div className="card overflow-hidden flex-1 flex flex-col min-h-0">
          <div ref={gridRef} className="overflow-auto flex-1">
            {(() => {
              const dayBh = bh[String(currentDate.getDay())];
              const dayHours = Array.from({ length: TOTAL_HOURS }, (_, i) => i);

              return dayHours.map(hour => {
                const isBusinessHour = dayBh ? (hour >= parseHour(dayBh.open) && hour < parseHour(dayBh.close)) : false;
                const dayAppts = getApptForDay(currentDate).filter(a => {
                  const h = new Date(a.starts_at).getHours();
                  return h === hour;
                });
                return (
                  <div key={hour} className="flex border-b border-nd-border/20">
                    <div className="w-14 shrink-0 py-3 text-right pr-3 border-r border-nd-border/30">
                      <span className="text-xs text-nd-muted">{String(hour).padStart(2, '0')}:00</span>
                    </div>
                    <div
                      className={`flex-1 min-h-[70px] p-1.5 cursor-pointer hover:bg-nd-accent/5 transition-colors ${isBusinessHour ? 'bg-white' : 'bg-nd-surface/20'}`}
                      onClick={() => openCreateAt(currentDate, hour)}
                    >
                      {dayAppts.map(appt => {
                        const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
                        const isClosed = !!appt.closed_at;
                        return (
                          <div
                            key={appt.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(appt); }}
                            className={`rounded-xl border px-4 py-3 mb-1.5 cursor-pointer hover:shadow-soft transition-shadow ${colors}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {getApptDisplayName(appt)}
                                </p>
                                {isClosed && <Check className="w-3.5 h-3.5 text-nd-success shrink-0" />}
                              </div>
                              <span className="text-[11px] shrink-0 font-medium">
                                {formatTime(appt.starts_at)} - {formatTime(appt.ends_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              {profMap[appt.professional_id] && (
                                <p className="text-xs opacity-70 flex items-center gap-1">
                                  <User className="w-3 h-3" /> {profMap[appt.professional_id]}
                                </p>
                              )}
                              {appt.total_amount > 0 && (
                                <p className="text-xs font-medium">{formatCurrency(appt.total_amount)}</p>
                              )}
                              {isClosed && appt.payment_method && (
                                <span className="text-[10px] opacity-60">
                                  {PAYMENT_METHODS.find(p => p.value === appt.payment_method)?.label}
                                </span>
                              )}
                            </div>
                            {!isClosed && appt.status !== 'cancelled' && (
                              <div className="flex gap-2 mt-2">
                                {appt.status === 'scheduled' && (
                                  <button onClick={(e) => { e.stopPropagation(); openConfirmAdvance(appt); }}
                                    className="text-[11px] font-medium text-blue-600 hover:underline">Confirmar</button>
                                )}
                                {appt.advance_amount > 0 && !isClosed && (
                                  <span className="text-[10px] text-nd-accent">Sinal: {formatCurrency(appt.advance_amount)}</span>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); openCloseShift(appt); }}
                                  className="text-[11px] font-medium text-nd-success hover:underline">Fechar Turno</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ════ CREATE/EDIT MODAL ════ */}
      {(modal === 'create' || modal === 'edit') && (() => {
        const formDate = form.starts_at ? new Date(form.starts_at) : new Date();
        const formDateLabel = formDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' });
        const totalDuration = form.service_ids.reduce((sum, id) => {
          const svc = services.find(s => s.id === id);
          return sum + (svc?.duration_minutes || 0);
        }, 0) || 60;
        const hasAdvance = parseFloat(form.advance_amount) > 0;
        const advAmt = parseFloat(form.advance_amount) || 0;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/30 shrink-0">
              <h2 className="text-base font-semibold text-nd-heading">
                {modal === 'create' ? 'Novo Agendamento' : 'Editar Agendamento'}
              </h2>
              <button onClick={() => setModal('closed')}
                className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="flex flex-col md:flex-row">
                {/* Left: Client search */}
                <div ref={clientRef} className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-nd-border/20 p-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nd-muted" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={e => handleClientSearchChange(e.target.value)}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Buscar cliente..."
                      className="input-field !pl-9 !bg-nd-surface/50"
                      autoFocus
                    />
                  </div>
                  {form.client_id && (
                    <p className="text-[10px] text-nd-success mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Cliente cadastrado
                    </p>
                  )}
                  {!form.client_id && clientSearch.trim() && (
                    <p className="text-[10px] text-nd-accent mt-1.5">Cliente avulso: &quot;{clientSearch.trim()}&quot;</p>
                  )}
                  <div className="mt-2 bg-white rounded-xl border border-nd-border/50 shadow-sm max-h-52 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-nd-muted text-center">
                        {clientSearch.trim() ? `Nenhum encontrado` : 'Nenhum cliente cadastrado'}
                      </p>
                    ) : (
                      filteredClients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-nd-surface/50 transition-colors flex items-center gap-2.5 border-b border-nd-border/10 last:border-0 ${
                            form.client_id === c.id ? 'bg-nd-accent/5' : ''
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            form.client_id === c.id ? 'bg-nd-accent/20' : 'bg-nd-accent/10'
                          }`}>
                            <span className="text-[11px] font-bold text-nd-accent">{c.name[0]}</span>
                          </div>
                          <span className="truncate">{c.name}</span>
                          {form.client_id === c.id && <Check className="w-3.5 h-3.5 text-nd-accent shrink-0 ml-auto" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Right: Form */}
                <div className="flex-1 p-5 space-y-5">
                  {/* Date label */}
                  <p className="text-sm font-semibold text-nd-heading capitalize">{formDateLabel}</p>

                  {/* Time + Services row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Hora de início</label>
                      <input type="datetime-local" value={form.starts_at}
                        onChange={e => {
                          const newStart = e.target.value;
                          setForm(f => ({ ...f, starts_at: newStart, ends_at: calcEndTime(newStart, f.service_ids) || f.ends_at }));
                        }}
                        className="input-field !bg-nd-surface/30 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Profissional</label>
                      <select value={form.professional_id}
                        onChange={e => setForm(f => ({ ...f, professional_id: e.target.value }))}
                        className="input-field !bg-nd-surface/30 text-sm">
                        <option value="">Selecione...</option>
                        {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Services */}
                  {services.length > 0 && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Serviços</label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-nd-muted" />
                        <input
                          type="text"
                          value={serviceSearch}
                          onChange={e => setServiceSearch(e.target.value)}
                          placeholder="Buscar serviço..."
                          className="input-field !pl-8 !py-2 text-sm !bg-nd-surface/30"
                        />
                      </div>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto rounded-xl bg-nd-surface/30 border border-nd-border/20 p-1">
                        {filteredServices.map(svc => (
                          <label key={svc.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/60 cursor-pointer transition-colors">
                            <input type="checkbox" checked={form.service_ids.includes(svc.id)}
                              onChange={() => toggleService(svc.id)}
                              className="w-3.5 h-3.5 rounded border-nd-border text-nd-accent focus:ring-nd-accent/20" />
                            <span className="text-sm text-nd-text flex-1 truncate">{svc.name}</span>
                            <span className="text-[11px] text-nd-muted shrink-0">
                              {formatCurrency(svc.price)} · {svc.duration_minutes}min
                            </span>
                          </label>
                        ))}
                        {filteredServices.length === 0 && (
                          <p className="text-xs text-nd-muted text-center py-2">Nenhum serviço encontrado</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Duration + End time + Total */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Término</label>
                      <input type="datetime-local" value={form.ends_at}
                        onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                        className="input-field !bg-nd-surface/30 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Duração</label>
                      <div className="flex items-center gap-2 h-[42px] px-3 rounded-xl bg-nd-surface/30 border border-nd-border/20 text-sm text-nd-muted">
                        <Clock className="w-4 h-4" />
                        <span>{totalDuration} min</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-nd-accent/5 border border-nd-accent/15">
                    <span className="text-sm font-medium text-nd-heading">Total</span>
                    <span className="text-lg font-bold text-nd-accent">
                      {formatCurrency(selectedServicesTotal)}
                    </span>
                  </div>

                  {/* ── Depósito / Adiantamento ── */}
                  <div className="border-t border-nd-border/20 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium">Depósito / Sinal</label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-nd-muted mb-1 block">Valor (R$)</label>
                        <input type="number" value={form.advance_amount}
                          onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value }))}
                          min="0" step="0.01" placeholder="0,00"
                          className="input-field !bg-nd-surface/30 text-sm font-semibold" />
                      </div>
                      <div>
                        <label className="text-[11px] text-nd-muted mb-1 block">Método de pagamento</label>
                        <select value={form.advance_payment_method}
                          onChange={e => setForm(f => ({ ...f, advance_payment_method: e.target.value }))}
                          className="input-field !bg-nd-surface/30 text-sm"
                          disabled={!hasAdvance}
                        >
                          {PAYMENT_METHODS.map(pm => (
                            <option key={pm.value} value={pm.value}>{pm.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {hasAdvance && (
                      <p className="text-[10px] text-nd-accent mt-1.5">
                        Sinal de {formatCurrency(advAmt)} será registrado como garantia
                      </p>
                    )}
                  </div>

                  {/* Status (edit only) */}
                  {modal === 'edit' && (
                    <div className="border-t border-nd-border/20 pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Status</label>
                          <select value={form.status}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                            className="input-field !bg-nd-surface/30 text-sm">
                            <option value="scheduled">Agendado</option>
                            <option value="confirmed">Confirmado</option>
                            <option value="in_progress">Em andamento</option>
                            <option value="completed">Concluído</option>
                            <option value="cancelled">Cancelado</option>
                            <option value="no_show">Não compareceu</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Observações</label>
                          <input type="text" value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Observações..."
                            className="input-field !bg-nd-surface/30 text-sm" />
                        </div>
                      </div>
                    </div>
                  )}

                  {modal === 'create' && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-nd-muted font-medium mb-1.5 block">Observações</label>
                      <input type="text" value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Observações..."
                        className="input-field !bg-nd-surface/30 text-sm" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-nd-border/30 flex items-center gap-3 shrink-0 bg-nd-surface/20">
              {modal === 'edit' && selected && (
                <>
                  <button onClick={() => handleDelete(selected.id)} className="p-2 rounded-xl text-nd-danger hover:bg-nd-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {!selected.closed_at && selected.status !== 'cancelled' && (
                    <button onClick={() => openCloseShift(selected)} className="btn-secondary text-sm flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4" /> Fechar Turno
                    </button>
                  )}
                </>
              )}
              <div className="flex-1" />
              <button onClick={() => setModal('closed')} className="btn-ghost text-sm px-4 py-2">Cancelar</button>
              <button onClick={handleSave}
                disabled={saving || (!form.client_id && !form.client_name.trim()) || !form.professional_id}
                className="btn-primary text-sm px-6">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {modal === 'create' ? 'Agendar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ════ CONFIRM WITH ADVANCE MODAL ════ */}
      {modal === 'confirm_advance' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <div>
                <h2 className="text-base font-semibold text-nd-heading">Confirmar Agendamento</h2>
                <p className="text-xs text-nd-muted mt-0.5">{getApptDisplayName(selected)} · {formatTime(selected.starts_at)}</p>
              </div>
              <button onClick={() => setModal('closed')}
                className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-sm text-blue-800 font-medium">Sinal de confirmação</p>
                <p className="text-xs text-blue-600 mt-1">
                  Valor cobrado como garantia. Não é devolvido em caso de não comparecimento (exceto exceções).
                </p>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Valor do sinal (R$)</label>
                <input type="number" value={advanceForm.amount}
                  onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))}
                  min="0" step="0.01" placeholder="0,00"
                  className="input-field text-lg font-semibold" />
              </div>

              {parseFloat(advanceForm.amount) > 0 && (
                <div>
                  <label className="section-label mb-2 block">Forma de Pagamento do Sinal</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(pm => {
                      const Icon = pm.icon;
                      const isSelected = advanceForm.payment_method === pm.value;
                      return (
                        <button
                          key={pm.value}
                          onClick={() => setAdvanceForm(f => ({ ...f, payment_method: pm.value }))}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-nd-accent/10 border-nd-accent/30 text-nd-accent'
                              : 'bg-white border-nd-border/30 text-nd-muted hover:border-nd-accent/20'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {pm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { handleStatusChange(selected.id, 'confirmed'); setModal('closed'); }}
                  className="btn-secondary text-sm flex-1">
                  Confirmar sem sinal
                </button>
                <button onClick={handleConfirmAdvance} disabled={saving} className="btn-primary text-sm flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {parseFloat(advanceForm.amount) > 0 ? `Confirmar · ${formatCurrency(parseFloat(advanceForm.amount))}` : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ CLOSE SHIFT MODAL ════ */}
      {modal === 'close_shift' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <div>
                <h2 className="text-base font-semibold text-nd-heading">Fechar Turno</h2>
                <p className="text-xs text-nd-muted mt-0.5">{getApptDisplayName(selected)} · {formatTime(selected.starts_at)}</p>
              </div>
              <button onClick={() => setModal('closed')}
                className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Service total + advance info */}
              <div className="p-4 rounded-xl bg-nd-surface/50 border border-nd-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-nd-muted">Total dos serviços</span>
                  <span className="text-lg font-bold text-nd-heading">{formatCurrency(selected.total_amount || 0)}</span>
                </div>
                {selected.advance_amount > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-nd-border/20">
                    <span className="text-xs text-nd-accent flex items-center gap-1">
                      Sinal pago ({PAYMENT_METHODS.find(p => p.value === selected.advance_payment_method)?.label || 'N/A'})
                    </span>
                    <span className="text-sm font-semibold text-nd-accent">-{formatCurrency(selected.advance_amount)}</span>
                  </div>
                )}
              </div>

              {/* Payment method for remaining */}
              <div>
                <label className="section-label mb-2 block">
                  Forma de Pagamento {selected.advance_amount > 0 ? '(saldo restante)' : ''}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(pm => {
                    const Icon = pm.icon;
                    const isSelected = closeForm.payment_method === pm.value;
                    return (
                      <button
                        key={pm.value}
                        onClick={() => setCloseForm(f => ({ ...f, payment_method: pm.value }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-nd-accent/10 border-nd-accent/30 text-nd-accent'
                            : 'bg-white border-nd-border/30 text-nd-muted hover:border-nd-accent/20'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discount and Extras */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label mb-1.5 block">Desconto (R$)</label>
                  <input type="number" value={closeForm.discount}
                    onChange={e => setCloseForm(f => ({ ...f, discount: e.target.value }))}
                    min="0" step="0.01" className="input-field" />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Extras (R$)</label>
                  <input type="number" value={closeForm.extras}
                    onChange={e => setCloseForm(f => ({ ...f, extras: e.target.value }))}
                    min="0" step="0.01" className="input-field" />
                </div>
              </div>

              {parseFloat(closeForm.extras) > 0 && (
                <div>
                  <label className="section-label mb-1.5 block">Descrição dos extras</label>
                  <input type="text" value={closeForm.extras_description}
                    onChange={e => setCloseForm(f => ({ ...f, extras_description: e.target.value }))}
                    placeholder="Ex: Pedrarias, decoração..."
                    className="input-field" />
                </div>
              )}

              {/* Summary */}
              {(() => {
                const baseTotal = selected.total_amount || 0;
                const discount = parseFloat(closeForm.discount) || 0;
                const extras = parseFloat(closeForm.extras) || 0;
                const advancePaid = selected.advance_amount || 0;
                const finalTotal = baseTotal - discount + extras;
                const remaining = Math.max(finalTotal - advancePaid, 0);
                return (
                  <div className="p-4 rounded-xl bg-nd-success/5 border border-nd-success/15 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-nd-muted">Serviços</span>
                      <span className="text-nd-text">{formatCurrency(baseTotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-nd-danger">Desconto</span>
                        <span className="text-nd-danger">-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    {extras > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-nd-accent">Extras</span>
                        <span className="text-nd-accent">+{formatCurrency(extras)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t border-nd-success/15 pt-2">
                      <span className="text-nd-heading font-medium">Total</span>
                      <span className="text-nd-text font-semibold">{formatCurrency(finalTotal)}</span>
                    </div>
                    {advancePaid > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-nd-accent">Sinal já pago</span>
                        <span className="text-nd-accent">-{formatCurrency(advancePaid)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold border-t border-nd-success/15 pt-2">
                      <span className="text-nd-heading">A receber agora</span>
                      <span className="text-nd-success text-lg">{formatCurrency(remaining)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">Cancelar</button>
                <button onClick={handleCloseShift} disabled={saving} className="btn-primary text-sm flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Fechar Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

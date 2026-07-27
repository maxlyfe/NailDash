'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import type { Client, ClientNote, Appointment } from '@/lib/types';
import {
  Users, Plus, Search, X, Phone, Mail, Star,
  ChevronRight, Loader2, Trash2, Edit3, Save, History,
  Calendar, DollarSign, Scissors, MessageSquare, User,
} from 'lucide-react';

type ModalMode = 'closed' | 'create' | 'edit' | 'view';

export default function ClientesPage() {
  const { salon } = useAuth();
  const { t, locale } = useT();
  const supabase = useSupabase();

  const [clients, setClients] = useState<Client[]>([]);
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  // Timeline (notes)
  const [timeline, setTimeline] = useState<ClientNote[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Appointment history
  type HistoryEntry = Appointment & {
    professional?: { name: string };
    appointment_services?: { price: number; service?: { name: string } }[];
  };
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchClients = useCallback(async () => {
    if (!salon?.id) return;
    setLoading(true);
    const [{ data }, { data: apptCounts }] = await Promise.all([
      supabase.from('clients').select('*').eq('salon_id', salon.id).order('name'),
      supabase.from('appointments').select('client_id').eq('salon_id', salon.id).eq('status', 'completed').limit(10000),
    ]);
    setClients(data || []);
    const counts: Record<string, number> = {};
    (apptCounts || []).forEach((a: any) => { if (a.client_id) counts[a.client_id] = (counts[a.client_id] || 0) + 1; });
    setVisitCounts(counts);
    setLoading(false);
  }, [salon?.id]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      (c.phone?.toLowerCase().includes(q)) ||
      (c.email?.toLowerCase().includes(q));
  });

  const openCreate = () => {
    setForm({ name: '', phone: '', email: '', notes: '' });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (client: Client) => {
    setForm({
      name: client.name,
      phone: client.phone || '',
      email: client.email || '',
      notes: client.notes || '',
    });
    setSelected(client);
    setModal('edit');
  };

  const openView = (client: Client) => {
    setSelected(client);
    setModal('view');
    fetchTimeline(client.id);
    fetchHistory(client.id);
  };

  const fetchTimeline = async (clientId: string) => {
    setTimelineLoading(true);
    const { data } = await supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setTimeline(data || []);
    setTimelineLoading(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm(t.deleteNoteConfirm)) return;
    await supabase.from('client_notes').delete().eq('id', noteId);
    setTimeline(tl => tl.filter(n => n.id !== noteId));
  };

  const fetchHistory = async (clientId: string) => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('*, professional:professionals(name), appointment_services(price, service:services(name))')
      .eq('client_id', clientId)
      .in('status', ['completed', 'cancelled', 'no_show'])
      .order('starts_at', { ascending: false });
    setHistory((data as HistoryEntry[]) || []);
    setHistoryLoading(false);
  };

  const getPaymentLabel = (method: string | null) => {
    if (!method) return '';
    const map: Record<string, string> = { pix: t.pay_pix, cash: t.pay_cash, card: t.pay_card, transfer: t.pay_transfer };
    return map[method] || method;
  };

  const handleSave = async () => {
    if (!salon || !form.name.trim()) return;
    setSaving(true);

    if (modal === 'create') {
      await supabase.from('clients').insert({
        salon_id: salon.id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      });
    } else if (modal === 'edit' && selected) {
      await supabase.from('clients').update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }).eq('id', selected.id);
    }

    setSaving(false);
    setModal('closed');
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.deleteClientConfirm)) return;
    await supabase.from('clients').delete().eq('id', id);
    setModal('closed');
    fetchClients();
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString(locale, { style: 'currency', currency: t.currency });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t.clients}</h1>
          <p className="text-nd-muted text-sm mt-1">
            {clients.length > 0
              ? `${clients.length} ${t.clientsRegistered}`
              : t.clientDatabase}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t.newShort}</span>
        </button>
      </div>

      {/* Search */}
      {clients.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nd-muted/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.searchClientsPlaceholder}
            className="input-field pl-10"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-nd-surface">
              <X className="w-3.5 h-3.5 text-nd-muted" />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && clients.length === 0 && (
        <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[250px]">
          <div className="w-16 h-16 rounded-2xl bg-nd-surface flex items-center justify-center mb-5">
            <Users className="w-8 h-8 text-nd-muted/30" />
          </div>
          <p className="text-sm font-semibold text-nd-text">{t.noClientsYet}</p>
          <p className="text-sm text-nd-muted mt-2">{t.importCsvOrManual}</p>
          <button onClick={openCreate} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> {t.register}
          </button>
        </div>
      )}

      {/* Client list */}
      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-nd-border/50">
            {filtered.map(client => (
              <button
                key={client.id}
                onClick={() => openView(client)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-nd-surface/50 transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-nd-accent/20 to-nd-highlight/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-nd-accent">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-nd-heading truncate">{client.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {client.phone && (
                      <span className="text-xs text-nd-muted flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="text-xs text-nd-muted flex items-center gap-1 hidden sm:flex">
                        <Mail className="w-3 h-3" /> {client.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-sm font-semibold text-nd-heading">{formatCurrency(client.total_spent)}</p>
                  <p className="text-xs text-nd-muted">{visitCounts[client.id] || 0} {t.visits.toLowerCase()}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-nd-muted/30 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && clients.length > 0 && filtered.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-nd-muted">{t.noResultsFor} &quot;{search}&quot;</p>
        </div>
      )}

      {/* Modal */}
      {modal !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <h2 className="text-base font-semibold text-nd-heading">
                {modal === 'create' ? t.newClient : modal === 'edit' ? t.editClient : selected?.name}
              </h2>
              <button onClick={() => setModal('closed')}
                className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>

            {/* View mode */}
            {modal === 'view' && selected && (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nd-accent/20 to-nd-highlight/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-nd-accent">
                      {selected.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-nd-heading">{selected.name}</h3>
                    {selected.last_visit_at && (
                      <p className="text-xs text-nd-muted mt-0.5">
                        {t.lastVisit} {new Date(selected.last_visit_at).toLocaleDateString(locale)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading">{history.filter(a => a.status === 'completed').length}</p>
                    <p className="text-[10px] text-nd-muted uppercase">{t.visits}</p>
                  </div>
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading">{formatCurrency(selected.total_spent)}</p>
                    <p className="text-[10px] text-nd-muted uppercase">{t.total}</p>
                  </div>
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading flex items-center justify-center gap-1">
                      <Star className="w-3.5 h-3.5 text-nd-warning" /> {selected.loyalty_points}
                    </p>
                    <p className="text-[10px] text-nd-muted uppercase">{t.points}</p>
                  </div>
                </div>

                {(selected.phone || selected.email) && (
                  <div className="space-y-2">
                    {selected.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="w-4 h-4 text-nd-accent" />
                        <span className="text-nd-text">{selected.phone}</span>
                      </div>
                    )}
                    {selected.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="w-4 h-4 text-nd-accent" />
                        <span className="text-nd-text">{selected.email}</span>
                      </div>
                    )}
                  </div>
                )}

                {selected.notes && (
                  <div className="p-3 rounded-xl bg-nd-surface text-sm text-nd-muted">
                    {selected.notes}
                  </div>
                )}

                {/* Appointment History */}
                <div>
                  <p className="section-label mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> {t.clientTimeline}
                  </p>
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-nd-accent" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-nd-muted italic">{t.noAppointments}</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {history.map(appt => {
                        const note = timeline.find(n => n.appointment_id === appt.id);
                        const services = appt.appointment_services || [];
                        const isCancelled = appt.status === 'cancelled' || appt.status === 'no_show';
                        return (
                          <div key={appt.id} className={`p-3 rounded-xl border border-nd-border/30 ${isCancelled ? 'bg-nd-danger/5' : 'bg-nd-surface/60'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3 h-3 text-nd-accent" />
                                <p className="text-[10px] font-semibold text-nd-accent uppercase tracking-wider">
                                  {new Date(appt.starts_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                              {isCancelled && (
                                <span className="text-[10px] font-semibold text-nd-danger uppercase">
                                  {appt.status === 'cancelled' ? t.status_cancelled : t.status_no_show}
                                </span>
                              )}
                            </div>

                            {services.length > 0 && (
                              <div className="flex items-start gap-2 mb-1">
                                <Scissors className="w-3 h-3 text-nd-muted mt-0.5 shrink-0" />
                                <p className="text-sm text-nd-text">
                                  {services.map(s => s.service?.name || '—').join(', ')}
                                </p>
                              </div>
                            )}

                            {appt.professional?.name && (
                              <div className="flex items-center gap-2 mb-1">
                                <User className="w-3 h-3 text-nd-muted shrink-0" />
                                <p className="text-xs text-nd-muted">{appt.professional.name}</p>
                              </div>
                            )}

                            {!isCancelled && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-3 h-3 text-nd-success shrink-0" />
                                <p className="text-sm font-semibold text-nd-heading">
                                  {formatCurrency(appt.total_amount)}
                                </p>
                                {appt.payment_method && (
                                  <span className="text-[10px] text-nd-muted bg-nd-surface rounded-md px-1.5 py-0.5">
                                    {getPaymentLabel(appt.payment_method)}
                                  </span>
                                )}
                                {appt.discount > 0 && (
                                  <span className="text-[10px] text-nd-warning">
                                    -{formatCurrency(appt.discount)}
                                  </span>
                                )}
                              </div>
                            )}

                            {note && (
                              <div className="flex items-start gap-2 mt-1.5 pt-1.5 border-t border-nd-border/20">
                                <MessageSquare className="w-3 h-3 text-nd-muted mt-0.5 shrink-0" />
                                <p className="text-xs text-nd-muted whitespace-pre-wrap">{note.note}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Orphan notes (not linked to appointments) */}
                {timeline.filter(n => !n.appointment_id).length > 0 && (
                  <div>
                    <p className="section-label mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> {t.clientNotes}
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {timeline.filter(n => !n.appointment_id).map(note => (
                        <div key={note.id} className="relative p-3 rounded-xl bg-nd-surface/60 border border-nd-border/30 group">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-semibold text-nd-accent uppercase tracking-wider">
                              {new Date(note.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 rounded-lg hover:bg-nd-danger/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={t.delete}
                            >
                              <Trash2 className="w-3 h-3 text-nd-danger" />
                            </button>
                          </div>
                          <p className="text-sm text-nd-text whitespace-pre-wrap">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => openEdit(selected)} className="btn-secondary text-sm flex-1">
                    <Edit3 className="w-4 h-4" /> {t.edit}
                  </button>
                  <button onClick={() => handleDelete(selected.id)} className="btn-danger text-sm">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Create / Edit form */}
            {(modal === 'create' || modal === 'edit') && (
              <div className="p-6 space-y-4">
                <div>
                  <label className="section-label mb-1.5 block">{t.name} *</label>
                  <input
                    type="text" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t.clientNamePlaceholder}
                    className="input-field" autoFocus
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">{t.phone}</label>
                  <input
                    type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder={t.phonePlaceholder}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">{t.email}</label>
                  <input
                    type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder={t.emailPlaceholder}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">{t.notes}</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder={t.notesTip}
                    className="input-field resize-none h-20"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.name.trim()}
                    className="btn-primary text-sm flex-1"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {modal === 'create' ? t.register : t.save}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

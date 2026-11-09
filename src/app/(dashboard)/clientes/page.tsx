'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import type { Client } from '@/lib/types';
import ClientDetail from '@/components/ClientDetail';
import {
  Users, Plus, Search, X, Phone, Mail,
  ChevronRight, Loader2, Save, Repeat,
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

  const fetchClients = useCallback(async () => {
    if (!salon?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*, appointments(count)')
      .eq('salon_id', salon.id)
      .eq('appointments.status', 'completed')
      .order('name');
    const rows = (data || []) as any[];
    const counts: Record<string, number> = {};
    rows.forEach((c: any) => {
      counts[c.id] = c.appointments?.[0]?.count ?? 0;
    });
    setClients(rows);
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
        <div className="flex items-center gap-2">
          <Link href="/fixas" className="btn-secondary text-sm">
            <Repeat className="w-4 h-4" />
            <span className="hidden sm:inline">{t.regularsTab}</span>
          </Link>
          <button onClick={openCreate} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t.newShort}</span>
          </button>
        </div>
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
              <ClientDetail
                clientId={selected.id}
                initialClient={selected}
                onEdit={openEdit}
                onDelete={handleDelete}
                canManageNotes
              />
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

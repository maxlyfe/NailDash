'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import type { Client } from '@/lib/types';
import {
  Users, Plus, Search, X, Phone, Mail, Star,
  ChevronRight, Loader2, Trash2, Edit3, Save,
} from 'lucide-react';

type ModalMode = 'closed' | 'create' | 'edit' | 'view';

export default function ClientesPage() {
  const { salon, loading: authLoading } = useAuth();
  const supabase = useSupabase();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  const fetchClients = useCallback(async () => {
    if (!salon) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', salon.id)
      .order('name');
    setClients(data || []);
    setLoading(false);
  }, [salon?.id, authLoading]);

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
    if (!confirm('Excluir este cliente?')) return;
    await supabase.from('clients').delete().eq('id', id);
    setModal('closed');
    fetchClients();
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="text-nd-muted text-sm mt-1">
            {clients.length > 0
              ? `${clients.length} cliente${clients.length !== 1 ? 's' : ''} cadastrado${clients.length !== 1 ? 's' : ''}`
              : 'Base de clientes do salão'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo</span>
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
            placeholder="Buscar por nome, telefone ou email..."
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
          <p className="text-sm font-semibold text-nd-text">Nenhum cliente cadastrado</p>
          <p className="text-sm text-nd-muted mt-2">Importe via CSV ou cadastre manualmente.</p>
          <button onClick={openCreate} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> Cadastrar
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
                  <p className="text-xs text-nd-muted">{client.visit_count} visita{client.visit_count !== 1 ? 's' : ''}</p>
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
          <p className="text-sm text-nd-muted">Nenhum resultado para &quot;{search}&quot;</p>
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
                {modal === 'create' ? 'Novo Cliente' : modal === 'edit' ? 'Editar Cliente' : selected?.name}
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
                        Última visita: {new Date(selected.last_visit_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading">{selected.visit_count}</p>
                    <p className="text-[10px] text-nd-muted uppercase">Visitas</p>
                  </div>
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading">{formatCurrency(selected.total_spent)}</p>
                    <p className="text-[10px] text-nd-muted uppercase">Total</p>
                  </div>
                  <div className="card-glow p-3 text-center">
                    <p className="text-lg font-bold text-nd-heading flex items-center justify-center gap-1">
                      <Star className="w-3.5 h-3.5 text-nd-warning" /> {selected.loyalty_points}
                    </p>
                    <p className="text-[10px] text-nd-muted uppercase">Pontos</p>
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

                <div className="flex gap-3">
                  <button onClick={() => openEdit(selected)} className="btn-secondary text-sm flex-1">
                    <Edit3 className="w-4 h-4" /> Editar
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
                  <label className="section-label mb-1.5 block">Nome *</label>
                  <input
                    type="text" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do cliente"
                    className="input-field" autoFocus
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Telefone</label>
                  <input
                    type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Email</label>
                  <input
                    type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Observações</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Preferências, alergias, etc..."
                    className="input-field resize-none h-20"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.name.trim()}
                    className="btn-primary text-sm flex-1"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {modal === 'create' ? 'Cadastrar' : 'Salvar'}
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

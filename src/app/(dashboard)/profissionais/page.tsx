'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import type { Professional } from '@/lib/types';
import {
  UserCog, Plus, X, Loader2, Save, Trash2, Edit3,
  Phone, Mail, Percent,
} from 'lucide-react';

type ModalMode = 'closed' | 'create' | 'edit';

const ROLE_LABELS: Record<string, string> = {
  nail_tech: 'Nail Designer',
  admin: 'Admin',
  receptionist: 'Recepcionista',
};

export default function ProfissionaisPage() {
  const { salon, loading: authLoading } = useAuth();
  const supabase = useSupabase();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<Professional | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'nail_tech' as Professional['role'],
    commission_percent: '0', is_active: true,
  });

  const fetchData = useCallback(async () => {
    if (!salon) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('professionals')
      .select('*')
      .eq('salon_id', salon.id)
      .order('name');
    setProfessionals(data || []);
    setLoading(false);
  }, [salon?.id, authLoading]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm({ name: '', email: '', phone: '', role: 'nail_tech', commission_percent: '0', is_active: true });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (prof: Professional) => {
    setForm({
      name: prof.name,
      email: prof.email || '',
      phone: prof.phone || '',
      role: prof.role,
      commission_percent: prof.commission_percent.toString(),
      is_active: prof.is_active,
    });
    setSelected(prof);
    setModal('edit');
  };

  const handleSave = async () => {
    if (!salon || !form.name.trim()) return;
    setSaving(true);

    const payload = {
      salon_id: salon.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role,
      commission_percent: parseFloat(form.commission_percent) || 0,
      is_active: form.is_active,
    };

    if (modal === 'create') {
      await supabase.from('professionals').insert(payload);
    } else if (selected) {
      await supabase.from('professionals').update(payload).eq('id', selected.id);
    }

    setSaving(false);
    setModal('closed');
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este profissional?')) return;
    await supabase.from('professionals').delete().eq('id', id);
    setModal('closed');
    fetchData();
  };

  const activeCount = professionals.filter(p => p.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="text-nd-muted text-sm mt-1">
            {professionals.length > 0
              ? `${activeCount} profissiona${activeCount !== 1 ? 'is' : 'l'} ativo${activeCount !== 1 ? 's' : ''}`
              : 'Profissionais do salão'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </button>
      </div>

      {loading && (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      )}

      {!loading && professionals.length === 0 && (
        <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[250px]">
          <div className="w-16 h-16 rounded-2xl bg-nd-surface flex items-center justify-center mb-5">
            <UserCog className="w-8 h-8 text-nd-muted/30" />
          </div>
          <p className="text-sm font-semibold text-nd-text">Nenhum profissional cadastrado</p>
          <p className="text-sm text-nd-muted mt-2">Adicione sua equipe para gerenciar agendamentos.</p>
          <button onClick={openCreate} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
      )}

      {!loading && professionals.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {professionals.map(prof => (
            <div key={prof.id} className="card-glow p-5 group">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-nd-accent/20 to-nd-highlight/20 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-nd-accent">
                    {prof.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-nd-heading truncate">{prof.name}</h3>
                  <p className="text-xs text-nd-muted mt-0.5">{ROLE_LABELS[prof.role] || prof.role}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={prof.is_active ? 'badge-success' : 'badge-muted'}>
                      {prof.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                    {prof.commission_percent > 0 && (
                      <span className="text-xs text-nd-muted flex items-center gap-0.5">
                        <Percent className="w-3 h-3" /> {prof.commission_percent}%
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => openEdit(prof)}
                  className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-nd-surface transition-all shrink-0">
                  <Edit3 className="w-4 h-4 text-nd-muted" />
                </button>
              </div>
              {(prof.phone || prof.email) && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-nd-border/30">
                  {prof.phone && (
                    <span className="text-xs text-nd-muted flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {prof.phone}
                    </span>
                  )}
                  {prof.email && (
                    <span className="text-xs text-nd-muted flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {prof.email}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <h2 className="text-base font-semibold text-nd-heading">
                {modal === 'create' ? 'Novo Profissional' : 'Editar Profissional'}
              </h2>
              <button onClick={() => setModal('closed')}
                className="p-1.5 rounded-xl hover:bg-nd-surface transition-colors">
                <X className="w-4 h-4 text-nd-muted" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="section-label mb-1.5 block">Nome *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome do profissional"
                  className="input-field" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label mb-1.5 block">Telefone</label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="input-field" />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="input-field" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label mb-1.5 block">Função</label>
                  <select value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as Professional['role'] }))}
                    className="input-field">
                    <option value="nail_tech">Nail Designer</option>
                    <option value="admin">Admin</option>
                    <option value="receptionist">Recepcionista</option>
                  </select>
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Comissão (%)</label>
                  <input type="number" value={form.commission_percent}
                    onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))}
                    placeholder="0" min="0" max="100" step="1"
                    className="input-field" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-nd-border text-nd-accent focus:ring-nd-accent/20" />
                <span className="text-sm text-nd-text">Ativo</span>
              </label>

              <div className="flex gap-3 pt-2">
                {modal === 'edit' && selected && (
                  <button onClick={() => handleDelete(selected.id)} className="btn-danger text-sm">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary text-sm flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {modal === 'create' ? 'Cadastrar' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

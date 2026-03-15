'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import type { Service, ServiceCategory } from '@/lib/types';
import {
  Scissors, Plus, X, Loader2, Save, Trash2, Edit3,
  Clock, DollarSign, Tag,
} from 'lucide-react';

type ModalMode = 'closed' | 'create' | 'edit';

export default function ServicosPage() {
  const { salon, loading: authLoading } = useAuth();
  const supabase = useSupabase();

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('all');

  const [form, setForm] = useState({
    name: '', description: '', price: '', duration_minutes: '60',
    category_id: '', is_addon: false, is_active: true,
  });

  const fetchData = useCallback(async () => {
    if (!salon) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    const [svcRes, catRes] = await Promise.all([
      supabase.from('services').select('*, category:service_categories(*)').eq('salon_id', salon.id).order('name'),
      supabase.from('service_categories').select('*').eq('salon_id', salon.id).order('name'),
    ]);
    setServices(svcRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }, [salon?.id, authLoading]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm({ name: '', description: '', price: '', duration_minutes: '60', category_id: '', is_addon: false, is_active: true });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (svc: Service) => {
    setForm({
      name: svc.name,
      description: svc.description || '',
      price: svc.price.toString(),
      duration_minutes: svc.duration_minutes.toString(),
      category_id: svc.category_id || '',
      is_addon: svc.is_addon,
      is_active: svc.is_active,
    });
    setSelected(svc);
    setModal('edit');
  };

  const handleSave = async () => {
    if (!salon || !form.name.trim()) return;
    setSaving(true);

    const payload = {
      salon_id: salon.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price) || 0,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      category_id: form.category_id || null,
      is_addon: form.is_addon,
      is_active: form.is_active,
    };

    if (modal === 'create') {
      await supabase.from('services').insert(payload);
    } else if (selected) {
      await supabase.from('services').update(payload).eq('id', selected.id);
    }

    setSaving(false);
    setModal('closed');
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este serviço?')) return;
    await supabase.from('services').delete().eq('id', id);
    setModal('closed');
    fetchData();
  };

  const filtered = filterCat === 'all'
    ? services
    : filterCat === 'addon'
      ? services.filter(s => s.is_addon)
      : services.filter(s => s.category_id === filterCat);

  const activeCount = services.filter(s => s.is_active).length;
  const addonCount = services.filter(s => s.is_addon).length;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Serviços</h1>
          <p className="text-nd-muted text-sm mt-1">
            {services.length > 0
              ? `${activeCount} ativo${activeCount !== 1 ? 's' : ''} · ${addonCount} adiciona${addonCount !== 1 ? 'is' : 'l'}`
              : 'Catálogo de serviços do salão'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterCat('all')}
            className={`badge whitespace-nowrap ${filterCat === 'all' ? 'bg-nd-accent/15 text-nd-accent' : 'bg-nd-surface text-nd-muted'}`}
          >Todos ({services.length})</button>
          {categories.map(cat => {
            const count = services.filter(s => s.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCat(cat.id)}
                className={`badge whitespace-nowrap ${filterCat === cat.id ? 'bg-nd-accent/15 text-nd-accent' : 'bg-nd-surface text-nd-muted'}`}
              >{cat.name} ({count})</button>
            );
          })}
          <button
            onClick={() => setFilterCat('addon')}
            className={`badge whitespace-nowrap ${filterCat === 'addon' ? 'bg-nd-warning/15 text-nd-warning' : 'bg-nd-surface text-nd-muted'}`}
          >Adicionais ({addonCount})</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
        </div>
      )}

      {/* Empty */}
      {!loading && services.length === 0 && (
        <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[250px]">
          <div className="w-16 h-16 rounded-2xl bg-nd-surface flex items-center justify-center mb-5">
            <Scissors className="w-8 h-8 text-nd-muted/30" />
          </div>
          <p className="text-sm font-semibold text-nd-text">Nenhum serviço cadastrado</p>
          <p className="text-sm text-nd-muted mt-2">Cadastre seus serviços para começar.</p>
          <button onClick={openCreate} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>
      )}

      {/* Service list */}
      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-nd-border/50">
            {filtered.map(svc => (
              <div
                key={svc.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-nd-surface/50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${svc.is_addon ? 'bg-nd-warning' : svc.is_active ? 'bg-nd-accent' : 'bg-nd-muted/30'}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${svc.is_active ? 'text-nd-text' : 'text-nd-muted line-through'}`}>
                      {svc.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-nd-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {svc.duration_minutes}min
                      </span>
                      {svc.category && (
                        <span className="badge-muted text-[10px]">{svc.category.name}</span>
                      )}
                      {svc.is_addon && <span className="badge-warning text-[10px]">Adicional</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-nd-heading">
                    {svc.price > 0 ? formatCurrency(svc.price) : '—'}
                  </span>
                  <button onClick={() => openEdit(svc)}
                    className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-nd-surface transition-all">
                    <Edit3 className="w-4 h-4 text-nd-muted" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal('closed')} />
          <div className="relative bg-nd-card rounded-2xl border border-nd-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nd-border/50">
              <h2 className="text-base font-semibold text-nd-heading">
                {modal === 'create' ? 'Novo Serviço' : 'Editar Serviço'}
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
                  placeholder="Ex: Manicure tradicional"
                  className="input-field" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label mb-1.5 block">Preço (R$)</label>
                  <input type="number" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0,00" step="0.01" min="0"
                    className="input-field" />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">Duração (min)</label>
                  <input type="number" value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    placeholder="60" min="5" step="5"
                    className="input-field" />
                </div>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Categoria</label>
                <select value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="input-field">
                  <option value="">Sem categoria</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Descrição</label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes do serviço..."
                  className="input-field resize-none h-16" />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_addon}
                    onChange={e => setForm(f => ({ ...f, is_addon: e.target.checked }))}
                    className="w-4 h-4 rounded border-nd-border text-nd-accent focus:ring-nd-accent/20" />
                  <span className="text-sm text-nd-text">Adicional</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded border-nd-border text-nd-accent focus:ring-nd-accent/20" />
                  <span className="text-sm text-nd-text">Ativo</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                {modal === 'edit' && selected && (
                  <button onClick={() => handleDelete(selected.id)} className="btn-danger text-sm">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setModal('closed')} className="btn-secondary text-sm flex-1">
                  Cancelar
                </button>
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

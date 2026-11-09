'use client';

/**
 * Ficha da cliente: totais, contato, histórico de atendimentos (com serviços,
 * profissional, valores e forma de pagamento) e as observações de client_notes.
 *
 * Usado pelo modal de /clientes e pelo card expansível de /fixas, para que as
 * duas telas mostrem exatamente a mesma coisa. Busca os próprios dados a partir
 * do clientId — em /fixas só existem nome e telefone vindos do agendamento.
 */

import { useEffect, useState, useCallback } from 'react';
import { useT } from '@/contexts/LanguageContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { spFormatDate } from '@/lib/dates';
import type { Client, ClientNote, Appointment } from '@/lib/types';
import {
  Phone, Mail, Star, History, Loader2, Trash2, Edit3,
  Calendar, DollarSign, Scissors, MessageSquare, User,
} from 'lucide-react';

type HistoryEntry = Appointment & {
  professional?: { name: string };
  appointment_services?: { price: number; service?: { name: string } }[];
};

type Props = {
  clientId: string;
  /** Registro já em mãos (em /clientes), para evitar o flash de loading. */
  initialClient?: Client;
  /** Ações de gestão; ausentes = modo leitura (o caso de /fixas). */
  onEdit?: (client: Client) => void;
  onDelete?: (id: string) => void;
  /** Permite apagar observação solta. */
  canManageNotes?: boolean;
  variant?: 'modal' | 'inline';
};

export default function ClientDetail({
  clientId,
  initialClient,
  onEdit,
  onDelete,
  canManageNotes = false,
  variant = 'modal',
}: Props) {
  const { t, locale } = useT();
  const supabase = useSupabase();

  const [client, setClient] = useState<Client | null>(initialClient ?? null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [timeline, setTimeline] = useState<ClientNote[]>([]);

  const inline = variant === 'inline';

  const fetchAll = useCallback(async () => {
    setHistoryLoading(true);

    if (!initialClient) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      if (data) setClient(data as Client);
    }

    const [{ data: appts }, { data: notes }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, professional:professionals(name), appointment_services(price, service:services(name))')
        .eq('client_id', clientId)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('starts_at', { ascending: false }),
      supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
    ]);

    setHistory((appts as HistoryEntry[]) || []);
    setTimeline(notes || []);
    setHistoryLoading(false);
  }, [clientId, initialClient, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm(t.deleteNoteConfirm)) return;
    await supabase.from('client_notes').delete().eq('id', noteId);
    setTimeline(tl => tl.filter(n => n.id !== noteId));
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString(locale, { style: 'currency', currency: t.currency });

  const getPaymentLabel = (method: string | null) => {
    if (!method) return '';
    const map: Record<string, string> = {
      pix: t.pay_pix, cash: t.pay_cash, card: t.pay_card, transfer: t.pay_transfer,
    };
    return map[method] || method;
  };

  const orphanNotes = timeline.filter(n => !n.appointment_id);

  /*
   * Os totais saem do histórico, não das colunas clients.total_spent /
   * last_visit_at: nada no app escreve nessas colunas, então elas ficam
   * zeradas e o card mostrava "Total 0" para cliente com atendimentos.
   */
  const completed = history.filter(a => a.status === 'completed');
  const totalSpent = completed.reduce((sum, a) => sum + (a.total_amount || 0), 0);
  const lastVisitAt = completed[0]?.starts_at || client?.last_visit_at || null;

  return (
    <div className={inline ? 'p-4 space-y-4' : 'p-6 space-y-5'}>
      {/* Cabeçalho: só no modal — em /fixas o nome já está na linha acima */}
      {!inline && client && (
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nd-accent/20 to-nd-highlight/20 flex items-center justify-center">
            <span className="text-xl font-bold text-nd-accent">
              {client.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-nd-heading">{client.name}</h3>
            {lastVisitAt && (
              <p className="text-xs text-nd-muted mt-0.5">
                {t.lastVisit} {spFormatDate(lastVisitAt, locale)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Totais */}
      <div>
        {inline && <p className="section-label mb-2">{t.totalAllTime}</p>}
        <div className="grid grid-cols-3 gap-3">
          <div className="card-glow p-3 text-center">
            <p className="text-base sm:text-lg font-bold text-nd-heading leading-tight">
              {completed.length}
            </p>
            <p className="text-[10px] text-nd-muted uppercase">{t.visits}</p>
          </div>
          <div className="card-glow p-3 text-center">
            <p className="text-sm sm:text-lg font-bold text-nd-heading leading-tight break-words">
              {formatCurrency(totalSpent)}
            </p>
            <p className="text-[10px] text-nd-muted uppercase">{t.total}</p>
          </div>
          <div className="card-glow p-3 text-center">
            <p className="text-base sm:text-lg font-bold text-nd-heading flex items-center justify-center gap-1 leading-tight">
              <Star className="w-3.5 h-3.5 text-nd-warning shrink-0" /> {client?.loyalty_points || 0}
            </p>
            <p className="text-[10px] text-nd-muted uppercase">{t.points}</p>
          </div>
        </div>
      </div>

      {/* Contato */}
      {(client?.phone || client?.email) && (
        <div className="space-y-2">
          {client.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-nd-accent" />
              <span className="text-nd-text">{client.phone}</span>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-nd-accent" />
              <span className="text-nd-text">{client.email}</span>
            </div>
          )}
        </div>
      )}

      {/* Observação do cadastro */}
      {client?.notes && (
        <div className="p-3 rounded-xl bg-nd-surface text-sm text-nd-muted">
          {client.notes}
        </div>
      )}

      {/* Histórico de atendimentos */}
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
          <div className={`space-y-2.5 overflow-y-auto pr-1 ${inline ? 'max-h-[320px]' : 'max-h-[400px]'}`}>
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
                        {spFormatDate(appt.starts_at, locale, { day: '2-digit', month: 'short', year: 'numeric' })}
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
                    <div className="flex items-center gap-2 flex-wrap">
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

      {/* Observações soltas (sem atendimento vinculado) */}
      {orphanNotes.length > 0 && (
        <div>
          <p className="section-label mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> {t.clientNotes}
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {orphanNotes.map(note => (
              <div key={note.id} className="relative p-3 rounded-xl bg-nd-surface/60 border border-nd-border/30 group">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-nd-accent uppercase tracking-wider">
                    {spFormatDate(note.created_at, locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  {canManageNotes && (
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded-lg hover:bg-nd-danger/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t.delete}
                    >
                      <Trash2 className="w-3 h-3 text-nd-danger" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-nd-text whitespace-pre-wrap">{note.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações de gestão */}
      {client && (onEdit || onDelete) && (
        <div className="flex gap-3">
          {onEdit && (
            <button onClick={() => onEdit(client)} className="btn-secondary text-sm flex-1">
              <Edit3 className="w-4 h-4" /> {t.edit}
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(client.id)} className="btn-danger text-sm">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

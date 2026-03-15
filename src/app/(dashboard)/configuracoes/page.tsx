'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { useT, localeOptions } from '@/contexts/LanguageContext';
import { Settings, Save, Loader2, Clock, Globe } from 'lucide-react';

type DayHours = { open: string; close: string } | null;
type BusinessHours = Record<string, DayHours>;

const DEFAULT_HOURS: BusinessHours = {
  '0': null,
  '1': { open: '09:00', close: '18:00' },
  '2': { open: '09:00', close: '18:00' },
  '3': { open: '09:00', close: '18:00' },
  '4': { open: '09:00', close: '18:00' },
  '5': { open: '09:00', close: '18:00' },
  '6': { open: '09:00', close: '13:00' },
};

export default function ConfiguracoesPage() {
  const { salon } = useAuth();
  const supabase = useSupabase();
  const { t, locale, setLocale } = useT();

  const DAY_NAMES = [t.day_sunday, t.day_monday, t.day_tuesday, t.day_wednesday, t.day_thursday, t.day_friday, t.day_saturday];

  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!salon?.id) return;
    if (salon.business_hours) {
      setHours(salon.business_hours as BusinessHours);
    }
    setLoading(false);
  }, [salon?.id]);

  const toggleDay = (day: string) => {
    setHours(h => ({
      ...h,
      [day]: h[day] ? null : { open: '09:00', close: '18:00' },
    }));
  };

  const updateHour = (day: string, field: 'open' | 'close', value: string) => {
    setHours(h => ({
      ...h,
      [day]: h[day] ? { ...h[day]!, [field]: value } : { open: '09:00', close: '18:00', [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!salon) return;
    setSaving(true);
    await supabase.from('salons').update({ business_hours: hours }).eq('id', salon.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Reload to update AuthContext
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-nd-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="page-title">{t.settings}</h1>
        <p className="text-nd-muted text-sm mt-1">{t.settingsSubtitle}</p>
      </div>

      {/* Language */}
      <div className="card">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-nd-border/50">
          <Globe className="w-4 h-4 text-nd-accent" />
          <h2 className="text-sm font-semibold text-nd-heading">{t.language}</h2>
        </div>
        <div className="p-5">
          <label className="text-xs font-medium text-nd-muted mb-2 block">{t.languageLabel}</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'pt-BR' | 'es-AR')}
            className="input-field"
          >
            {localeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-nd-border/50">
          <Clock className="w-4 h-4 text-nd-accent" />
          <h2 className="text-sm font-semibold text-nd-heading">{t.businessHours}</h2>
        </div>

        <div className="p-5 space-y-3">
          {DAY_NAMES.map((name, i) => {
            const day = String(i);
            const isOpen = hours[day] !== null && hours[day] !== undefined;
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOpen}
                    onChange={() => toggleDay(day)}
                    className="w-4 h-4 rounded border-nd-border text-nd-accent focus:ring-nd-accent/20"
                  />
                  <span className={`text-sm font-medium ${isOpen ? 'text-nd-text' : 'text-nd-muted'}`}>
                    {name}
                  </span>
                </label>

                {isOpen ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={hours[day]?.open || '09:00'}
                      onChange={e => updateHour(day, 'open', e.target.value)}
                      className="input-field !py-1.5 !px-2 text-sm w-28"
                    />
                    <span className="text-nd-muted text-xs">{t.until}</span>
                    <input
                      type="time"
                      value={hours[day]?.close || '18:00'}
                      onChange={e => updateHour(day, 'close', e.target.value)}
                      className="input-field !py-1.5 !px-2 text-sm w-28"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-nd-muted italic">{t.closedDay}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-nd-border/50 flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.save}
          </button>
          {saved && <span className="text-xs text-nd-success font-medium">{t.savedSuccess}</span>}
        </div>
      </div>
    </div>
  );
}

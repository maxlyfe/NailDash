'use client';

import { Search, Bell, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function MobileHeader() {
  const { salon } = useAuth();

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-nd-border/50">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-nd-accent to-nd-highlight flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <span className="font-display font-bold text-xs text-nd-heading">
              Nail<span className="text-nd-accent">Dash</span>
            </span>
            <span className="text-[9px] text-nd-muted ml-2">{salon?.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-xl hover:bg-nd-surface text-nd-muted transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-xl hover:bg-nd-surface text-nd-muted transition-colors relative">
            <Bell className="w-4 h-4" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-nd-accent rounded-full border-2 border-white" />
          </button>
        </div>
      </div>
    </header>
  );
}

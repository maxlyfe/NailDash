'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  CalendarDays,
  Users,
  Scissors,
  DollarSign,
  UserCog,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Sparkles,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Serviços', href: '/servicos', icon: Scissors },
  { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
  { label: 'Equipe', href: '/profissionais', icon: UserCog },
  { label: 'Configurações', href: '/configuracoes', icon: Settings },
];

const MOBILE_NAV = NAV_ITEMS.slice(0, 5);

export default function Sidebar() {
  const pathname = usePathname();
  const { user, salon, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    return pathname.startsWith(href);
  };

  const userInitial = user?.user_metadata?.full_name?.[0] ||
    user?.email?.[0]?.toUpperCase() || '?';
  const userName = user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] || 'Usuário';

  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[256px] bg-white border-r border-nd-border/50 z-40">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-nd-border/50">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nd-accent to-nd-highlight flex items-center justify-center shadow-soft">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-display font-bold text-nd-heading tracking-tight leading-none">
              Nail<span className="text-nd-accent">Dash</span>
            </h1>
            <p className="text-[10px] text-nd-muted mt-0.5">
              {salon?.name || 'Carregando...'}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="section-label px-3 mb-2">Menu</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
                  transition-all duration-200 group relative
                  ${active
                    ? 'bg-nd-accent/10 text-nd-accent shadow-soft'
                    : 'text-nd-muted hover:bg-nd-surface hover:text-nd-text'
                  }
                `}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-nd-accent rounded-r-full" />
                )}
                <Icon className={`w-[18px] h-[18px] ${active ? 'text-nd-accent' : 'text-nd-muted group-hover:text-nd-text'}`} />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-nd-accent/40" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-nd-border/50">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-nd-accent/20 to-nd-highlight/20 flex items-center justify-center">
              <span className="text-xs font-bold text-nd-accent">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-nd-text truncate">{userName}</p>
              <p className="text-[10px] text-nd-muted truncate">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg hover:bg-nd-danger/10 text-nd-muted hover:text-nd-danger transition-colors"
              title="Sair"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-nd-border/50 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl min-w-[52px]
                  transition-all duration-200
                  ${active ? 'text-nd-accent' : 'text-nd-muted'}
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{item.label}</span>
                {active && <div className="w-5 h-0.5 rounded-full bg-nd-accent" />}
              </Link>
            );
          })}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 text-nd-muted"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[9px] font-medium">Mais</span>
          </button>
        </div>
      </nav>

      {/* ─── Mobile Slide Menu ─── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-nd-heading/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-nd-border/50 animate-slide-in shadow-soft-xl">
            <div className="flex items-center justify-between px-5 h-16 border-b border-nd-border/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-nd-accent to-nd-highlight flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-bold text-sm text-nd-heading">
                  Nail<span className="text-nd-accent">Dash</span>
                </span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl hover:bg-nd-surface text-nd-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium
                      transition-all duration-200
                      ${active ? 'bg-nd-accent/10 text-nd-accent' : 'text-nd-muted hover:bg-nd-surface hover:text-nd-text'}
                    `}
                  >
                    <Icon className={`w-[18px] h-[18px] ${active ? 'text-nd-accent' : ''}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-nd-border/50">
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-nd-danger hover:bg-nd-danger/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

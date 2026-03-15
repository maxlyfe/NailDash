import { AuthProvider } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import MobileHeader from '@/components/layout/MobileHeader';
import { LocaleSync } from './LocaleSync';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LocaleSync />
      <div className="min-h-screen bg-nd-bg bg-pattern">
        <div className="warm-glow fixed inset-0 pointer-events-none" />
        <Sidebar />
        <MobileHeader />
        <main className="lg:ml-[256px] pb-20 lg:pb-0 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}

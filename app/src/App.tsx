import { useEffect, useState, type ComponentType } from 'react';
import { Toaster } from 'sonner';
import { AppProvider, useApp } from '@/lib/store';
import { IS_DEMO } from '@/lib/api';
import Login from '@/pages/Login';
import { navigate, readHash } from '@/lib/nav';
export { navigate };
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { LayoutDashboard, FileText, FileClock, ReceiptText, Users, Package, Truck, ListOrdered, Wallet, ScrollText, TrendingUp, HeartPulse, ShieldCheck, UserCircle, Menu, LogOut, Moon, Sun } from 'lucide-react';

import Dashboard from '@/pages/Dashboard';
import { Invoices, Proformas } from '@/pages/Documents';
import Receipts from '@/pages/Receipts';
import { Customers, Products, Suppliers } from '@/pages/Masters';
import { Ledger, CashBook, Statements } from '@/pages/Ledger';
import Analytics from '@/pages/Analytics';
import Health from '@/pages/Health';
import Admin from '@/pages/Admin';
import Account from '@/pages/Account';

type NavItem = { id: string; label: string; icon: ComponentType<{ className?: string }>; module?: string; page: ComponentType; group: string };
const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', page: Dashboard, group: 'Overview' },
  { id: 'invoices', label: 'Invoices', icon: FileText, module: 'invoices', page: Invoices, group: 'Sales' },
  { id: 'proformas', label: 'Proformas', icon: FileClock, module: 'proformas', page: Proformas, group: 'Sales' },
  { id: 'receipts', label: 'Receipts', icon: ReceiptText, module: 'receipts', page: Receipts, group: 'Sales' },
  { id: 'statements', label: 'Statements', icon: ScrollText, module: 'statements', page: Statements, group: 'Sales' },
  { id: 'customers', label: 'Customers', icon: Users, module: 'customers', page: Customers, group: 'Records' },
  { id: 'products', label: 'Products & prices', icon: Package, module: 'products', page: Products, group: 'Records' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, module: 'suppliers', page: Suppliers, group: 'Records' },
  { id: 'ledger', label: 'Transactions', icon: ListOrdered, module: 'ledger', page: Ledger, group: 'Money' },
  { id: 'cashbook', label: 'Cash book', icon: Wallet, module: 'cashbook', page: CashBook, group: 'Money' },
  { id: 'analytics', label: 'Trends & forecast', icon: TrendingUp, module: 'analytics', page: Analytics, group: 'Insight' },
  { id: 'health', label: 'Data health', icon: HeartPulse, module: 'health', page: Health, group: 'Insight' },
  { id: 'admin', label: 'Admin portal', icon: ShieldCheck, module: 'admin', page: Admin, group: 'Settings' },
  { id: 'account', label: 'My account', icon: UserCircle, page: Account, group: 'Settings' },
];

function useTheme() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('lm-theme') || ''; } catch { return ''; } });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
    try { theme ? localStorage.setItem('lm-theme', theme) : localStorage.removeItem('lm-theme'); } catch { /* ignore */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

function Shell() {
  const { user, data, can, signOut, loading } = useApp();
  const items = NAV.filter((n) => !n.module || can(n.module));
  const [page, setPage] = useState(() => { const h = readHash(); return items.some((i) => i.id === h) ? h : items[0]?.id || 'account'; });
  const [menu, setMenu] = useState(false);
  const theme = useTheme();
  useEffect(() => {
    const on = () => { const h = readHash(); if (h && items.some((i) => i.id === h)) setPage(h); };
    const onNav = (e: Event) => { const id = String((e as CustomEvent).detail).split('.')[0]; if (items.some((i) => i.id === id)) setPage(id); setMenu(false); };
    window.addEventListener('hashchange', on); window.addEventListener('lm-nav', onNav);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('lm-nav', onNav); };
  }, [items]);
  const current = items.find((i) => i.id === page) || items[0];
  const Page = current.page;
  const groups = Array.from(new Set(items.map((i) => i.group)));

  const nav = (
    <nav className="flex flex-col gap-4 text-[13.5px]" aria-label="Main">
      {groups.map((g) => (
        <div key={g}>
          <div className="px-3 mb-1 text-[10.5px] tracking-[.14em] uppercase opacity-50 font-semibold">{g}</div>
          {items.filter((i) => i.group === g).map((i) => (
            <button key={i.id} onClick={() => navigate(i.id)} className={cn('w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-left transition-colors', page === i.id ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 opacity-85')}>
              <i.icon className="h-4 w-4 shrink-0" />{i.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
  const brand = (
    <div className="px-3 mb-6">
      <div className="font-display text-[22px] font-extrabold tracking-tight text-white leading-none">LISMANDY</div>
      <div className="text-[10.5px] tracking-[.2em] uppercase opacity-60 mt-1">Office{IS_DEMO ? ' · demo' : ''}</div>
    </div>
  );
  const footer = (
    <div className="mt-auto pt-4 border-t border-white/10 px-3 text-[12px]">
      <div className="font-semibold text-white truncate">{user!.name}</div>
      <div className="opacity-60 truncate">{user!.email}</div>
      <div className="flex gap-3 mt-2">
        <button onClick={signOut} className="inline-flex items-center gap-1 opacity-80 hover:opacity-100"><LogOut className="h-3.5 w-3.5" />Sign out</button>
        <button onClick={theme.toggle} className="inline-flex items-center gap-1 opacity-80 hover:opacity-100">{theme.dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}{theme.dark ? 'Light' : 'Dark'}</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden lg:flex flex-col bg-sidebar text-sidebar-foreground py-5 px-2 sticky top-0 h-screen overflow-y-auto">{brand}{nav}{footer}</aside>
      <header className="lg:hidden sticky top-0 z-20 bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 py-2.5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        <button onClick={() => setMenu(true)} aria-label="Open menu" className="p-1"><Menu className="h-5 w-5" /></button>
        <div className="font-display font-extrabold text-white tracking-tight">LISMANDY</div>
        <span className="text-[12px] opacity-70 w-5" />
      </header>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="bg-sidebar text-sidebar-foreground border-none w-[260px] flex flex-col py-5 px-2 overflow-y-auto">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {brand}{nav}{footer}
        </SheetContent>
      </Sheet>
      <main className="min-w-0 px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] w-full">
        {IS_DEMO && <div className="mb-4 text-[12px] border border-warn/40 bg-warn/10 rounded px-3 py-1.5">Demo mode — sample figures stored in this browser only. Nothing here is sent to the live database.</div>}
        {loading || !data ? <div className="text-muted-foreground py-20 text-center">Loading the books…</div> : (
          <Page key={current.id} />
        )}
      </main>
    </div>
  );
}

function Root() {
  const { user, loading } = useApp();
  if (!user) return loading ? <div className="p-10 text-muted-foreground">Checking your session…</div> : <Login />;
  return <Shell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
      <Toaster richColors position="top-right" />
    </AppProvider>
  );
}

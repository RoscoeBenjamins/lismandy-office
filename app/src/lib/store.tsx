import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, getToken, setToken, core } from './api';

export type Perms = Record<string, number>;
export type User = { id: string; email: string; name: string; role: string; perms: Perms; permissions: Perms; mfaEnabled: boolean; active: boolean; lastLoginAt: string; createdAt: string; mustChangePassword: boolean; lockedUntil: string };
export type Item = { code: string; description: string; qty: number; price: number; discount: number; amount?: number };
export type Invoice = { id: string; number: number; date: string; dueDate: string; customerName: string; vat: boolean; vatRate: number; items: Item[]; subtotal: number; vatAmount: number; total: number; status: string; notes: string; emailedAt: string; createdBy: string; paid: number; balance: number; payStatus: string; daysOverdue: number; fromProforma?: number };
export type Proforma = Omit<Invoice, 'dueDate' | 'paid' | 'balance' | 'payStatus' | 'daysOverdue'> & { validUntil: string; convertedInvoice: number | '' };
export type Receipt = { id: string; number: number; date: string; customerName: string; invoiceNumber: number | ''; amount: number; mode: string; reference: string; paymentFor: string; notes: string; status: string; emailedAt: string; createdBy: string };
export type Customer = { id: string; name: string; segment: string; vatDefault: boolean; email: string; phone: string; address: string; contactPerson: string; notes: string };
export type Product = { id: string; code: string; name: string; source: string; type: string; packaging: string; unitsPerCtn: number; packLabel: string; costPrice: number; price: number; price200: number; active: boolean };
export type Supplier = { id: string; name: string; contact: string; phone: string; email: string; notes: string };
export type CashEntry = { id: string; date: string; description: string; category: string; type: string; reference: string; amountIn: number; amountOut: number; notes: string; source: string; createdAt: string };
export type Data = { company: any; settings: any; today: string; customers: Customer[]; products: Product[]; suppliers: Supplier[]; invoices: Invoice[]; receipts: Receipt[]; proformas: Proforma[]; cashbook: CashEntry[]; unallocated: Record<string, number> };

type Ctx = {
  user: User | null; data: Data | null; loading: boolean;
  signedIn: (token: string, user: User) => void; signOut: () => void;
  refresh: () => Promise<void>;
  call: <T = any>(action: string, payload?: any, opts?: { success?: string; refresh?: boolean }) => Promise<T | null>;
  can: (module: string, level?: number) => boolean;
  setUser: (u: User) => void;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const signOut = useCallback(() => { api('logout'); setToken(null); setUser(null); setData(null); }, []);
  const refresh = useCallback(async () => {
    const r = await api<Data>('getData');
    if (r.ok) setData(r.data!);
    else if (r.code === 'AUTH') { setToken(null); setUser(null); setData(null); toast.error(r.error); }
    else toast.error(r.error);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    (async () => {
      const r = await api<{ user: User }>('me');
      if (r.ok) { setUser(r.data!.user); await refresh(); } else setToken(null);
      setLoading(false);
    })();
  }, [refresh]);

  const signedIn = useCallback((t: string, u: User) => { setToken(t); setUser(u); setLoading(true); refresh().finally(() => setLoading(false)); }, [refresh]);

  const call = useCallback(async (action: string, payload: any = {}, opts: { success?: string; refresh?: boolean } = {}) => {
    const r = await api(action, payload);
    if (!r.ok) {
      if (r.code === 'AUTH' && !/password|code/i.test(r.error || '')) { setToken(null); setUser(null); setData(null); }
      toast.error(r.error);
      return null;
    }
    if (opts.success) toast.success(opts.success);
    if (opts.refresh !== false) await refresh();
    return r.data;
  }, [refresh]);

  const can = useCallback((m: string, level = 1) => !!user && (user.perms[m] || 0) >= level, [user]);
  const value = useMemo(() => ({ user, data, loading, signedIn, signOut, refresh, call, can, setUser }), [user, data, loading, signedIn, signOut, refresh, call, can]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export { core };

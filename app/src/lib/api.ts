import core from './core.js';
import seed from './demo-seed.json';
import { sha256 } from 'js-sha256';
import sha1 from 'js-sha1';
import { API_URL } from '../config';

export type ApiResult<T = any> = { ok: boolean; data?: T; error?: string; code?: string };

const ss = {
  get(k: string) { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { v === null ? window.sessionStorage.removeItem(k) : window.sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const ls = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { v === null ? window.localStorage.removeItem(k) : window.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

function hashDemo(): boolean {
  try { return /(^|#)demo$/.test(window.location.hash); } catch { return false; }
}
// The live API address lives in config.json next to index.html, so it can be changed on GitHub without rebuilding.
let RUNTIME_API = API_URL;
export let IS_DEMO = !RUNTIME_API || hashDemo();
export async function loadConfig() {
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && typeof j.apiUrl === 'string' && /^https:\/\/script\.google\.com\//.test(j.apiUrl)) RUNTIME_API = j.apiUrl; }
  } catch { /* no config.json: stay on the built-in value */ }
  IS_DEMO = !RUNTIME_API || hashDemo();
}
export const DEMO_LOGIN = { email: 'demo@lismandy.app', password: 'Demo-Lismandy-2026' };

// ---------------------------------------------------------------- live backend
async function remote(action: string, data: any, token?: string | null): Promise<ApiResult> {
  try {
    const res = await fetch(RUNTIME_API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data, token }) });
    return await res.json();
  } catch {
    return { ok: false, error: 'Could not reach the Lismandy server. Check your internet connection and try again.', code: 'NETWORK' };
  }
}

// ---------------------------------------------------------------- demo backend (same business code, stored in this browser)
const DEMO_KEY = 'lismandy-demo-v2';
function demoStore() {
  let tables: Record<string, any[]> = {};
  const raw = ls.get(DEMO_KEY);
  if (raw) { try { tables = JSON.parse(raw); } catch { tables = {}; } }
  Object.keys(core.SCHEMA).forEach((k) => { tables[k] = tables[k] || []; });
  const c = (o: any) => JSON.parse(JSON.stringify(o));
  return {
    tables,
    all: (n: string) => c(tables[n]),
    insert: (n: string, r: any) => { tables[n].push(c(r)); },
    update: (n: string, id: string, p: any) => { const r = tables[n].find((x) => x.id === id); if (!r) throw new Error('Record not found'); Object.assign(r, c(p)); },
    remove: (n: string, id: string) => { tables[n] = tables[n].filter((x) => x.id !== id); },
    flush: () => ls.set(DEMO_KEY, JSON.stringify(tables)),
  };
}
function rnd(n: number) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a); }
const cache = new Map<string, { v: string; exp: number }>();
const browserEnv = {
  hashIterations: 200,
  now: () => new Date(),
  uuid: () => (crypto.randomUUID ? crypto.randomUUID() : rnd(16).map((b) => b.toString(16).padStart(2, '0')).join('')),
  randomBytes: rnd,
  sha256Hex: (s: string) => sha256(s),
  hmacSha1: (k: number[], m: number[]) => Array.from(new Uint8Array((sha1 as any).hmac.arrayBuffer(new Uint8Array(k), new Uint8Array(m)))),
  cacheGet: (k: string) => { const e = cache.get(k) || JSON.parse(ss.get('c:' + k) || 'null'); if (!e || e.exp < Date.now()) return null; return e.v; },
  cachePut: (k: string, v: string, ttl: number) => { const e = { v, exp: Date.now() + ttl * 1000 }; cache.set(k, e); ss.set('c:' + k, JSON.stringify(e)); },
  cacheRemove: (k: string) => { cache.delete(k); ss.set('c:' + k, null); },
  sendMail: () => { throw new Error('Demo mode does not send real email. On the live site this goes out from lismandyenterprise@gmail.com.'); },
};
let demoApi: any = null;
function getDemo() {
  if (demoApi) return demoApi;
  const store = demoStore();
  demoApi = core.createApi(store, browserEnv);
  if (!store.tables.users.length) seedDemo(store);
  return demoApi;
}
function seedDemo(store: any) {
  const s = JSON.parse(JSON.stringify(seed));
  s.settings.requireMfa = false;
  demoApi.seed(s, DEMO_LOGIN.email, 'Demo Admin');
  const u = store.tables.users[0];
  const salt = 'demosalt';
  let h = sha256(salt + '|' + DEMO_LOGIN.password);
  for (let i = 0; i < 200; i++) h = sha256(h + salt);
  Object.assign(u, { passwordHash: '200$' + h, salt, mustChangePassword: false });
  // Sample history so charts, forecast and health checks have something to show. Clearly marked as demo data.
  const r = demoApi.handle({ action: 'login', data: DEMO_LOGIN });
  const tok = r.data.token;
  const call = (action: string, data: any) => demoApi.handle({ action, data, token: tok });
  const custs = s.customers.map((c: any) => c.name);
  const prods = store.tables.products;
  const today = new Date();
  let seedN = 7;
  const rand = () => { seedN = (seedN * 9301 + 49297) % 233280; return seedN / 233280; };
  for (let m = 11; m >= 0; m--) {
    const per = 2 + Math.floor(rand() * 3) + Math.floor((11 - m) / 4);
    for (let k = 0; k < per; k++) {
      const day = m === 0 ? 1 + Math.floor(rand() * Math.max(1, today.getUTCDate() - 1)) : 3 + Math.floor(rand() * 24);
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, day));
      const iso = d.toISOString().slice(0, 10);
      const cust = custs[Math.floor(rand() * custs.length)];
      const items = [0, 1].map(() => { const p = prods[Math.floor(rand() * prods.length)]; return { code: p.code, description: p.name, qty: Math.round((5 + Math.floor(rand() * 40)) * (1 + (11 - m) / 10)), price: p.price, discount: 0 }; });
      const inv = call('invoices.save', { customerName: cust, date: iso, vat: !!s.customers.find((c: any) => c.name === cust)?.vatDefault, items, notes: 'Demo sample' }).data;
      if (!inv) continue;
      const pay = rand();
      if (m > 2 || pay > 0.4) {
        const amt = pay > 0.25 ? inv.total : Math.round(inv.total * 0.5);
        const pd = new Date(d.getTime() + (7 + Math.floor(rand() * 25)) * 86400000);
        if (pd < today) call('receipts.save', { customerName: cust, invoiceNumber: inv.number, amount: amt, mode: ['Momo', 'Transfer', 'Cash', 'Cheque'][Math.floor(rand() * 4)], date: pd.toISOString().slice(0, 10) });
      }
    }
    if (m === 0) continue;
    const cd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 25)).toISOString().slice(0, 10);
    call('cashbook.save', { type: 'Out', amount: 800 + Math.round(rand() * 1500), description: 'Delivery & fuel', category: 'Transport', date: cd });
    call('cashbook.save', { type: 'Out', amount: 1200, description: 'Shop rent', category: 'Rent', date: cd });
  }
  call('proformas.save', { customerName: custs[2], items: [{ code: prods[0].code, description: prods[0].name, qty: 40, price: prods[0].price }], notes: 'Demo sample' });
    call('admin.saveUser', { email: 'ama.sales@lismandy.app', name: 'Ama Owusu (demo)', role: 'sales' });
  call('admin.saveUser', { email: 'kofi.accounts@lismandy.app', name: 'Kofi Mensah (demo)', role: 'accounts' });
  call('logout', {});
  store.flush();
}
export function resetDemo() { ls.set(DEMO_KEY, null); demoApi = null; }

// ---------------------------------------------------------------- public client
let token: string | null = ss.get('lm-token');
export function getToken() { return token; }
export function setToken(t: string | null) { token = t; ss.set('lm-token', t); }

export async function api<T = any>(action: string, data: any = {}): Promise<ApiResult<T>> {
  if (IS_DEMO) {
    await new Promise((r) => setTimeout(r, 60));
    return getDemo().handle({ action, data, token });
  }
  return remote(action, data, token);
}
export { core };

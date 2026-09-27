import { useEffect } from 'react';
export function readHash() { try { return window.location.hash.replace('#', '').split('.')[0]; } catch { return ''; } }
export function subRoute() { try { return window.location.hash.replace('#', '').split('.')[1] || ''; } catch { return ''; } }
export function clearSub() { try { if (window.location.hash.includes('.')) history.replaceState(null, '', '#' + readHash()); } catch { /* ignore */ } }
export function navigate(id: string) { try { window.location.hash = id; } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('lm-nav', { detail: id })); }
// Lets a page react to deep links such as #invoices.new or #customers.<id>
export function useSubRoute(page: string, handler: (sub: string) => void) {
  useEffect(() => {
    const s = subRoute(); if (s) { handler(s); clearSub(); }
    const on = (e: Event) => { const [p, sub] = String((e as CustomEvent).detail).split('.'); if (p === page && sub) { setTimeout(() => { handler(sub); clearSub(); }, 0); } };
    window.addEventListener('lm-nav', on);
    return () => window.removeEventListener('lm-nav', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

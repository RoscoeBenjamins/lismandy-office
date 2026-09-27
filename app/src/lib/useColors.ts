import { useEffect, useState } from 'react';
const KEYS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'foreground', 'muted-foreground', 'border', 'card', 'ok', 'warn', 'bad', 'primary'];
function read() {
  const cs = getComputedStyle(document.documentElement);
  const o: Record<string, string> = {};
  KEYS.forEach((k) => { o[k] = `hsl(${cs.getPropertyValue('--' + k).trim().replace(/\s+/g, ' ')})`; });
  return o;
}
// Chart colors follow the light/dark theme tokens (SVG attributes can't read CSS variables directly).
export function useColors() {
  const [c, setC] = useState(read);
  useEffect(() => {
    const update = () => setC(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', update);
    return () => { mo.disconnect(); mq?.removeEventListener?.('change', update); };
  }, []);
  return c;
}

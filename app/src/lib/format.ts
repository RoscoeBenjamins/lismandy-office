import core from './core.js';
export const ghs = (n: number) => 'GHS ' + core.money(n || 0);
export const money = (n: number) => core.money(n || 0);
export const compact = (n: number) => {
  const a = Math.abs(n || 0);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  return String(Math.round(n || 0));
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (k: string) => MONTHS[+k.slice(5, 7) - 1] + " '" + k.slice(2, 4);
export const dateLabel = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

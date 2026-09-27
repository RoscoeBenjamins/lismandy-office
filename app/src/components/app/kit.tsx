import { useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-muted-foreground mt-1 text-[13px]">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'primary' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'primary' ? 'text-primary' : '';
  return (
    <div className="bg-card border rounded-md px-4 py-3 min-w-0">
      <div className="eyebrow">{label}</div>
      <div className={cn('num text-[22px] font-medium mt-1 truncate', color)}>{value}</div>
      {hint && <div className="text-[12px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

const pillTone: Record<string, string> = {
  Paid: 'bg-ok/10 text-ok border-ok/30', Partial: 'bg-warn/10 text-warn border-warn/30', Unpaid: 'bg-secondary text-secondary-foreground border-border',
  Overdue: 'bg-bad/10 text-bad border-bad/30', Void: 'bg-muted text-muted-foreground border-border line-through', open: 'bg-secondary text-secondary-foreground border-border',
  converted: 'bg-ok/10 text-ok border-ok/30', void: 'bg-muted text-muted-foreground border-border line-through', valid: 'bg-ok/10 text-ok border-ok/30',
  high: 'bg-bad/10 text-bad border-bad/30', medium: 'bg-warn/10 text-warn border-warn/30', low: 'bg-secondary text-secondary-foreground border-border',
  In: 'bg-ok/10 text-ok border-ok/30', Out: 'bg-bad/10 text-bad border-bad/30',
};
export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  const k = tone || String(children);
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-[1px] text-[11px] font-semibold whitespace-nowrap', pillTone[k] || 'bg-secondary border-border')}>{children}</span>;
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
const ctl = 'h-9 w-full rounded-md border border-input bg-card px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60';
export function TextInput(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cn(ctl, p.className)} />; }
export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string | number; label: string })[] }) {
  return (
    <select {...p} className={cn(ctl, 'pr-8', p.className)}>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Search'} className={cn(ctl, 'pl-8')} aria-label={placeholder || 'Search'} />
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-h-[92vh] overflow-y-auto', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// Two-step confirmation (the browser confirm() dialog is not available everywhere)
export function ConfirmButton({ children, confirmText, onConfirm, variant = 'outline', size = 'sm', disabled }: { children: ReactNode; confirmText: string; onConfirm: () => void; variant?: any; size?: any; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (armed) return (
    <span className="inline-flex items-center gap-1">
      <Button size={size} variant="destructive" onClick={() => { setArmed(false); onConfirm(); }}>{confirmText}</Button>
      <Button size={size} variant="ghost" onClick={() => setArmed(false)}>Cancel</Button>
    </span>
  );
  return <Button size={size} variant={variant} disabled={disabled} onClick={() => setArmed(true)}>{children}</Button>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed rounded-md p-8 text-center">
      <div className="font-display text-lg font-semibold">{title}</div>
      {children && <div className="text-muted-foreground text-[13px] mt-1">{children}</div>}
    </div>
  );
}

export function Paper({ html }: { html: string }) {
  // HTML comes from the shared core renderer, which escapes every user-supplied value.
  return <div className="paper print-area" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Section({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('bg-card border rounded-md', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          {title && <h2 className="font-display text-[15px] font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

// Printing is unavailable when the app runs inside an embedded preview frame.
export const CAN_PRINT = (() => { try { return window.self === window.top; } catch { return false; } })();

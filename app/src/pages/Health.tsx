import { useMemo, useState } from 'react';
import { useApp, core } from '@/lib/store';
import { PageHeader, Stat, Section, Pill } from '@/components/app/kit';
import { money } from '@/lib/format';
import { navigate } from '@/lib/nav';
import { useColors } from '@/lib/useColors';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

function Gauge({ score }: { score: number }) {
  const c = useColors();
  const tone = score >= 80 ? c.ok : score >= 60 ? c.warn : c.bad;
  const r = 52, len = Math.PI * r, off = len * (1 - score / 100);
  return (
    <svg viewBox="0 0 140 84" width="180" height="108" role="img" aria-label={`Data health score ${score} out of 100`}>
      <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke={c.border} strokeWidth="12" strokeLinecap="round" />
      <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={off} />
      <text x="70" y="66" textAnchor="middle" fontSize="28" fontWeight="600" fill={c.foreground} style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{score}</text>
      <text x="70" y="80" textAnchor="middle" fontSize="9" fill={c['muted-foreground']}>out of 100</text>
    </svg>
  );
}

export default function Health() {
  const { data } = useApp();
  const d = data!;
  const h = useMemo(() => core.computeHealth(d, d.today), [d]);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const ageing = [['Not yet due', h.ageing.current], ['1–30 days', h.ageing.d30], ['31–60 days', h.ageing.d60], ['61–90 days', h.ageing.d90], ['90+ days', h.ageing.d90p]] as [string, number][];
  const maxA = Math.max(1, ...ageing.map((x) => x[1]));
  const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  h.issues.forEach((i: any) => { counts[i.severity] += i.count; });
  return (
    <div>
      <PageHeader title="Data health" sub="A hygiene check of the books: stale dates, missing details and mismatches, ranked by what to fix first. Read-only; nothing is changed here." />
      <div className="grid lg:grid-cols-[260px_1fr] gap-4 mb-4">
        <div className="bg-card border rounded-md p-4 flex flex-col items-center justify-center">
          <Gauge score={h.score} />
          <div className="text-[13px] mt-1 text-center"><b className="text-bad">{counts.high}</b> urgent · <b className="text-warn">{counts.medium}</b> soon · <b>{counts.low}</b> tidy-up</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Collection rate" value={`${Math.round(h.kpis.collectionRate)}%`} hint="received ÷ invoiced" tone={h.kpis.collectionRate >= 85 ? 'ok' : h.kpis.collectionRate >= 60 ? 'warn' : 'bad'} />
          <Stat label="Overdue share" value={`${Math.round(h.kpis.overdueShare)}%`} hint="of what customers owe" tone={h.kpis.overdueShare > 40 ? 'bad' : h.kpis.overdueShare > 15 ? 'warn' : 'ok'} />
          <Stat label="Days sales outstanding" value={h.kpis.dso} hint="approx., 90-day basis" />
          <Stat label="Outstanding" value={money(h.kpis.outstanding)} hint="GHS still owed" />
          <Stat label="Customer records complete" value={`${h.kpis.customerCompleteness}%`} hint="have phone + email" tone={h.kpis.customerCompleteness >= 80 ? 'ok' : 'warn'} />
          <Stat label="Product records complete" value={`${h.kpis.productCompleteness}%`} hint="have cost + price" tone={h.kpis.productCompleteness >= 80 ? 'ok' : 'warn'} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <Section title={`Fix list · ${h.issues.length} checks need attention`}>
          {h.issues.length === 0 && <p className="text-ok text-[14px]">Everything checks out. Nice.</p>}
          <ul className="divide-y">
            {h.issues.map((i: any, k: number) => (
              <li key={k} className="py-2.5">
                <button className="w-full flex items-start gap-3 text-left" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))} aria-expanded={!!open[k]}>
                  <span className={cn('mt-1 w-1 self-stretch rounded-full', i.severity === 'high' ? 'bg-bad' : i.severity === 'medium' ? 'bg-warn' : 'bg-border')} />
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{i.title}</span><Pill tone={i.severity}>{i.count}</Pill><span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i.category}</span></span>
                    <span className="block text-[13px] text-muted-foreground mt-0.5">{i.fix}</span>
                  </span>
                  {open[k] ? <ChevronDown className="h-4 w-4 mt-1" /> : <ChevronRight className="h-4 w-4 mt-1" />}
                </button>
                {open[k] && (
                  <div className="pl-7 mt-2">
                    <ul className="text-[13px] space-y-0.5 num">{i.items.map((x: string) => <li key={x}>{x}</li>)}</ul>
                    {i.count > i.items.length && <div className="text-[12px] text-muted-foreground">…and {i.count - i.items.length} more</div>}
                    <button className="text-[12px] text-primary underline mt-1.5" onClick={() => navigate(i.module)}>Go to {i.module}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Money owed by age">
          <div className="space-y-2.5">
            {ageing.map(([l, v], i) => (
              <div key={l}>
                <div className="flex justify-between text-[13px]"><span>{l}</span><span className="num">{money(v)}</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mt-1"><div className={cn('h-full rounded-full', i === 0 ? 'bg-ok' : i < 2 ? 'bg-warn' : 'bg-bad')} style={{ width: `${(v / maxA) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

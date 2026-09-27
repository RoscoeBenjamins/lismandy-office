import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from 'recharts';
import { useApp, core } from '@/lib/store';
import { PageHeader, Stat, Section, Select, Pill } from '@/components/app/kit';
import { ghs, money, compact, monthLabel } from '@/lib/format';
import { useColors } from '@/lib/useColors';
import { cn } from '@/lib/utils';

export default function Analytics() {
  const { data } = useApp();
  const d = data!;
  const c = useColors();
  const [horizon, setHorizon] = useState(3);
  const [window_, setWindow] = useState(12);

  const a = useMemo(() => {
    // Fit on completed months only; the current month is still filling up, so it is forecast (with its sales so far shown).
    const full = core.monthSeries(d, window_ + 1, d.today);
    const series = full.slice(0, -1), current = full[full.length - 1];
    const sales = series.map((s: any) => s.sales);
    const fc = core.forecast(sales, horizon);
    const fcColl = core.forecast(series.map((s: any) => s.collections), horizon);
    const futureKeys = core.nextMonths(series[series.length - 1].month, horizon);
    const chart: any[] = series.map((s: any, i: number) => ({ label: monthLabel(s.month), sales: s.sales, collections: s.collections, forecast: i === series.length - 1 ? s.sales : null, band: null, soFar: null }));
    futureKeys.forEach((k: string, i: number) => chart.push({ label: monthLabel(k), sales: null, collections: null, forecast: fc.points[i], band: [fc.lower[i], fc.upper[i]], soFar: i === 0 ? current.sales : null }));
    const sum = (arr: number[]) => arr.reduce((x, y) => x + y, 0);
    const last3 = sum(sales.slice(-3)), prev3 = sum(sales.slice(-6, -3));
    const growth = prev3 ? ((last3 - prev3) / prev3) * 100 : null;
    const live = d.invoices.filter((i) => i.status !== 'void');
    const avgInv = live.length ? sum(live.map((i) => i.total)) / live.length : 0;
    const rate = sum(series.map((s: any) => s.sales)) ? (sum(series.map((s: any) => s.collections)) / sum(series.map((s: any) => s.sales))) * 100 : 0;

    // product mix from invoice lines
    const prod: Record<string, { rev: number; qty: number }> = {};
    const since = series[0].month;
    live.filter((i) => i.date.slice(0, 7) >= since).forEach((i) => i.items.forEach((it) => { const k = it.description; prod[k] = prod[k] || { rev: 0, qty: 0 }; prod[k].rev += it.amount || 0; prod[k].qty += it.qty; }));
    const topProducts = Object.entries(prod).sort((x, y) => y[1].rev - x[1].rev).slice(0, 8).map(([name, v]) => ({ name: name.length > 26 ? name.slice(0, 25) + '…' : name, rev: Math.round(v.rev), qty: v.qty }));

    // segment by month
    const segOf: Record<string, string> = {}; d.customers.forEach((cu) => { segOf[cu.name.toLowerCase()] = cu.segment || 'Other'; });
    const segs = Array.from(new Set(Object.values(segOf).concat(['Other'])));
    const bySeg = series.map((s: any) => { const row: any = { label: monthLabel(s.month) }; segs.forEach((g) => { row[g] = 0; }); return row; });
    const idx: Record<string, number> = {}; series.forEach((s: any, i: number) => { idx[s.month] = i; });
    live.forEach((i) => { const k = i.date.slice(0, 7); if (k in idx) { const g = segOf[i.customerName.toLowerCase()] || 'Other'; bySeg[idx[k]][g] += i.total; } });
    const usedSegs = segs.filter((g) => bySeg.some((r: any) => r[g] > 0));

    // customer momentum: last 3 months vs previous 3
    const cm: Record<string, { now: number; before: number }> = {};
    const cut3 = series[Math.max(0, series.length - 3)].month, cut6 = series[Math.max(0, series.length - 6)].month;
    live.forEach((i) => { const k = i.date.slice(0, 7); cm[i.customerName] = cm[i.customerName] || { now: 0, before: 0 }; if (k >= cut3) cm[i.customerName].now += i.total; else if (k >= cut6) cm[i.customerName].before += i.total; });
    const momentum = Object.entries(cm).filter(([, v]) => v.now || v.before).map(([n, v]) => ({ name: n, ...v, change: v.before ? ((v.now - v.before) / v.before) * 100 : null })).sort((x, y) => y.now - x.now);

    return { chart, fc, fcColl, futureKeys, growth, avgInv, rate, topProducts, bySeg, usedSegs, momentum, current };
  }, [d, horizon, window_]);

  const tip = { contentStyle: { background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12 }, labelStyle: { color: c.foreground } };
  const axis = { tick: { fill: c['muted-foreground'], fontSize: 11 }, tickLine: false };
  const segColors = [c['chart-1'], c['chart-2'], c['chart-3'], c['chart-4'], c['muted-foreground']];

  return (
    <div>
      <PageHeader title="Trends & forecast" sub={a.fc.note}
        actions={<div className="flex gap-2">
          <Select id="an-window" aria-label="History" className="w-auto" value={String(window_)} onChange={(e) => setWindow(Number(e.target.value))} options={[{ value: '6', label: 'Last 6 months' }, { value: '12', label: 'Last 12 months' }, { value: '24', label: 'Last 24 months' }]} />
          <Select id="an-h" aria-label="Forecast horizon" className="w-auto" value={String(horizon)} onChange={(e) => setHorizon(Number(e.target.value))} options={[{ value: '3', label: 'Forecast 3 months' }, { value: '6', label: 'Forecast 6 months' }]} />
        </div>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label={`${monthLabel(a.futureKeys[0])} forecast`} value={compact(a.fc.points[0])} hint={`${compact(a.current.sales)} invoiced so far · range ${compact(a.fc.lower[0])}–${compact(a.fc.upper[0])}`} tone="primary" />
        <Stat label="3-month growth" value={a.growth === null ? '—' : `${a.growth >= 0 ? '+' : ''}${Math.round(a.growth)}%`} hint="last 3 months vs 3 before" tone={a.growth === null ? undefined : a.growth >= 0 ? 'ok' : 'bad'} />
        <Stat label="Collection rate" value={`${Math.round(a.rate)}%`} hint="cash in ÷ sales in window" tone={a.rate >= 85 ? 'ok' : a.rate >= 60 ? 'warn' : 'bad'} />
        <Stat label="Average invoice" value={compact(a.avgInv)} hint="GHS per invoice" />
      </div>

      <Section title="Monthly sales and forecast" className="mb-4">
        <div className="h-[300px]">
          <ResponsiveContainer>
            <ComposedChart data={a.chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={c.border} vertical={false} />
              <XAxis dataKey="label" {...axis} axisLine={{ stroke: c.border }} />
              <YAxis tickFormatter={compact} {...axis} axisLine={false} width={44} />
              <Tooltip {...tip} formatter={(v: any, n: any) => Array.isArray(v) ? [`${money(v[0])} – ${money(v[1])}`, 'Likely range'] : [ghs(Number(v)), n]} />
              <Area isAnimationActive={false} dataKey="band" name="Likely range" stroke="none" fill={c['chart-1']} fillOpacity={0.12} />
              <Line isAnimationActive={false} type="monotone" dataKey="sales" name="Sales" stroke={c['chart-1']} strokeWidth={2.5} dot={{ r: 2.5, fill: c['chart-1'] }} connectNulls={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="collections" name="Collected" stroke={c['chart-2']} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="soFar" name="This month so far" stroke="none" dot={{ r: 4, fill: c['chart-3'], stroke: c['chart-3'] }} />
              <Line isAnimationActive={false} type="monotone" dataKey="forecast" name="Forecast" stroke={c['chart-1']} strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3, fill: c.card, stroke: c['chart-1'] }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap mt-3">
          <table className="dt max-w-xl">
            <thead><tr><th>Month</th><th className="r">Expected sales</th><th className="r">Low</th><th className="r">High</th><th className="r">Expected collections</th></tr></thead>
            <tbody>{a.futureKeys.map((k: string, i: number) => <tr key={k}><td className="whitespace-nowrap">{monthLabel(k)}</td><td className="r num font-medium">{money(a.fc.points[i])}</td><td className="r num text-muted-foreground">{money(a.fc.lower[i])}</td><td className="r num text-muted-foreground">{money(a.fc.upper[i])}</td><td className="r num">{money(a.fcColl.points[i])}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="text-[12px] text-muted-foreground mt-2">Method: Holt’s trend smoothing on completed months’ invoice totals; the gold dot is this month so far. The shaded band is an 80% range; it widens further out because uncertainty grows. It updates every time an invoice is saved.</p>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Section title="Sales by segment, month by month">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={a.bySeg} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={c.border} vertical={false} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: c.border }} />
                <YAxis tickFormatter={compact} {...axis} axisLine={false} width={44} />
                <Tooltip {...tip} formatter={(v: any) => ghs(Number(v))} cursor={{ fill: c.border, opacity: 0.3 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: c['muted-foreground'] }} />
                {a.usedSegs.map((g, i) => <Bar isAnimationActive={false} key={g} dataKey={g} stackId="s" fill={segColors[i % segColors.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Best-selling products (by value)">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={a.topProducts} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={170} tick={{ fill: c.foreground, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...tip} formatter={(v: any) => ghs(Number(v))} cursor={{ fill: c.border, opacity: 0.3 }} />
                <Bar isAnimationActive={false} dataKey="rev" name="Sales" fill={c['chart-2']} radius={[0, 3, 3, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section title="Customer momentum · last 3 months vs the 3 before">
        <div className="table-wrap">
          <table className="dt">
            <thead><tr><th>Customer</th><th className="r">Previous 3 months</th><th className="r">Last 3 months</th><th className="r">Change</th><th>Signal</th></tr></thead>
            <tbody>{a.momentum.map((m) => (
              <tr key={m.name}><td>{m.name}</td><td className="r num">{money(m.before)}</td><td className="r num">{money(m.now)}</td>
                <td className={cn('r num', m.change !== null && (m.change >= 0 ? 'text-ok' : 'text-bad'))}>{m.change === null ? 'new' : `${m.change >= 0 ? '+' : ''}${Math.round(m.change)}%`}</td>
                <td>{m.now === 0 ? <Pill tone="high">stopped buying</Pill> : m.change !== null && m.change < -30 ? <Pill tone="medium">slowing</Pill> : m.change === null ? <Pill tone="Paid">new / returning</Pill> : m.change > 30 ? <Pill tone="Paid">growing</Pill> : <Pill tone="low">steady</Pill>}</td></tr>))}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

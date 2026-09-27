import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import { useApp, core } from '@/lib/store';
import { PageHeader, Stat, Section, Pill } from '@/components/app/kit';
import { ghs, money, compact, monthLabel, dateLabel } from '@/lib/format';
import { useColors } from '@/lib/useColors';
import { navigate } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function Dashboard() {
  const { data, can, user } = useApp();
  const c = useColors();
  const d = data!;
  const m = useMemo(() => {
    const live = d.invoices.filter((i) => i.status !== 'void');
    const total = live.reduce((a, i) => a + i.total, 0);
    const received = d.receipts.filter((r) => r.status !== 'void').reduce((a, r) => a + r.amount, 0);
    const outstanding = live.reduce((a, i) => a + i.balance, 0);
    const overdue = live.filter((i) => i.daysOverdue > 0);
    const series = core.monthSeries(d, 12, d.today).map((x: any) => ({ ...x, label: monthLabel(x.month) }));
    const seg: Record<string, number> = {};
    const segOf: Record<string, string> = {}; d.customers.forEach((cu) => { segOf[cu.name.toLowerCase()] = cu.segment || 'Other'; });
    live.forEach((i) => { const s = segOf[i.customerName.toLowerCase()] || 'Other'; seg[s] = (seg[s] || 0) + i.total; });
    const byCust: Record<string, { sales: number; balance: number }> = {};
    live.forEach((i) => { byCust[i.customerName] = byCust[i.customerName] || { sales: 0, balance: 0 }; byCust[i.customerName].sales += i.total; byCust[i.customerName].balance += i.balance; });
    const top = Object.entries(byCust).sort((a, b) => b[1].sales - a[1].sales).slice(0, 6);
    const thisM = series[series.length - 1], lastM = series[series.length - 2];
    const change = lastM && lastM.sales ? ((thisM.sales - lastM.sales) / lastM.sales) * 100 : null;
    const topSeg = Object.entries(seg).sort((a, b) => b[1] - a[1])[0];
    const recent = [...live].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    return { total, received, outstanding, overdue, series, seg, top, thisM, change, topSeg, recent, count: live.length };
  }, [d]);

  const overdueAmt = m.overdue.reduce((a, i) => a + i.balance, 0);
  const segData = Object.entries(m.seg).map(([k, v]) => ({ name: k, value: Math.round(v) }));
  const hello = (user?.name || '').split(' ')[0];

  return (
    <div>
      <PageHeader title={`Good day${hello ? ', ' + hello : ''}`} sub={<>Books as of {dateLabel(d.today)}. {m.topSeg ? <>Top segment: <b>{m.topSeg[0]}</b> ({ghs(m.topSeg[1])}).</> : 'No sales recorded yet.'}</>}
        actions={<>
          {can('invoices', 2) && <Button onClick={() => navigate('invoices.new')}><Plus className="h-4 w-4 mr-1" />New invoice</Button>}
          {can('receipts', 2) && <Button variant="outline" onClick={() => navigate('receipts.new')}>Record payment</Button>}
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Total sales" value={compact(m.total)} hint={`${m.count} invoices · GHS`} tone="primary" />
        <Stat label="Received" value={compact(m.received)} hint={m.total ? `${Math.round((m.received / m.total) * 100)}% collected` : '—'} tone="ok" />
        <Stat label="Outstanding" value={compact(m.outstanding)} hint="still owed to you" />
        <Stat label="Overdue" value={compact(overdueAmt)} hint={`${m.overdue.length} invoice${m.overdue.length === 1 ? '' : 's'} past due`} tone={overdueAmt > 0 ? 'bad' : undefined} />
        <Stat label="This month" value={compact(m.thisM.sales)} hint={m.change === null ? 'first month on record' : `${m.change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(m.change))}% vs all of last month`} tone={m.change !== null && m.change < 0 ? 'warn' : undefined} />
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 mb-4">
        <Section title="Sales vs money collected · last 12 months">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <AreaChart data={m.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c['chart-1']} stopOpacity={0.28} /><stop offset="100%" stopColor={c['chart-1']} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={c.border} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: c['muted-foreground'], fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.border }} />
                <YAxis tickFormatter={compact} tick={{ fill: c['muted-foreground'], fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v: any) => ghs(Number(v))} contentStyle={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12 }} labelStyle={{ color: c.foreground }} />
                <Area isAnimationActive={false} type="monotone" dataKey="sales" name="Sales" stroke={c['chart-1']} strokeWidth={2} fill="url(#gS)" />
                <Area isAnimationActive={false} type="monotone" dataKey="collections" name="Collected" stroke={c['chart-2']} strokeWidth={2} fill="none" strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-[12px] text-muted-foreground mt-1"><span className="inline-flex items-center gap-1.5"><i className="w-3 h-[3px] inline-block" style={{ background: c['chart-1'] }} />Sales invoiced</span><span className="inline-flex items-center gap-1.5"><i className="w-3 h-[3px] inline-block" style={{ background: c['chart-2'] }} />Money collected</span></div>
        </Section>
        <Section title="Sales by segment">
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={segData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: c.foreground, fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => ghs(Number(v))} contentStyle={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12 }} cursor={{ fill: c.border, opacity: 0.3 }} />
                <Bar isAnimationActive={false} dataKey="value" name="Sales" fill={c['chart-1']} radius={[0, 3, 3, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-[13px]">
            {segData.map((s) => <div key={s.name} className="flex justify-between"><span>{s.name}</span><span className="num">{money(s.value)}</span></div>)}
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Top customers" actions={can('statements') ? <button className="text-[12px] text-primary underline" onClick={() => navigate('statements')}>Statements</button> : null}>
          <div className="table-wrap"><table className="dt">
            <thead><tr><th>Customer</th><th className="r">Sales (GHS)</th><th className="r">Owes (GHS)</th></tr></thead>
            <tbody>{m.top.map(([n, v]) => <tr key={n}><td>{n}</td><td className="r num">{money(v.sales)}</td><td className={'r num ' + (v.balance > 0 ? 'text-bad' : 'text-muted-foreground')}>{money(v.balance)}</td></tr>)}</tbody>
          </table></div>
        </Section>
        <Section title="Latest invoices" actions={<button className="text-[12px] text-primary underline" onClick={() => navigate('invoices')}>All invoices</button>}>
          <div className="table-wrap"><table className="dt">
            <thead><tr><th>#</th><th>Date</th><th>Customer</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>{m.recent.map((i) => <tr key={i.id} className="clickable" onClick={() => navigate('invoices')}><td className="num">{i.number}</td><td className="whitespace-nowrap">{dateLabel(i.date)}</td><td className="max-w-[180px] truncate">{i.customerName}</td><td className="r num">{money(i.total)}</td><td><Pill tone={i.daysOverdue > 0 ? 'Overdue' : i.payStatus}>{i.daysOverdue > 0 ? `${i.daysOverdue}d overdue` : i.payStatus}</Pill></td></tr>)}</tbody>
          </table></div>
        </Section>
      </div>
    </div>
  );
}

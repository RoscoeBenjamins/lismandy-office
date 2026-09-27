import { useMemo, useState } from 'react';
import { useApp, core } from '@/lib/store';
import { PageHeader, SearchBox, Modal, Field, TextInput, Select, ConfirmButton, Paper, CAN_PRINT, Stat, Pill, Empty } from '@/components/app/kit';
import { EmailDialog } from '@/components/app/EmailDialog';
import { Button } from '@/components/ui/button';
import { money, dateLabel, downloadCsv } from '@/lib/format';
import { navigate, useSubRoute } from '@/lib/nav';
import { Plus, Download, Printer, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Ledger() {
  const { data } = useApp();
  const d = data!;
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [month, setMonth] = useState('');
  const all = useMemo(() => core.buildLedger(d), [d]);
  const rows = all.filter((r: any) => (type === 'All' || r.docType === type) && (!month || r.date.startsWith(month)) && (!q || (r.customer + r.docNo).toLowerCase().includes(q.toLowerCase())));
  const months = Array.from(new Set(all.map((r: any) => r.date.slice(0, 7)))).sort().reverse() as string[];
  const debit = rows.reduce((a: number, r: any) => a + r.debit, 0), credit = rows.reduce((a: number, r: any) => a + r.credit, 0);
  return (
    <div>
      <PageHeader title="Transactions" sub="Every invoice and payment in date order, with each customer’s running balance. Filled in automatically."
        actions={CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv('transactions.csv', [['S.No', 'Date', 'Doc type', 'Doc no', 'Customer', 'Segment', 'VAT', 'Amount (GHS)', 'Received (GHS)', 'Customer balance'], ...rows.map((r: any) => [r.sno, r.date, r.docType, r.docNo, r.customer, r.segment, r.vat ? 'Yes' : 'No', r.debit || '', r.credit || '', r.balance])])}><Download className="h-4 w-4 mr-1" />CSV</Button>} />
      <div className="flex flex-wrap gap-3 justify-between mb-3">
        <div className="flex flex-wrap gap-2">
          <Select id="lg-type" aria-label="Document type" className="w-36" value={type} onChange={(e) => setType(e.target.value)} options={['All', 'Invoice', 'Receipt']} />
          <Select id="lg-month" aria-label="Month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} options={[{ value: '', label: 'All months' }, ...months.map((m) => ({ value: m, label: m }))]} />
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Customer or number" />
      </div>
      <div className="bg-card border rounded-md table-wrap max-h-[70vh]">
        <table className="dt">
          <thead><tr><th>S.No</th><th>Date</th><th>Type</th><th>Doc no.</th><th>Customer</th><th>Segment</th><th className="r">Invoiced</th><th className="r">Received</th><th className="r">Customer balance</th></tr></thead>
          <tbody>{rows.map((r: any) => (
            <tr key={r.docType + r.docNo} className="clickable" onClick={() => navigate((r.docType === 'Invoice' ? 'invoices.' : 'receipts.') + r.ref)}>
              <td className="num text-muted-foreground">{r.sno}</td><td className="whitespace-nowrap">{dateLabel(r.date)}</td><td><Pill tone={r.docType === 'Invoice' ? 'Unpaid' : 'Paid'}>{r.docType}</Pill></td><td className="num">{r.docNo}</td>
              <td className="max-w-[220px] truncate">{r.customer}</td><td className="text-[13px] text-muted-foreground">{r.segment}</td>
              <td className="r num">{r.debit ? money(r.debit) : ''}</td><td className="r num text-ok">{r.credit ? money(r.credit) : ''}</td><td className={cn('r num', r.balance > 0 && 'font-medium')}>{money(r.balance)}</td>
            </tr>))}</tbody>
          <tfoot><tr><td colSpan={6} className="text-[12px] text-muted-foreground">{rows.length} rows</td><td className="r num font-semibold">{money(debit)}</td><td className="r num font-semibold">{money(credit)}</td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

const CATS = ['Sales receipt', 'Purchases', 'Transport', 'Rent', 'Salaries', 'Utilities', 'Owner drawings', 'Capital', 'Bank charges', 'Other'];
export function CashBook() {
  const { data, can, call } = useApp();
  const d = data!;
  const [form, setForm] = useState<any>(null);
  const [month, setMonth] = useState('');
  const rows = useMemo(() => core.cashbookWithBalance(d.cashbook), [d.cashbook]);
  const months = Array.from(new Set(rows.map((r: any) => r.date.slice(0, 7)))).sort().reverse() as string[];
  const shown = rows.filter((r: any) => !month || r.date.startsWith(month));
  const inSum = shown.reduce((a: number, r: any) => a + r.amountIn, 0), outSum = shown.reduce((a: number, r: any) => a + r.amountOut, 0);
  const balance = rows.length ? rows[rows.length - 1].balance : 0;
  return (
    <div>
      <PageHeader title="Cash book" sub="Money in and out. Customer receipts appear here on their own; add expenses and other cash movements yourself."
        actions={<>
          {CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv('cash-book.csv', [['S.No', 'Date', 'Description', 'Category', 'Type', 'Reference', 'In', 'Out', 'Balance', 'Notes'], ...shown.map((r: any) => [r.sno, r.date, r.description, r.category, r.type, r.reference, r.amountIn || '', r.amountOut || '', r.balance, r.notes])])}><Download className="h-4 w-4 mr-1" />CSV</Button>}
          {can('cashbook', 2) && <Button onClick={() => setForm({ type: 'Out', date: d.today, category: 'Other' })}><Plus className="h-4 w-4 mr-1" />Add entry</Button>}
        </>} />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={month ? 'In this month' : 'Total in'} value={money(inSum)} tone="ok" />
        <Stat label={month ? 'Out this month' : 'Total out'} value={money(outSum)} tone="bad" />
        <Stat label="Cash balance now" value={money(balance)} tone={balance < 0 ? 'bad' : 'primary'} />
      </div>
      <div className="flex justify-end mb-3"><Select id="cb-month" aria-label="Month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} options={[{ value: '', label: 'All months' }, ...months.map((m) => ({ value: m, label: m }))]} /></div>
      {shown.length === 0 ? <Empty title="Nothing in the cash book yet" /> : (
        <div className="bg-card border rounded-md table-wrap">
          <table className="dt">
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Ref.</th><th className="r">In</th><th className="r">Out</th><th className="r">Balance</th><th /></tr></thead>
            <tbody>{shown.map((r: any) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateLabel(r.date)}</td><td>{r.description}{r.source === 'receipt' && <span className="ml-1.5 text-[10px] border rounded px-1 text-muted-foreground">auto</span>}</td><td className="text-[13px]">{r.category}</td><td className="text-[13px] text-muted-foreground">{r.reference}</td>
                <td className="r num text-ok">{r.amountIn ? money(r.amountIn) : ''}</td><td className="r num text-bad">{r.amountOut ? money(r.amountOut) : ''}</td><td className={cn('r num font-medium', r.balance < 0 && 'text-bad')}>{money(r.balance)}</td>
                <td className="whitespace-nowrap">{r.source !== 'receipt' && can('cashbook', 2) && <button className="text-[12px] text-primary underline" onClick={() => setForm({ ...r, amount: r.amountIn || r.amountOut })}>Edit</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? 'Edit entry' : 'Add cash book entry'}>
          <form className="grid sm:grid-cols-2 gap-3" onSubmit={async (e) => { e.preventDefault(); const r = await call('cashbook.save', form, { success: 'Saved' }); if (r) setForm(null); }}>
            <Field label="Money"><Select id="cb-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[{ value: 'Out', label: 'Out (expense / payment)' }, { value: 'In', label: 'In (other income)' }]} /></Field>
            <Field label="Amount (GHS)"><TextInput id="cb-amt" type="number" step="0.01" min={0.01} required className="num" value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
            <Field label="Description" className="sm:col-span-2"><TextInput id="cb-desc" required value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Category"><Select id="cb-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={CATS} /></Field>
            <Field label="Date"><TextInput id="cb-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Reference" className="sm:col-span-2"><TextInput id="cb-ref" value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            <div className="sm:col-span-2 flex justify-between gap-2">
              <div>{form.id && can('cashbook', 3) && <ConfirmButton confirmText="Delete entry" onConfirm={async () => { const r = await call('cashbook.delete', { id: form.id }, { success: 'Deleted' }); if (r) setForm(null); }}>Delete</ConfirmButton>}</div>
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button>Save</Button></div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Statements() {
  const { data, can } = useApp();
  const d = data!;
  const withActivity = d.customers.filter((c) => d.invoices.some((i) => i.customerName === c.name));
  const [cust, setCust] = useState<string>((withActivity[0] || d.customers[0])?.name || '');
  const [from, setFrom] = useState(d.today.slice(0, 4) + '-01-01');
  const [to, setTo] = useState(d.today);
  const [emailOpen, setEmailOpen] = useState(false);
  useSubRoute('statements', (s) => { const c = d.customers.find((x) => x.id === decodeURIComponent(s)); if (c) { setCust(c.name); setFrom(''); } });
  const st = useMemo(() => cust ? core.buildStatement(d, cust, from, to) : null, [d, cust, from, to]);
  const customer = d.customers.find((c) => c.name === cust);
  return (
    <div>
      <PageHeader title="Customer statements" sub="Opening balance, every invoice and payment in the period, and what is due now."
        actions={st && <>
          {CAN_PRINT && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>}
          {can('statements', 2) && <Button onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4 mr-1" />Email statement</Button>}
        </>} />
      <div className="grid sm:grid-cols-[2fr_1fr_1fr] gap-3 mb-4 max-w-3xl">
        <Field label="Customer"><Select id="st-cust" value={cust} onChange={(e) => setCust(e.target.value)} options={d.customers.map((c) => c.name)} /></Field>
        <Field label="From"><TextInput id="st-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput id="st-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {st && <Paper html={core.renderStatementHtml(st, d.company)} />}
      {st && <EmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} payload={{ docType: 'statement', customerName: cust, from, to_date: to }} defaultTo={customer?.email} title={`Email statement to ${cust}`} label="statement" />}
    </div>
  );
}

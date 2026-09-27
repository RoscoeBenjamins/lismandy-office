import { useMemo, useState } from 'react';
import { useApp, core, type Receipt } from '@/lib/store';
import { PageHeader, Pill, SearchBox, Modal, Field, TextInput, Select, ConfirmButton, Paper, CAN_PRINT, Empty } from '@/components/app/kit';
import { EmailDialog } from '@/components/app/EmailDialog';
import { Button } from '@/components/ui/button';
import { money, dateLabel, downloadCsv } from '@/lib/format';
import { useSubRoute } from '@/lib/nav';
import { Plus, Printer, Mail, Ban, Download, Check } from 'lucide-react';

const MODES = ['Cash', 'Momo', 'Transfer', 'Cheque'];

export default function Receipts() {
  const { data, can } = useApp();
  const d = data!;
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  useSubRoute('receipts', (sub) => {
    if (sub === 'new') setForm({});
    else if (sub.startsWith('inv')) { const n = Number(sub.slice(3)); const inv = d.invoices.find((i) => i.number === n); if (inv) setForm({ customerName: inv.customerName, invoiceNumber: n, amount: inv.balance }); }
    else if (d.receipts.some((r) => r.id === sub)) setViewId(sub);
  });
  const rows = useMemo(() => [...d.receipts].sort((a, b) => b.number - a.number).filter((r) => !q || String(r.number).includes(q) || r.customerName.toLowerCase().includes(q.toLowerCase())), [d.receipts, q]);
  const viewing = viewId ? d.receipts.find((r) => r.id === viewId) : null;
  if (viewing) return <ReceiptView r={viewing} onBack={() => setViewId(null)} />;
  const sum = rows.filter((r) => r.status !== 'void').reduce((a, r) => a + r.amount, 0);
  return (
    <div>
      <PageHeader title="Receipts" sub="Money received from customers. Each receipt is posted to the cash book automatically."
        actions={<>
          {CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv('receipts.csv', [['Number', 'Date', 'Customer', 'Invoice', 'Amount', 'Mode', 'Reference', 'Status'], ...rows.map((r) => [r.number, r.date, r.customerName, r.invoiceNumber, r.amount, r.mode, r.reference, r.status])])}><Download className="h-4 w-4 mr-1" />CSV</Button>}
          {can('receipts', 2) && <Button onClick={() => setForm({})}><Plus className="h-4 w-4 mr-1" />Record payment</Button>}
        </>} />
      <div className="flex justify-end mb-3"><SearchBox value={q} onChange={setQ} placeholder="Number or customer" /></div>
      {rows.length === 0 ? <Empty title="No receipts yet">Record a payment when a customer pays.</Empty> : (
        <div className="bg-card border rounded-md table-wrap">
          <table className="dt">
            <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>For invoice</th><th>Mode</th><th className="r">Amount (GHS)</th><th>Status</th><th>Emailed</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setViewId(r.id)}>
                <td className="num font-medium">{r.number}</td><td className="whitespace-nowrap">{dateLabel(r.date)}</td><td className="max-w-[220px] truncate">{r.customerName}</td>
                <td className="num">{r.invoiceNumber ? '#' + r.invoiceNumber : <span className="text-muted-foreground">on account</span>}</td><td>{r.mode}</td>
                <td className="r num">{money(r.amount)}</td><td><Pill>{r.status}</Pill></td><td>{r.emailedAt ? <Check className="h-4 w-4 text-ok" /> : <span className="text-muted-foreground">—</span>}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={5} className="text-[12px] text-muted-foreground">{rows.length} shown</td><td className="r num font-semibold">{money(sum)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}
      {form && <ReceiptForm init={form} onClose={() => setForm(null)} onSaved={(r) => { setForm(null); setViewId(r.id); }} />}
    </div>
  );
}

function ReceiptForm({ init, onClose, onSaved }: { init: any; onClose: () => void; onSaved: (r: Receipt) => void }) {
  const { data, call } = useApp();
  const d = data!;
  const [f, setF] = useState<any>({ date: d.today, mode: 'Momo', reference: '', paymentFor: '', notes: '', invoiceNumber: '', amount: '', customerName: '', ...init });
  const open = d.invoices.filter((i) => i.customerName === f.customerName && i.balance > 0 && i.status !== 'void');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title="Record a payment" description={`Receipt number is assigned on save (next: ${d.settings.nextReceiptNo}).`}>
      <form className="grid sm:grid-cols-2 gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await call('receipts.save', { ...f, amount: Number(f.amount), invoiceNumber: Number(f.invoiceNumber) || '' }, { success: 'Payment recorded' }); setBusy(false); if (r) onSaved(r); }}>
        <Field label="Received from" className="sm:col-span-2"><Select id="rc-customer" value={f.customerName} onChange={(e) => { set('customerName', e.target.value); set('invoiceNumber', ''); }} options={[{ value: '', label: 'Choose a customer…' }, ...d.customers.map((c) => ({ value: c.name, label: c.name }))]} required /></Field>
        <Field label="Against invoice" className="sm:col-span-2" hint={open.length ? 'Leave as “On account” to apply it to the oldest unpaid invoices.' : f.customerName ? 'This customer has no unpaid invoices.' : ''}>
          <Select id="rc-invoice" value={String(f.invoiceNumber)} onChange={(e) => { const n = Number(e.target.value); set('invoiceNumber', n || ''); const inv = open.find((i) => i.number === n); if (inv) set('amount', inv.balance); }} options={[{ value: '', label: 'On account' }, ...open.map((i) => ({ value: String(i.number), label: `#${i.number} · ${dateLabel(i.date)} · owes GHS ${money(i.balance)}` }))]} />
        </Field>
        <Field label="Amount (GHS)"><TextInput id="rc-amount" type="number" min={0.01} step="0.01" className="num" value={f.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
        <Field label="Date"><TextInput id="rc-date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Mode of payment"><Select id="rc-mode" value={f.mode} onChange={(e) => set('mode', e.target.value)} options={MODES} /></Field>
        <Field label="Reference" hint="Momo ID, cheque no., bank ref"><TextInput id="rc-ref" value={f.reference} onChange={(e) => set('reference', e.target.value)} /></Field>
        <Field label="Payment for" className="sm:col-span-2"><TextInput id="rc-for" value={f.paymentFor} onChange={(e) => set('paymentFor', e.target.value)} placeholder={f.invoiceNumber ? `Invoice #${f.invoiceNumber}` : 'Account payment'} /></Field>
        <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !f.customerName}>{busy ? 'Saving…' : 'Save receipt'}</Button></div>
      </form>
    </Modal>
  );
}

function ReceiptView({ r, onBack }: { r: Receipt; onBack: () => void }) {
  const { data, can, call, user } = useApp();
  const d = data!;
  const [emailOpen, setEmailOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cust = d.customers.find((c) => c.name === r.customerName);
  const balance = d.invoices.filter((i) => i.customerName === r.customerName).reduce((a, i) => a + i.balance, 0);
  const html = core.renderReceiptHtml(r, d.company, { balance, receivedBy: user?.name });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <button onClick={onBack} className="text-[13px] text-primary underline">← All receipts</button>
        <div className="flex flex-wrap gap-2">
          {CAN_PRINT && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>}
          {can('receipts', 2) && r.status !== 'void' && <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4 mr-1" />Email</Button>}
        </div>
      </div>
      <div className="grid xl:grid-cols-[1fr_280px] gap-4 items-start">
        <Paper html={html} />
        {can('receipts', 3) && r.status !== 'void' && (
          <aside className="bg-card border rounded-md p-3 space-y-2 text-[13px]">
            <div className="eyebrow">Void this receipt</div>
            <p className="text-muted-foreground">Removes it from the cash book and puts the amount back on the customer’s balance.</p>
            <TextInput id="rv-reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <ConfirmButton confirmText="Yes, void it" disabled={!reason} onConfirm={() => call('receipts.void', { id: r.id, reason }, { success: `Receipt #${r.number} voided` })}><Ban className="h-4 w-4 mr-1" />Void</ConfirmButton>
          </aside>
        )}
      </div>
      <EmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} payload={{ docType: 'receipt', id: r.id }} defaultTo={cust?.email} title={`Email receipt #${r.number}`} label="receipt" />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useApp, core, type Invoice, type Proforma, type Item } from '@/lib/store';
import { PageHeader, Pill, SearchBox, Modal, Field, TextInput, Select, ConfirmButton, Paper, CAN_PRINT, Empty } from '@/components/app/kit';
import { EmailDialog } from '@/components/app/EmailDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { money, dateLabel, downloadCsv } from '@/lib/format';
import { navigate, useSubRoute } from '@/lib/nav';
import { Plus, Trash2, Printer, Mail, Pencil, ArrowRightLeft, Ban, Wallet, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kind = 'invoice' | 'proforma';
type Doc = Invoice | Proforma;

export function Invoices() { return <DocPage kind="invoice" />; }
export function Proformas() { return <DocPage kind="proforma" />; }

function DocPage({ kind }: { kind: Kind }) {
  const { data, can } = useApp();
  const mod = kind === 'invoice' ? 'invoices' : 'proformas';
  const docs: Doc[] = (kind === 'invoice' ? data!.invoices : data!.proformas) as Doc[];
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [editing, setEditing] = useState<Partial<Doc> | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  useSubRoute(mod, (sub) => { if (sub === 'new') setEditing({}); else if (docs.some((x) => x.id === sub)) setViewId(sub); });

  const tabs = kind === 'invoice' ? ['all', 'Unpaid', 'Partial', 'Overdue', 'Paid', 'Void'] : ['all', 'open', 'converted', 'void'];
  const rows = useMemo(() => {
    const k = q.toLowerCase();
    return [...docs].sort((a, b) => b.number - a.number).filter((d: any) => {
      if (k && !(String(d.number).includes(k) || d.customerName.toLowerCase().includes(k))) return false;
      if (tab === 'all') return true;
      if (kind === 'proforma') return d.status === tab;
      if (tab === 'Overdue') return d.daysOverdue > 0;
      return d.payStatus === tab;
    });
  }, [docs, q, tab, kind]);
  const viewing = viewId ? docs.find((d) => d.id === viewId) : null;
  const totals = rows.reduce((a: any, d: any) => ({ total: a.total + (d.status === 'void' ? 0 : d.total), balance: a.balance + (d.balance || 0) }), { total: 0, balance: 0 });

  if (viewing) return <DocView kind={kind} doc={viewing} onBack={() => setViewId(null)} onEdit={() => setEditing(viewing)} editing={editing} setEditing={setEditing} onSaved={(d) => { setEditing(null); setViewId(d.id); }} />;

  return (
    <div>
      <PageHeader title={kind === 'invoice' ? 'Invoices' : 'Proforma invoices'} sub={kind === 'invoice' ? 'Every invoice, what has been paid against it and what is still owed.' : 'Quotations for customers. Convert one to an invoice when the order is confirmed.'}
        actions={<>
          {CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv(`${mod}.csv`, [['Number', 'Date', 'Customer', 'VAT', 'Subtotal', 'VAT amount', 'Total', 'Status'], ...rows.map((d: any) => [d.number, d.date, d.customerName, d.vat ? 'Yes' : 'No', d.subtotal, d.vatAmount, d.total, d.payStatus || d.status])])}><Download className="h-4 w-4 mr-1" />CSV</Button>}
          {can(mod, 2) && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />New {kind}</Button>}
        </>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('px-3 py-1.5 rounded-md text-[13px] capitalize border', tab === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}>{t === 'all' ? 'All' : t}</button>)}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Number or customer" />
      </div>
      {rows.length === 0 ? <Empty title={`No ${kind}s here`}>{can(mod, 2) ? `Create one with “New ${kind}”.` : ''}</Empty> : (
        <div className="bg-card border rounded-md table-wrap">
          <table className="dt">
            <thead><tr><th>#</th><th>Date</th><th>Customer</th><th className="r">Total (GHS)</th>{kind === 'invoice' ? <><th className="r">Paid</th><th className="r">Balance</th><th>Due</th></> : <th>Valid until</th>}<th>Status</th><th>Emailed</th></tr></thead>
            <tbody>
              {rows.map((d: any) => (
                <tr key={d.id} className="clickable" onClick={() => setViewId(d.id)}>
                  <td className="num font-medium">{d.number}</td>
                  <td className="whitespace-nowrap">{dateLabel(d.date)}</td>
                  <td className="max-w-[240px] truncate">{d.customerName}{d.vat && <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground border rounded px-1">VAT</span>}</td>
                  <td className="r num">{money(d.total)}</td>
                  {kind === 'invoice' ? <><td className="r num text-muted-foreground">{money(d.paid)}</td><td className={cn('r num', d.balance > 0 && 'font-semibold')}>{money(d.balance)}</td><td className="whitespace-nowrap">{dateLabel(d.dueDate)}</td></> : <td className="whitespace-nowrap">{dateLabel(d.validUntil)}</td>}
                  <td>{kind === 'invoice' ? <Pill tone={d.daysOverdue > 0 ? 'Overdue' : d.payStatus}>{d.daysOverdue > 0 ? `Overdue ${d.daysOverdue}d` : d.payStatus}</Pill> : <Pill>{d.status}{d.convertedInvoice ? ` → #${d.convertedInvoice}` : ''}</Pill>}</td>
                  <td>{d.emailedAt ? <Check className="h-4 w-4 text-ok" aria-label="Emailed" /> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="text-muted-foreground text-[12px]">{rows.length} shown</td><td className="r num font-semibold">{money(totals.total)}</td>{kind === 'invoice' && <><td /><td className="r num font-semibold">{money(totals.balance)}</td><td /></>}<td colSpan={kind === 'invoice' ? 2 : 3} /></tr></tfoot>
          </table>
        </div>
      )}
      {editing && <DocEditor kind={kind} doc={editing} onClose={() => setEditing(null)} onSaved={(d) => { setEditing(null); setViewId(d.id); }} />}
    </div>
  );
}

function DocView({ kind, doc, onBack, onEdit, editing, setEditing, onSaved }: { kind: Kind; doc: any; onBack: () => void; onEdit: () => void; editing: any; setEditing: (x: any) => void; onSaved: (d: any) => void }) {
  const { data, can, call } = useApp();
  const [emailOpen, setEmailOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const mod = kind === 'invoice' ? 'invoices' : 'proformas';
  const cust = data!.customers.find((c) => c.name === doc.customerName);
  const html = core.renderInvoiceHtml(doc, data!.company, kind, { customer: cust, paid: doc.paid, balance: doc.balance });
  const locked = doc.status === 'void' || doc.status === 'converted';
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <button onClick={onBack} className="text-[13px] text-primary underline">← All {kind}s</button>
        <div className="flex flex-wrap gap-2">
          {CAN_PRINT && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>}
          {can(mod, 2) && !locked && <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4 mr-1" />Email</Button>}
          {can(mod, 2) && !locked && <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4 mr-1" />Edit</Button>}
          {kind === 'invoice' && can('receipts', 2) && doc.balance > 0 && doc.status !== 'void' && <Button size="sm" onClick={() => navigate('receipts.inv' + doc.number)}><Wallet className="h-4 w-4 mr-1" />Record payment</Button>}
          {kind === 'proforma' && doc.status === 'open' && can('invoices', 2) && <Button size="sm" onClick={async () => { const inv = await call('proformas.convert', { id: doc.id }, { success: 'Converted to an invoice' }); if (inv) navigate('invoices.' + inv.id); }}><ArrowRightLeft className="h-4 w-4 mr-1" />Convert to invoice</Button>}
        </div>
      </div>
      <div className="grid xl:grid-cols-[1fr_280px] gap-4 items-start">
        <Paper html={html} />
        <aside className="space-y-3 text-[13px]">
          <div className="bg-card border rounded-md p-3 space-y-1.5">
            <div className="eyebrow">Status</div>
            <div>{kind === 'invoice' ? <Pill tone={doc.daysOverdue > 0 ? 'Overdue' : doc.payStatus}>{doc.daysOverdue > 0 ? `Overdue ${doc.daysOverdue} days` : doc.payStatus}</Pill> : <Pill>{doc.status}</Pill>}</div>
            {kind === 'invoice' && doc.status !== 'void' && <div className="num">Paid {money(doc.paid)} · Owes {money(doc.balance)}</div>}
            {doc.fromProforma ? <div>From proforma #{doc.fromProforma}</div> : null}
            <div className="text-muted-foreground">Created by {doc.createdBy}</div>
            <div className="text-muted-foreground">{doc.emailedAt ? `Emailed ${dateLabel(doc.emailedAt)}` : 'Not emailed yet'}</div>
          </div>
          {can(mod, 3) && !locked && (
            <div className="bg-card border rounded-md p-3 space-y-2">
              <div className="eyebrow">Void this {kind}</div>
              <TextInput id="void-reason" placeholder="Reason (e.g. wrong customer)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
              <ConfirmButton confirmText="Yes, void it" disabled={!voidReason} onConfirm={async () => { await call(mod + '.void', { id: doc.id, reason: voidReason }, { success: `${kind === 'invoice' ? 'Invoice' : 'Proforma'} #${doc.number} voided` }); }}><Ban className="h-4 w-4 mr-1" />Void</ConfirmButton>
            </div>
          )}
        </aside>
      </div>
      <EmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} payload={{ docType: kind, id: doc.id }} defaultTo={cust?.email} title={`Email ${kind} #${doc.number}`} label={kind} />
      {editing && <DocEditor kind={kind} doc={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}

const blank = (): Item => ({ code: '', description: '', qty: 0, price: 0, discount: 0 });

function DocEditor({ kind, doc, onClose, onSaved }: { kind: Kind; doc: any; onClose: () => void; onSaved: (d: any) => void }) {
  const { data, call } = useApp();
  const d = data!;
  const isNew = !doc.id;
  const [customer, setCustomer] = useState<string>(doc.customerName || '');
  const [date, setDate] = useState<string>(doc.date || d.today);
  const [due, setDue] = useState<string>(kind === 'invoice' ? doc.dueDate || '' : doc.validUntil || '');
  const [vat, setVat] = useState<boolean>(!!doc.vat);
  const [notes, setNotes] = useState<string>(doc.notes || '');
  const [items, setItems] = useState<Item[]>(doc.items?.length ? doc.items.map((i: Item) => ({ ...i })) : [blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const threshold = Number(d.settings.bulkQtyThreshold) || 200;
  const products = d.products.filter((p) => p.active !== false);
  const byLabel = useMemo(() => { const m: Record<string, any> = {}; products.forEach((p) => { m[p.name.toLowerCase()] = p; m[(p.code + ' · ' + p.name).toLowerCase()] = p; }); return m; }, [products]);

  const pickCustomer = (name: string) => { setCustomer(name); const c = d.customers.find((x) => x.name === name); if (c && isNew) setVat(!!c.vatDefault); };
  const setItem = (i: number, patch: Partial<Item>) => setItems((arr) => arr.map((it, k) => {
    if (k !== i) return it;
    const n = { ...it, ...patch };
    if (patch.description !== undefined) { const p = byLabel[String(patch.description).toLowerCase()]; if (p) { n.description = p.name; n.code = p.code; n.price = n.qty >= threshold && p.price200 ? p.price200 : p.price; } }
    if (patch.qty !== undefined) { const p = products.find((x) => x.code === n.code); if (p && p.price200) n.price = n.qty >= threshold ? p.price200 : p.price; }
    return n;
  }));
  const totals = useMemo(() => { try { return core.docTotals(items.filter((i) => i.description || i.qty), vat, d.settings.vatRate); } catch { return null; } }, [items, vat, d.settings.vatRate]);
  const lineAmount = (it: Item) => core.round2((Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discount) || 0)));

  async function save() {
    setBusy(true);
    const payload: any = { id: doc.id, customerName: customer, date, vat, notes, items: items.filter((i) => i.description || i.qty) };
    if (due) payload[kind === 'invoice' ? 'dueDate' : 'validUntil'] = due;
    const r = await call(kind === 'invoice' ? 'invoices.save' : 'proformas.save', payload, { success: isNew ? `${kind === 'invoice' ? 'Invoice' : 'Proforma'} created` : 'Saved' });
    setBusy(false);
    if (r) onSaved(r);
  }

  return (
    <Modal open onClose={onClose} wide title={isNew ? `New ${kind}` : `Edit ${kind} #${doc.number}`} description={isNew ? `The number is assigned when you save (next: ${kind === 'invoice' ? d.settings.nextInvoiceNo : d.settings.nextProformaNo}).` : undefined}>
      <datalist id="product-list">{products.map((p) => <option key={p.id} value={p.name}>{p.code} · GHS {money(p.price)}</option>)}</datalist>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Bill to" className="sm:col-span-2">
          <Select id="doc-customer" value={customer} onChange={(e) => pickCustomer(e.target.value)} options={[{ value: '', label: 'Choose a customer…' }, ...d.customers.map((c) => ({ value: c.name, label: c.name }))]} />
        </Field>
        <Field label="Date"><TextInput id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={kind === 'invoice' ? 'Due date' : 'Valid until'} hint={due ? '' : kind === 'invoice' ? `Default: ${d.settings.paymentTermsDays} days` : `Default: ${d.settings.proformaValidDays || 14} days`}><TextInput id="doc-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Switch id="doc-vat" checked={vat} onCheckedChange={setVat} /><label htmlFor="doc-vat" className="text-[13px]">Add VAT ({Math.round(d.settings.vatRate * 1000) / 10}%)</label>
        <span className="text-[12px] text-muted-foreground ml-2">Orders of {threshold}+ cartons use the bulk price where one is set.</span>
      </div>
      <div className="table-wrap border rounded-md mt-2">
        <table className="dt min-w-[680px]">
          <thead><tr><th className="w-[90px]">Code</th><th>Description</th><th className="r w-[80px]">Qty (ctn)</th><th className="r w-[110px]">Ctn price</th><th className="r w-[80px]">Disc %</th><th className="r w-[110px]">Amount</th><th className="w-[36px]" /></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="num text-[12px] text-muted-foreground">{it.code || '—'}</td>
                <td><input list="product-list" aria-label={`Line ${i + 1} description`} className="w-full bg-transparent outline-none border-b border-transparent focus:border-ring py-1" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Type to search products" /></td>
                <td className="r"><input type="number" min={0} aria-label={`Line ${i + 1} quantity`} className="w-full text-right bg-transparent outline-none num py-1" value={it.qty || ''} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></td>
                <td className="r"><input type="number" min={0} step="0.01" aria-label={`Line ${i + 1} price`} className="w-full text-right bg-transparent outline-none num py-1" value={it.price || ''} onChange={(e) => setItem(i, { price: Number(e.target.value) })} /></td>
                <td className="r"><input type="number" min={0} max={99} aria-label={`Line ${i + 1} discount`} className="w-full text-right bg-transparent outline-none num py-1" value={it.discount ? Math.round(it.discount * 1000) / 10 : ''} onChange={(e) => setItem(i, { discount: Number(e.target.value) / 100 })} /></td>
                <td className="r num">{money(lineAmount(it))}</td>
                <td><button aria-label="Remove line" className="text-muted-foreground hover:text-bad" onClick={() => setItems((a) => a.length > 1 ? a.filter((_, k) => k !== i) : [blank()])}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setItems((a) => [...a, blank()])}><Plus className="h-4 w-4 mr-1" />Add line</Button>
      <div className="grid sm:grid-cols-[1fr_260px] gap-4 items-start">
        <Field label="Notes"><Textarea id="doc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery details, PO number…" /></Field>
        <div className="text-[13px] space-y-1 bg-muted rounded-md p-3 num">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(totals?.subtotal || 0)}</span></div>
          <div className="flex justify-between"><span>VAT</span><span>{money(totals?.vatAmount || 0)}</span></div>
          <div className="flex justify-between font-semibold text-[16px] border-t pt-1 mt-1"><span>Total GHS</span><span>{money(totals?.total || 0)}</span></div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy || !customer}>{busy ? 'Saving…' : isNew ? `Create ${kind}` : 'Save changes'}</Button>
      </div>
    </Modal>
  );
}

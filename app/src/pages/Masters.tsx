import { useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import { PageHeader, SearchBox, Modal, Field, TextInput, Select, ConfirmButton, Empty, Pill, CAN_PRINT } from '@/components/app/kit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { money, downloadCsv } from '@/lib/format';
import { navigate, useSubRoute } from '@/lib/nav';
import { Plus, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

type FieldDef = { k: string; label: string; type?: 'text' | 'number' | 'email' | 'bool' | 'textarea' | 'select'; options?: string[]; span?: boolean; hint?: string; required?: boolean };

function RecordForm({ title, fields, init, action, onClose, deleteAction, module }: { title: string; fields: FieldDef[]; init: any; action: string; onClose: () => void; deleteAction?: string; module: string }) {
  const { call, can } = useApp();
  const [f, setF] = useState<any>({ ...init });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title={title}>
      <form className="grid sm:grid-cols-2 gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await call(action, f, { success: 'Saved' }); setBusy(false); if (r) onClose(); }}>
        {fields.map((fd) => (
          <Field key={fd.k} label={fd.label} hint={fd.hint} className={fd.span || fd.type === 'textarea' ? 'sm:col-span-2' : ''}>
            {fd.type === 'bool' ? <div className="h-9 flex items-center"><Switch id={'f-' + fd.k} checked={!!f[fd.k]} onCheckedChange={(v) => set(fd.k, v)} /></div>
              : fd.type === 'textarea' ? <Textarea id={'f-' + fd.k} rows={2} value={f[fd.k] || ''} onChange={(e) => set(fd.k, e.target.value)} />
              : fd.type === 'select' ? <Select id={'f-' + fd.k} value={f[fd.k] || ''} onChange={(e) => set(fd.k, e.target.value)} options={['', ...fd.options!].map((o) => ({ value: o, label: o || '—' }))} />
              : <TextInput id={'f-' + fd.k} type={fd.type || 'text'} step={fd.type === 'number' ? 'any' : undefined} className={fd.type === 'number' ? 'num' : ''} required={fd.required} value={f[fd.k] ?? ''} onChange={(e) => set(fd.k, fd.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />}
          </Field>
        ))}
        <div className="sm:col-span-2 flex flex-wrap justify-between gap-2 pt-1">
          <div>{init.id && deleteAction && can(module, 3) && <ConfirmButton confirmText="Delete for good" onConfirm={async () => { const r = await call(deleteAction, { id: init.id }, { success: 'Deleted' }); if (r) onClose(); }}>Delete</ConfirmButton>}</div>
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
        </div>
      </form>
    </Modal>
  );
}

const SEGMENTS = ['Open Market', 'Modern Trade', 'Wholesale', 'Retail', 'Institution', 'Other'];
export function Customers() {
  const { data, can } = useApp();
  const d = data!;
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  useSubRoute('customers', (s) => { const c = d.customers.find((x) => x.id === s); if (c) setEdit(c); });
  const stats = useMemo(() => {
    const m: Record<string, { sales: number; balance: number; last: string }> = {};
    d.invoices.filter((i) => i.status !== 'void').forEach((i) => { const k = i.customerName; m[k] = m[k] || { sales: 0, balance: 0, last: '' }; m[k].sales += i.total; m[k].balance += i.balance; if (i.date > m[k].last) m[k].last = i.date; });
    return m;
  }, [d.invoices]);
  const rows = d.customers.filter((c) => !q || (c.name + c.phone + c.email + c.segment).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <PageHeader title="Customers" sub={`${d.customers.length} customers. Segment and VAT default are applied automatically on new invoices.`}
        actions={<>
          {CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv('customers.csv', [['Name', 'Segment', 'VAT default', 'Email', 'Phone', 'Address', 'Contact', 'Sales', 'Balance'], ...rows.map((c) => [c.name, c.segment, c.vatDefault ? 'Yes' : 'No', c.email, c.phone, c.address, c.contactPerson, stats[c.name]?.sales || 0, stats[c.name]?.balance || 0])])}><Download className="h-4 w-4 mr-1" />CSV</Button>}
          {can('customers', 2) && <Button onClick={() => setEdit({ segment: 'Open Market', vatDefault: false })}><Plus className="h-4 w-4 mr-1" />Add customer</Button>}
        </>} />
      <div className="flex justify-end mb-3"><SearchBox value={q} onChange={setQ} placeholder="Name, phone, email" /></div>
      {rows.length === 0 ? <Empty title="No customers match" /> : (
        <div className="bg-card border rounded-md table-wrap">
          <table className="dt">
            <thead><tr><th>Customer</th><th>Segment</th><th>VAT</th><th>Phone</th><th>Email</th><th className="r">Sales (GHS)</th><th className="r">Owes (GHS)</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} className={can('customers', 2) ? 'clickable' : ''} onClick={() => can('customers', 2) && setEdit(c)}>
                <td className="font-medium">{c.name}</td><td>{c.segment}</td><td>{c.vatDefault ? 'Yes' : 'No'}</td>
                <td className="num text-[13px]">{c.phone || <span className="text-warn">missing</span>}</td>
                <td className="text-[13px] max-w-[200px] truncate">{c.email || <span className="text-warn">missing</span>}</td>
                <td className="r num">{money(stats[c.name]?.sales || 0)}</td>
                <td className={cn('r num', (stats[c.name]?.balance || 0) > 0 && 'text-bad font-medium')}>{money(stats[c.name]?.balance || 0)}</td>
                <td>{can('statements') && <button className="text-[12px] text-primary underline" onClick={(e) => { e.stopPropagation(); navigate('statements.' + encodeURIComponent(c.id)); }}>Statement</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {edit && <RecordForm module="customers" title={edit.id ? edit.name : 'Add customer'} init={edit} action="customers.save" deleteAction="customers.delete" onClose={() => setEdit(null)} fields={[
        { k: 'name', label: 'Customer name', span: true, required: true }, { k: 'segment', label: 'Segment', type: 'select', options: SEGMENTS }, { k: 'vatDefault', label: 'Charge VAT by default', type: 'bool' },
        { k: 'phone', label: 'Phone / WhatsApp' }, { k: 'email', label: 'Email (for invoices)', type: 'email' }, { k: 'contactPerson', label: 'Contact person' }, { k: 'address', label: 'Address / location' }, { k: 'notes', label: 'Notes', type: 'textarea' }]} />}
    </div>
  );
}

export function Products() {
  const { data, can } = useApp();
  const d = data!;
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('All');
  const [edit, setEdit] = useState<any>(null);
  const sources = ['All', ...Array.from(new Set(d.products.map((p) => p.source)))];
  const showCost = d.products.some((p) => 'costPrice' in p);
  const vr = Number(d.settings.vatRate) || 0;
  const rows = d.products.filter((p) => (src === 'All' || p.source === src) && (!q || (p.code + p.name).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader title="Products & prices" sub={<>The master list behind every invoice line. Carton prices exclude VAT ({Math.round(vr * 1000) / 10}%). Bulk price applies at {d.settings.bulkQtyThreshold}+ cartons.</>}
        actions={<>
          {CAN_PRINT && <Button variant="outline" onClick={() => downloadCsv('price-list.csv', [['Code', 'Product', 'Source', 'Pack', 'Units/ctn', 'Cost', 'Ctn price excl VAT', 'Ctn price incl VAT', 'Bulk price', 'Unit price'], ...rows.map((p) => [p.code, p.name, p.source, p.packLabel || p.packaging, p.unitsPerCtn, p.costPrice ?? '', p.price, core2(p.price * (1 + vr)), p.price200 || '', p.unitsPerCtn ? core2(p.price / p.unitsPerCtn) : ''])])}><Download className="h-4 w-4 mr-1" />Price list CSV</Button>}
          {can('products', 2) && <Button onClick={() => setEdit({ source: 'Lismandy', active: true })}><Plus className="h-4 w-4 mr-1" />Add product</Button>}
        </>} />
      <div className="flex flex-wrap justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-1">{sources.map((s) => <button key={s} onClick={() => setSrc(s)} className={cn('px-3 py-1.5 rounded-md text-[13px] border', src === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}>{s}</button>)}</div>
        <SearchBox value={q} onChange={setQ} placeholder="Code or product" />
      </div>
      <div className="bg-card border rounded-md table-wrap">
        <table className="dt">
          <thead><tr><th>Code</th><th>Product</th><th>Source</th><th>Pack</th><th className="r">Units/ctn</th>{showCost && <th className="r">Cost</th>}<th className="r">Ctn price</th><th className="r">Incl. VAT</th><th className="r">Bulk</th>{showCost && <th className="r">Margin</th>}<th /></tr></thead>
          <tbody>{rows.map((p) => {
            const margin = p.costPrice ? (p.price - p.costPrice) / p.price : null;
            return (
              <tr key={p.id} className={cn(can('products', 2) && 'clickable', p.active === false && 'opacity-50')} onClick={() => can('products', 2) && setEdit(p)}>
                <td className="num text-[12px]">{p.code}</td><td className="font-medium">{p.name}{p.type && <span className="ml-1.5 text-[11px] text-muted-foreground">{p.type}</span>}</td><td>{p.source}</td>
                <td className="num text-[12px]">{p.packLabel || p.packaging}</td><td className="r num">{p.unitsPerCtn || ''}</td>
                {showCost && <td className="r num">{p.costPrice ? money(p.costPrice) : <span className="text-warn text-[12px]">not set</span>}</td>}
                <td className="r num font-medium">{money(p.price)}</td><td className="r num text-muted-foreground">{money(p.price * (1 + vr))}</td>
                <td className="r num">{p.price200 ? money(p.price200) : ''}</td>
                {showCost && <td className="r">{margin === null ? '' : <Pill tone={margin < 0.05 ? 'high' : margin < 0.12 ? 'medium' : 'Paid'}>{Math.round(margin * 100)}%</Pill>}</td>}
                <td>{p.active === false && <Pill>inactive</Pill>}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {edit && <RecordForm module="products" title={edit.id ? `${edit.code} · ${edit.name}` : 'Add product'} init={edit} action="products.save" deleteAction="products.delete" onClose={() => setEdit(null)} fields={[
        { k: 'name', label: 'Product name', span: true, required: true }, { k: 'code', label: 'Code', hint: edit.id ? '' : 'Leave blank to generate' }, { k: 'source', label: 'Source / brand', type: 'select', options: ['Lismandy', 'Nkulenu', 'Nkatie Burger', 'Ekumfi', 'Other'] },
        { k: 'type', label: 'Type / variant' }, { k: 'packLabel', label: 'Pack (e.g. 1*12)' }, { k: 'unitsPerCtn', label: 'Units per carton', type: 'number' },
        { k: 'costPrice', label: 'Cost price per carton (GHS)', type: 'number' }, { k: 'price', label: 'Selling price per carton, excl. VAT', type: 'number', required: true },
        { k: 'price200', label: `Bulk price (${d.settings.bulkQtyThreshold}+ cartons)`, type: 'number', hint: 'Optional' }, { k: 'active', label: 'Available for new invoices', type: 'bool' }]} />}
    </div>
  );
}
const core2 = (n: number) => Math.round(n * 100) / 100;

export function Suppliers() {
  const { data, can } = useApp();
  const d = data!;
  const [edit, setEdit] = useState<any>(null);
  const productCount = (name: string) => d.products.filter((p) => p.source.toLowerCase().startsWith(name.toLowerCase().split(' ')[0])).length;
  return (
    <div>
      <PageHeader title="Suppliers" sub="Who Lismandy buys from." actions={can('suppliers', 2) && <Button onClick={() => setEdit({})}><Plus className="h-4 w-4 mr-1" />Add supplier</Button>} />
      <div className="bg-card border rounded-md table-wrap">
        <table className="dt">
          <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th className="r">Products</th><th>Notes</th></tr></thead>
          <tbody>{d.suppliers.map((s) => (
            <tr key={s.id} className={can('suppliers', 2) ? 'clickable' : ''} onClick={() => can('suppliers', 2) && setEdit(s)}>
              <td className="font-medium">{s.name}</td><td>{s.contact}</td><td className="num text-[13px]">{s.phone}</td><td className="text-[13px]">{s.email}</td><td className="r num">{productCount(s.name) || ''}</td><td className="text-[13px] text-muted-foreground max-w-[360px]">{s.notes}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {edit && <RecordForm module="suppliers" title={edit.id ? edit.name : 'Add supplier'} init={edit} action="suppliers.save" deleteAction="suppliers.delete" onClose={() => setEdit(null)} fields={[
        { k: 'name', label: 'Supplier name', span: true, required: true }, { k: 'contact', label: 'Contact person' }, { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email', type: 'email', span: true }, { k: 'notes', label: 'Notes', type: 'textarea' }]} />}
    </div>
  );
}

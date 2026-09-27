import { useEffect, useState } from 'react';
import { useApp, core, type User } from '@/lib/store';
import { PageHeader, Modal, Field, TextInput, Select, ConfirmButton, Pill, Section } from '@/components/app/kit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api, IS_DEMO } from '@/lib/api';
import { dateLabel } from '@/lib/format';
import { UserPlus, KeyRound, Smartphone, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const LEVELS = [{ value: '0', label: 'No access' }, { value: '1', label: 'View' }, { value: '2', label: 'Create & edit' }, { value: '3', label: 'Full (void/delete)' }];

export default function Admin() {
  return (
    <div>
      <PageHeader title="Admin portal" sub="Create staff accounts, decide what each person can see and do, and manage system settings." />
      <Tabs defaultValue="users">
        <TabsList className="mb-4"><TabsTrigger value="users">Users & access</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger><TabsTrigger value="audit">Activity log</TabsTrigger><TabsTrigger value="emails">Email log</TabsTrigger></TabsList>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="settings"><Settings /></TabsContent>
        <TabsContent value="audit"><Log action="admin.audit" cols={[['at', 'When'], ['user', 'Who'], ['action', 'Action'], ['entity', 'Area'], ['details', 'Details']]} /></TabsContent>
        <TabsContent value="emails"><Log action="admin.emails" cols={[['at', 'When'], ['user', 'Sent by'], ['docType', 'Document'], ['docNumber', 'No.'], ['to', 'To'], ['status', 'Status'], ['error', 'Error']]} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Secret({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border border-ok/40 bg-ok/10 rounded-md p-3 text-[13px] space-y-1.5">
      <div className="font-semibold">{label}</div>
      <div className="num text-[18px] select-all flex items-center gap-2">{value}<button aria-label="Copy" onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Copied')).catch(() => {})}><Copy className="h-4 w-4" /></button></div>
      <div className="text-muted-foreground">{note}</div>
    </div>
  );
}

function Users() {
  const { user: me, call } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [secret, setSecret] = useState<{ email: string; pw: string } | null>(null);
  const load = async () => { const r = await api<User[]>('admin.users'); if (r.ok) setUsers(r.data!); else toast.error(r.error); };
  useEffect(() => { load(); }, []);
  const act = async (action: string, payload: any, success: string) => { const r = await call(action, payload, { success, refresh: false }); await load(); return r; };
  return (
    <div className="space-y-4">
      {secret && <Secret label={`Temporary password for ${secret.email}`} value={secret.pw} note="Give this to the person privately (in person or by phone). They must change it at first sign-in and then link Google or Microsoft Authenticator. It is not shown again." />}
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-[13px] text-muted-foreground max-w-2xl">Roles give sensible defaults; you can raise or lower any area per person. Everyone signs in with a password plus a 6-digit code from Google Authenticator or Microsoft Authenticator.</p>
        <Button onClick={() => { setSecret(null); setEdit({ role: 'sales', permissions: {} }); }}><UserPlus className="h-4 w-4 mr-1" />Add user</Button>
      </div>
      <div className="bg-card border rounded-md table-wrap">
        <table className="dt">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Authenticator</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.name}{u.id === me?.id && <span className="text-[11px] text-muted-foreground ml-1">(you)</span>}</td>
              <td className="text-[13px]">{u.email}</td><td>{core.ROLES[u.role]?.label || u.role}</td>
              <td>{u.mfaEnabled ? <Pill tone="Paid">linked</Pill> : <Pill tone="medium">not yet</Pill>}</td>
              <td className="text-[13px] whitespace-nowrap">{u.lastLoginAt ? dateLabel(u.lastLoginAt) : <span className="text-muted-foreground">never</span>}</td>
              <td>{!u.active ? <Pill tone="Void">disabled</Pill> : u.lockedUntil && u.lockedUntil > new Date().toISOString() ? <Pill tone="high">locked</Pill> : u.mustChangePassword ? <Pill tone="low">invited</Pill> : <Pill tone="Paid">active</Pill>}</td>
              <td className="whitespace-nowrap"><button className="text-[12px] text-primary underline" onClick={() => { setSecret(null); setEdit(u); }}>Manage</button></td>
            </tr>))}</tbody>
        </table>
      </div>
      {edit && <UserForm u={edit} me={me!} onClose={() => setEdit(null)} onDone={async (r: any, email: string) => { setEdit(null); if (r?.tempPassword) setSecret({ email, pw: r.tempPassword }); await load(); }} act={act} />}
    </div>
  );
}

function UserForm({ u, me, onClose, onDone, act }: { u: any; me: User; onClose: () => void; onDone: (r: any, email: string) => void; act: (a: string, p: any, s: string) => Promise<any> }) {
  const [f, setF] = useState<any>({ email: u.email || '', name: u.name || '', role: u.role || 'sales', active: u.active !== false, permissions: { ...(u.permissions || {}) } });
  const base = core.ROLES[f.role]?.perms || {};
  const eff = (m: string) => f.permissions[m] !== undefined && f.permissions[m] !== '' ? Number(f.permissions[m]) : base[m];
  return (
    <Modal open onClose={onClose} wide title={u.id ? `Manage ${u.name}` : 'Add a user'} description={u.id ? u.email : 'They get a temporary password; at first sign-in they choose their own and link an authenticator app.'}>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await act('admin.saveUser', { id: u.id, ...f }, u.id ? 'User updated' : 'User created'); if (r) onDone(r, f.email); }}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Full name"><TextInput id="u-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email (sign-in)"><TextInput id="u-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role"><Select id="u-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, permissions: {} })} options={Object.entries(core.ROLES).map(([k, v]: any) => ({ value: k, label: v.label }))} /></Field>
        </div>
        <div>
          <div className="eyebrow mb-2">Access by area</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {core.MODULES.map((m: string) => {
              const custom = f.permissions[m] !== undefined && f.permissions[m] !== '';
              return (
                <div key={m} className="flex items-center justify-between gap-3">
                  <span className={cn('text-[13px]', custom && 'font-semibold')}>{core.MODULE_LABELS[m]}{custom && <span className="text-[10px] text-primary ml-1">custom</span>}</span>
                  <Select id={'perm-' + m} aria-label={core.MODULE_LABELS[m]} className="w-44 h-8 text-[13px]" disabled={f.role === 'admin'} value={String(eff(m))} onChange={(e) => setF({ ...f, permissions: { ...f.permissions, [m]: Number(e.target.value) === base[m] ? undefined : Number(e.target.value) } })} options={LEVELS} />
                </div>
              );
            })}
          </div>
          {f.role === 'admin' && <p className="text-[12px] text-muted-foreground mt-2">Administrators always have full access to everything.</p>}
        </div>
        {u.id && (
          <div className="flex items-center gap-2"><Switch id="u-active" checked={f.active} disabled={u.id === me.id} onCheckedChange={(v) => setF({ ...f, active: v })} /><label htmlFor="u-active" className="text-[13px]">Account enabled (turn off to block sign-in immediately)</label></div>
        )}
        {u.id && (
          <Section className="bg-muted/50" title="Security">
            <div className="flex flex-wrap gap-2">
              <ConfirmButton confirmText="Issue new password" onConfirm={async () => { const r = await act('admin.resetPassword', { id: u.id }, 'Temporary password issued'); if (r) onDone(r, u.email); }}><KeyRound className="h-4 w-4 mr-1" />Reset password</ConfirmButton>
              <ConfirmButton confirmText="Unlink authenticator" disabled={!u.mfaEnabled} onConfirm={async () => { await act('admin.resetMfa', { id: u.id }, 'Authenticator unlinked; they will link a new one at next sign-in'); onClose(); }}><Smartphone className="h-4 w-4 mr-1" />Reset authenticator</ConfirmButton>
              {u.id !== me.id && <ConfirmButton confirmText="Delete user" onConfirm={async () => { await act('admin.deleteUser', { id: u.id }, 'User deleted'); onClose(); }}>Delete user</ConfirmButton>}
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">Use “Reset authenticator” when someone changes or loses their phone.</p>
          </Section>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button>{u.id ? 'Save changes' : 'Create user'}</Button></div>
      </form>
    </Modal>
  );
}

function Settings() {
  const { data, call } = useApp();
  const d = data!;
  const [s, setS] = useState<any>({ ...d.settings });
  const [co, setCo] = useState<any>({ ...d.company });
  const [testTo, setTestTo] = useState('');
  const set = (k: string, v: any) => setS((x: any) => ({ ...x, [k]: v }));
  const save = () => call('admin.saveSettings', { settings: s, company: co }, { success: 'Settings saved' });
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Section title="Company details (letterhead)">
        <div className="grid sm:grid-cols-2 gap-3">
          {[['name', 'Business name'], ['tagline', 'Tagline'], ['poBox', 'P.O. Box'], ['location', 'Location'], ['phones', 'Phone numbers'], ['momo', 'Momo number'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['tin', 'TIN']].map(([k, l]) => (
            <Field key={k} label={l} className={k === 'location' || k === 'poBox' ? 'sm:col-span-2' : ''}><TextInput id={'co-' + k} value={co[k] || ''} onChange={(e) => setCo({ ...co, [k]: e.target.value })} /></Field>
          ))}
        </div>
      </Section>
      <div className="space-y-4">
        <Section title="Invoicing">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="VAT rate" hint="0.03 = 3%"><TextInput id="s-vat" type="number" step="0.001" className="num" value={s.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))} /></Field>
            <Field label="Payment terms (days)"><TextInput id="s-terms" type="number" className="num" value={s.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Number(e.target.value))} /></Field>
            <Field label="Proforma valid (days)"><TextInput id="s-pv" type="number" className="num" value={s.proformaValidDays} onChange={(e) => set('proformaValidDays', Number(e.target.value))} /></Field>
            <Field label="Bulk price from (ctns)"><TextInput id="s-bulk" type="number" className="num" value={s.bulkQtyThreshold} onChange={(e) => set('bulkQtyThreshold', Number(e.target.value))} /></Field>
            <Field label="Next invoice no."><TextInput id="s-ni" type="number" className="num" value={s.nextInvoiceNo} onChange={(e) => set('nextInvoiceNo', Number(e.target.value))} /></Field>
            <Field label="Next receipt no."><TextInput id="s-nr" type="number" className="num" value={s.nextReceiptNo} onChange={(e) => set('nextReceiptNo', Number(e.target.value))} /></Field>
          </div>
        </Section>
        <Section title="Security">
          <div className="flex items-center gap-2"><Switch id="s-mfa" checked={!!s.requireMfa} onCheckedChange={(v) => set('requireMfa', v)} /><label htmlFor="s-mfa" className="text-[13px]">Require two-step verification (authenticator app) for everyone</label></div>
          {IS_DEMO && <p className="text-[12px] text-muted-foreground mt-1">Off in the demo so you can look around without a phone. On for the live site.</p>}
        </Section>
        <Section title="Email (Lismandy mailbox)">
          <p className="text-[13px] text-muted-foreground mb-3">Invoices, receipts and statements are sent only from <b>{co.email}</b>, through a small mailer that runs inside that Gmail account. Paste its web-app URL and secret here.</p>
          <div className="space-y-3">
            <Field label="Mailer web-app URL"><TextInput id="s-murl" placeholder="https://script.google.com/macros/s/…/exec" value={s.mailerUrl || ''} onChange={(e) => set('mailerUrl', e.target.value)} /></Field>
            <Field label="Mailer secret"><TextInput id="s-msec" type="password" value={s.mailerSecret || ''} onChange={(e) => set('mailerSecret', e.target.value)} /></Field>
            <div className="flex items-center gap-2"><Switch id="s-cc" checked={!!s.emailCcSelf} onCheckedChange={(v) => set('emailCcSelf', v)} /><label htmlFor="s-cc" className="text-[13px]">Send a copy of every email to {co.email}</label></div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <Field label="Send a test to" className="flex-1 min-w-[200px]"><TextInput id="s-test" type="email" placeholder={co.email} value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
              <Button variant="outline" onClick={() => call('admin.testMailer', { to: testTo }, { success: 'Test email sent', refresh: false })}>Send test</Button>
            </div>
            <div className="text-[12px]">Status: {d.settings.mailerConfigured ? <Pill tone="Paid">connected</Pill> : <Pill tone="medium">not connected</Pill>}</div>
          </div>
        </Section>
        <div className="flex justify-end"><Button onClick={save}>Save settings</Button></div>
      </div>
    </div>
  );
}

function Log({ action, cols }: { action: string; cols: [string, string][] }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api(action).then((r) => r.ok ? setRows(r.data) : toast.error(r.error)); }, [action]);
  return (
    <div className="bg-card border rounded-md table-wrap max-h-[70vh]">
      <table className="dt">
        <thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={cols.length} className="text-muted-foreground">Nothing yet.</td></tr> : rows.map((r) => <tr key={r.id}>{cols.map(([k]) => <td key={k} className={cn('text-[13px]', k === 'at' && 'whitespace-nowrap num')}>{k === 'at' ? String(r[k]).replace('T', ' ').slice(0, 16) : k === 'status' ? <Pill tone={r[k] === 'sent' ? 'Paid' : 'high'}>{r[k]}</Pill> : String(r[k] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

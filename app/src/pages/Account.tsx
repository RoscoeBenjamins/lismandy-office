import { useState } from 'react';
import { useApp, core } from '@/lib/store';
import { PageHeader, Section, Field, TextInput, Pill } from '@/components/app/kit';
import { Button } from '@/components/ui/button';
import { QrBlock, RecoveryCodes } from './Login';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function Account() {
  const { user, call, setUser } = useApp();
  const [cur, setCur] = useState(''); const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [mfaPw, setMfaPw] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const u = user!;
  return (
    <div>
      <PageHeader title="My account" sub={`${u.name} · ${u.email} · ${core.ROLES[u.role]?.label || u.role}`} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Section title="Change password">
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (pw1 !== pw2) { toast.error('The new passwords do not match'); return; }
            const r = await call('changePassword', { currentPassword: cur, newPassword: pw1 }, { success: 'Password changed', refresh: false });
            if (r) { setCur(''); setPw1(''); setPw2(''); }
          }}>
            <Field label="Current password"><TextInput id="a-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
            <Field label="New password" hint="At least 10 characters, letters and numbers"><TextInput id="a-new" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={10} /></Field>
            <Field label="Repeat new password"><TextInput id="a-new2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
            <Button>Change password</Button>
          </form>
        </Section>
        <Section title="Two-step verification">
          <div className="text-[13px] mb-3">Status: {u.mfaEnabled ? <Pill tone="Paid">authenticator linked</Pill> : <Pill tone="medium">not set up</Pill>}</div>
          {codes ? (<><RecoveryCodes codes={codes} /><Button className="mt-3" onClick={() => setCodes(null)}>Done</Button></>)
            : setup ? (
              <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await call('mfaSetupConfirm', { code }, { refresh: false, success: 'Authenticator linked' }); if (r) { setCodes(r.recoveryCodes); setSetup(null); setUser(r.user); setCode(''); } }}>
                <QrBlock secret={setup.secret} otpauth={setup.otpauth} />
                <Field label="6-digit code"><TextInput id="a-code" inputMode="numeric" maxLength={6} className="num text-[18px] tracking-[.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
                <div className="flex gap-2"><Button disabled={code.length !== 6}>Verify</Button><Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button></div>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await api('mfaSetupStart', { currentPassword: mfaPw }); if (!r.ok) { toast.error(r.error); return; } setSetup(r.data); setMfaPw(''); }}>
                <p className="text-[13px] text-muted-foreground">{u.mfaEnabled ? 'Moving to a new phone? Link it here. The old phone stops working and you get new recovery codes.' : 'Link Google Authenticator or Microsoft Authenticator so a password alone is not enough to get in.'}</p>
                <Field label="Confirm with your password"><TextInput id="a-mfapw" type="password" value={mfaPw} onChange={(e) => setMfaPw(e.target.value)} required /></Field>
                <Button>{u.mfaEnabled ? 'Link a new phone' : 'Set up authenticator'}</Button>
              </form>
            )}
        </Section>
        <Section title="What you can access" className="lg:col-span-2">
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[13px]">
            {core.MODULES.map((m: string) => <div key={m} className="flex justify-between border rounded px-2.5 py-1.5"><span>{core.MODULE_LABELS[m]}</span><span className="text-muted-foreground">{['—', 'view', 'edit', 'full'][u.perms[m] || 0]}</span></div>)}
          </div>
        </Section>
      </div>
    </div>
  );
}

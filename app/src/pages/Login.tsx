import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { api, IS_DEMO, DEMO_LOGIN, resetDemo } from '@/lib/api';
import { useApp } from '@/lib/store';
import { Field, TextInput } from '@/components/app/kit';
import { ShieldCheck, KeyRound, Smartphone, Copy } from 'lucide-react';
import { toast } from 'sonner';

type Step = { step: 'password' } | { step: 'changePassword'; ticket: string } | { step: 'mfa'; ticket: string } | { step: 'mfaEnroll'; ticket: string; secret: string; otpauth: string } | { step: 'codes'; codes: string[]; token: string; user: any };

export function QrBlock({ secret, otpauth }: { secret: string; otpauth: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(otpauth, { margin: 1, width: 200, color: { dark: '#1c1414', light: '#ffffff' } }).then(setSrc); }, [otpauth]);
  const pretty = secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
      <div className="bg-white p-2 rounded border w-[200px] max-w-full">{src && <img src={src} alt="Authenticator QR code" width={184} height={184} />}</div>
      <ol className="text-[13px] space-y-2 list-decimal pl-4">
        <li>Open <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</li>
        <li>Tap <b>+</b> → <b>Scan a QR code</b> (Microsoft: <b>Other account</b>) and scan this code.</li>
        <li>Can’t scan? Choose “Enter a setup key” and type:
          <div className="num mt-1 text-[13px] bg-muted px-2 py-1 rounded select-all break-all flex items-center justify-between gap-2">
            <span>{pretty}</span>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Copy setup key" onClick={() => navigator.clipboard?.writeText(secret).then(() => toast.success('Setup key copied')).catch(() => {})}><Copy className="h-3.5 w-3.5" /></button>
          </div>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
    </div>
  );
}

export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 num text-[14px] bg-muted rounded p-3 select-all">{codes.map((c) => <span key={c}>{c}</span>)}</div>
      <p className="text-[12px] text-muted-foreground mt-2">Each code works once if your phone is lost. Write them down or store them somewhere safe. They are not shown again.</p>
    </div>
  );
}

export default function Login() {
  const { signedIn } = useApp();
  const [s, setS] = useState<Step>({ step: 'password' });
  const [email, setEmail] = useState(IS_DEMO ? DEMO_LOGIN.email : '');
  const [password, setPassword] = useState(IS_DEMO ? DEMO_LOGIN.password : '');
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go(action: string, data: any) {
    setBusy(true); setError('');
    const r = await api(action, data);
    setBusy(false);
    if (!r.ok) { setError(r.error || 'Something went wrong'); if (/expired|sign in again/i.test(r.error || '')) setS({ step: 'password' }); return; }
    const d = r.data;
    setCode('');
    if (d.step === 'done') { if (d.recoveryCodes) setS({ step: 'codes', codes: d.recoveryCodes, token: d.token, user: d.user }); else signedIn(d.token, d.user); }
    else setS(d);
  }

  return (
    <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-10 relative overflow-hidden">
        <div>
          <div className="font-display text-[30px] font-extrabold tracking-tight text-white">LISMANDY</div>
          <div className="text-[12px] tracking-[.2em] uppercase opacity-70">Enterprise · Accra</div>
        </div>
        <div className="max-w-md">
          <p className="font-display text-[34px] leading-[1.1] font-semibold text-white">Invoices, receipts and stock prices for every carton that leaves Osu.</p>
          <p className="mt-4 opacity-75 text-[14px]">One office system for Lismandy, Nkulenu and Nkatie Burger lines, from proforma to paid.</p>
        </div>
        <div className="text-[12px] opacity-60">P.O. Box CT2705, Cantonments · TIN P0028440587</div>
        <svg aria-hidden className="absolute -right-24 -bottom-24 opacity-[.07]" width="420" height="420" viewBox="0 0 420 420"><g fill="none" stroke="#fff" strokeWidth="18">{[60, 110, 160, 210].map((r) => <circle key={r} cx="210" cy="210" r={r} />)}</g></svg>
      </aside>
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-6"><div className="font-display text-[26px] font-extrabold text-primary">LISMANDY</div><div className="eyebrow">Enterprise office</div></div>
          {IS_DEMO && s.step === 'password' && (
            <div className="mb-5 border border-warn/40 bg-warn/10 rounded-md p-3 text-[13px]">
              <b>Demo mode.</b> Sample data lives only in this browser. The demo account is filled in for you; the live site asks for your authenticator code as well.
            </div>
          )}

          {s.step === 'password' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go('login', { email, password }); }}>
              <h1 className="text-[28px] font-bold">Sign in</h1>
              <Field label="Email"><TextInput id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Password"><TextInput id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
              <Button className="w-full" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</Button>
              {IS_DEMO && <button type="button" className="text-[12px] text-muted-foreground underline" onClick={() => { resetDemo(); toast.success('Demo data reset'); }}>Reset demo data</button>}
            </form>
          )}

          {s.step === 'changePassword' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (pw1 !== pw2) { setError('The two passwords do not match'); return; } go('completePasswordChange', { ticket: s.ticket, newPassword: pw1 }); }}>
              <div className="flex items-center gap-2 text-primary"><KeyRound className="h-5 w-5" /><span className="eyebrow text-primary">Step 1 of 2</span></div>
              <h1 className="text-[26px] font-bold">Choose your own password</h1>
              <p className="text-[13px] text-muted-foreground">You signed in with a temporary password. Pick one only you know: at least 10 characters with letters and numbers.</p>
              <Field label="New password"><TextInput id="new-pw" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={10} /></Field>
              <Field label="Repeat new password"><TextInput id="new-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
              {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
              <Button className="w-full" disabled={busy}>Save password</Button>
            </form>
          )}

          {s.step === 'mfaEnroll' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go('mfaEnrollConfirm', { ticket: s.ticket, code }); }}>
              <div className="flex items-center gap-2 text-primary"><Smartphone className="h-5 w-5" /><span className="eyebrow text-primary">Two-step verification</span></div>
              <h1 className="text-[26px] font-bold">Link your authenticator app</h1>
              <QrBlock secret={s.secret} otpauth={s.otpauth} />
              <Field label="6-digit code"><TextInput id="enroll-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="num text-[20px] tracking-[.3em] h-11" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></Field>
              {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
              <Button className="w-full" disabled={busy || code.length !== 6}>Verify and finish</Button>
            </form>
          )}

          {s.step === 'mfa' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go('mfaVerify', { ticket: s.ticket, code }); }}>
              <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="eyebrow text-primary">Two-step verification</span></div>
              <h1 className="text-[26px] font-bold">Enter your code</h1>
              <p className="text-[13px] text-muted-foreground">Open Google Authenticator or Microsoft Authenticator and type the 6-digit code for <b>Lismandy Enterprise</b>. Lost your phone? Enter one of your recovery codes instead.</p>
              <Field label="Code"><TextInput id="mfa-code" autoFocus autoComplete="one-time-code" className="num text-[20px] tracking-[.3em] h-11" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, ''))} required maxLength={9} /></Field>
              {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
              <Button className="w-full" disabled={busy}>Verify</Button>
              <button type="button" className="text-[12px] text-muted-foreground underline" onClick={() => setS({ step: 'password' })}>Back</button>
            </form>
          )}

          {s.step === 'codes' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-ok"><ShieldCheck className="h-5 w-5" /><span className="eyebrow text-ok">Authenticator linked</span></div>
              <h1 className="text-[26px] font-bold">Save your recovery codes</h1>
              <RecoveryCodes codes={s.codes} />
              <Button className="w-full" onClick={() => signedIn(s.token, s.user)}>I’ve saved them. Open the office</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

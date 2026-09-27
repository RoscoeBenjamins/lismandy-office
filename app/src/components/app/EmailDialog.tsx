import { useEffect, useState } from 'react';
import { Modal, Field, TextInput } from './kit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/lib/store';
import { IS_DEMO } from '@/lib/api';
import { Mail } from 'lucide-react';

export function EmailDialog({ open, onClose, payload, defaultTo, title, label }: { open: boolean; onClose: () => void; payload: any; defaultTo?: string; title: string; label: string }) {
  const { call, data } = useApp();
  const [to, setTo] = useState(defaultTo || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(defaultTo || ''); setMsg(''); } }, [open, defaultTo]);
  const configured = data?.settings?.mailerConfigured;
  return (
    <Modal open={open} onClose={onClose} title={title} description={`Sends the ${label} as a PDF from ${data?.company?.email || 'the Lismandy mailbox'}.`}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await call('email.send', { ...payload, to, message: msg }, { success: `Sent to ${to}` });
        setBusy(false); if (r) onClose();
      }}>
        {!configured && <div className="text-[13px] border border-warn/40 bg-warn/10 rounded p-2.5">{IS_DEMO ? 'Demo mode cannot send real email.' : 'Email is not connected yet. An admin links the Lismandy mailbox under Admin portal → Settings.'}</div>}
        <Field label="To" hint="Separate several addresses with commas"><TextInput id="email-to" type="text" value={to} onChange={(e) => setTo(e.target.value)} required placeholder="accounts@customer.com" /></Field>
        <Field label="Message (optional)"><Textarea id="email-msg" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Dear Customer, please find attached…" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy}><Mail className="h-4 w-4 mr-1" />{busy ? 'Sending…' : 'Send'}</Button></div>
      </form>
    </Modal>
  );
}

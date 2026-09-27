import core from '../core/core.mjs';
import { memStore, nodeEnv } from './memstore.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const seed = JSON.parse(fs.readFileSync(new URL('../backend/seed.json', import.meta.url)));
const clock = { t: Date.parse('2026-09-26T10:00:00Z') };
const env = nodeEnv(clock), store = memStore();
const api = core.createApi(store, env);
const call = (action, data, token) => api.handle({ action, data, token });
const okc = (action, data, token) => { const r = call(action, data, token); if (!r.ok) throw new Error(action + ': ' + r.error); return r.data; };
const totpNow = secret => core.hotp(env, core.base32Decode(secret), Math.floor(clock.t / 30000));

// RFC 6238 test vector (SHA1, secret "12345678901234567890", T=59 -> 94287082 -> last 6 = 287082)
t('TOTP matches RFC 6238 vector', () => {
  const key = Array.from(Buffer.from('12345678901234567890'));
  assert.equal(core.hotp(env, key, Math.floor(59 / 30)), '287082');
  assert.equal(core.hotp(env, key, Math.floor(1111111109 / 30)), '081804');
  assert.deepEqual(core.base32Decode(core.base32Encode(key)), key);
});
t('toHex', () => assert.equal(core.toHex([0, 255, 16]), '00ff10'));

const s = api.seed(seed, 'fafale17@gmail.com', 'Roscoe');
t('seed creates data + admin', () => {
  assert.equal(store._t.products.length, 43); assert.equal(store._t.customers.length, 9);
  assert.equal(store._t.invoices[0].total, 104400);
  assert.match(s.tempPassword, /^\w{4}-\w{4}-\w{5}$/);
});

let token, recovery, adminSecret;
t('login -> forced password change -> MFA enrollment -> session', () => {
  assert.equal(call('login', { email: 'fafale17@gmail.com', password: 'wrong' }).code, 'AUTH');
  let r = okc('login', { email: 'FAFALE17@gmail.com', password: s.tempPassword });
  assert.equal(r.step, 'changePassword');
  assert.equal(call('completePasswordChange', { ticket: r.ticket, newPassword: 'short' }).ok, false);
  r = okc('completePasswordChange', { ticket: r.ticket, newPassword: 'Lismandy2026secure' });
  assert.equal(r.step, 'mfaEnroll'); assert.match(r.otpauth, /^otpauth:\/\/totp\/Lismandy%20Enterprise:fafale17%40gmail.com\?secret=[A-Z2-7]{32}&issuer=/);
  assert.equal(call('mfaEnrollConfirm', { ticket: r.ticket, code: '000000' }).ok, false);
  adminSecret = r.secret;
  const done = okc('mfaEnrollConfirm', { ticket: r.ticket, code: totpNow(r.secret) });
  assert.equal(done.step, 'done'); assert.equal(done.recoveryCodes.length, 8); assert.equal(done.user.perms.admin, 3);
  token = done.token; recovery = done.recoveryCodes;
});
t('second login requires TOTP; replay blocked; recovery code works once', () => {
  clock.t += 60000;
  let r = okc('login', { email: 'fafale17@gmail.com', password: 'Lismandy2026secure' });
  assert.equal(r.step, 'mfa');
  const code = totpNow(adminSecret);
  assert.equal(okc('mfaVerify', { ticket: r.ticket, code }).step, 'done');
  r = okc('login', { email: 'fafale17@gmail.com', password: 'Lismandy2026secure' });
  assert.match(call('mfaVerify', { ticket: r.ticket, code }).error, /already used/);
  r = okc('login', { email: 'fafale17@gmail.com', password: 'Lismandy2026secure' });
  assert.equal(okc('mfaVerify', { ticket: r.ticket, code: recovery[0] }).step, 'done');
  r = okc('login', { email: 'fafale17@gmail.com', password: 'Lismandy2026secure' });
  assert.equal(call('mfaVerify', { ticket: r.ticket, code: recovery[0] }).ok, false);
});
t('lockout after 5 bad passwords', () => {
  const u = okc('admin.saveUser', { email: 'lock@x.com', name: 'L', role: 'viewer' }, token);
  for (let i = 0; i < 5; i++) call('login', { email: 'lock@x.com', password: 'nope' });
  assert.equal(call('login', { email: 'lock@x.com', password: u.tempPassword }).code, 'LOCKED');
  clock.t += 16 * 60000;
  assert.equal(okc('login', { email: 'lock@x.com', password: u.tempPassword }).step, 'changePassword');
});

let salesTok;
t('admin creates sales user with custom permission; permissions enforced', () => {
  const u = okc('admin.saveUser', { email: 'ama@lismandy.com', name: 'Ama', role: 'sales', permissions: { cashbook: 1 } }, token);
  let r = okc('login', { email: 'ama@lismandy.com', password: u.tempPassword });
  r = okc('completePasswordChange', { ticket: r.ticket, newPassword: 'AmaSales12345' });
  r = okc('mfaEnrollConfirm', { ticket: r.ticket, code: totpNow(r.secret) });
  salesTok = r.token;
  assert.equal(r.user.perms.cashbook, 1); assert.equal(r.user.perms.admin, 0);
  assert.equal(call('admin.users', {}, salesTok).code, 'FORBIDDEN');
  assert.equal(call('cashbook.save', { description: 'x', amount: 5 }, salesTok).code, 'FORBIDDEN');
  assert.equal(call('invoices.void', { id: store._t.invoices[0].id }, salesTok).code, 'FORBIDDEN');
  assert.equal(call('getData', {}, 'bogus').code, 'AUTH');
});

let inv;
t('invoice numbering, totals, VAT, discount', () => {
  inv = okc('invoices.save', { customerName: 'melcom', date: '2026-07-01', vat: true, items: [{ code: 'NB-001', description: 'Nkatie Burger 35GM (Peanut Snack)', qty: 10, price: 140, discount: 0.1 }, { description: '', qty: '' }] }, salesTok);
  assert.equal(inv.number, 1008); assert.equal(inv.customerName, 'Melcom'); assert.equal(inv.subtotal, 1260); assert.equal(inv.vatAmount, 37.8); assert.equal(inv.total, 1297.8); assert.equal(inv.dueDate, '2026-07-31');
  assert.equal(call('invoices.save', { customerName: 'Nobody', items: [{ description: 'a', qty: 1, price: 1 }] }, salesTok).ok, false);
  assert.equal(call('invoices.save', { customerName: 'Melcom', items: [] }, salesTok).ok, false);
});
t('receipts allocate, post to cash book, statuses update; void reverses', () => {
  const r1 = okc('receipts.save', { customerName: 'Melcom', invoiceNumber: 1008, amount: 500, mode: 'Momo', date: '2026-07-10' }, token);
  assert.equal(r1.number, 9001);
  let d = okc('getData', {}, token);
  let i = d.invoices.find(x => x.number === 1008);
  assert.equal(i.paid, 500); assert.equal(i.payStatus, 'Partial'); assert.equal(i.daysOverdue, 57);
  assert.equal(d.cashbook.length, 1); assert.equal(d.cashbook[0].amountIn, 500);
  okc('receipts.save', { customerName: 'Melcom', amount: 1000, mode: 'Cash', date: '2026-07-12' }, token); // unlinked -> FIFO
  d = okc('getData', {}, token); i = d.invoices.find(x => x.number === 1008);
  assert.equal(i.payStatus, 'Paid'); assert.equal(d.unallocated.melcom, 202.2);
  assert.equal(call('receipts.save', { customerName: 'Melcom', invoiceNumber: 1007, amount: 1, mode: 'Cash' }, token).error, 'Invoice #1007 belongs to China Mall Manet');
  okc('receipts.void', { id: r1.id, reason: 'test' }, token);
  d = okc('getData', {}, token); i = d.invoices.find(x => x.number === 1008);
  assert.equal(i.paid, 1000); assert.equal(d.cashbook.length, 1);
  assert.match(call('invoices.void', { id: inv.id }, token).error, /Void the receipts/);
});
t('ledger + statement balances', () => {
  const d = okc('getData', {}, token);
  const L = core.buildLedger(d);
  assert.equal(L.length, 3);
  const st = core.buildStatement(d, 'Melcom', '2026-07-05', '2026-12-31');
  assert.equal(st.opening, 1297.8); assert.equal(st.received, 1000); assert.equal(st.closing, 297.8);
  const cm = core.buildStatement(d, 'China Mall Manet', '', '');
  assert.equal(cm.closing, 104400);
});
t('proforma -> invoice conversion', () => {
  const p = okc('proformas.save', { customerName: 'Panda Mall', items: [{ description: 'Banku 400 G', qty: 3, price: 126.5 }] }, salesTok);
  assert.equal(p.number, 5001); assert.equal(p.validUntil, '2026-10-10');
  const i2 = okc('proformas.convert', { id: p.id }, salesTok);
  assert.equal(i2.number, 1009); assert.equal(i2.fromProforma, 5001);
  assert.equal(call('proformas.convert', { id: p.id }, salesTok).ok, false);
});
t('email: not configured -> clear error; configured -> sent via mailer with PDF html', () => {
  assert.equal(call('email.send', { docType: 'invoice', id: inv.id, to: 'a@b.com' }, token).code, 'MAILER');
  assert.match(call('admin.saveSettings', { settings: { mailerUrl: 'https://evil.com/x' } }, token).error, /Mailer URL/);
  okc('admin.saveSettings', { settings: { mailerUrl: 'https://script.google.com/macros/s/X/exec', mailerSecret: 'sek' } }, token);
  const d = okc('getData', {}, salesTok); assert.equal(d.settings.mailerSecret, '••••••'); assert.equal(d.settings.mailerUrl, undefined);
  okc('email.send', { docType: 'invoice', id: inv.id, to: 'buyer@melcom.com' }, salesTok);
  assert.equal(env.sent.at(-1).cc, 'lismandyenterprise@gmail.com'); assert.match(env.sent.at(-1).attachmentHtml, /INVOICE/);
  assert.ok(store._t.invoices.find(x => x.id === inv.id).emailedAt);
  assert.equal(call('email.send', { docType: 'invoice', id: inv.id, to: 'fail@x.com' }, token).code, 'MAILER');
  assert.equal(store._t.emails.at(-1).status, 'failed');
  okc('email.send', { docType: 'statement', customerName: 'Melcom', to: 'buyer@melcom.com' }, token);
  assert.match(env.sent.at(-1).html, /STATEMENT OF ACCOUNT/);
});
t('health KPIs flag real issues', () => {
  const d = okc('getData', {}, token);
  const h = core.computeHealth(d, d.today);
  const titles = h.issues.map(i => i.title);
  assert.ok(titles.includes('Customers with invoices but no email'));
  assert.ok(titles.includes('Overdue invoices (1–60 days)')); // 1007 due 2026-09-06
  assert.ok(titles.includes('One customer is more than half of all sales'));
  assert.ok(h.score >= 0 && h.score < 100);
  assert.equal(h.issues[0].severity, 'high');
});
t('forecast', () => {
  const f = core.forecast([0, 0, 100, 120, 140, 160, 180], 3);
  assert.equal(f.method, 'holt'); assert.ok(f.points[0] > 180 && f.points[2] > f.points[0]);
  assert.equal(core.forecast([0, 500], 2).method, 'average');
  assert.deepEqual(core.nextMonths('2026-11', 3), ['2026-12', '2027-01', '2027-02']);
  const ms = core.monthSeries(okc('getData', {}, token), 12, '2026-09-26');
  assert.equal(ms.length, 12); assert.equal(ms.at(-2).sales, 104400);
});
t('customer rename cascades; delete blocked when used', () => {
  const c = store._t.customers.find(x => x.name === 'Melcom');
  okc('customers.save', { id: c.id, name: 'Melcom Ltd', email: 'ap@melcom.com' }, token);
  assert.ok(store._t.invoices.filter(i => i.customerName === 'Melcom Ltd').length >= 1);
  assert.match(call('customers.delete', { id: c.id }, token).error, /has documents/);
  assert.equal(call('customers.save', { name: 'melcom ltd' }, token).ok, false);
});
t('products auto-code + cash book manual', () => {
  const p = okc('products.save', { name: 'Ekumfi Pineapple 1L', source: 'Ekumfi', price: 210, costPrice: 200 }, token);
  assert.equal(p.code, 'EKU-001');
  okc('cashbook.save', { type: 'Out', amount: 50, description: 'Fuel' }, token);
  const cb = core.cashbookWithBalance(store._t.cashbook);
  assert.equal(cb.at(-1).balance, 950);
});
t('admin safety rails + audit', () => {
  const me = store._t.users.find(u => u.email === 'fafale17@gmail.com');
  assert.match(call('admin.saveUser', { id: me.id, email: me.email, role: 'viewer' }, token).error, /own admin/);
  assert.ok(okc('admin.audit', {}, token).length > 10);
  const ama = store._t.users.find(u => u.email === 'ama@lismandy.com');
  okc('admin.saveUser', { id: ama.id, email: ama.email, role: 'sales', active: false }, token);
  assert.equal(call('getData', {}, salesTok).code, 'AUTH');
});
t('document HTML renders', () => {
  const co = seed.company;
  assert.match(core.renderReceiptHtml({ number: 9, date: '2026-01-01', customerName: 'X', amount: 1234.5, mode: 'Cash' }, co), /One thousand two hundred and thirty-four Ghana cedis and fifty pesewas/);
});
console.log(`\n${passed} tests passed`);
t('self-service MFA setup from account page', () => {
  assert.equal(call('mfaSetupStart', { currentPassword: 'bad' }, token).ok, false);
  const r = okc('mfaSetupStart', { currentPassword: 'Lismandy2026secure' }, token);
  clock.t += 30000;
  const res = okc('mfaSetupConfirm', { code: totpNow(r.secret) }, token);
  assert.equal(res.recoveryCodes.length, 8);
  console.log(`\n${passed} tests passed (incl. late)`);
});
t('IDs are 8-digit numbers per table; migration converts old ids and references', () => {
  const c = store._t.customers[0], s0 = store._t.suppliers[0], u = store._t.users[0], inv = store._t.invoices[0];
  assert.match(c.id, /^10\d{6}$/); assert.match(s0.id, /^20\d{6}$/); assert.match(u.id, /^80\d{6}$/); assert.match(inv.id, /^40\d{6}$/);
  assert.ok(store._t.audit.every(a => /^9\d{7}$/.test(a.id)));
  // simulate legacy rows
  store._t.customers.push({ id: 'abc-uuid-1', name: 'Legacy Shop', segment: 'Retail' });
  store._t.invoices.push({ id: 'uuid-inv', number: 5555, date: '2026-01-01', dueDate: '2026-01-31', customerId: 'abc-uuid-1', customerName: 'Legacy Shop', items: [], subtotal: 1, vatAmount: 0, total: 1, status: 'issued' });
  const r = api.migrateIds();
  assert.equal(r.converted, 2);
  const lc = store._t.customers.find(x => x.name === 'Legacy Shop');
  assert.match(lc.id, /^10\d{6}$/);
  assert.equal(store._t.invoices.find(x => x.number === 5555).customerId, lc.id);
  assert.equal(api.migrateIds().converted, 0);
  console.log(`\n${passed} tests passed (ids)`);
});

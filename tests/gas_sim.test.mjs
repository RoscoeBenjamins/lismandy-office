// Runs the real Code.gs inside a simulated Apps Script runtime (Sheets/Cache/Utilities mocks).
import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const signed = b => Array.from(b).map(x => x > 127 ? x - 256 : x);
function makeSheet(name) {
  const sh = { name, data: [], hidden: false,
    getLastRow: () => { let n = sh.data.length; while (n && sh.data[n - 1].every(v => v === '')) n--; return n; },
    getMaxRows: () => Math.max(1000, sh.data.length),
    appendRow: row => { sh.data.length = sh.getLastRow(); sh.data.push(row.map(v => v)); },
    deleteRow: r => sh.data.splice(r - 1, 1),
    setFrozenRows() {}, hideSheet() { sh.hidden = true; }, getName: () => name,
    getRange: (r, c, nr = 1, nc = 1) => { const rg = {
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(sh.data[r - 1 + i]?.[c - 1 + j] ?? ''); o.push(row); } return o; },
      setValues: v => { for (let i = 0; i < nr; i++) { while (sh.data.length < r + i) sh.data.push([]); for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = v[i][j]; } return rg; },
      setNumberFormat: () => rg, setFontWeight: () => rg, setBackground: () => rg, setFontColor: () => rg }; return rg; } };
  return sh;
}
const ss = { sheets: [makeSheet('Sheet1')], getId: () => 'SSID',
  getSheetByName: n => ss.sheets.find(s => s.name === n) || null,
  insertSheet: n => { const s = makeSheet(n); ss.sheets.push(s); return s; },
  getSheets: () => ss.sheets, deleteSheet: s => { ss.sheets = ss.sheets.filter(x => x !== s); } };
const cache = new Map(), props = new Map();
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, MacAlgorithm: { HMAC_SHA_1: 'sha1' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, s) => signed(crypto.createHash(a).update(String(s), 'utf8').digest()),
    computeHmacSignature: (a, v, k) => signed(crypto.createHmac(a, Buffer.from(k.map(x => x & 255))).update(Buffer.from(v.map(x => x & 255))).digest()),
    getUuid: () => crypto.randomUUID(), formatDate: d => d.toISOString() },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
  UrlFetchApp: { fetch: (url, o) => ({ getContentText: () => JSON.stringify({ ok: true }), getResponseCode: () => 200, _p: o }) },
  Logger: { log() {} }, console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8') + '\n' + fs.readFileSync(new URL('../backend/Seed.gs', import.meta.url), 'utf8'), ctx);
const msg = vm.runInContext('setup()', ctx);
const pw = /Temporary password: (\S+)/.exec(msg)[1];
const post = body => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(body) } }).s);
let r = post({ action: 'login', data: { email: 'fafale17@gmail.com', password: pw } });
assert.equal(r.data.step, 'changePassword', JSON.stringify(r));
r = post({ action: 'completePasswordChange', data: { ticket: r.data.ticket, newPassword: 'Lismandy2026secure' } });
const core = ctx.LismandyCore;
const env = { hmacSha1: (k, m) => Array.from(crypto.createHmac('sha1', Buffer.from(k)).update(Buffer.from(m)).digest()) };
const code = core.hotp(env, core.base32Decode(r.data.secret), Math.floor(Date.now() / 30000));
r = post({ action: 'mfaEnrollConfirm', data: { ticket: r.data.ticket, code } });
assert.equal(r.data.step, 'done', JSON.stringify(r));
const token = r.data.token;
r = post({ action: 'getData', token });
assert.equal(r.data.products.length, 43); assert.equal(r.data.invoices[0].total, 104400); assert.equal(r.data.customers[0].vatDefault, false);
assert.equal(r.data.settings.vatRate, 0.03);
r = post({ action: 'invoices.save', token, data: { customerName: 'Melcom', vat: true, items: [{ description: 'Banku 400 G', qty: 2, price: 126.5 }] } });
assert.equal(r.data.number, 1008, JSON.stringify(r));
r = post({ action: 'customers.save', token, data: { name: 'New Shop', phone: '0547677111', segment: 'Retail' } });
r = post({ action: 'getData', token });
assert.equal(r.data.customers.find(c => c.name === 'New Shop').phone, '0547677111');
assert.equal(r.data.invoices.length, 2);
const inv = r.data.invoices.find(i => i.number === 1008);
assert.deepEqual(inv.items[0].amount, 253);
post({ action: 'admin.saveSettings', token, data: { settings: { mailerUrl: 'https://script.google.com/macros/s/abc/exec', mailerSecret: 's' } } });
r = post({ action: 'email.send', token, data: { docType: 'invoice', id: inv.id, to: 'a@b.com' } });
assert.equal(r.ok, true, JSON.stringify(r));
r = post({ action: 'receipts.save', token, data: { customerName: 'Melcom', invoiceNumber: 1008, amount: 100, mode: 'Cash' } });
r = post({ action: 'receipts.void', token, data: { id: r.data.id } });
r = post({ action: 'getData', token });
assert.equal(r.data.cashbook.length, 0);
assert.ok(ss.getSheetByName('users').hidden);
console.log('GAS simulation: setup, login+MFA, CRUD, email, receipts, cashbook sync — all OK');

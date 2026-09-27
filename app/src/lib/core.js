/*
 * LISMANDY ENTERPRISE — shared business core.
 * Runs unchanged in Google Apps Script (the live API) and in the browser (demo mode) and Node (tests).
 * Everything environment-specific (storage, crypto primitives, cache, mail) is injected.
 */
var LismandyCore = (function () {
  'use strict';

  // ---------------------------------------------------------------- schema
  var SCHEMA = {
    users: ['id', 'email', 'name', 'role', 'permissions', 'passwordHash', 'salt', 'mustChangePassword', 'mfaEnabled', 'mfaSecret', 'recoveryCodes', 'active', 'failedAttempts', 'lockedUntil', 'lastLoginAt', 'createdAt', 'updatedAt'],
    customers: ['id', 'name', 'segment', 'vatDefault', 'email', 'phone', 'address', 'contactPerson', 'notes', 'createdAt', 'updatedAt'],
    suppliers: ['id', 'name', 'contact', 'phone', 'email', 'notes', 'createdAt', 'updatedAt'],
    products: ['id', 'code', 'name', 'source', 'type', 'packaging', 'unitsPerCtn', 'packLabel', 'costPrice', 'price', 'price200', 'active', 'createdAt', 'updatedAt'],
    invoices: ['id', 'number', 'date', 'dueDate', 'customerId', 'customerName', 'vat', 'vatRate', 'items', 'subtotal', 'vatAmount', 'total', 'status', 'notes', 'fromProforma', 'emailedAt', 'createdBy', 'createdAt', 'updatedAt'],
    proformas: ['id', 'number', 'date', 'validUntil', 'customerId', 'customerName', 'vat', 'vatRate', 'items', 'subtotal', 'vatAmount', 'total', 'status', 'convertedInvoice', 'notes', 'emailedAt', 'createdBy', 'createdAt', 'updatedAt'],
    receipts: ['id', 'number', 'date', 'customerId', 'customerName', 'invoiceNumber', 'amount', 'mode', 'reference', 'paymentFor', 'notes', 'status', 'emailedAt', 'createdBy', 'createdAt', 'updatedAt'],
    cashbook: ['id', 'date', 'description', 'category', 'type', 'reference', 'amountIn', 'amountOut', 'notes', 'source', 'sourceId', 'createdBy', 'createdAt', 'updatedAt'],
    settings: ['id', 'value'],
    audit: ['id', 'at', 'user', 'action', 'entity', 'entityId', 'details'],
    emails: ['id', 'at', 'user', 'docType', 'docNumber', 'to', 'subject', 'status', 'error']
  };
  var JSON_COLS = { permissions: 1, items: 1, recoveryCodes: 1, value: 1 };
  var BOOL_COLS = { mustChangePassword: 1, mfaEnabled: 1, active: 1, vat: 1, vatDefault: 1 };
  var NUM_COLS = { number: 1, vatRate: 1, subtotal: 1, vatAmount: 1, total: 1, amount: 1, amountIn: 1, amountOut: 1, unitsPerCtn: 1, costPrice: 1, price: 1, price200: 1, failedAttempts: 1, invoiceNumber: 1, convertedInvoice: 1, fromProforma: 1 };

  var MODULES = ['dashboard', 'invoices', 'proformas', 'receipts', 'customers', 'products', 'suppliers', 'ledger', 'cashbook', 'statements', 'analytics', 'health', 'admin'];
  var MODULE_LABELS = { dashboard: 'Dashboard', invoices: 'Invoices', proformas: 'Proformas', receipts: 'Receipts', customers: 'Customers', products: 'Products & Prices', suppliers: 'Suppliers', ledger: 'Transactions', cashbook: 'Cash Book', statements: 'Statements', analytics: 'Trends & Forecast', health: 'Data Health', admin: 'Admin Portal' };
  // 0 = no access, 1 = view, 2 = create/edit, 3 = full (void / delete)
  var ROLES = {
    admin: { label: 'Administrator', perms: { dashboard: 3, invoices: 3, proformas: 3, receipts: 3, customers: 3, products: 3, suppliers: 3, ledger: 3, cashbook: 3, statements: 3, analytics: 3, health: 3, admin: 3 } },
    manager: { label: 'Manager', perms: { dashboard: 3, invoices: 3, proformas: 3, receipts: 3, customers: 3, products: 3, suppliers: 3, ledger: 3, cashbook: 3, statements: 3, analytics: 3, health: 3, admin: 0 } },
    accounts: { label: 'Accounts', perms: { dashboard: 1, invoices: 2, proformas: 1, receipts: 3, customers: 2, products: 1, suppliers: 1, ledger: 3, cashbook: 3, statements: 3, analytics: 1, health: 1, admin: 0 } },
    sales: { label: 'Sales', perms: { dashboard: 1, invoices: 2, proformas: 2, receipts: 1, customers: 2, products: 1, suppliers: 0, ledger: 1, cashbook: 0, statements: 1, analytics: 1, health: 1, admin: 0 } },
    viewer: { label: 'Viewer (read-only)', perms: { dashboard: 1, invoices: 1, proformas: 1, receipts: 1, customers: 1, products: 1, suppliers: 1, ledger: 1, cashbook: 1, statements: 1, analytics: 1, health: 1, admin: 0 } }
  };
  var DEFAULT_SETTINGS = { vatRate: 0.03, nextInvoiceNo: 1001, nextProformaNo: 5001, nextReceiptNo: 9001, paymentTermsDays: 30, proformaValidDays: 14, currency: 'GHS', requireMfa: true, bulkQtyThreshold: 200, mailerUrl: '', mailerSecret: '', emailCcSelf: true };
  var SECRET_SETTINGS = { mailerSecret: 1 };
  // Record IDs are 8-digit numbers; the first digits tell you the table (e.g. customers 10xxxxxx, suppliers 20xxxxxx).
  var ID_BASE = { customers: 10000000, suppliers: 20000000, products: 30000000, invoices: 40000000, proformas: 50000000, receipts: 60000000, cashbook: 70000000, users: 80000000, audit: 90000000, emails: 99000000 };
  var ID_SPAN = { audit: 8999999, emails: 999999 };

  // ---------------------------------------------------------------- utils
  function err(msg, code) { var e = new Error(msg); e.code = code || 'BAD_REQUEST'; return e; }
  function round2(n) { return Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function isoDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1, 2) + '-' + pad(d.getUTCDate(), 2); }
  function parseDate(s) { if (!s) return null; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); if (!m) return null; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); }
  function addDays(s, n) { var d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function validDate(s, field) { if (!parseDate(s)) throw err(field + ' must be a date (YYYY-MM-DD)'); return String(s).slice(0, 10); }
  function lower(s) { return str(s).toLowerCase(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(n) { var v = round2(n).toFixed(2).split('.'); v[0] = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return v.join('.'); }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(s)); }

  // ---------------------------------------------------------------- bytes / base32 / TOTP
  function strBytes(s) { // UTF-8
    var out = [], i, c;
    s = unescape(encodeURIComponent(s));
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); out.push(c); }
    return out;
  }
  function toHex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += pad((((bytes[i] % 256) + 256) % 256).toString(16), 2); return s; }
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32Encode(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | (bytes[i] & 255); bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
  }
  function base32Decode(s) {
    s = str(s).toUpperCase().replace(/[\s=-]/g, '');
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      var idx = B32.indexOf(s[i]); if (idx < 0) throw err('Invalid secret');
      value = (value << 5) | idx; bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return out;
  }
  function hotp(env, keyBytes, counter) {
    var msg = [], c = counter;
    for (var i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
    var h = env.hmacSha1(keyBytes, msg).map(function (b) { return b & 255; });
    var o = h[19] & 15;
    var code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return pad(code % 1000000, 6);
  }
  function totpCounter(env) { return Math.floor(env.now().getTime() / 30000); }
  // returns matched counter or -1; window of ±1 step (±30 s) to tolerate phone clock drift
  function totpCheck(env, secret, code) {
    code = str(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return -1;
    var key = base32Decode(secret), c = totpCounter(env);
    for (var w = -1; w <= 1; w++) if (hotp(env, key, c + w) === code) return c + w;
    return -1;
  }
  function otpauthUri(secret, email, issuer) {
    var label = encodeURIComponent(issuer) + ':' + encodeURIComponent(email);
    return 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30';
  }
  function randomToken(env, n) { return toHex(env.randomBytes(n || 32)); }
  // Stored as "<iterations>$<hex>" so the iteration count can be tuned per environment without breaking old hashes.
  function hashPassword(env, password, salt, iterations) {
    var n = iterations || env.hashIterations || 1000;
    var h = env.sha256Hex(salt + '|' + password);
    for (var i = 0; i < n; i++) h = env.sha256Hex(h + salt);
    return n + '$' + h;
  }
  function checkPassword(env, password, user) {
    var stored = String(user.passwordHash || ''), n = Number(stored.split('$')[0]) || 1000;
    return hashPassword(env, String(password || ''), user.salt, n) === stored;
  }
  function passwordPolicy(pw) {
    pw = String(pw || '');
    if (pw.length < 10) throw err('Password must be at least 10 characters');
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw err('Password must contain letters and numbers');
  }
  function tempPassword(env) {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = env.randomBytes(12), s = '';
    for (var i = 0; i < 12; i++) s += chars[b[i] % chars.length];
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8) + '7';
  }

  // ---------------------------------------------------------------- permissions
  function effectivePerms(user) {
    var base = (ROLES[user.role] || ROLES.viewer).perms, out = {}, custom = user.permissions || {};
    MODULES.forEach(function (m) { out[m] = custom[m] !== undefined && custom[m] !== null && custom[m] !== '' ? Number(custom[m]) : base[m]; });
    if (user.role === 'admin') out.admin = 3;
    return out;
  }
  function need(ctx, module, level) {
    if (!ctx.user) throw err('Please sign in', 'AUTH');
    if ((ctx.perms[module] || 0) < level) throw err('You do not have ' + ['', 'view', 'edit', 'full'][level] + ' access to ' + MODULE_LABELS[module], 'FORBIDDEN');
  }
  function publicUser(u) {
    return { id: u.id, email: u.email, name: u.name, role: u.role, permissions: u.permissions || {}, perms: effectivePerms(u), mfaEnabled: !!u.mfaEnabled, active: u.active !== false, mustChangePassword: !!u.mustChangePassword, lastLoginAt: u.lastLoginAt || '', createdAt: u.createdAt || '', lockedUntil: u.lockedUntil || '' };
  }

  // ---------------------------------------------------------------- documents: totals & status
  function calcItems(items) {
    var clean = [], subtotal = 0;
    (items || []).forEach(function (it) {
      var desc = str(it.description), qty = num(it.qty), price = num(it.price), disc = num(it.discount);
      if (!desc && !qty) return;
      if (!desc) throw err('Every line needs a description');
      if (qty <= 0) throw err('Quantity must be greater than 0 for ' + desc);
      if (price < 0) throw err('Price cannot be negative for ' + desc);
      if (disc < 0 || disc >= 1) throw err('Discount must be between 0% and 99% for ' + desc);
      var amount = round2(qty * price * (1 - disc));
      subtotal += amount;
      clean.push({ code: str(it.code), description: desc, qty: qty, price: price, discount: disc, amount: amount });
    });
    if (!clean.length) throw err('Add at least one line item');
    return { items: clean, subtotal: round2(subtotal) };
  }
  function docTotals(items, vat, vatRate) {
    var c = calcItems(items), rate = vat ? num(vatRate) : 0, vatAmount = round2(c.subtotal * rate);
    return { items: c.items, subtotal: c.subtotal, vatRate: rate, vatAmount: vatAmount, total: round2(c.subtotal + vatAmount) };
  }

  // Allocates receipts to invoices: linked receipts first, then unlinked receipts FIFO by invoice date per customer.
  function computeInvoiceStatus(invoices, receipts, todayIso) {
    var live = invoices.filter(function (i) { return i.status !== 'void'; }).map(function (i) { return Object.assign({}, i, { paid: 0 }); });
    var byNo = {}; live.forEach(function (i) { byNo[i.number] = i; });
    var pool = {}; // customer -> unallocated amount
    receipts.filter(function (r) { return r.status !== 'void'; }).forEach(function (r) {
      var amt = num(r.amount), inv = r.invoiceNumber ? byNo[r.invoiceNumber] : null;
      if (inv) {
        var room = Math.max(0, inv.total - inv.paid), take = Math.min(room, amt);
        inv.paid = round2(inv.paid + take); amt = round2(amt - take);
      }
      if (amt > 0) { var k = lower(r.customerName); pool[k] = round2((pool[k] || 0) + amt); }
    });
    live.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.number - b.number; }).forEach(function (inv) {
      var k = lower(inv.customerName), avail = pool[k] || 0;
      if (avail > 0) { var take = Math.min(avail, Math.max(0, inv.total - inv.paid)); inv.paid = round2(inv.paid + take); pool[k] = round2(avail - take); }
    });
    var map = {};
    live.forEach(function (i) {
      var bal = round2(i.total - i.paid);
      var st = bal <= 0.004 ? 'Paid' : i.paid > 0 ? 'Partial' : 'Unpaid';
      var daysOverdue = bal > 0.004 && i.dueDate && i.dueDate < todayIso ? daysBetween(i.dueDate, todayIso) : 0;
      map[i.id] = { paid: i.paid, balance: Math.max(0, bal), payStatus: st, daysOverdue: daysOverdue };
    });
    return { byId: map, unallocated: pool };
  }

  // Ledger = the old "Transactions" sheet: every invoice and receipt, oldest first, with a running balance per customer.
  function buildLedger(data) {
    var rows = [];
    data.invoices.filter(function (i) { return i.status !== 'void'; }).forEach(function (i) {
      rows.push({ date: i.date, docType: 'Invoice', docNo: i.number, customer: i.customerName, vat: !!i.vat, debit: num(i.total), credit: 0, ref: i.id, notes: i.notes || '' });
    });
    data.receipts.filter(function (r) { return r.status !== 'void'; }).forEach(function (r) {
      rows.push({ date: r.date, docType: 'Receipt', docNo: r.number, customer: r.customerName, vat: false, debit: 0, credit: num(r.amount), ref: r.id, notes: (r.invoiceNumber ? 'For invoice #' + r.invoiceNumber + '. ' : '') + (r.mode || '') });
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.docType === b.docType ? a.docNo - b.docNo : a.docType === 'Invoice' ? -1 : 1); });
    var seg = {}; (data.customers || []).forEach(function (c) { seg[lower(c.name)] = c.segment || ''; });
    var run = {};
    rows.forEach(function (r, i) {
      var k = lower(r.customer); run[k] = round2((run[k] || 0) + r.debit - r.credit);
      r.sno = i + 1; r.balance = run[k]; r.segment = seg[k] || '';
    });
    return rows;
  }

  function buildStatement(data, customerName, from, to) {
    var k = lower(customerName), ledger = buildLedger(data).filter(function (r) { return lower(r.customer) === k; });
    var opening = 0, lines = [], inv = 0, rec = 0;
    ledger.forEach(function (r) {
      if (from && r.date < from) { opening = round2(opening + r.debit - r.credit); return; }
      if (to && r.date > to) return;
      inv += r.debit; rec += r.credit; lines.push(r);
    });
    var bal = opening;
    lines = lines.map(function (r) { bal = round2(bal + r.debit - r.credit); return Object.assign({}, r, { balance: bal }); });
    var cust = (data.customers || []).filter(function (c) { return lower(c.name) === k; })[0] || { name: customerName };
    return { customer: cust, from: from, to: to, opening: opening, invoiced: round2(inv), received: round2(rec), closing: round2(opening + inv - rec), lines: lines };
  }

  function cashbookWithBalance(entries) {
    var rows = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1); });
    var bal = 0;
    return rows.map(function (e, i) { bal = round2(bal + num(e.amountIn) - num(e.amountOut)); return Object.assign({}, e, { sno: i + 1, balance: bal }); });
  }

  // ---------------------------------------------------------------- analytics & forecast
  function monthKey(d) { return String(d).slice(0, 7); }
  function monthSeries(data, months, todayIso) {
    var end = parseDate(todayIso), keys = [];
    for (var i = months - 1; i >= 0; i--) { var d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1)); keys.push(isoDate(d).slice(0, 7)); }
    var sales = {}, coll = {}, count = {};
    keys.forEach(function (k) { sales[k] = 0; coll[k] = 0; count[k] = 0; });
    data.invoices.forEach(function (i) { if (i.status === 'void') return; var k = monthKey(i.date); if (k in sales) { sales[k] = round2(sales[k] + num(i.total)); count[k]++; } });
    data.receipts.forEach(function (r) { if (r.status === 'void') return; var k = monthKey(r.date); if (k in coll) coll[k] = round2(coll[k] + num(r.amount)); });
    return keys.map(function (k) { return { month: k, sales: sales[k], collections: coll[k], invoices: count[k] }; });
  }
  // Holt's linear trend (double exponential smoothing), falls back to mean when history is thin.
  function forecast(values, horizon, alpha, beta) {
    alpha = alpha || 0.5; beta = beta || 0.3; horizon = horizon || 3;
    var v = values.map(num), firstIdx = 0;
    while (firstIdx < v.length && v[firstIdx] === 0) firstIdx++;
    v = v.slice(firstIdx);
    if (v.length === 0) return { points: repeat(0, horizon), lower: repeat(0, horizon), upper: repeat(0, horizon), method: 'none', note: 'No sales history yet' };
    if (v.length < 3) {
      var mean = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
      return { points: repeat(round2(mean), horizon), lower: repeat(round2(mean * 0.5), horizon), upper: repeat(round2(mean * 1.5), horizon), method: 'average', note: 'Only ' + v.length + ' month(s) of history — using the average. Accuracy improves as more months are recorded.' };
    }
    var level = v[0], trend = v[1] - v[0], resid = [];
    for (var i = 1; i < v.length; i++) {
      var pred = level + trend; resid.push(v[i] - pred);
      var nl = alpha * v[i] + (1 - alpha) * (level + trend);
      trend = beta * (nl - level) + (1 - beta) * trend; level = nl;
    }
    var sd = Math.sqrt(resid.reduce(function (a, r) { return a + r * r; }, 0) / Math.max(1, resid.length));
    var pts = [], lo = [], hi = [];
    for (var h = 1; h <= horizon; h++) {
      var p = Math.max(0, level + h * trend), band = 1.28 * sd * Math.sqrt(h);
      pts.push(round2(p)); lo.push(round2(Math.max(0, p - band))); hi.push(round2(p + band));
    }
    return { points: pts, lower: lo, upper: hi, method: 'holt', note: 'Trend-based forecast from ' + v.length + ' months (80% range shown).' };
  }
  function repeat(x, n) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }
  function nextMonths(lastKey, n) {
    var y = +lastKey.slice(0, 4), m = +lastKey.slice(5, 7), out = [];
    for (var i = 0; i < n; i++) { m++; if (m > 12) { m = 1; y++; } out.push(y + '-' + pad(m, 2)); }
    return out;
  }

  // ---------------------------------------------------------------- data health (hygiene KPIs)
  function computeHealth(data, todayIso) {
    var st = computeInvoiceStatus(data.invoices, data.receipts, todayIso);
    var issues = [];
    function add(sev, cat, title, fix, items, module) { if (items.length) issues.push({ severity: sev, category: cat, title: title, fix: fix, count: items.length, items: items.slice(0, 50), module: module }); }
    var liveInv = data.invoices.filter(function (i) { return i.status !== 'void'; });
    var custNames = {}; data.customers.forEach(function (c) { custNames[lower(c.name)] = c; });

    // Stale dates
    var od = liveInv.filter(function (i) { return st.byId[i.id] && st.byId[i.id].daysOverdue > 0; });
    add('high', 'Stale dates', 'Overdue invoices over 60 days', 'Call the customer, agree a payment date and record it in Receipts.', od.filter(function (i) { return st.byId[i.id].daysOverdue > 60; }).map(function (i) { return '#' + i.number + ' · ' + i.customerName + ' · GHS ' + money(st.byId[i.id].balance) + ' · ' + st.byId[i.id].daysOverdue + ' days'; }), 'invoices');
    add('medium', 'Stale dates', 'Overdue invoices (1–60 days)', 'Send a reminder with the invoice attached.', od.filter(function (i) { return st.byId[i.id].daysOverdue <= 60; }).map(function (i) { return '#' + i.number + ' · ' + i.customerName + ' · GHS ' + money(st.byId[i.id].balance) + ' · ' + st.byId[i.id].daysOverdue + ' days'; }), 'invoices');
    add('low', 'Stale dates', 'Expired proformas still open', 'Convert to an invoice if the customer accepted, otherwise void it.', data.proformas.filter(function (p) { return p.status === 'open' && p.validUntil && p.validUntil < todayIso; }).map(function (p) { return '#' + p.number + ' · ' + p.customerName + ' · expired ' + p.validUntil; }), 'proformas');

    // Missing fields
    var activeCustomers = {}; liveInv.forEach(function (i) { activeCustomers[lower(i.customerName)] = 1; });
    add('high', 'Missing fields', 'Customers with invoices but no email', 'Add an email so invoices and receipts can be sent to them.', data.customers.filter(function (c) { return activeCustomers[lower(c.name)] && !isEmail(c.email); }).map(function (c) { return c.name; }), 'customers');
    add('medium', 'Missing fields', 'Customers with no phone number', 'Add a phone / WhatsApp number for follow-ups.', data.customers.filter(function (c) { return !str(c.phone); }).map(function (c) { return c.name; }), 'customers');
    add('medium', 'Missing fields', 'Products with no cost price', 'Enter the supplier cost so margins can be tracked.', data.products.filter(function (p) { return p.active !== false && !num(p.costPrice); }).map(function (p) { return p.code + ' · ' + p.name; }), 'products');
    add('high', 'Missing fields', 'Products with no selling price', 'Set a carton price before it can be invoiced.', data.products.filter(function (p) { return p.active !== false && !num(p.price); }).map(function (p) { return p.code + ' · ' + p.name; }), 'products');
    add('low', 'Missing fields', 'Suppliers with no contact details', 'Add a phone or email for each supplier.', data.suppliers.filter(function (s) { return !str(s.phone) && !str(s.email); }).map(function (s) { return s.name; }), 'suppliers');

    // Mismatches
    add('medium', 'Mismatches', 'Invoices whose VAT setting differs from the customer default', 'Check whether VAT should apply; re-issue if wrong.', liveInv.filter(function (i) { var c = custNames[lower(i.customerName)]; return c && !!c.vatDefault !== !!i.vat; }).map(function (i) { return '#' + i.number + ' · ' + i.customerName + ' · invoice ' + (i.vat ? 'VAT' : 'no VAT') + ', customer default ' + (custNames[lower(i.customerName)].vatDefault ? 'VAT' : 'no VAT'); }), 'invoices');
    add('medium', 'Mismatches', 'Invoices for customers not in the customer list', 'Add the customer or correct the name so statements match.', liveInv.filter(function (i) { return !custNames[lower(i.customerName)]; }).map(function (i) { return '#' + i.number + ' · ' + i.customerName; }), 'customers');
    add('low', 'Mismatches', 'Customers with unallocated credit', 'Payment received with nothing to apply it to — link it to an invoice or refund it.', Object.keys(st.unallocated).filter(function (k) { return st.unallocated[k] > 0.004; }).map(function (k) { return (custNames[k] ? custNames[k].name : k) + ' · GHS ' + money(st.unallocated[k]); }), 'receipts');
    add('low', 'Mismatches', 'Invoices never emailed to the customer', 'Open the invoice and press Email.', liveInv.filter(function (i) { return !i.emailedAt; }).map(function (i) { return '#' + i.number + ' · ' + i.customerName; }), 'invoices');
    var dup = {}; data.customers.forEach(function (c) { var k = lower(c.name).replace(/[^a-z0-9]/g, ''); dup[k] = (dup[k] || []).concat([c.name]); });
    add('medium', 'Mismatches', 'Possible duplicate customers', 'Merge duplicates so sales are not split.', Object.keys(dup).filter(function (k) { return dup[k].length > 1; }).map(function (k) { return dup[k].join(' / '); }), 'customers');

    // Concentration (single-threading)
    var byCust = {}, total = 0; liveInv.forEach(function (i) { byCust[i.customerName] = (byCust[i.customerName] || 0) + num(i.total); total += num(i.total); });
    var top = Object.keys(byCust).sort(function (a, b) { return byCust[b] - byCust[a]; })[0];
    if (top && total > 0 && byCust[top] / total > 0.5) add('medium', 'Concentration', 'One customer is more than half of all sales', 'Reduce risk by growing other customers / segments.', [top + ' · ' + Math.round(byCust[top] / total * 100) + '% of sales'], 'analytics');

    // Cash book
    var cb = cashbookWithBalance(data.cashbook || []);
    add('high', 'Cash', 'Cash book went negative', 'Check for missing cash-in entries or mis-typed amounts.', cb.filter(function (e) { return e.balance < 0; }).map(function (e) { return e.date + ' · ' + e.description + ' · balance GHS ' + money(e.balance); }), 'cashbook');

    // KPIs
    var outstanding = 0, overdueAmt = 0, collected = 0, billed = 0;
    liveInv.forEach(function (i) { var s = st.byId[i.id]; billed += num(i.total); outstanding += s.balance; if (s.daysOverdue > 0) overdueAmt += s.balance; });
    data.receipts.forEach(function (r) { if (r.status !== 'void') collected += num(r.amount); });
    var custComplete = data.customers.length ? data.customers.filter(function (c) { return isEmail(c.email) && str(c.phone); }).length / data.customers.length : 1;
    var prodComplete = data.products.length ? data.products.filter(function (p) { return num(p.price) && num(p.costPrice); }).length / data.products.length : 1;
    var weights = { high: 12, medium: 5, low: 2 }, penalty = 0;
    issues.forEach(function (i) { penalty += weights[i.severity] * Math.min(3, Math.ceil(i.count / 3)); });
    var ageing = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    liveInv.forEach(function (i) { var s = st.byId[i.id]; if (s.balance <= 0) return; var d = s.daysOverdue; if (d <= 0) ageing.current += s.balance; else if (d <= 30) ageing.d30 += s.balance; else if (d <= 60) ageing.d60 += s.balance; else if (d <= 90) ageing.d90 += s.balance; else ageing.d90p += s.balance; });
    Object.keys(ageing).forEach(function (k) { ageing[k] = round2(ageing[k]); });
    var sevOrder = { high: 0, medium: 1, low: 2 };
    issues.sort(function (a, b) { return sevOrder[a.severity] - sevOrder[b.severity] || b.count - a.count; });
    return {
      score: Math.max(0, 100 - penalty),
      kpis: {
        collectionRate: billed ? round2(collected / billed * 100) : 100,
        overdueShare: outstanding ? round2(overdueAmt / outstanding * 100) : 0,
        outstanding: round2(outstanding), overdue: round2(overdueAmt),
        customerCompleteness: Math.round(custComplete * 100), productCompleteness: Math.round(prodComplete * 100),
        dso: billed ? Math.round(outstanding / Math.max(1, billed) * 90) : 0
      },
      ageing: ageing,
      issues: issues
    };
  }

  // ---------------------------------------------------------------- printable HTML documents (screen, print, PDF and email all use these)
  function letterhead(co) {
    return '<table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr><td style="vertical-align:top">' +
      '<div style="font-size:22px;font-weight:800;letter-spacing:.5px;color:#7a1f1f">' + esc(co.name) + '</div>' +
      '<div style="font-size:11px;color:#555;margin-top:2px">' + esc(co.tagline || '') + '</div>' +
      '<div style="font-size:11px;color:#333;margin-top:6px;line-height:1.5">' + esc(co.poBox) + '<br>Location: ' + esc(co.location) + '<br>Tel: ' + esc(co.phones) + ' &nbsp;|&nbsp; Momo: ' + esc(co.momo) + ' &nbsp;|&nbsp; WhatsApp: ' + esc(co.whatsapp) + '<br>Email: ' + esc(co.email) + ' &nbsp;|&nbsp; TIN: ' + esc(co.tin) + '</div>' +
      '</td></tr></table>';
  }
  function docShell(inner) {
    return '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1d;max-width:760px;margin:0 auto;padding:28px;background:#fff">' + inner + '</div>';
  }
  function kv(label, value) { return '<tr><td style="padding:2px 10px 2px 0;color:#666;font-size:12px">' + esc(label) + '</td><td style="padding:2px 0;font-size:12px;font-weight:600">' + value + '</td></tr>'; }
  function renderInvoiceHtml(doc, co, kind, extra) {
    kind = kind || 'invoice'; extra = extra || {};
    var title = kind === 'proforma' ? 'PROFORMA INVOICE' : 'INVOICE';
    var cust = extra.customer || {};
    var rows = doc.items.map(function (it, i) {
      return '<tr style="background:' + (i % 2 ? '#faf7f5' : '#fff') + '"><td style="padding:7px 8px;font-size:12px">' + esc(it.code) + '</td><td style="padding:7px 8px;font-size:12px">' + esc(it.description) + '</td><td style="padding:7px 8px;font-size:12px;text-align:right">' + round2(it.qty) + '</td><td style="padding:7px 8px;font-size:12px;text-align:right">' + money(it.price) + '</td><td style="padding:7px 8px;font-size:12px;text-align:right">' + (it.discount ? Math.round(it.discount * 100) + '%' : '') + '</td><td style="padding:7px 8px;font-size:12px;text-align:right;font-weight:600">' + money(it.amount) + '</td></tr>';
    }).join('');
    var right = '<table style="border-collapse:collapse">' +
      kv(kind === 'proforma' ? 'Proforma #' : 'Invoice #', esc(doc.number)) + kv('Date', esc(doc.date)) +
      kv(kind === 'proforma' ? 'Valid until' : 'Due date', esc(kind === 'proforma' ? doc.validUntil : doc.dueDate)) +
      kv('VAT status', doc.vat ? 'VAT' : 'NON-VAT') + '</table>';
    var bill = '<div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px">Bill to</div><div style="font-size:14px;font-weight:700;margin-top:3px">' + esc(doc.customerName) + '</div>' +
      '<div style="font-size:12px;color:#333;line-height:1.5">' + [cust.address, cust.phone, cust.email].filter(Boolean).map(esc).join('<br>') + '</div>';
    var totals = '<table style="margin-left:auto;border-collapse:collapse;min-width:260px">' +
      '<tr><td style="padding:4px 8px;font-size:12px;color:#555">Subtotal</td><td style="padding:4px 8px;text-align:right;font-size:12px">' + money(doc.subtotal) + '</td></tr>' +
      '<tr><td style="padding:4px 8px;font-size:12px;color:#555">VAT (' + round2(num(doc.vatRate) * 100) + '%)</td><td style="padding:4px 8px;text-align:right;font-size:12px">' + money(doc.vatAmount) + '</td></tr>' +
      '<tr><td style="padding:8px;font-size:14px;font-weight:800;border-top:2px solid #7a1f1f">TOTAL (GHS)</td><td style="padding:8px;text-align:right;font-size:14px;font-weight:800;border-top:2px solid #7a1f1f">' + money(doc.total) + '</td></tr>' +
      (extra.balance !== undefined && kind === 'invoice' ? '<tr><td style="padding:4px 8px;font-size:12px;color:#555">Paid to date</td><td style="padding:4px 8px;text-align:right;font-size:12px">' + money(extra.paid || 0) + '</td></tr><tr><td style="padding:4px 8px;font-size:12px;font-weight:700">Balance due</td><td style="padding:4px 8px;text-align:right;font-size:12px;font-weight:700">' + money(extra.balance) + '</td></tr>' : '') +
      '</table>';
    return docShell(letterhead(co) +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:16px"><tr><td style="vertical-align:top;width:55%">' + bill + '</td><td style="vertical-align:top"><div style="font-size:24px;font-weight:800;color:#7a1f1f;margin-bottom:6px">' + title + '</div>' + right + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr style="background:#7a1f1f;color:#fff"><th style="padding:8px;font-size:11px;text-align:left">Code</th><th style="padding:8px;font-size:11px;text-align:left">Description</th><th style="padding:8px;font-size:11px;text-align:right">Qty (ctns)</th><th style="padding:8px;font-size:11px;text-align:right">Ctn price</th><th style="padding:8px;font-size:11px;text-align:right">Disc.</th><th style="padding:8px;font-size:11px;text-align:right">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      totals +
      (doc.notes ? '<div style="margin-top:16px;font-size:12px;color:#444"><b>Notes:</b> ' + esc(doc.notes) + '</div>' : '') +
      '<div style="margin-top:28px;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:10px">Payment by Momo (' + esc(co.momo) + '), bank transfer, cash or cheque. Thank you for your business.</div>');
  }
  function renderReceiptHtml(r, co, extra) {
    extra = extra || {};
    return docShell(letterhead(co) +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px"><tr><td><div style="font-size:24px;font-weight:800;color:#7a1f1f">OFFICIAL RECEIPT</div></td><td style="text-align:right"><table style="margin-left:auto">' + kv('Receipt #', esc(r.number)) + kv('Date', esc(r.date)) + '</table></td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      line('Received from', esc(r.customerName)) +
      line('The sum of', 'GHS ' + money(r.amount) + ' <span style="color:#555;font-weight:400">(' + esc(amountInWords(r.amount)) + ')</span>') +
      line('Payment for', esc(r.paymentFor || (r.invoiceNumber ? 'Invoice #' + r.invoiceNumber : 'Account payment'))) +
      line('Mode of payment', esc(r.mode) + (r.reference ? ' · Ref: ' + esc(r.reference) : '')) +
      (extra.balance !== undefined ? line('Outstanding balance', 'GHS ' + money(extra.balance)) : '') +
      '</table>' +
      '<table style="width:100%;margin-top:46px;font-size:12px;color:#444"><tr><td>Received by: ' + esc(extra.receivedBy || '') + '<br><br>______________________</td><td style="text-align:right">Manager\'s signature<br><br>______________________</td></tr></table>');
    function line(l, v) { return '<tr><td style="padding:9px 0;width:180px;color:#666;border-bottom:1px dotted #ccc">' + l + '</td><td style="padding:9px 0;font-weight:700;border-bottom:1px dotted #ccc">' + v + '</td></tr>'; }
  }
  function renderStatementHtml(s, co) {
    var rows = s.lines.map(function (r) {
      return '<tr><td style="padding:6px;font-size:12px">' + esc(r.date) + '</td><td style="padding:6px;font-size:12px">' + r.docType + ' #' + r.docNo + '</td><td style="padding:6px;font-size:12px;text-align:right">' + (r.debit ? money(r.debit) : '') + '</td><td style="padding:6px;font-size:12px;text-align:right">' + (r.credit ? money(r.credit) : '') + '</td><td style="padding:6px;font-size:12px;text-align:right;font-weight:600">' + money(r.balance) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="padding:10px;font-size:12px;color:#777">No transactions in this period.</td></tr>';
    return docShell(letterhead(co) +
      '<div style="font-size:20px;font-weight:800;color:#7a1f1f;margin-bottom:10px">CUSTOMER STATEMENT OF ACCOUNT</div>' +
      '<table style="width:100%;margin-bottom:14px"><tr><td style="vertical-align:top"><table>' + kv('Customer', esc(s.customer.name)) + kv('Period', esc(s.from || 'start') + ' to ' + esc(s.to || 'today')) + '</table></td><td style="vertical-align:top"><table style="margin-left:auto">' + kv('Opening balance', money(s.opening)) + kv('Invoiced', money(s.invoiced)) + kv('Received', money(s.received)) + kv('BALANCE DUE (GHS)', '<span style="font-size:14px;color:#7a1f1f">' + money(s.closing) + '</span>') + '</table></td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#7a1f1f;color:#fff"><th style="padding:7px;font-size:11px;text-align:left">Date</th><th style="padding:7px;font-size:11px;text-align:left">Document</th><th style="padding:7px;font-size:11px;text-align:right">Invoiced</th><th style="padding:7px;font-size:11px;text-align:right">Received</th><th style="padding:7px;font-size:11px;text-align:right">Balance</th></tr></thead><tbody><tr><td colspan="4" style="padding:6px;font-size:12px;color:#555">Opening balance</td><td style="padding:6px;font-size:12px;text-align:right">' + money(s.opening) + '</td></tr>' + rows + '</tbody></table>');
  }
  function amountInWords(n) {
    n = round2(n); var ced = Math.floor(n), pes = Math.round((n - ced) * 100);
    var a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    function w(x) {
      if (x < 20) return a[x];
      if (x < 100) return b[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '');
      if (x < 1000) return a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' and ' + w(x % 100) : '');
      if (x < 1e6) return w(Math.floor(x / 1000)) + ' thousand' + (x % 1000 ? (x % 1000 < 100 ? ' and ' : ' ') + w(x % 1000) : '');
      return w(Math.floor(x / 1e6)) + ' million' + (x % 1e6 ? ' ' + w(x % 1e6) : '');
    }
    var s = (ced ? w(ced) : 'zero') + ' Ghana cedi' + (ced === 1 ? '' : 's');
    if (pes) s += ' and ' + w(pes) + ' pesewa' + (pes === 1 ? '' : 's');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ================================================================ API
  function createApi(store, env) {
    // ------------ table helpers
    function all(t) { return store.all(t); }
    // Next 8-digit numeric ID for a table: highest existing numeric id + 1 (or the table's base).
    var idCursor = {};
    function newId(t) {
      var base = ID_BASE[t], span = ID_SPAN[t] || 9999999, cur = idCursor[t];
      if (cur === undefined) {
        cur = base;
        var ids = store.maxId ? [store.maxId(t)] : all(t).map(function (r) { return r.id; });
        ids.forEach(function (x) { var n = Number(x); if (/^\d{8}$/.test(String(x)) && n > cur && n <= base + span) cur = n; });
      }
      cur += 1;
      if (cur > base + span) throw err('ID range for ' + t + ' is full');
      idCursor[t] = cur;
      return String(cur);
    }
    function byId(t, id) { var r = all(t).filter(function (x) { return x.id === id; })[0]; if (!r) throw err('Record not found', 'NOT_FOUND'); return r; }
    function settings() {
      var s = clone(DEFAULT_SETTINGS);
      all('settings').forEach(function (r) { s[r.id] = r.value; });
      return s;
    }
    function setSetting(k, v) {
      var ex = all('settings').filter(function (r) { return r.id === k; })[0];
      if (ex) store.update('settings', k, { value: v }); else store.insert('settings', { id: k, value: v });
    }
    function company() { var c = settings().company; return c || {}; }
    function stamp() { return env.now().toISOString(); }
    function today() { return isoDate(new Date(env.now().getTime() + (env.tzOffsetMinutes || 0) * 60000)); }
    function audit(ctx, action, entity, id, details) {
      store.insert('audit', { id: newId('audit'), at: stamp(), user: ctx && ctx.user ? ctx.user.email : 'system', action: action, entity: entity || '', entityId: id || '', details: typeof details === 'string' ? details : JSON.stringify(details || '') });
    }
    function nextNumber(key, table) {
      var s = settings(), n = num(s[key]);
      var max = 0; all(table).forEach(function (r) { if (num(r.number) > max) max = num(r.number); });
      if (n <= max) n = max + 1;
      setSetting(key, n + 1);
      return n;
    }
    function findCustomer(name) { var k = lower(name); return all('customers').filter(function (c) { return lower(c.name) === k; })[0]; }

    // ------------ sessions & login tickets (short-lived, kept in cache)
    var SESSION_TTL = 6 * 3600, TICKET_TTL = 600;
    function newTicket(user, stage, extra) {
      var t = randomToken(env, 24);
      env.cachePut('tkt:' + t, JSON.stringify(Object.assign({ userId: user.id, stage: stage }, extra || {})), TICKET_TTL);
      return t;
    }
    function readTicket(t, stage) {
      var raw = t && env.cacheGet('tkt:' + t); if (!raw) throw err('Your sign-in step expired. Please sign in again.', 'AUTH');
      var d = JSON.parse(raw); if (d.stage !== stage) throw err('Unexpected sign-in step', 'AUTH');
      return d;
    }
    function startSession(user) {
      var token = randomToken(env, 32);
      env.cachePut('sess:' + token, JSON.stringify({ userId: user.id }), SESSION_TTL);
      store.update('users', user.id, { lastLoginAt: stamp(), failedAttempts: 0, lockedUntil: '' });
      audit({ user: user }, 'login', 'users', user.id, '');
      var u = byId('users', user.id);
      return { step: 'done', token: token, user: publicUser(u) };
    }
    function afterPassword(user) {
      var s = settings();
      if (user.mustChangePassword) return { step: 'changePassword', ticket: newTicket(user, 'changePassword') };
      if (user.mfaEnabled) return { step: 'mfa', ticket: newTicket(user, 'mfa') };
      if (s.requireMfa) return enrollStep(user);
      return startSession(user);
    }
    function enrollStep(user) {
      var secret = base32Encode(env.randomBytes(20));
      var t = newTicket(user, 'mfaEnroll', { secret: secret });
      return { step: 'mfaEnroll', ticket: t, secret: secret, otpauth: otpauthUri(secret, user.email, 'Lismandy Enterprise') };
    }
    function useCode(user, counter) {
      var k = 'totp:' + user.id, last = env.cacheGet(k);
      if (last && Number(last) >= counter) throw err('That code was already used. Wait for the next one.', 'AUTH');
      env.cachePut(k, String(counter), 120);
    }
    function authFail(user, msg) {
      if (user) {
        var f = num(user.failedAttempts) + 1, patch = { failedAttempts: f };
        if (f >= 5) { patch.lockedUntil = new Date(env.now().getTime() + 15 * 60000).toISOString(); patch.failedAttempts = 0; }
        store.update('users', user.id, patch);
      }
      throw err(msg || 'Incorrect email or password', 'AUTH');
    }
    function checkLock(user) {
      if (user.lockedUntil && user.lockedUntil > stamp()) throw err('Too many failed attempts. Try again after ' + user.lockedUntil.slice(11, 16) + ' UTC.', 'LOCKED');
    }
    function contextFromToken(token) {
      var raw = token && env.cacheGet('sess:' + token);
      if (!raw) throw err('Your session has expired. Please sign in again.', 'AUTH');
      var s = JSON.parse(raw), user = all('users').filter(function (u) { return u.id === s.userId; })[0];
      if (!user || user.active === false) { env.cacheRemove('sess:' + token); throw err('Your account is disabled.', 'AUTH'); }
      env.cachePut('sess:' + token, raw, SESSION_TTL); // sliding expiry
      return { user: user, perms: effectivePerms(user), token: token };
    }

    // ------------ documents
    function customerForDoc(name) {
      var c = findCustomer(name); if (!c) throw err('Customer "' + name + '" is not in the customer list. Add them first.');
      return c;
    }
    function statusSnapshot() { return computeInvoiceStatus(all('invoices'), all('receipts'), today()); }
    function decorateInvoice(i, st) { var s = st.byId[i.id] || { paid: 0, balance: 0, payStatus: i.status === 'void' ? 'Void' : 'Unpaid', daysOverdue: 0 }; return Object.assign({}, i, s, i.status === 'void' ? { payStatus: 'Void', balance: 0 } : {}); }

    function saveDoc(ctx, table, d) {
      var isInv = table === 'invoices', s = settings();
      var cust = customerForDoc(d.customerName);
      var date = validDate(d.date || today(), 'Date');
      var t = docTotals(d.items, !!d.vat, s.vatRate);
      var row = { date: date, customerId: cust.id, customerName: cust.name, vat: !!d.vat, vatRate: t.vatRate, items: t.items, subtotal: t.subtotal, vatAmount: t.vatAmount, total: t.total, notes: str(d.notes), updatedAt: stamp() };
      if (isInv) row.dueDate = validDate(d.dueDate || addDays(date, num(s.paymentTermsDays) || 30), 'Due date');
      else row.validUntil = validDate(d.validUntil || addDays(date, num(s.proformaValidDays) || 14), 'Valid until');
      if (d.id) {
        var ex = byId(table, d.id);
        if (ex.status === 'void') throw err('This document is void and cannot be edited');
        if (!isInv && ex.status === 'converted') throw err('This proforma was already converted to invoice #' + ex.convertedInvoice);
        if (isInv) { var paid = (statusSnapshot().byId[ex.id] || {}).paid || 0; if (t.total + 0.004 < paid) throw err('New total is below the GHS ' + money(paid) + ' already received'); }
        store.update(table, ex.id, row);
        audit(ctx, 'update', table, ex.id, '#' + ex.number + ' total ' + money(t.total));
        return byId(table, ex.id);
      }
      row.id = newId(table); row.number = nextNumber(isInv ? 'nextInvoiceNo' : 'nextProformaNo', table);
      row.status = isInv ? 'issued' : 'open'; row.createdBy = ctx.user.email; row.createdAt = stamp(); row.emailedAt = '';
      if (isInv) row.fromProforma = num(d.fromProforma) || ''; else row.convertedInvoice = '';
      store.insert(table, row);
      audit(ctx, 'create', table, row.id, '#' + row.number + ' ' + cust.name + ' GHS ' + money(t.total));
      return row;
    }

    function saveReceipt(ctx, d) {
      var cust = customerForDoc(d.customerName), amount = round2(d.amount);
      if (amount <= 0) throw err('Amount must be greater than 0');
      var modes = ['Cash', 'Momo', 'Transfer', 'Cheque'];
      if (modes.indexOf(d.mode) < 0) throw err('Choose a payment mode: ' + modes.join(', '));
      var invNo = num(d.invoiceNumber) || '';
      if (invNo) {
        var inv = all('invoices').filter(function (i) { return i.number === invNo && i.status !== 'void'; })[0];
        if (!inv) throw err('Invoice #' + invNo + ' was not found');
        if (lower(inv.customerName) !== lower(cust.name)) throw err('Invoice #' + invNo + ' belongs to ' + inv.customerName);
      }
      var row = { date: validDate(d.date || today(), 'Date'), customerId: cust.id, customerName: cust.name, invoiceNumber: invNo, amount: amount, mode: d.mode, reference: str(d.reference), paymentFor: str(d.paymentFor), notes: str(d.notes), updatedAt: stamp() };
      if (d.id) {
        need(ctx, 'receipts', 3);
        var ex = byId('receipts', d.id); if (ex.status === 'void') throw err('This receipt is void');
        store.update('receipts', ex.id, row);
        syncCashFromReceipt(ctx, byId('receipts', ex.id));
        audit(ctx, 'update', 'receipts', ex.id, '#' + ex.number + ' GHS ' + money(amount));
        return byId('receipts', ex.id);
      }
      row.id = newId('receipts'); row.number = nextNumber('nextReceiptNo', 'receipts'); row.status = 'valid'; row.createdBy = ctx.user.email; row.createdAt = stamp(); row.emailedAt = '';
      store.insert('receipts', row);
      syncCashFromReceipt(ctx, row);
      audit(ctx, 'create', 'receipts', row.id, '#' + row.number + ' ' + cust.name + ' GHS ' + money(amount));
      return row;
    }
    // Every receipt posts one "In" line to the cash book (the old manual step), kept in sync on edit/void.
    function syncCashFromReceipt(ctx, r) {
      var ex = all('cashbook').filter(function (e) { return e.source === 'receipt' && e.sourceId === r.id; })[0];
      if (r.status === 'void') { if (ex) store.remove('cashbook', ex.id); return; }
      var row = { date: r.date, description: 'Receipt #' + r.number + ' — ' + r.customerName, category: 'Sales receipt', type: 'In', reference: r.mode + (r.reference ? ' ' + r.reference : ''), amountIn: r.amount, amountOut: 0, notes: r.invoiceNumber ? 'Invoice #' + r.invoiceNumber : '', source: 'receipt', sourceId: r.id, updatedAt: stamp() };
      if (ex) store.update('cashbook', ex.id, row);
      else { row.id = newId('cashbook'); row.createdBy = ctx.user.email; row.createdAt = stamp(); store.insert('cashbook', row); }
    }

    function dataFor(ctx) {
      var p = ctx.perms, out = { company: company(), settings: publicSettings(ctx), today: today() };
      var st = statusSnapshot();
      var can = function (m) { return p[m] >= 1; };
      var needInv = can('invoices') || can('dashboard') || can('ledger') || can('statements') || can('analytics') || can('health') || can('receipts');
      out.customers = all('customers');
      out.products = can('products') || can('invoices') || can('proformas') || can('health') ? all('products') : [];
      out.suppliers = can('suppliers') || can('health') ? all('suppliers') : [];
      out.invoices = needInv ? all('invoices').map(function (i) { return decorateInvoice(i, st); }) : [];
      out.receipts = needInv ? all('receipts') : [];
      out.proformas = can('proformas') || can('health') ? all('proformas') : [];
      out.cashbook = can('cashbook') || can('health') ? all('cashbook') : [];
      out.unallocated = st.unallocated;
      if (!can('products') && !can('health')) out.products = out.products.map(function (x) { var y = Object.assign({}, x); delete y.costPrice; return y; });
      return out;
    }
    function publicSettings(ctx) {
      var s = settings(), o = {};
      Object.keys(s).forEach(function (k) { if (k === 'company') return; if (SECRET_SETTINGS[k]) o[k] = s[k] ? '••••••' : ''; else o[k] = s[k]; });
      if (ctx.perms.admin < 1) { delete o.mailerUrl; }
      o.mailerConfigured = !!(s.mailerUrl && s.mailerSecret);
      return o;
    }

    function sendEmail(ctx, d) {
      var type = d.docType, s = settings(), co = company();
      var moduleFor = { invoice: 'invoices', proforma: 'proformas', receipt: 'receipts', statement: 'statements' }[type];
      if (!moduleFor) throw err('Unknown document type');
      need(ctx, moduleFor, 2);
      if (!s.mailerUrl || !s.mailerSecret) throw err('Email is not connected yet. An admin needs to link the Lismandy mailbox in Admin → Settings.', 'MAILER');
      var to = str(d.to).split(/[,;\s]+/).filter(Boolean);
      if (!to.length || to.some(function (e) { return !isEmail(e); })) throw err('Enter a valid recipient email');
      var html, subject, number, table, id, name;
      if (type === 'statement') {
        var stmt = buildStatement({ invoices: all('invoices'), receipts: all('receipts'), customers: all('customers') }, d.customerName, d.from, d.to_date);
        html = renderStatementHtml(stmt, co); subject = 'Statement of account — ' + stmt.customer.name; number = stmt.customer.name; name = 'Statement-' + stmt.customer.name.replace(/[^A-Za-z0-9]+/g, '-');
      } else {
        table = moduleFor; var doc = byId(table, d.id); id = doc.id; number = doc.number;
        if (doc.status === 'void') throw err('Cannot email a void document');
        var cust = findCustomer(doc.customerName) || {};
        if (type === 'receipt') {
          var bal = 0; var stt = statusSnapshot(); all('invoices').forEach(function (i) { if (lower(i.customerName) === lower(doc.customerName) && stt.byId[i.id]) bal += stt.byId[i.id].balance; });
          html = renderReceiptHtml(doc, co, { balance: round2(bal), receivedBy: ctx.user.name });
          subject = 'Receipt #' + doc.number + ' from ' + co.name; name = 'Receipt-' + doc.number;
        } else {
          var sd = type === 'invoice' ? statusSnapshot().byId[doc.id] || {} : {};
          html = renderInvoiceHtml(doc, co, type, { customer: cust, paid: sd.paid, balance: sd.balance });
          subject = (type === 'proforma' ? 'Proforma invoice #' : 'Invoice #') + doc.number + ' from ' + co.name; name = (type === 'proforma' ? 'Proforma-' : 'Invoice-') + doc.number;
        }
      }
      var intro = str(d.message) || 'Dear ' + (type === 'statement' ? number : 'Customer') + ',\n\nPlease find attached your ' + type + ' from ' + co.name + '.\n\nThank you.';
      var body = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;white-space:pre-line">' + esc(intro) + '</div><hr style="border:none;border-top:1px solid #eee;margin:18px 0">' + html;
      var log = { id: newId('emails'), at: stamp(), user: ctx.user.email, docType: type, docNumber: String(number), to: to.join(', '), subject: subject, status: 'sent', error: '' };
      try {
        env.sendMail({ url: s.mailerUrl, secret: s.mailerSecret, to: to.join(','), cc: s.emailCcSelf ? co.email : '', subject: subject, html: body, attachmentHtml: html, attachmentName: name + '.pdf', fromName: co.name, replyTo: co.email });
      } catch (e) {
        log.status = 'failed'; log.error = String(e.message || e); store.insert('emails', log);
        throw err('Email failed: ' + log.error, 'MAILER');
      }
      store.insert('emails', log);
      if (table) store.update(table, id, { emailedAt: stamp() });
      audit(ctx, 'email', table || 'statements', id || '', subject + ' → ' + log.to);
      return { sent: true, to: log.to };
    }

    // ------------ master data
    function saveMaster(ctx, table, d, fields, required) {
      var row = {};
      fields.forEach(function (f) { if (d[f] !== undefined) row[f] = BOOL_COLS[f] ? !!d[f] && d[f] !== 'No' : NUM_COLS[f] ? num(d[f]) : str(d[f]); });
      required.forEach(function (f) { if (!str(d[f])) throw err(f.charAt(0).toUpperCase() + f.slice(1) + ' is required'); });
      if (row.email && !isEmail(row.email)) throw err('Email address is not valid');
      var key = table === 'products' ? 'code' : 'name';
      var dup = all(table).filter(function (r) { return lower(r[key]) === lower(d[key]) && r.id !== d.id; })[0];
      if (dup) throw err('A record with this ' + key + ' already exists');
      row.updatedAt = stamp();
      if (d.id) {
        var ex = byId(table, d.id);
        store.update(table, d.id, row);
        if (table === 'customers' && row.name && row.name !== ex.name) renameCustomer(ex.name, row.name);
        audit(ctx, 'update', table, d.id, row[key] || ex[key]);
        return byId(table, d.id);
      }
      row.id = newId(table); row.createdAt = stamp();
      if (table === 'products' && row.active === undefined) row.active = true;
      store.insert(table, row);
      audit(ctx, 'create', table, row.id, row[key]);
      return row;
    }
    function renameCustomer(oldName, newName) {
      ['invoices', 'proformas', 'receipts'].forEach(function (t) { all(t).forEach(function (r) { if (r.customerName === oldName) store.update(t, r.id, { customerName: newName }); }); });
    }
    function deleteMaster(ctx, table, id) {
      var ex = byId(table, id);
      if (table === 'customers') {
        var used = ['invoices', 'proformas', 'receipts'].some(function (t) { return all(t).some(function (r) { return lower(r.customerName) === lower(ex.name); }); });
        if (used) throw err('This customer has documents and cannot be deleted. Edit them instead.');
      }
      store.remove(table, id);
      audit(ctx, 'delete', table, id, ex.name || ex.code);
      return { deleted: true };
    }

    // ------------ admin
    function saveUser(ctx, d) {
      var email = lower(d.email), role = d.role || 'viewer';
      if (!isEmail(email)) throw err('Enter a valid email');
      if (!ROLES[role]) throw err('Unknown role');
      var perms = {};
      MODULES.forEach(function (m) { if (d.permissions && d.permissions[m] !== undefined && d.permissions[m] !== null && d.permissions[m] !== '') perms[m] = Math.max(0, Math.min(3, num(d.permissions[m]))); });
      var dup = all('users').filter(function (u) { return lower(u.email) === email && u.id !== d.id; })[0];
      if (dup) throw err('A user with this email already exists');
      if (d.id) {
        var ex = byId('users', d.id);
        if (ex.id === ctx.user.id && (role !== 'admin' || d.active === false)) throw err('You cannot remove your own admin access or disable yourself');
        store.update('users', d.id, { email: email, name: str(d.name), role: role, permissions: perms, active: d.active !== false, updatedAt: stamp() });
        audit(ctx, 'update', 'users', d.id, email + ' role=' + role);
        return { user: publicUser(byId('users', d.id)) };
      }
      var pw = tempPassword(env), salt = randomToken(env, 16);
      var u = { id: newId('users'), email: email, name: str(d.name) || email, role: role, permissions: perms, passwordHash: hashPassword(env, pw, salt), salt: salt, mustChangePassword: true, mfaEnabled: false, mfaSecret: '', recoveryCodes: [], active: true, failedAttempts: 0, lockedUntil: '', lastLoginAt: '', createdAt: stamp(), updatedAt: stamp() };
      store.insert('users', u);
      audit(ctx, 'create', 'users', u.id, email + ' role=' + role);
      return { user: publicUser(u), tempPassword: pw };
    }

    // ------------ action table
    var A = {};
    A.ping = { pub: true, fn: function () { return { ok: true, time: stamp(), hasUsers: all('users').length > 0 }; } };
    A.login = {
      pub: true, fn: function (ctx, d) {
        var u = all('users').filter(function (x) { return lower(x.email) === lower(d.email); })[0];
        if (!u || u.active === false) { hashPassword(env, String(d.password || ''), 'x'); throw err('Incorrect email or password', 'AUTH'); }
        checkLock(u);
        if (!checkPassword(env, d.password, u)) authFail(u);
        return afterPassword(u);
      }
    };
    A.completePasswordChange = {
      pub: true, fn: function (ctx, d) {
        var t = readTicket(d.ticket, 'changePassword'), u = byId('users', t.userId);
        passwordPolicy(d.newPassword);
        if (checkPassword(env, d.newPassword, u)) throw err('Choose a new password different from the temporary one');
        var salt = randomToken(env, 16);
        store.update('users', u.id, { passwordHash: hashPassword(env, d.newPassword, salt), salt: salt, mustChangePassword: false, updatedAt: stamp() });
        env.cacheRemove('tkt:' + d.ticket);
        return afterPassword(byId('users', u.id));
      }
    };
    A.mfaVerify = {
      pub: true, fn: function (ctx, d) {
        var t = readTicket(d.ticket, 'mfa'), u = byId('users', t.userId);
        checkLock(u);
        var code = str(d.code).replace(/\s/g, '');
        if (!/^\d{6}$/.test(code)) { // recovery code (XXXX-XXXX)
          var h = env.sha256Hex(code.replace(/-/g, '').toUpperCase()), list = u.recoveryCodes || [];
          if (list.indexOf(h) < 0) authFail(u, 'That recovery code is not valid');
          store.update('users', u.id, { recoveryCodes: list.filter(function (x) { return x !== h; }) });
          audit({ user: u }, 'mfa-recovery-used', 'users', u.id, (list.length - 1) + ' codes left');
        } else {
          var c = totpCheck(env, u.mfaSecret, code);
          if (c < 0) authFail(u, 'That code is not correct. Check the time on your phone and try the newest code.');
          useCode(u, c);
        }
        env.cacheRemove('tkt:' + d.ticket);
        return startSession(byId('users', u.id));
      }
    };
    A.mfaEnrollConfirm = {
      pub: true, fn: function (ctx, d) {
        var t = readTicket(d.ticket, 'mfaEnroll'), u = byId('users', t.userId);
        var c = totpCheck(env, t.secret, d.code);
        if (c < 0) throw err('That code does not match. Make sure you scanned the latest QR code and try again.', 'AUTH');
        var codes = [], hashes = [];
        for (var i = 0; i < 8; i++) { var raw = base32Encode(env.randomBytes(5)).slice(0, 8); codes.push(raw.slice(0, 4) + '-' + raw.slice(4)); hashes.push(env.sha256Hex(raw)); }
        store.update('users', u.id, { mfaEnabled: true, mfaSecret: t.secret, recoveryCodes: hashes, updatedAt: stamp() });
        useCode(u, c);
        env.cacheRemove('tkt:' + d.ticket);
        audit({ user: u }, 'mfa-enabled', 'users', u.id, '');
        var res = startSession(byId('users', u.id)); res.recoveryCodes = codes;
        return res;
      }
    };
    A.logout = { fn: function (ctx) { env.cacheRemove('sess:' + ctx.token); return { ok: true }; } };
    A.me = { fn: function (ctx) { return { user: publicUser(ctx.user) }; } };
    A.changePassword = {
      fn: function (ctx, d) {
        if (!checkPassword(env, d.currentPassword, ctx.user)) throw err('Current password is incorrect', 'AUTH');
        passwordPolicy(d.newPassword);
        var salt = randomToken(env, 16);
        store.update('users', ctx.user.id, { passwordHash: hashPassword(env, d.newPassword, salt), salt: salt, updatedAt: stamp() });
        audit(ctx, 'password-changed', 'users', ctx.user.id, '');
        return { ok: true };
      }
    };
    A.getData = { fn: function (ctx) { return dataFor(ctx); } };
    // Set up or replace the authenticator from inside a signed-in session (Account page)
    A.mfaSetupStart = {
      fn: function (ctx, d) {
        if (!checkPassword(env, d.currentPassword, ctx.user)) throw err('Current password is incorrect', 'AUTH');
        var secret = base32Encode(env.randomBytes(20));
        env.cachePut('mfasetup:' + ctx.user.id, secret, TICKET_TTL);
        return { secret: secret, otpauth: otpauthUri(secret, ctx.user.email, 'Lismandy Enterprise') };
      }
    };
    A.mfaSetupConfirm = {
      fn: function (ctx, d) {
        var secret = env.cacheGet('mfasetup:' + ctx.user.id);
        if (!secret) throw err('Setup expired. Start again.');
        var c = totpCheck(env, secret, d.code);
        if (c < 0) throw err('That code does not match. Try the newest code in your app.');
        var codes = [], hashes = [];
        for (var i = 0; i < 8; i++) { var raw = base32Encode(env.randomBytes(5)).slice(0, 8); codes.push(raw.slice(0, 4) + '-' + raw.slice(4)); hashes.push(env.sha256Hex(raw)); }
        store.update('users', ctx.user.id, { mfaEnabled: true, mfaSecret: secret, recoveryCodes: hashes, updatedAt: stamp() });
        env.cacheRemove('mfasetup:' + ctx.user.id); useCode(ctx.user, c);
        audit(ctx, 'mfa-enabled', 'users', ctx.user.id, 'self-service');
        return { recoveryCodes: codes, user: publicUser(byId('users', ctx.user.id)) };
      }
    };

    A['invoices.save'] = { fn: function (ctx, d) { need(ctx, 'invoices', 2); return saveDoc(ctx, 'invoices', d); } };
    A['invoices.void'] = { fn: function (ctx, d) { need(ctx, 'invoices', 3); var i = byId('invoices', d.id); var paid = (statusSnapshot().byId[i.id] || {}).paid || 0; if (paid > 0) throw err('GHS ' + money(paid) + ' has been received against this invoice. Void the receipts linked to this invoice first'); store.update('invoices', i.id, { status: 'void', notes: (i.notes ? i.notes + ' | ' : '') + 'VOID: ' + str(d.reason), updatedAt: stamp() }); audit(ctx, 'void', 'invoices', i.id, '#' + i.number + ' ' + str(d.reason)); return { ok: true }; } };
    A['proformas.save'] = { fn: function (ctx, d) { need(ctx, 'proformas', 2); return saveDoc(ctx, 'proformas', d); } };
    A['proformas.void'] = { fn: function (ctx, d) { need(ctx, 'proformas', 3); var p = byId('proformas', d.id); store.update('proformas', p.id, { status: 'void', updatedAt: stamp() }); audit(ctx, 'void', 'proformas', p.id, '#' + p.number); return { ok: true }; } };
    A['proformas.convert'] = {
      fn: function (ctx, d) {
        need(ctx, 'proformas', 2); need(ctx, 'invoices', 2);
        var p = byId('proformas', d.id);
        if (p.status !== 'open') throw err('Only open proformas can be converted');
        var inv = saveDoc(ctx, 'invoices', { customerName: p.customerName, date: today(), vat: p.vat, items: p.items, notes: p.notes, fromProforma: p.number });
        store.update('proformas', p.id, { status: 'converted', convertedInvoice: inv.number, updatedAt: stamp() });
        return inv;
      }
    };
    A['receipts.save'] = { fn: function (ctx, d) { need(ctx, 'receipts', 2); return saveReceipt(ctx, d); } };
    A['receipts.void'] = { fn: function (ctx, d) { need(ctx, 'receipts', 3); var r = byId('receipts', d.id); store.update('receipts', r.id, { status: 'void', notes: (r.notes ? r.notes + ' | ' : '') + 'VOID: ' + str(d.reason), updatedAt: stamp() }); syncCashFromReceipt(ctx, byId('receipts', r.id)); audit(ctx, 'void', 'receipts', r.id, '#' + r.number); return { ok: true }; } };
    A['cashbook.save'] = {
      fn: function (ctx, d) {
        need(ctx, 'cashbook', 2);
        var type = d.type === 'Out' ? 'Out' : 'In', amt = round2(d.amount);
        if (amt <= 0) throw err('Amount must be greater than 0');
        if (!str(d.description)) throw err('Description is required');
        var row = { date: validDate(d.date || today(), 'Date'), description: str(d.description), category: str(d.category), type: type, reference: str(d.reference), amountIn: type === 'In' ? amt : 0, amountOut: type === 'Out' ? amt : 0, notes: str(d.notes), updatedAt: stamp() };
        if (d.id) { var ex = byId('cashbook', d.id); if (ex.source === 'receipt') throw err('This line comes from a receipt — edit the receipt instead'); store.update('cashbook', d.id, row); audit(ctx, 'update', 'cashbook', d.id, row.description); return byId('cashbook', d.id); }
        row.id = newId('cashbook'); row.source = 'manual'; row.sourceId = ''; row.createdBy = ctx.user.email; row.createdAt = stamp();
        store.insert('cashbook', row); audit(ctx, 'create', 'cashbook', row.id, row.type + ' ' + money(amt) + ' ' + row.description); return row;
      }
    };
    A['cashbook.delete'] = { fn: function (ctx, d) { need(ctx, 'cashbook', 3); var ex = byId('cashbook', d.id); if (ex.source === 'receipt') throw err('Void the receipt instead'); store.remove('cashbook', d.id); audit(ctx, 'delete', 'cashbook', d.id, ex.description); return { ok: true }; } };

    A['customers.save'] = { fn: function (ctx, d) { need(ctx, 'customers', 2); if (d.segment && ['Open Market', 'Modern Trade', 'Wholesale', 'Retail', 'Institution', 'Other'].indexOf(d.segment) < 0) throw err('Unknown segment'); return saveMaster(ctx, 'customers', d, ['name', 'segment', 'vatDefault', 'email', 'phone', 'address', 'contactPerson', 'notes'], ['name']); } };
    A['customers.delete'] = { fn: function (ctx, d) { need(ctx, 'customers', 3); return deleteMaster(ctx, 'customers', d.id); } };
    A['suppliers.save'] = { fn: function (ctx, d) { need(ctx, 'suppliers', 2); return saveMaster(ctx, 'suppliers', d, ['name', 'contact', 'phone', 'email', 'notes'], ['name']); } };
    A['suppliers.delete'] = { fn: function (ctx, d) { need(ctx, 'suppliers', 3); return deleteMaster(ctx, 'suppliers', d.id); } };
    A['products.save'] = {
      fn: function (ctx, d) {
        need(ctx, 'products', 2);
        if (!str(d.code) && str(d.name)) { var pre = (str(d.source) === 'Nkulenu' ? 'NK' : str(d.source) === 'Nkatie Burger' ? 'NB' : str(d.name).replace(/\s/g, '').slice(0, 3).toUpperCase()); var n = all('products').filter(function (p) { return p.code.indexOf(pre + '-') === 0; }).length + 1; d.code = pre + '-' + pad(n, 3); }
        if (num(d.price) < 0 || num(d.costPrice) < 0) throw err('Prices cannot be negative');
        return saveMaster(ctx, 'products', d, ['code', 'name', 'source', 'type', 'packaging', 'unitsPerCtn', 'packLabel', 'costPrice', 'price', 'price200', 'active'], ['name']);
      }
    };
    A['products.delete'] = { fn: function (ctx, d) { need(ctx, 'products', 3); return deleteMaster(ctx, 'products', d.id); } };
    A['email.send'] = { fn: function (ctx, d) { return sendEmail(ctx, d); } };

    A['admin.users'] = { fn: function (ctx) { need(ctx, 'admin', 1); return all('users').map(publicUser); } };
    A['admin.saveUser'] = { fn: function (ctx, d) { need(ctx, 'admin', 2); return saveUser(ctx, d); } };
    A['admin.resetPassword'] = { fn: function (ctx, d) { need(ctx, 'admin', 2); var u = byId('users', d.id), pw = tempPassword(env), salt = randomToken(env, 16); store.update('users', u.id, { passwordHash: hashPassword(env, pw, salt), salt: salt, mustChangePassword: true, failedAttempts: 0, lockedUntil: '', updatedAt: stamp() }); audit(ctx, 'reset-password', 'users', u.id, u.email); return { tempPassword: pw }; } };
    A['admin.resetMfa'] = { fn: function (ctx, d) { need(ctx, 'admin', 2); var u = byId('users', d.id); store.update('users', u.id, { mfaEnabled: false, mfaSecret: '', recoveryCodes: [], updatedAt: stamp() }); audit(ctx, 'reset-mfa', 'users', u.id, u.email); return { ok: true }; } };
    A['admin.deleteUser'] = { fn: function (ctx, d) { need(ctx, 'admin', 3); if (d.id === ctx.user.id) throw err('You cannot delete yourself'); var u = byId('users', d.id); store.remove('users', d.id); audit(ctx, 'delete', 'users', d.id, u.email); return { ok: true }; } };
    A['admin.audit'] = { fn: function (ctx, d) { need(ctx, 'admin', 1); return all('audit').slice(-Math.min(1000, num(d && d.limit) || 300)).reverse(); } };
    A['admin.emails'] = { fn: function (ctx) { need(ctx, 'admin', 1); return all('emails').slice(-300).reverse(); } };
    A['admin.saveSettings'] = {
      fn: function (ctx, d) {
        need(ctx, 'admin', 2);
        var allowed = { vatRate: 'n', paymentTermsDays: 'n', proformaValidDays: 'n', requireMfa: 'b', bulkQtyThreshold: 'n', mailerUrl: 's', mailerSecret: 's', emailCcSelf: 'b', nextInvoiceNo: 'n', nextProformaNo: 'n', nextReceiptNo: 'n' };
        Object.keys(d.settings || {}).forEach(function (k) {
          if (!allowed[k]) return;
          var v = d.settings[k];
          if (k === 'mailerSecret' && (v === '••••••' || v === undefined)) return;
          if (k === 'mailerUrl' && v && !/^https:\/\/script\.google\.com\//.test(v)) throw err('Mailer URL must be the Apps Script web-app URL from the Lismandy account');
          if (k === 'vatRate' && (num(v) < 0 || num(v) > 0.5)) throw err('VAT rate looks wrong (use 0.03 for 3%)');
          setSetting(k, allowed[k] === 'n' ? num(v) : allowed[k] === 'b' ? !!v : str(v));
        });
        if (d.company) { var c = company(); ['name', 'tagline', 'poBox', 'location', 'phones', 'momo', 'whatsapp', 'email', 'tin'].forEach(function (k) { if (d.company[k] !== undefined) c[k] = str(d.company[k]); }); setSetting('company', c); }
        audit(ctx, 'settings', 'settings', '', Object.keys(d.settings || {}).join(','));
        return { settings: publicSettings(ctx), company: company() };
      }
    };
    A['admin.testMailer'] = { fn: function (ctx, d) { need(ctx, 'admin', 2); var s = settings(), co = company(); if (!s.mailerUrl || !s.mailerSecret) throw err('Save the mailer URL and secret first', 'MAILER'); env.sendMail({ url: s.mailerUrl, secret: s.mailerSecret, to: str(d.to) || co.email, subject: 'Lismandy system — test email', html: '<p>The Lismandy web system can send email from this mailbox. ✔</p>', fromName: co.name, replyTo: co.email }); return { sent: true }; } };

    // ------------ entry point
    function handle(req) {
      req = req || {};
      var a = A[req.action];
      try {
        if (!a) throw err('Unknown action: ' + req.action);
        var ctx = a.pub ? {} : contextFromToken(req.token);
        var data = env.withLock && !a.pub && /\.(save|void|convert|delete|send)|admin\.|changePassword/.test(req.action) ? env.withLock(function () { return a.fn(ctx, req.data || {}); }) : a.fn(ctx, req.data || {});
        if (store.flush) store.flush();
        return { ok: true, data: data };
      } catch (e) {
        if (store.discard) store.discard();
        return { ok: false, error: String(e && e.message || e), code: (e && e.code) || 'ERROR' };
      }
    }

    // ------------ one-time setup / seeding
    function seed(seedData, adminEmail, adminName) {
      if (all('users').length) throw err('Already initialised');
      setSetting('company', seedData.company);
      Object.keys(seedData.settings || {}).forEach(function (k) { setSetting(k, seedData.settings[k]); });
      var ts = stamp();
      (seedData.customers || []).forEach(function (c) { store.insert('customers', Object.assign({ id: newId('customers'), createdAt: ts, updatedAt: ts }, c)); });
      (seedData.suppliers || []).forEach(function (c) { store.insert('suppliers', Object.assign({ id: newId('suppliers'), createdAt: ts, updatedAt: ts }, c)); });
      (seedData.products || []).forEach(function (c) { store.insert('products', Object.assign({ id: newId('products'), createdAt: ts, updatedAt: ts }, c)); });
      var sys = { user: { email: 'import', name: 'Import' } };
      (seedData.invoices || []).forEach(function (inv) {
        var cust = findCustomer(inv.customer), t = docTotals(inv.items, inv.vat, seedData.settings.vatRate);
        store.insert('invoices', { id: newId('invoices'), number: inv.number, date: inv.date, dueDate: inv.dueDate, customerId: cust ? cust.id : '', customerName: inv.customer, vat: !!inv.vat, vatRate: t.vatRate, items: t.items, subtotal: t.subtotal, vatAmount: t.vatAmount, total: t.total, status: 'issued', notes: inv.notes || '', fromProforma: '', emailedAt: '', createdBy: 'import', createdAt: ts, updatedAt: ts });
      });
      var pw = tempPassword(env), salt = randomToken(env, 16);
      store.insert('users', { id: newId('users'), email: lower(adminEmail), name: adminName || 'Administrator', role: 'admin', permissions: {}, passwordHash: hashPassword(env, pw, salt), salt: salt, mustChangePassword: true, mfaEnabled: false, mfaSecret: '', recoveryCodes: [], active: true, failedAttempts: 0, lockedUntil: '', lastLoginAt: '', createdAt: ts, updatedAt: ts });
      audit(sys, 'setup', 'system', '', 'Database created from Excel master workbook');
      if (store.flush) store.flush();
      return { adminEmail: lower(adminEmail), tempPassword: pw };
    }

    // One-off: convert any older long IDs to 8-digit numbers and fix every reference to them.
    function migrateIds() {
      var changed = {}, total = 0;
      ['customers', 'suppliers', 'products', 'invoices', 'proformas', 'receipts', 'cashbook', 'users'].forEach(function (t) {
        changed[t] = {};
        all(t).forEach(function (r) { if (!/^\d{8}$/.test(String(r.id))) { var n = newId(t); changed[t][r.id] = n; store.update(t, r.id, { id: n }); total++; } });
      });
      ['invoices', 'proformas', 'receipts'].forEach(function (t) {
        all(t).forEach(function (r) { if (changed.customers[r.customerId]) store.update(t, r.id, { customerId: changed.customers[r.customerId] }); });
      });
      all('cashbook').forEach(function (r) { if (r.source === 'receipt' && changed.receipts[r.sourceId]) store.update('cashbook', r.id, { sourceId: changed.receipts[r.sourceId] }); });
      all('audit').forEach(function (r) {
        var map = changed[r.entity] || {};
        var patch = {};
        if (map[r.entityId]) patch.entityId = map[r.entityId];
        if (!/^\d{8}$/.test(String(r.id))) patch.id = newId('audit');
        if (patch.id || patch.entityId) { store.update('audit', r.id, patch); }
      });
      all('emails').forEach(function (r) { if (!/^\d{8}$/.test(String(r.id))) store.update('emails', r.id, { id: newId('emails') }); });
      if (store.flush) store.flush();
      return { converted: total };
    }

    return { handle: handle, seed: seed, actions: A, migrateIds: migrateIds };
  }

  return {
    SCHEMA: SCHEMA, JSON_COLS: JSON_COLS, BOOL_COLS: BOOL_COLS, NUM_COLS: NUM_COLS, MODULES: MODULES, MODULE_LABELS: MODULE_LABELS, ROLES: ROLES,
    createApi: createApi, effectivePerms: effectivePerms,
    calcItems: calcItems, docTotals: docTotals, computeInvoiceStatus: computeInvoiceStatus, buildLedger: buildLedger, buildStatement: buildStatement, cashbookWithBalance: cashbookWithBalance,
    monthSeries: monthSeries, forecast: forecast, nextMonths: nextMonths, computeHealth: computeHealth,
    renderInvoiceHtml: renderInvoiceHtml, renderReceiptHtml: renderReceiptHtml, renderStatementHtml: renderStatementHtml, amountInWords: amountInWords,
    base32Encode: base32Encode, base32Decode: base32Decode, hotp: hotp, totpCheck: totpCheck, otpauthUri: otpauthUri,
    money: money, round2: round2, isoDate: isoDate, addDays: addDays, daysBetween: daysBetween, strBytes: strBytes, toHex: toHex
  };
})();

export default LismandyCore;

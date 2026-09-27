
// =====================================================================================
//  LISMANDY ENTERPRISE — Google Apps Script API (bound to the "Lismandy Database" sheet)
//  Deploy: Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone
//  The website talks to this URL; every call except login needs a session token.
// =====================================================================================

var APP_VERSION = '1.0.0';
var ADMIN_EMAIL = 'fafale17@gmail.com';
var ADMIN_NAME = 'Roscoe';

function getDb_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DB_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run setup() from the spreadsheet\'s Apps Script editor first.');
  props.setProperty('DB_ID', ss.getId());
  return ss;
}

// ------------------------------------------------------------------ Sheet-backed store
function SheetStore_(ss) {
  var S = LismandyCore.SCHEMA, cache = {}, sheets = {};
  function sheet(t) {
    if (!sheets[t]) { sheets[t] = ss.getSheetByName(t); if (!sheets[t]) throw new Error('Missing sheet "' + t + '". Run setup().'); }
    return sheets[t];
  }
  function decode(col, v) {
    if (v instanceof Date) v = Utilities.formatDate(v, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    if (LismandyCore.JSON_COLS[col]) { if (v === '' || v === null) return col === 'value' ? '' : (col === 'items' || col === 'recoveryCodes' ? [] : {}); try { return JSON.parse(v); } catch (e) { return v; } }
    if (LismandyCore.BOOL_COLS[col]) return v === true || String(v).toUpperCase() === 'TRUE';
    if (LismandyCore.NUM_COLS[col]) return v === '' || v === null ? '' : Number(v);
    return v === null || v === undefined ? '' : String(v);
  }
  function encode(col, v) {
    if (LismandyCore.JSON_COLS[col]) return JSON.stringify(v === undefined ? '' : v);
    if (LismandyCore.BOOL_COLS[col]) return v ? 'TRUE' : 'FALSE';
    if (v === null || v === undefined) return '';
    return typeof v === 'number' ? v : String(v);
  }
  function load(t) {
    if (cache[t]) return cache[t];
    var sh = sheet(t), n = sh.getLastRow(), cols = S[t], rows = [];
    if (n >= 2) {
      var vals = sh.getRange(2, 1, n - 1, cols.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (vals[i][0] === '' || vals[i][0] === null) continue;
        var o = { _row: i + 2 };
        for (var c = 0; c < cols.length; c++) o[cols[c]] = decode(cols[c], vals[i][c]);
        rows.push(o);
      }
    }
    cache[t] = rows; return rows;
  }
  function strip(o) { var c = JSON.parse(JSON.stringify(o)); delete c._row; return c; }
  return {
    all: function (t) { return load(t).map(strip); },
    insert: function (t, row) {
      var cols = S[t], sh = sheet(t);
      sh.appendRow(cols.map(function (c) { return encode(c, row[c]); }));
      var o = JSON.parse(JSON.stringify(row)); o._row = sh.getLastRow(); load(t).push(o);
    },
    update: function (t, id, patch) {
      var rows = load(t), r = null;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) { r = rows[i]; break; }
      if (!r) throw new Error('Record not found');
      Object.keys(patch).forEach(function (k) { r[k] = JSON.parse(JSON.stringify(patch[k] === undefined ? '' : patch[k])); });
      var cols = S[t];
      sheet(t).getRange(r._row, 1, 1, cols.length).setValues([cols.map(function (c) { return encode(c, r[c]); })]);
    },
    remove: function (t, id) {
      var rows = load(t);
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) { sheet(t).deleteRow(rows[i]._row); break; }
      delete cache[t];
    },
    flush: function () { SpreadsheetApp.flush(); },
    discard: function () { cache = {}; }
  };
}

// ------------------------------------------------------------------ environment
function signed_(bytes) { return bytes.map(function (b) { b = b & 255; return b > 127 ? b - 256 : b; }); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
var gasEnv_ = {
  hashIterations: 400,
  tzOffsetMinutes: 0, // Ghana = UTC+0
  now: function () { return new Date(); },
  uuid: function () { return Utilities.getUuid(); },
  randomBytes: function (n) {
    var out = [];
    while (out.length < n) {
      var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random());
      for (var i = 0; i < d.length && out.length < n; i++) out.push(d[i] & 255);
    }
    return out;
  },
  sha256Hex: function (s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); },
  hmacSha1: function (key, msg) { return Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, signed_(msg), signed_(key)).map(function (b) { return b & 255; }); },
  cacheGet: function (k) { return CacheService.getScriptCache().get(k); },
  cachePut: function (k, v, ttl) { CacheService.getScriptCache().put(k, v, Math.min(21600, ttl)); },
  cacheRemove: function (k) { CacheService.getScriptCache().remove(k); },
  withLock: function (fn) { var l = LockService.getScriptLock(); l.waitLock(25000); try { return fn(); } finally { l.releaseLock(); } },
  sendMail: function (m) {
    var res = UrlFetchApp.fetch(m.url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true, payload: JSON.stringify({ secret: m.secret, to: m.to, cc: m.cc || '', subject: m.subject, html: m.html, attachmentHtml: m.attachmentHtml || '', attachmentName: m.attachmentName || '', fromName: m.fromName || '', replyTo: m.replyTo || '' }) });
    var body = res.getContentText(), j;
    try { j = JSON.parse(body); } catch (e) { throw new Error('Mailer did not respond correctly (HTTP ' + res.getResponseCode() + '). Check the mailer deployment URL.'); }
    if (!j.ok) throw new Error(j.error || 'Mailer error');
    return j;
  }
};

function api_() { return LismandyCore.createApi(SheetStore_(getDb_()), gasEnv_); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'Bad request' }); }
  return json_(api_().handle(req));
}
function doGet() { return json_({ ok: true, app: 'Lismandy API', version: APP_VERSION }); }

// ------------------------------------------------------------------ setup & maintenance (run from the editor or the Lismandy menu)
function setup() {
  var ss = getDb_(), S = LismandyCore.SCHEMA;
  Object.keys(S).forEach(function (t) {
    var sh = ss.getSheetByName(t) || ss.insertSheet(t);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(S[t].length, 1)).setNumberFormat('@');
    sh.getRange(1, 1, 1, S[t].length).setValues([S[t]]).setFontWeight('bold').setBackground('#7a1f1f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  ['Sheet1', 'Sheet 1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
  var hidden = ['users', 'settings', 'audit', 'emails'];
  hidden.forEach(function (n) { ss.getSheetByName(n).hideSheet(); });
  var api = api_(), res;
  if (api.handle({ action: 'ping' }).data.hasUsers) { Logger.log('Database already set up. Nothing seeded.'); return 'Already set up'; }
  res = api.seed(SEED_DATA, ADMIN_EMAIL, ADMIN_NAME);
  installBackupTrigger_();
  var msg = 'Setup complete.\n\nAdmin: ' + res.adminEmail + '\nTemporary password: ' + res.tempPassword + '\n\nSign in on the website with this, then you will choose a new password and link Google or Microsoft Authenticator.';
  Logger.log(msg);
  return msg;
}

// Emergency: if the admin is locked out, run this from the editor to get a new temporary password.
function resetAdminPassword() {
  var api = api_(), store = SheetStore_(getDb_());
  var u = store.all('users').filter(function (x) { return x.email === ADMIN_EMAIL; })[0];
  if (!u) throw new Error('Admin user not found');
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = gasEnv_.randomBytes(12), pw = '';
  for (var i = 0; i < 12; i++) pw += chars[b[i] % chars.length];
  pw = pw.slice(0, 4) + '-' + pw.slice(4, 8) + '-' + pw.slice(8) + '7';
  var salt = hex_(gasEnv_.randomBytes(16)), h = gasEnv_.sha256Hex(salt + '|' + pw);
  for (var j = 0; j < gasEnv_.hashIterations; j++) h = gasEnv_.sha256Hex(h + salt);
  store.update('users', u.id, { passwordHash: gasEnv_.hashIterations + '$' + h, salt: salt, mustChangePassword: true, failedAttempts: 0, lockedUntil: '', mfaEnabled: false, mfaSecret: '', recoveryCodes: [] });
  Logger.log('New temporary admin password: ' + pw + '  (authenticator was also reset — you will scan a new QR code)');
  return pw;
}

// Nightly copy of the database into LISMANDY DB/Backups (keeps the latest 30).
function backupDatabase() {
  var ss = getDb_(), file = DriveApp.getFileById(ss.getId());
  var parents = file.getParents(), parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName('Backups'), folder = it.hasNext() ? it.next() : parent.createFolder('Backups');
  file.makeCopy('Lismandy Database backup ' + Utilities.formatDate(new Date(), 'Africa/Accra', 'yyyy-MM-dd HHmm'), folder);
  var files = [], f = folder.getFiles();
  while (f.hasNext()) files.push(f.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(30).forEach(function (x) { x.setTrashed(true); });
}
function installBackupTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backupDatabase') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupDatabase').timeBased().everyDays(1).atHour(23).create();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lismandy')
    .addItem('1. Set up database', 'menuSetup_')
    .addItem('Back up now', 'backupDatabase')
    .addItem('Reset admin password', 'menuReset_')
    .addToUi();
}
function menuSetup_() { SpreadsheetApp.getUi().alert(setup()); }
function menuReset_() { SpreadsheetApp.getUi().alert('New temporary admin password:\n\n' + resetAdminPassword() + '\n\nThe authenticator link was also reset.'); }

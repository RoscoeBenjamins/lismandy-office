// =====================================================================================
//  LISMANDY MAILER — deploy this ONLY from the lismandyenterprise@gmail.com account.
//  It is the one and only place email leaves from, so customers always see the
//  Lismandy address. The main Lismandy API calls it with a shared secret.
//
//  1. Signed in as lismandyenterprise@gmail.com, go to script.google.com → New project
//  2. Paste this file, save, then Run → setupMailer (approve the Gmail permission)
//  3. Copy the secret it prints (View → Logs / Execution log)
//  4. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone
//  5. In the Lismandy website: Admin → Settings → Email, paste the web-app URL + secret
// =====================================================================================

function setupMailer() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('MAILER_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('MAILER_SECRET', secret);
  }
  GmailApp.getAliases(); // triggers the Gmail permission prompt
  Logger.log('Mailer secret (paste into Admin → Settings → Email):\n' + secret);
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
  return secret;
}

function doPost(e) {
  var out;
  try {
    var m = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
    if (!secret || !safeEqual_(String(m.secret || ''), secret)) throw new Error('Not authorised');
    var to = String(m.to || '').split(',').filter(String);
    if (!to.length || to.length > 10) throw new Error('Between 1 and 10 recipients allowed');
    if (MailApp.getRemainingDailyQuota() < to.length) throw new Error('Daily Gmail sending limit reached — try again tomorrow');
    var opts = { htmlBody: m.html, name: m.fromName || 'Lismandy Enterprise' };
    if (m.cc) opts.cc = m.cc;
    if (m.replyTo) opts.replyTo = m.replyTo;
    if (m.attachmentHtml) {
      var page = '<html><head><meta charset="utf-8"></head><body style="margin:0">' + m.attachmentHtml + '</body></html>';
      opts.attachments = [Utilities.newBlob(page, 'text/html', 'doc.html').getAs('application/pdf').setName(m.attachmentName || 'Document.pdf')];
    }
    GmailApp.sendEmail(to.join(','), String(m.subject || 'Lismandy Enterprise'), 'Please open this email in an HTML-capable mail app.', opts);
    out = { ok: true, remaining: MailApp.getRemainingDailyQuota() };
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'Lismandy Mailer' })).setMimeType(ContentService.MimeType.JSON);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * v129 · KM-MAIL-LOG — «ΑΛΛΗΛΟΓΡΑΦΙΑ» ΣΤΟΝ ΠΙΝΑΚΑ (12/10/2026, απόφαση Stavros)
 * Ζει στο ΙΔΙΟ Apps Script με το support_autoreply.gs (admin@fastwrite.tech) — νέο αρχείο, ίδιο έργο.
 * Τρέχει κάθε 10 λεπτά. Για κάθε μήνυμα από/προς support@ ή stavros@ στέλνει στον server ΜΟΝΟ:
 *   ποιος (επαφή), προς/από ποιο κουτί, εισερχόμενο/εξερχόμενο, θέμα, ώρα, 200 πρώτους χαρακτήρες, id συζήτησης.
 * ΔΕΝ στέλνει, ΔΕΝ απαντάει, ΔΕΝ αλλάζει τίποτα στο Gmail. Ο server κρατάει κάθε μήνυμα ΜΙΑ φορά.
 *
 * ΡΥΘΜΙΣΗ (μία φορά): ίδιο κλειδί με το support (KM_SUPPORT_KEY στα Script Properties — υπάρχει ήδη).
 *   Εκτέλεσε installMailLog(): στέλνει τους 90 τελευταίους ημέρες (ιστορικό) και στήνει το ρολόι 10′.
 */
var API_MAIL_LOG = 'https://fastwrite.tech/api/km/support/mail-log';
var MAIL_BOXES = ['support@fastwrite.tech', 'stavros@fastwrite.tech'];
var MAIL_SEARCH = '(from:support@fastwrite.tech OR to:support@fastwrite.tech OR cc:support@fastwrite.tech OR list:support@fastwrite.tech' +
                  ' OR from:stavros@fastwrite.tech OR to:stavros@fastwrite.tech OR cc:stavros@fastwrite.tech OR list:stavros@fastwrite.tech)';
var OURS_RE = /@fastwrite\.tech$/i;

function installMailLog() {
  if (!PropertiesService.getScriptProperties().getProperty('KM_SUPPORT_KEY')) { throw new Error('Λείπει το KM_SUPPORT_KEY.'); }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mailLog') { ScriptApp.deleteTrigger(t); } });
  var n = mailLogRun_('newer_than:90d', 500);
  ScriptApp.newTrigger('mailLog').timeBased().everyMinutes(10).create();
  console.log('ιστορικό: στάλθηκαν ' + n + ' μηνύματα · ρολόι 10′ ενεργό');
}
function uninstallMailLog() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mailLog') { ScriptApp.deleteTrigger(t); } });
}
function mailLog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { return; }
  try { mailLogRun_('newer_than:1d', 200); } finally { lock.releaseLock(); }
}

function mailLogRun_(when, maxThreads) {
  var items = [], sent = 0;
  GmailApp.search(MAIL_SEARCH + ' ' + when, 0, maxThreads).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var it = mailItem_(m, th);
      if (it) { items.push(it); }
      if (items.length >= 150) { sent += mailPost_(items); items = []; }
    });
  });
  if (items.length) { sent += mailPost_(items); }
  return sent;
}

function mailItem_(m, th) {
  var from = addr_(m.getFrom()), tos = (m.getTo() + ',' + m.getCc()).split(',').map(addr_).filter(Boolean);
  var all = [from].concat(tos);
  var box = MAIL_BOXES.filter(function (b) { return all.indexOf(b) >= 0; })[0];
  if (!box) { return null; }
  var out = OURS_RE.test(from) || from === 'stavrosfkallenos@gmail.com';
  var peer = out ? tos.filter(function (a) { return !OURS_RE.test(a); })[0] : from;
  if (!peer || OURS_RE.test(peer)) { return null; }
  var body = '';
  try { body = String(m.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 200); } catch (e) {}
  return { msg_id: m.getId(), thread_id: th.getId(), mailbox: box, dir: out ? 'out' : 'in', peer: peer,
           peer_name: out ? '' : name_(m.getFrom()), subject: m.getSubject(), at: m.getDate().toISOString(), snippet: body };
}

function mailPost_(items) {
  var key = PropertiesService.getScriptProperties().getProperty('KM_SUPPORT_KEY');
  var r = UrlFetchApp.fetch(API_MAIL_LOG, { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ items: items }), headers: { 'X-Km-Support': key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { console.error('mail-log ' + r.getResponseCode()); return 0; }
  try { return JSON.parse(r.getContentText()).saved || 0; } catch (e) { return 0; }
}
function addr_(s) { var m = /<([^>]+)>/.exec(String(s || '')); return (m ? m[1] : String(s || '')).trim().toLowerCase(); }
function name_(s) { var m = /^\s*"?([^"<]+?)"?\s*</.exec(String(s || '')); return m ? m[1].trim().slice(0, 80) : ''; }

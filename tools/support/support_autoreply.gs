/**
 * v92 · KM-SUP-CASE — ΑΥΤΟΜΑΤΗ ΑΠΑΝΤΗΣΗ ΤΟΥ support@ ΜΕ ΑΡΙΘΜΟ ΑΙΤΗΜΑΤΟΣ (26/9/2026)
 * Ζει στο Apps Script του admin@fastwrite.tech. Τρέχει κάθε 1 λεπτό.
 *
 * ΤΙ ΚΑΝΕΙ, για κάθε ΝΕΟ μήνυμα προς support@:
 *   · ΧΩΡΙΣ αριθμό (γράφτηκε έξω από την εφαρμογή): ζητάει ΝΕΟ αριθμό από τον
 *     server μας (KM-E-nnnnnn, ένας μετρητής για όλους → ποτέ ο ίδιος δύο φορές)
 *     και απαντάει «ο αριθμός σου είναι …», με τον αριθμό ΣΤΟ ΘΕΜΑ — άρα κάθε
 *     «Απάντηση» του χρήστη τον κρατάει μόνη της.
 *   · ΜΕ αριθμό (KM-<affiliate>-<n> από την εφαρμογή, ή KM-E-…): απαντάει
 *     «λάβαμε το μήνυμά σου για το …» — ΧΩΡΙΣ νέο αριθμό.
 * Αντικαθιστά τη σταθερή αυτόματη απάντηση του Google Group, που δεν μπορεί να
 * δώσει διαφορετικό αριθμό σε κάθε μήνυμα. Ο χρήστης παίρνει ΕΝΑ email, όχι δύο.
 *
 * ΦΡΕΝΑ (για να μη γίνει ποτέ βρόχος με αυτόματους απαντητές):
 *   · δεν απαντάει σε αυτόματα μηνύματα (Auto-Submitted, Precedence, X-Autoreply…)
 *   · δεν απαντάει σε δικές μας διευθύνσεις (@fastwrite.tech) ούτε σε mailer-daemon/no-reply
 *   · ≤5 απαντήσεις ανά αποστολέα ανά ώρα (κάθε μήνυμα απαντιέται, 26/9)
 *   · κάθε μήνυμα απαντιέται ΜΙΑ φορά (id στα Script Properties, 3 ημέρες)
 *   · v93 · KM-SUP-ARRIVED: κάθε αριθμός που φτάνει λέγεται στον server («έφτασε»)
 *     ΑΜΕΣΩΣ — η εφαρμογή δείχνει «Συνέχεια σε…» ΜΟΝΟ για όσους έφτασαν. Γίνεται
 *     ΠΡΙΝ από τα φρένα απάντησης: η άφιξη μετράει ακόμα κι αν δεν απαντήσουμε.
 * ΤΙ ΔΕΝ ΚΑΝΕΙ: δεν ενώνει αιτήματα (κλειστό 26/9), δεν στέλνει τίποτα στον server
 * εκτός από «δώσε μου αριθμό» — ούτε θέμα, ούτε κείμενο, ούτε διεύθυνση.
 *
 * ΡΥΘΜΙΣΗ (μία φορά): Script Properties → KM_SUPPORT_KEY = το κλειδί από
 * C:\Users\User\fastwrite-project\secrets\km_support_key.txt · μετά εκτέλεση
 * της install() (ζητάει άδειες, σημαδεύει ό,τι υπάρχει ήδη ως «απαντημένο»,
 * στήνει το ρολόι του 1 λεπτού). Προϋπόθεση: «Αποστολή ως support@» στο Gmail
 * του admin@ — αλλιώς ΔΕΝ στέλνει τίποτα (ποτέ από admin@).
 */

var API = 'https://fastwrite.tech/api/km/support/email-ticket';
var API_ARRIVED = 'https://fastwrite.tech/api/km/support/arrived';   // v93 · KM-SUP-ARRIVED
var SUPPORT = 'support@fastwrite.tech';
var NAME = 'FastWrite Support';
var SEARCH = '(list:support@fastwrite.tech OR to:support@fastwrite.tech OR cc:support@fastwrite.tech) newer_than:2d';
var WINDOW_MS = 36 * 3600 * 1000;      // μόνο μηνύματα των τελευταίων 36 ωρών
var KEEP_MS = 3 * 24 * 3600 * 1000;    // πόσο θυμόμαστε ότι απαντήσαμε
var CODE_RE = /KM-(?:E-\d{6,}|[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}-\d{1,9})/;
var FAIL_LABEL = 'KM-ΣΦΑΛΜΑ ΑΥΤΟΜΑΤΗΣ ΑΠΑΝΤΗΣΗΣ';

function install() {
  if (!PropertiesService.getScriptProperties().getProperty('KM_SUPPORT_KEY')) {
    throw new Error('Λείπει το KM_SUPPORT_KEY στα Script Properties.');
  }
  // 🔴 ΠΡΩΤΑ σημαδεύονται όσα υπάρχουν ήδη — αλλιώς το πρώτο τρέξιμο θα
  //    απαντούσε σε όλα τα μηνύματα των τελευταίων 2 ημερών.
  var n = markAllSeen_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processInbox') { ScriptApp.deleteTrigger(t); }
  });
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(1).create();
  console.log('ΕΤΟΙΜΟ · σημαδεύτηκαν ' + n + ' υπάρχοντα μηνύματα · ρολόι 1 λεπτού ενεργό');
}

function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processInbox') { ScriptApp.deleteTrigger(t); }
  });
  console.log('Το ρολόι σταμάτησε.');
}

function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { return; }            // προηγούμενο τρέξιμο ακόμα σε εξέλιξη
  try {
    var props = PropertiesService.getScriptProperties();
    var seen = props.getProperties();
    var now = Date.now(), done = 0;
    GmailApp.search(SEARCH, 0, 100).forEach(function (th) {
      th.getMessages().forEach(function (m) {
        var key = 'm:' + m.getId();
        if (seen[key]) { return; }
        if (now - m.getDate().getTime() > WINDOW_MS) { props.setProperty(key, String(now)); return; }
        var res = handle_(m);
        props.setProperty(key, String(now));      // σημάδι ΚΑΙ σε αποτυχία: ποτέ δεύτερη απάντηση
        if (res === 'fail') { th.addLabel(label_(FAIL_LABEL)); }
        if (res === 'sent') { done++; }
      });
    });
    prune_(props, now);
    if (done) { console.log('απαντήθηκαν ' + done); }
  } finally { lock.releaseLock(); }
}

function handle_(m) {
  var addr = addrOf_(m.getFrom());
  /* 🔴 26/9 (δοκιμή 4α): το Google Group μπορεί να ξαναγράψει το «Από» σε
     «Χ via FastWrite Support <support@fastwrite.tech>» — ο πραγματικός
     αποστολέας τότε ζει στο Reply-To. Χωρίς αυτό, κάθε τέτοιο μήνυμα έμοιαζε δικό μας. */
  if (addr === SUPPORT) { addr = addrOf_(m.getReplyTo()); }
  if (!addr || /@(?:[a-z0-9-]+\.)*fastwrite\.tech$/.test(addr)) { return skip_(m, 'δική μας διεύθυνση ' + addr); }
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)[@+]/.test(addr)) { return skip_(m, 'αυτόματος αποστολέας ' + addr); }
  if (isAuto_(m)) { return skip_(m, 'αυτόματο μήνυμα'); }
  var subj = m.getSubject() || '';
  var hit = CODE_RE.exec(subj) || CODE_RE.exec((m.getPlainBody() || '').slice(0, 4000));
  if (hit) { markArrived_(hit[0]); }

  var cache = CacheService.getScriptCache();
  var rk = 'r:' + addr, cnt = Number(cache.get(rk) || 0);
  if (cnt >= 5) { return 'skip'; }
  var code, body, outSubj;
  if (hit) {
    code = hit[0];
    // 26/9 (απόφαση Stavros): ΚΑΘΕ μήνυμα παίρνει απάντηση — το φρένο «1 ανά αριθμό
    // ανά 12 ώρες» έφυγε: ο χρήστης έγραφε και δεν ήξερε αν έφτασε.
    body = textAck_(code);
    outSubj = /(^|\s)KM-/.test(subj) ? reSubj_(subj) : reSubj_(subj) + ' [' + code + ']';
  } else {
    code = newCode_();
    if (!code) { return 'fail'; }
    body = textNew_(code);
    outSubj = reSubj_(subj) + ' [' + code + ']';
  }
  try {
    GmailApp.sendEmail(addr, outSubj, body, { from: SUPPORT, name: NAME, replyTo: SUPPORT });
  } catch (e) {
    console.error('ΔΕΝ ΣΤΑΛΘΗΚΕ (λείπει η «Αποστολή ως support@»;) ' + e);
    return 'fail';                                  // 🔴 ΠΟΤΕ από admin@
  }
  cache.put(rk, String(cnt + 1), 3600);
  return 'sent';
}

function addrOf_(s) {
  s = String(s || '');
  return ((/<([^>]+)>/.exec(s) || [null, s])[1] || '').trim().toLowerCase();
}

/* Κάθε παράλειψη γράφεται στο αρχείο εκτελέσεων — αλλιώς «δεν απάντησε» και
   «δεν είδε» μοιάζουν ίδια (26/9: μία δοκιμή χάθηκε ακριβώς έτσι). */
function skip_(m, why) {
  console.log('παράλειψη · ' + why + ' · «' + String(m.getSubject() || '').slice(0, 60) + '»');
  return 'skip';
}

function newCode_() {
  var key = PropertiesService.getScriptProperties().getProperty('KM_SUPPORT_KEY');
  try {
    var r = UrlFetchApp.fetch(API, { method: 'post', contentType: 'application/json', payload: '{}',
      headers: { 'X-Km-Support': key }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { console.error('server ' + r.getResponseCode()); return ''; }
    var j = JSON.parse(r.getContentText());
    return (j && j.ok && /^KM-E-\d{6,}$/.test(j.code)) ? j.code : '';
  } catch (e) { console.error('server ' + e); return ''; }
}

function markArrived_(code) {
  var key = PropertiesService.getScriptProperties().getProperty('KM_SUPPORT_KEY');
  try {
    var r = UrlFetchApp.fetch(API_ARRIVED, { method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ code: code }), headers: { 'X-Km-Support': key }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { console.error('arrived ' + code + ' → ' + r.getResponseCode()); }
  } catch (e) { console.error('arrived ' + code + ' → ' + e); }
}

function isAuto_(m) {
  var h = function (n) { try { return String(m.getHeader(n) || '').toLowerCase(); } catch (e) { return ''; } };
  var as = h('Auto-Submitted');
  if (as && as !== 'no') { return true; }
  /* ⚠ ΟΧΙ «list»: το Google Group βάζει Precedence: list σε ΚΑΘΕ μήνυμα που
     μοιράζει στα μέλη του — με αυτό μέσα το σκριπτ αγνοούσε τα πάντα (26/9, δοκιμή 4α). */
  if (/^(bulk|junk|auto_reply)$/.test(h('Precedence'))) { return true; }
  if (h('X-Autoreply') || h('X-Autorespond') || h('X-Auto-Response-Suppress')) { return true; }
  return false;
}

function reSubj_(s) {
  s = String(s || '').replace(/^\s*((re|fwd?|απ|σχετ)\s*:\s*)+/i, '').trim();
  return 'Re: ' + (s || 'Kostometro');
}

function textNew_(code) {
  // Κείμενο Stavros 26/9/2026 — «νέο μήνυμα», ΟΧΙ «διαφορετικό email» (δεν υπονοεί άλλη διεύθυνση).
  return 'Γεια σου,\n\n' +
    'λάβαμε το μήνυμά σου. Ο αριθμός του αιτήματός σου είναι: ' + code + '\n' +
    'Αν μας ξαναγράψεις για το ίδιο πρόβλημα, πάτα «Απάντηση» σε αυτό το email. Αν μας στείλεις νέο μήνυμα, ' +
    'γράψε τον αριθμό ' + code + ' στο θέμα, για καλύτερο εντοπισμό και συνέχεια του ιστορικού σου.\n' +
    'Απόφυγε να ανοίξεις δεύτερο αίτημα για το ίδιο πρόβλημα — αυτό δημιουργεί συνήθως καθυστέρηση.\n' +
    'Θα σου απαντήσουμε το συντομότερο.\n\n' +
    'FastWrite · Kostometro\n\n' +
    '— — —\n\n' +
    'Hi,\n\n' +
    'we received your message. Your request number is: ' + code + '\n' +
    'If you write to us again about the same problem, press "Reply" on this email. If you send us a new message, ' +
    'put the number ' + code + ' in the subject, so we can find it and keep your history together.\n' +
    'Please avoid opening a second request for the same problem — it usually causes delays.\n' +
    'We will get back to you as soon as possible.\n\n' +
    'FastWrite · Kostometro\n';
}

function textAck_(code) {
  // 26/9 (απόφαση Stavros): ΙΔΙΟ κείμενο με το πρώτο — ο χρήστης βλέπει πάντα το ίδιο μήνυμα.
  return textNew_(code);
}

function markAllSeen_() {
  var props = PropertiesService.getScriptProperties(), now = String(Date.now()), n = 0;
  GmailApp.search(SEARCH, 0, 500).forEach(function (th) {
    th.getMessages().forEach(function (m) { props.setProperty('m:' + m.getId(), now); n++; });
  });
  return n;
}

function prune_(props, now) {
  if (Math.random() > 0.05) { return; }            // ~1 φορά στα 20 τρεξίματα
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('m:') === 0 && now - Number(all[k]) > KEEP_MS) { props.deleteProperty(k); }
  });
}

function label_(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }

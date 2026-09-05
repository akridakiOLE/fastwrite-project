/* Kostometro — φέτα 3 (29/8/2026)
   φέτα 1: εγγραφή, κάμερα, ουρά, προμηθευτής.
   φέτα 2: Εκκρεμή · Προμηθευτές · Κάλεσε · κανονικό μενού ·
           οδηγία άδειας κάμερας.
   φέτα 3: ανάγνωση Gemini (BYOK) · αυτόματη ανανέωση έκδοσης.
   Δεδομένα τοπικά. Η ΜΟΝΗ εξωτερική κλήση: φωτογραφία → Gemini,
   απευθείας από τη συσκευή, με το κλειδί του χρήστη. Κανένας δικός μας server. */
(function () {
  'use strict';

  var LS = {
    email: 'km_email',
    key:   'km_key',
    skip:  'km_key_skipped',
    id:    'km_install_id',
    perm:  'km_perm_seen',
    src:   'km_source',
    diag:  'km_ai_diag',
    model: 'km_ai_model',
    /* v26 · Η.2β-1 — ο λογαριασμός. Οι 12 λέξεις ΜΕΝΟΥΝ στη συσκευή:
       από αυτές βγαίνουν folder/auth (πάνε στον server) και το κλειδί
       κρυπτογράφησης (ΔΕΝ φεύγει ποτέ). */
    words:   'km_words',
    folder:  'km_folder',
    auth:    'km_auth',
    wordsOk: 'km_words_ok',
    reg:     'km_registered',
    /* v33 — «αυτή η συσκευή ΔΕΝ έχει κατεβάσει ακόμα». Όσο υπάρχει, δεν
       ανεβαίνει ΤΙΠΟΤΑ. Χωρίς αυτό, μια καθαρή συσκευή που μόλις συνδέθηκε
       θα ανέβαζε άδεια στοιχεία και θα έσβηνε τον φάκελο στον server. */
    needPull: 'km_need_pull',
    /* v35 · Η.3 — Η ΤΕΛΕΥΤΑΙΑ ΓΝΩΣΤΗ ΑΠΑΝΤΗΣΗ ΤΟΥ SERVER στο «είμαι εγώ η
       ενεργή;». Κρατιέται τοπικά ΕΠΙΤΗΔΕΣ: χωρίς δίκτυο στην πόρτα, η
       εφαρμογή πρέπει να ξέρει τι είναι — και «δεν μπόρεσα να ρωτήσω» ΔΕΝ
       είναι «είμαι ενεργή». Απουσία τιμής = ενεργή, γιατί όποια συσκευή
       βάζει τις 12 λέξεις γίνεται ενεργή την ίδια στιγμή (Η.3). */
    active:   'km_active',
    activeAt: 'km_active_since',
    /* v36 · Γ.3 — το διαπιστευτήριο της συσκευής που φυλάει τις 12 λέξεις.
       ΔΕΝ είναι κλειδί κρυπτογράφησης και δεν ξεκλειδώνει τίποτα από μόνο
       του: είναι απλώς η ταυτότητα που δείχνουμε στο Android/iOS για να
       ρωτήσει «είσαι εσύ;». Αν χαθεί, ξαναφτιάχνεται με νέα επιβεβαίωση. */
    lockCred: 'km_lock_cred',
    /* v40 — ΕΥΡΕΤΗΡΙΟ ΤΩΝ ΦΩΤΟΓΡΑΦΙΩΝ ΠΟΥ ΚΑΤΕΒΑΣΕ ΑΥΤΗ Η ΣΥΣΚΕΥΗ.
       Κρατάει ΜΟΝΟ ό,τι ήρθε από τον server — άρα ό,τι είναι εδώ μέσα
       υπάρχει σίγουρα και εκεί και μπορεί να ξανακατέβει. Φωτογραφία που
       τραβήχτηκε ΣΕ ΑΥΤΗ τη συσκευή δεν μπαίνει ποτέ, άρα δεν πετιέται
       ποτέ: [{ id, b (bytes), at (πότε ζητήθηκε) }]. */
    pcache:   'km_photo_cache',
    gone:     'km_gone'          // v43 — τα id όσων διαγράφηκαν, ώστε να μη γυρίζουν
  };

  var el = function (id) { return document.getElementById(id); };
  var stream = null, pendingBlob = null, pendingUrl = null;
  var pendingPages = [];   // v9: επιπλέον σελίδες του ΙΔΙΟΥ τιμολογίου
  var thumbUrl = null;     // objectURL της μικρογραφίας στο «Ποιος;»
  var MAX_PAGES = 8;       // φρένο: πάνω από αυτό δεν είναι τιμολόγιο, είναι λάθος
  var nav = [];            // στοίβα πλοήγησης για το «πίσω»
  var urls = [];           // objectURLs προς απελευθέρωση

  /* ── Τοπική βάση (IndexedDB) ── */
  var db = null;
  function openDB() {
    return new Promise(function (res, rej) {
      /* ⛔ ΤΟ ΟΝΟΜΑ ΤΗΣ ΒΑΣΗΣ ΔΕΝ ΑΛΛΑΖΕΙ ΠΟΤΕ. Η μετονομασία σε
         Kostometro (1/9/2026) άλλαξε ΜΟΝΟ διαδρομή και κείμενα. Το
         IndexedDB και τα κλειδιά km_* ζουν στην ΠΡΟΕΛΕΥΣΗ, όχι στη
         διαδρομή — γι' αυτό όλα τα τιμολόγια επιβίωσαν. Αλλαγή αυτού
         του ονόματος = κάθε χρήστης χάνει το αρχείο του, σιωπηλά. */
      var r = indexedDB.open('kostometrisi', 1);
      r.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('shots')) {
          d.createObjectStore('shots', { keyPath: 'id' }).createIndex('status', 'status');
        }
      };
      r.onsuccess = function () { db = r.result; res(db); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function put(rec) {
    return new Promise(function (res, rej) {
      var t = db.transaction('shots', 'readwrite');
      t.objectStore('shots').put(rec);
      t.oncomplete = res; t.onerror = function () { rej(t.error); };
    }).then(function (r) {
      /* v31 — ο συγχρονισμός κρεμιέται ΕΔΩ, στο ένα σημείο απ' όπου περνάει
         κάθε αποθήκευση. Αν κρεμόταν στα σημεία κλήσης, θα ξεχνιόταν ένα.
         v33 — ΕΚΤΟΣ όσο τρέχει κατέβασμα: αλλιώς κάθε εγγραφή που μόλις
         ήρθε από τον server θα σκανδάλιζε ανέβασμα προς τον ίδιο server. */
      if (!pulling && typeof scheduleSync === 'function') { scheduleSync(); }
      return r;
    });
  }
  function all() {
    return new Promise(function (res, rej) {
      var out = [], t = db.transaction('shots', 'readonly');
      t.objectStore('shots').openCursor().onsuccess = function (e) {
        var c = e.target.result;
        if (c) { out.push(c.value); c.continue(); }
        else { out.sort(function (a, b) { return dateOf(b) - dateOf(a); }); res(out); }
      };
      t.onerror = function () { rej(t.error); };
    });
  }
  function get(id) {
    return new Promise(function (res, rej) {
      var t = db.transaction('shots', 'readonly');
      var q = t.objectStore('shots').get(id);
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  /* ══ v43 · Η ΔΙΑΓΡΑΦΗ ΠΡΕΠΕΙ ΝΑ ΤΑΞΙΔΕΥΕΙ ══════════════════════════
     5/9/2026, Stavros: «το κάνω διαγραφή αλλά μετά εμφανίζεται». Δεν ήταν
     τύχη. Η διαγραφή έσβηνε ΜΟΝΟ τοπικά· ο σφραγισμένος φάκελος κρατούσε
     το τιμολόγιο, και ο κανόνας του v33 («το κατέβασμα ποτέ δεν σβήνει
     τοπική εγγραφή, μόνο προσθέτει») το ξανάφερνε στον επόμενο γύρο —
     κάθε 30 δευτερόλεπτα, για πάντα. Σε δεύτερη συσκευή δεν έφευγε ποτέ.

     Τώρα κάθε διαγραφή αφήνει ΤΑΦΟΠΕΤΡΑ: το id μπαίνει σε κατάλογο που
     ταξιδεύει μέσα στον ίδιο κρυπτογραφημένο φάκελο (πεδίο «gone»). Καμία
     αλλαγή στον server — ο φάκελος είναι αδιαφανής για εκείνον. Όποια
     συσκευή κατεβάζει: σβήνει ό,τι είναι στον κατάλογο και δεν το ξαναφέρνει.
     Στον κατάλογο μπαίνει ΜΟΝΟ το id — κανένα ποσό, κανένα όνομα. */
  function goneRead() {
    try { var a = JSON.parse(localStorage.getItem(LS.gone) || '[]'); return a.length ? a : []; }
    catch (e) { return []; }
  }
  function goneWrite(a) { try { localStorage.setItem(LS.gone, JSON.stringify(a)); } catch (e) {} }
  function goneAdd(ids) {
    var a = goneRead(), seen = {};
    a.forEach(function (x) { seen[x] = 1; });
    ids.forEach(function (id) { if (!seen[id]) { seen[id] = 1; a.push(id); } });
    goneWrite(a);
  }
  function goneDrop(ids) {                 // η αναίρεση ανασταίνει το τιμολόγιο
    var out = {}; ids.forEach(function (id) { out[id] = 1; });
    goneWrite(goneRead().filter(function (x) { return !out[x]; }));
  }
  function goneMap() {
    var m = {}; goneRead().forEach(function (x) { m[x] = 1; }); return m;
  }
  /* Σβήσιμο ΜΟΝΟ από την τοπική βάση — χωρίς ταφόπετρα. Το χρησιμοποιεί
     το κατέβασμα, που εκτελεί ταφόπετρα ΑΛΛΗΣ συσκευής: δεν την ξαναγράφει. */
  function dbDel(id) {
    return new Promise(function (res, rej) {
      var t = db.transaction('shots', 'readwrite');
      t.objectStore('shots').delete(id);
      t.oncomplete = res; t.onerror = function () { rej(t.error); };
    });
  }
  function del(id) {
    goneAdd([id]);
    return dbDel(id).then(function (r) {
      /* Η ταφόπετρα ανεβαίνει με τον ίδιο μηχανισμό που ανεβαίνει κάθε
         αλλαγή — το put() δεν περνάει από εδώ, οπότε το λέμε ρητά. */
      if (!pulling && typeof scheduleSync === 'function') { scheduleSync(); }
      return r;
    });
  }
  function isPending(r) { return r.total === null || r.total === undefined; }
  /* v9 — ΣΧΗΜΑ: το r.blob παραμένει η ΣΕΛΙΔΑ 1, όπως ήταν πάντα.
     Οι επιπλέον μπαίνουν στο r.pages (νέο, προαιρετικό πεδίο).
     Οι εγγραφές πριν την v9 δεν έχουν r.pages — δουλεύουν αυτούσιες. */
  function pagesOf(r) {
    var extra = (r && r.pages && r.pages.length) ? r.pages : [];
    return [r.blob].concat(extra);
  }
  function pageCount(r) { return pagesOf(r).length; }
  /* v10 — ΠΟΤΕ: r.invDate = η ημερομηνία ΤΟΥ ΤΙΜΟΛΟΓΙΟΥ (νέο, προαιρετικό).
     r.ts = πότε το φωτογράφισες, μένει ως έχει.
     Κάθε λίστα, κάθε άθροισμα, κάθε εύρος περνάει ΜΟΝΟ από εδώ — αλλιώς
     τριάντα παλιά τιμολόγια φωτογραφημένα ένα βράδυ πέφτουν όλα σε έναν μήνα. */
  function dateOf(r) { return (r && r.invDate) ? r.invDate : r.ts; }

  /* ══ CROP (v11) ═══════════════════════════════════════════════
     ΚΑΝΟΝΑΣ: το blob ΔΕΝ αγγίζεται ΠΟΤΕ. Ένα τιμολόγιο είναι λογιστικό
     τεκμήριο — δεν πετάμε pixel. Αποθηκεύονται μόνο ΠΟΣΟΣΤΑ (0-1) στο
     r.crops[i], ανεξάρτητα από ανάλυση συσκευής. Σβήνεις το crop και η
     φωτογραφία επιστρέφει ολόκληρη, όποτε θέλεις. */
  function cropOf(r, i) {
    var c = r && r.crops && r.crops[i];
    if (!c) { return null; }
    if (!(c.w > 0.05 && c.h > 0.05)) { return null; }   // πολύ μικρό = άκυρο
    return c;
  }
  /* Εμφάνιση με σκέτο CSS: μηδέν επανακωδικοποίηση εικόνας, μηδέν μνήμη. */
  function cropImg(blob, c, cls) {
    /* v33 — Τιμολόγιο που ήρθε από τον server έχει ΣΤΟΙΧΕΙΑ πριν έχει
       φωτογραφία: τα στοιχεία κατεβαίνουν πρώτα (κιλομπάιτ, τα βλέπεις
       αμέσως) και οι εικόνες έρχονται στο παρασκήνιο. Χωρίς αυτόν τον
       έλεγχο το createObjectURL(undefined) έσπαγε ολόκληρη τη λίστα. */
    if (!blob) {
      var ph = document.createElement('span');
      ph.className = cls + ' ph-wait';
      ph.textContent = '⟳';
      ph.title = 'Η φωτογραφία κατεβαίνει';
      return ph;
    }
    var img = document.createElement('img');
    img.src = blobUrl(blob);
    img.alt = '';
    if (!c) { img.className = cls; return img; }
    var box = document.createElement('span');
    box.className = cls + ' crop-box';
    img.style.position = 'absolute';
    img.style.width  = (100 / c.w) + '%';
    img.style.height = (100 / c.h) + '%';
    img.style.left   = (-c.x / c.w * 100) + '%';
    img.style.top    = (-c.y / c.h * 100) + '%';
    img.style.objectFit = 'fill';
    box.appendChild(img);
    return box;
  }
  function ymd(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fromYmd(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) { return null; }
    var d = new Date(v + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  /* ── Πλοήγηση ── */
  /* ⚠ ΚΑΘΕ ΝΕΑ ΟΘΟΝΗ ΓΡΑΦΕΤΑΙ ΚΑΙ ΕΔΩ. Το show() κρύβει ΜΟΝΟ όσες είναι σε
     αυτή τη λίστα και ξεκρύβει τη ζητούμενη — οθόνη εκτός λίστας μένει
     αόρατη για πάντα, σιωπηλά, χωρίς κανένα σφάλμα. (Το έπιασε το τεστ α1
     στις 5/9· με ανάγνωση δεν φαινόταν.) */
  var SCREENS = ['s-acc','s-email','s-words','s-signin','s-key','s-perm','s-cam','s-who',
                 's-menu','s-pend','s-sup','s-ref','s-settings','s-shot','s-mywords'];
  function show(id) {
    var pv = el('preview');
    if (pv) { pv.hidden = true; }     // v9: καμία προεπισκόπηση επιζεί αλλαγής οθόνης
    SCREENS.forEach(function (s) { el(s).hidden = (s !== id); });
  }
  function goto(id) { nav.push(id); render(id); show(id); }
  function back() {
    freeUrls();
    nav.pop();
    var prev = nav[nav.length - 1];
    /* v18 — Η επιστροφή στην κάμερα ΞΑΝΑΖΗΤΑΕΙ κάμερα. Μέχρι τώρα το back()
       απλώς εμφάνιζε την οθόνη· αν το κανάλι είχε πεθάνει στο μεταξύ, ο χρήστης
       έβλεπε παγωμένο καρέ και καμία διαδρομή δεν το επανέφερε. */
    if (!prev) { show('s-cam'); startCam(); refreshCount(); return; }
    render(prev); show(prev);
  }
  function freeUrls() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
  }
  function blobUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }

  function render(id) {
    if (id === 's-menu')     { renderMenu(); }
    /* v11 — ΚΑΘΕ ΕΙΣΟΔΟΣ στην οθόνη παγώνει τη σειρά. Αλλιώς, μόλις
       διορθώσεις ημερομηνία, η κάρτα πηδάει αλλού και τη χάνεις από τα
       μάτια σου ακριβώς τη στιγμή που τη δουλεύεις. Φεύγεις και ξαναμπαίνεις
       → όλα παίρνουν τη σωστή τους σειρά. */
    if (id === 's-pend')     { pendOrder = null; renderPending(); }
    if (id === 's-sup')      {
      /* v43 — η προβολή προμηθευτή επιβιώνει της επιστροφής από τη φωτογραφία. */
      if (supView) { var v = supView; all().then(function (rs) { openSupplier(v, rs); }); }
      else { renderSupPage(); }
    }
    if (id === 's-ref')      { renderRef(); }
    if (id === 's-settings') { renderSettings(); }
  }

  /* ── Μορφοποίηση ── */
  function eur(n) {
    if (n === null || n === undefined || isNaN(n)) { return '—'; }
    return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function dstr(ts) {
    var d = new Date(ts);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  function mkey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  var MONTHS = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
                'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  function mlabel(k) { var p = k.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function norm(s) {
    return String(s === null || s === undefined ? '' : s)
      .toLocaleUpperCase('el')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
  function num(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v).replace('.', ',');
  }
  function parseNum(s) {
    s = String(s || '').trim().replace(/\s|€/g, '').replace(',', '.');
    if (!s) { return null; }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* ── Προμηθευτές ── */
  /* v42 — Η ΛΙΣΤΑ ΤΩΝ ΠΡΟΜΗΘΕΥΤΩΝ ΣΤΟ «ΠΡΟΜΗΘΕΥΤΗΣ;» ΒΓΑΙΝΕΙ ΑΠΟ ΤΑ ΤΙΜΟΛΟΓΙΑ.
     Μέχρι τη v41 έβγαινε από τοπική μνήμη ονομάτων (km_suppliers) που γέμιζε
     μόνο όταν πληκτρολογούσες στη συσκευή αυτή, έδειχνε 5 και δεν ξαναχτιζόταν
     ποτέ από τον φάκελο: σε επαναφορά με 12 λέξεις έβγαινε άδεια (5/9/2026).
     Τώρα: ΟΛΑ τα ονόματα, τα πιο πρόσφατα (κατά dateOf) πρώτα, με φίλτρο. */
  try { localStorage.removeItem('km_suppliers'); } catch (e) {}
  function supplierNames(rows) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var name = String(r.supplier || '').trim();
      if (!name) { return; }
      var k = name.toLowerCase(), d = dateOf(r) || 0;   // άξονας χρόνου: ΠΑΝΤΑ dateOf (Α320)
      if (!seen[k]) { seen[k] = { name: name, n: 0, last: 0 }; out.push(seen[k]); }
      seen[k].n++;
      if (d > seen[k].last) { seen[k].last = d; }
    });
    out.sort(function (a, b) { return b.last - a.last; });
    return out;
  }
  var whoNames = [];
  function whoMode(m) {
    el('who-tab-list').classList.toggle('on', m === 'list');
    el('who-tab-new').classList.toggle('on', m === 'new');
    el('who-list-wrap').hidden = (m !== 'list');
    el('who-new-wrap').hidden = (m !== 'new');
    if (m === 'new') { setTimeout(function () { el('in-sup').focus(); }, 50); }
  }
  function drawSuppliers() {
    var q = el('who-find').value.trim().toLowerCase();
    var box = el('sup-list');
    box.innerHTML = '';
    whoNames.forEach(function (s) {
      if (q && s.name.toLowerCase().indexOf(q) < 0) { return; }
      var b = document.createElement('button');
      b.className = 'sup';
      b.textContent = s.name;
      var n = document.createElement('span');
      n.className = 'sup-n'; n.textContent = s.n + ' τιμ.';
      b.appendChild(n);
      b.onclick = function () { assign(s.name); };
      box.appendChild(b);
    });
    el('who-empty').hidden = whoNames.length > 0;
  }
  function renderSuppliers() {
    return all().then(function (rows) {
      whoNames = supplierNames(rows);
      el('who-find').value = '';
      drawSuppliers();
      whoMode(whoNames.length ? 'list' : 'new');
    });
  }
  el('who-tab-list').onclick = function () { whoMode('list'); };
  el('who-tab-new').onclick  = function () { whoMode('new'); };
  el('who-find').addEventListener('input', drawSuppliers);

  /* ══ ΜΕΝΟΥ ══ */
  function renderMenu() {
    all().then(function (rows) {
      var p = rows.filter(isPending).length;
      var m = el('m-pend');
      m.textContent = p;
      m.className = 'row-b' + (p > 0 ? ' hot' : '');
      /* v18 — Ο αριθμός εδώ ΠΡΕΠΕΙ να μετράει ό,τι μετράει και η οθόνη
         (31/8/2026: το μενού έλεγε 4, η λίστα 3 — η παλιά μνήμη ονομάτων
         δεν μίκραινε ποτέ). Από τη v42 όλα βγαίνουν από τα τιμολόγια. */
      var supNames = {};
      rows.forEach(function (r) { if (r.supplier) { supNames[r.supplier] = 1; } });
      el('m-sup').textContent = Object.keys(supNames).length;
    });
  }

  /* ══ ΤΑ ΕΚΚΡΕΜΗ ══ */
  var pendOrder = null;      // παγωμένη σειρά όσο είσαι μέσα στην οθόνη
  /* v23 — ΜΑΖΙΚΗ ΔΙΑΓΡΑΦΗ (#4 της 30/8, brief Stavros 31/8: επιβεβαίωση ΚΑΙ
     αναίρεση). Το τιμολόγιο είναι λογιστικό τεκμήριο: η επιβεβαίωση σταματάει
     το λάθος πάτημα, η αναίρεση σώζει το λάθος που πέρασε την επιβεβαίωση. */
  var pendPick = {};
  var undoBin = null, undoTimer = null;
  var UNDO_MS = 10000;
  function renderPending() {
    aiSweep();
    var body = el('pend-body');
    body.innerHTML = '';
    all().then(function (rows) {
      var list = rows.filter(isPending);
      if (!list.length) {
        body.innerHTML = '<p class="empty">Δεν έχεις εκκρεμή.<br>Ό,τι φωτογράφισες έχει ποσά.</p>';
        pendOrder = null;
        return;
      }
      /* v14 — Ο χρήστης βλέπει ΠΟΣΑ μένουν και ΠΟΣΟ θα πάρει, πριν ξεκινήσει.
         Η αναμονή που την ξέρεις εκ των προτέρων δεν είναι αποτυχία. */
      var waiting = list.filter(function (r) {
        return !r.sug && (r.aiTry || 0) < AI_MAX_TRY && !autoIds[r.id];
      });
      if (waiting.length && localStorage.getItem(LS.key) && !manualRun && !isReader()) {
        var qb = document.createElement('button');
        qb.className = 'btn ghost queue-btn';
        qb.textContent = '📖 Διάβασε τα υπόλοιπα (' + waiting.length + ')';
        qb.onclick = function () {
          var secs = waiting.length * Math.round(AI_GAP / 1000) + 3;
          var mins = Math.floor(secs / 60), rest = secs % 60;
          var t = mins ? (mins + ' λεπτ. ' + (rest ? rest + ' δευτ.' : '')) : (secs + ' δευτερόλεπτα');
          if (!confirm('Ανάγνωση ' + waiting.length + ' τιμολογίων.\n\n' +
                       'Εκτιμώμενος χρόνος: περίπου ' + t + '.\n\n' +
                       'Το δωρεάν κλειδί επιτρέπει 5 αναγνώσεις το λεπτό — γι\' αυτό χρειάζεται χρόνος. ' +
                       'Μπορείς να κλείσεις την οθόνη, η ανάγνωση συνεχίζει.\n\nΝα ξεκινήσω;')) { return; }
          manualRun = true;
          aiSweep();
          renderPending();
        };
        body.appendChild(qb);
      }
      if (manualRun) {
        var st = document.createElement('p');
        st.className = 'queue-run';
        st.textContent = '📖 Η ανάγνωση τρέχει… μπορείς να φύγεις από αυτή την οθόνη';
        body.appendChild(st);
      }

      if (!pendOrder) {
        pendOrder = list.map(function (r) { return r.id; });
      } else {
        /* Ό,τι ήταν ήδη εδώ κρατάει τη θέση του· ό,τι μπήκε στο μεταξύ
           πάει στο τέλος, χωρίς να σπρώξει τίποτα. */
        var seen = {};
        pendOrder.forEach(function (id, i) { seen[id] = i; });
        list.forEach(function (r) {
          if (!(r.id in seen)) { seen[r.id] = pendOrder.length; pendOrder.push(r.id); }
        });
        list.sort(function (a, b) { return seen[a.id] - seen[b.id]; });
      }
      list.forEach(function (r) { body.appendChild(pendCard(r)); });

      /* Καθαρισμός επιλογών που δεν υπάρχουν πια (π.χ. αποθηκεύτηκαν) */
      var alive = {};
      list.forEach(function (r) { alive[r.id] = 1; });
      Object.keys(pendPick).forEach(function (id) { if (!alive[id]) { delete pendPick[id]; } });

      /* v35 · Η.3 — καμία μαζική ενέργεια σε αναγνώστρια συσκευή. */
      if (isReader()) {
        var rb = document.createElement('p');
        rb.className = 'ro-note';
        rb.textContent = 'Αυτή η συσκευή είναι σε ανάγνωση. Για να επεξεργαστείς ή να διαγράψεις, κάν᾽ την ενεργή από την οθόνη της κάμερας.';
        body.appendChild(rb);
        if (undoBin) { body.appendChild(undoRow()); }
        return;
      }
      var bar = document.createElement('div');
      bar.className = 'multi-bar';
      var allBtn = document.createElement('button');
      allBtn.className = 'btn ghost';
      /* v24 — Το «Καθάρισε» είναι ΞΕΧΩΡΙΣΤΟ κουμπί, όχι εναλλαγή του
         «Επίλεξε όλα». Με μερική επιλογή (2 από 3) ο παλιός διακόπτης
         έδειχνε «Επίλεξε όλα» και ΔΕΝ υπήρχε κανένας τρόπος να
         ξεδιαλέξεις. Αίτημα Stavros 31/8/2026. */
      var clrBtn = document.createElement('button');
      clrBtn.className = 'btn ghost';
      var delBtn = document.createElement('button');
      delBtn.className = 'btn del-many';
      bar.appendChild(allBtn); bar.appendChild(clrBtn); bar.appendChild(delBtn);
      body.appendChild(bar);

      window.__syncPendBar = function () {
        var n = Object.keys(pendPick).length;
        var oloi = n === list.length && n > 0;
        allBtn.hidden = oloi;
        allBtn.textContent = 'Επίλεξε όλα (' + list.length + ')';
        allBtn.onclick = function () {
          list.forEach(function (r) { pendPick[r.id] = true; });
          renderPending();
        };
        clrBtn.hidden = n === 0;
        clrBtn.textContent = 'Καθάρισε (' + n + ')';
        clrBtn.onclick = function () { pendPick = {}; renderPending(); };
        delBtn.hidden = n === 0;
        delBtn.textContent = '🗑 Διαγραφή (' + n + ')';
        delBtn.onclick = function () { deleteMany(list); };
      };
      syncPendBar();

      if (undoBin) { body.appendChild(undoRow()); }
    });
  }
  function syncPendBar() { if (window.__syncPendBar) { window.__syncPendBar(); } }

  function undoRow() {
    var u = document.createElement('div');
    u.className = 'undo-row';
    var t = document.createElement('span');
    t.textContent = 'Διαγράφηκαν ' + undoBin.length +
                    (undoBin.length === 1 ? ' τιμολόγιο' : ' τιμολόγια');
    var b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = '↩ Αναίρεση';
    b.onclick = function () {
      var back = undoBin; undoBin = null;
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      goneDrop(back.map(function (r) { return r.id; }));   // v43 — σηκώνεται και η ταφόπετρα
      Promise.all(back.map(function (r) { return put(r); }))
        .then(function () { renderPending(); refreshCount(); });
    };
    u.appendChild(t); u.appendChild(b);
    return u;
  }

  function deleteMany(list) {
    var ids = Object.keys(pendPick);
    if (!ids.length) { return; }
    var recs = list.filter(function (r) { return pendPick[r.id]; });
    if (!confirm('Διαγραφή ' + ids.length +
                 (ids.length === 1 ? ' τιμολογίου;' : ' τιμολογίων;') +
                 '\n\nΣβήνονται και οι φωτογραφίες.\n' +
                 'Θα έχεις 10 δευτερόλεπτα για αναίρεση.')) { return; }
    Promise.all(recs.map(function (r) { return del(r.id); })).then(function () {
      pendPick = {};
      undoBin = recs;                    // κρατιούνται ΟΛΟΚΛΗΡΕΣ, με το blob
      if (undoTimer) { clearTimeout(undoTimer); }
      undoTimer = setTimeout(function () {
        undoBin = null; undoTimer = null;
        if (!el('s-pend').hidden) { renderPending(); }
      }, UNDO_MS);
      renderPending(); refreshCount();
    });
  }
  function pendCard(r) {
    var c = document.createElement('div');
    c.className = 'card';

    var head = document.createElement('div');
    head.className = 'card-head';
    var img = cropImg(r.blob, cropOf(r, 0), 'thumb-in');
    img.onclick = function () { openShot(r.id); };
    var meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = '<div class="card-sup"></div><div class="card-date"></div>';
    meta.querySelector('.card-sup').textContent = r.supplier;
    meta.querySelector('.card-date').textContent = dstr(dateOf(r));
    var thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.appendChild(img);
    addPgBadge(thumb, r);
    /* v23 — κουτάκι επιλογής, ίδια λογική με τη λίστα προμηθευτών (§5 30/8) */
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'pend-cb';
    cb.hidden = isReader();          // v35 — χωρίς μαζική διαγραφή, χωρίς επιλογή
    cb.checked = !!pendPick[r.id];
    cb.setAttribute('aria-label', 'Επίλεξε τιμολόγιο ' + r.supplier);
    cb.onchange = function () {
      if (cb.checked) { pendPick[r.id] = true; } else { delete pendPick[r.id]; }
      syncPendBar();
    };
    head.appendChild(cb);
    head.appendChild(thumb); head.appendChild(meta);

    var amts = document.createElement('div');
    amts.className = 'amts';
    /* v10 — ΤΑ ΤΡΙΑ ΠΟΣΑ. Το «Υπόλοιπο» αποσύρθηκε (30/8): σήμαινε δύο
       διαφορετικά πράγματα στο ίδιο πεδίο. Το r.balance μένει στη βάση
       παλιών εγγραφών, δεν διαβάζεται και δεν γράφεται πουθενά. */
    var fields = [['Καθαρό ποσό','net'], ['ΦΠΑ','vat'], ['Συνολικό ποσό','total']];
    var inputs = {}, sug = r.sug || null, prefilled = false;
    fields.forEach(function (f) {
      var w = document.createElement('label');
      w.className = 'amt';
      var s = document.createElement('span'); s.textContent = f[0];
      var i = document.createElement('input');
      i.type = 'text'; i.inputMode = 'decimal'; i.placeholder = '0,00';
      i.value = num(r[f[1]]);
      /* Πρόταση Gemini: ΜΟΝΟ σε άδειο πεδίο, σημασμένη — ο άνθρωπος εγκρίνει */
      if (!i.value && sug && sug[f[1]] !== null && sug[f[1]] !== undefined) {
        i.value = num(sug[f[1]]);
        i.classList.add('ai');
        prefilled = true;
      }
      i.addEventListener('input', function () {
        i.classList.remove('ai'); i.classList.remove('calc');
        /* Γεμάτο = δικό του, δεν το πατάει τίποτα.
           Άδειο = «δεν το θέλω δικό μου» — ξαναγίνεται υπολογίσιμο.
           Χωρίς αυτό, ένα πεδίο που έσβησες έμενε κενό για πάντα. */
        if (i.value.trim()) { i.dataset.human = '1'; }
        else { delete i.dataset.human; }
        recalc();
      });
      inputs[f[1]] = i;
      w.appendChild(s); w.appendChild(i);
      amts.appendChild(w);
    });

    var warn = document.createElement('p');
    warn.className = 'amt-warn';
    warn.hidden = true;
    amts.appendChild(warn);

    /* v11 — Η ουρά κρατάει 13 δευτ. ανάμεσα σε αναγνώσεις (όριο 5/λεπτό).
       Χωρίς ένδειξη, ο χρήστης βλέπει κενά πεδία και συμπεραίνει αποτυχία.
       Το Ζ.4 («ποτέ Διαβάζω…») προστατεύει ΤΗΝ ΠΟΡΤΑ, όπου δεν περιμένεις·
       εδώ ήρθες επίτηδες να δεις αποτέλεσμα, και η σιωπή είναι το πρόβλημα. */
    /* == null (όχι ===) ώστε να πιάνει ΚΑΙ το undefined των παλιών εγγραφών */
    var empty = (r.net == null && r.vat == null && r.total == null);
    if (!sug && localStorage.getItem(LS.key) && empty) {
      var busy = document.createElement('p');
      busy.className = 'ai-busy';
      /* ΚΑΘΕ κατάσταση έχει το δικό της μήνυμα. Σιωπή = ο χρήστης νομίζει
         ότι απέτυχε και ξαναφωτογραφίζει, που τρώει κι άλλο όριο. */
      if (!navigator.onLine) {
        busy.classList.add('off');
        busy.textContent = '📵 Χωρίς σύνδεση — γράψε τα ποσά μόνος σου ή περίμενε δίκτυο';
      } else if (aiHalt) {
        busy.classList.add('off');
        busy.textContent = '⚠ Η ανάγνωση σταμάτησε — δες ☰ Ρυθμίσεις · μπορείς να τα γράψεις μόνος σου';
      } else if ((r.aiTry || 0) >= AI_MAX_TRY) {
        busy.classList.add('off');
        busy.textContent = '⚠ Δεν διαβάστηκαν ποσά μετά από ' + AI_MAX_TRY +
                           ' προσπάθειες — δοκίμασε ξανά ή γράψ\' τα μόνος σου';
        /* v20 — ΜΕΧΡΙ ΣΗΜΕΡΑ ΗΤΑΝ ΜΟΝΟΔΡΟΜΟΣ. Τρεις αποτυχημένες αναγνώσεις
           (κακός φωτισμός, στραβή γωνία) κλείδωναν το τιμολόγιο για πάντα:
           έβγαινε από την ουρά και καμία διαδρομή δεν το ξανάβαζε. */
        var again = document.createElement('button');
        again.className = 'btn ghost retry-btn';
        again.hidden = isReader();
        again.textContent = '🔄 Δοκίμασε ξανά';
        again.onclick = function () {
          again.disabled = true;
          again.textContent = 'Μπαίνει στην ουρά…';
          r.aiTry = 0;
          autoIds[r.id] = true;
          put(r).then(function () { manualRun = true; aiSweep(); renderPending(); });
        };
        amts.appendChild(busy);
        amts.appendChild(again);
        busy = null;
      } else if (!manualRun && !autoIds[r.id]) {
        /* Δεν είναι στην ουρά και δεν πρόκειται να μπει μόνο του */
        busy.textContent = '📖 Δεν έχει διαβαστεί — πάτα «Διάβασε τα υπόλοιπα» πάνω, ή γράψ\' τα μόνος σου';
      } else {
        var w = Math.max(aiWait - Date.now(), aiLast + AI_GAP - Date.now());
        /* Και στις δύο περιπτώσεις λέγεται ΠΑΝΤΑ ότι δεν είναι υποχρεωμένος
           να περιμένει — αλλιώς κάθεται και κοιτάει την οθόνη. */
        busy.textContent = (w > 1000)
          ? '⏳ Στη σειρά — ανάγνωση σε ' + Math.ceil(w / 1000) + 'ς · μπορείς να τα γράψεις και μόνος σου'
          : '⏳ Διαβάζεται… μπορείς να τα γράψεις και μόνος σου';
      }
      if (busy) { amts.appendChild(busy); }
    }

    /* ΙΕΡΑΡΧΙΑ: ΑΝΘΡΩΠΟΣ > GEMINI > ΥΠΟΛΟΓΙΣΜΟΣ.
       Δύο γνωστά ποσά δίνουν το τρίτο με σκέτη πρόσθεση/αφαίρεση — καμία
       γνώση συντελεστή ΦΠΑ, άρα δουλεύει και με πολλούς συντελεστές στο
       ίδιο τιμολόγιο, και σε κάθε χώρα.
       Ανοχή 0,02 €: τα τιμολόγια στρογγυλοποιούν ανά γραμμή. Χωρίς αυτήν
       θα φώναζε στα μισά τιμολόγια και θα μάθαινες να την αγνοείς. */
    var TOL = 0.02;
    function recalc() {
      /* Ποσό που το είχε βγάλει ΜΟΝΟ η αριθμητική ξαναϋπολογίζεται όταν
         αλλάζουν τα άλλα — αλλιώς αλλάζεις το Σύνολο και μένει κολλημένο
         το παλιό ΦΠΑ, βγάζοντας συναγερμό αντί για το σωστό νούμερο.
         Ό,τι έγραψε άνθρωπος (data-human) ή διάβασε το Gemini (.ai) μένει. */
      ['net', 'vat', 'total'].forEach(function (k) {
        var i = inputs[k];
        if (i.classList.contains('calc') && !i.dataset.human) {
          i.value = ''; i.classList.remove('calc');
        }
      });
      var v = {
        net:   parseNum(inputs.net.value),
        vat:   parseNum(inputs.vat.value),
        total: parseNum(inputs.total.value)
      };
      var known = ['net','vat','total'].filter(function (k) { return v[k] !== null; });

      if (known.length === 2) {
        var miss = ['net','vat','total'].filter(function (k) { return v[k] === null; })[0];
        var out = (miss === 'total') ? v.net + v.vat
                : (miss === 'net')   ? v.total - v.vat
                :                      v.total - v.net;
        out = Math.round(out * 100) / 100;
        if (out >= 0) {
          inputs[miss].value = num(out);
          inputs[miss].classList.add('calc');
          v[miss] = out;
          known.push(miss);
        }
      }
      if (known.length === 3) {
        var diff = Math.abs((v.net + v.vat) - v.total);
        if (diff > TOL) {
          warn.textContent = 'Τα νούμερα δεν κλείνουν: ' + num(v.net) + ' + ' +
                             num(v.vat) + ' ≠ ' + num(v.total) +
                             ' (διαφορά ' + num(Math.round(diff * 100) / 100) + ' €)';
          warn.hidden = false;
          return;
        }
      }
      warn.hidden = true;
    }
    recalc();

    if (prefilled) {
      var note = document.createElement('p');
      note.className = 'ai-note';
      note.textContent = 'Διαβάστηκαν από το Gemini — έλεγξε με τη φωτογραφία και πάτα Αποθήκευση.';
      amts.appendChild(note);
    }

    /* Η ανάγνωση τρέχει ΜΕΤΑ την αποθήκευση, άρα η ημερομηνία που διάβασε
       το Gemini εμφανίζεται εδώ — όχι στην προεπισκόπηση, όπου δεν την ξέρουμε
       ακόμα. Πρόταση με ένα πάτημα, ποτέ αυτόματη αλλαγή. */
    if (sug && sug.date && !isReader() && Math.abs(sug.date - dateOf(r)) > 86400000) {
      var ds = document.createElement('div');
      ds.className = 'date-sug';
      var dt = document.createElement('span');
      dt.textContent = 'Το τιμολόγιο γράφει ' + dstr(sug.date) +
                       ' · τώρα είναι καταχωρημένο ' + dstr(dateOf(r));
      var db = document.createElement('button');
      db.className = 'btn ghost';
      db.textContent = 'Διόρθωσέ το';
      db.onclick = function () {
        r.invDate = sug.date;
        put(r).then(function () { renderPending(); });
      };
      ds.appendChild(dt); ds.appendChild(db);
      amts.appendChild(ds);
    }

    /* v35 · Η.3 — ΣΕ ΑΝΑΓΝΩΣΤΡΙΑ ΣΥΣΚΕΥΗ ΔΕΝ ΥΠΑΡΧΕΙ ΑΠΟΘΗΚΕΥΣΗ.
       Τα πεδία μένουν ορατά (ο χρήστης θέλει να ΔΕΙ τα ποσά) αλλά κλειστά,
       και μια γραμμή λέει γιατί — κουμπί που εξαφανίστηκε χωρίς εξήγηση
       διαβάζεται ως σφάλμα της εφαρμογής. */
    if (isReader()) {
      ['net', 'vat', 'total'].forEach(function (k) {
        inputs[k].readOnly = true;
        inputs[k].tabIndex = -1;
      });
      var ron = document.createElement('p');
      ron.className = 'ro-note';
      ron.textContent = 'Μόνο ανάγνωση — η επεξεργασία γίνεται στην ενεργή συσκευή.';
      amts.appendChild(ron);
      c.appendChild(head); c.appendChild(amts);
      return c;
    }

    var save = document.createElement('button');
    save.className = 'btn primary';
    save.textContent = 'Αποθήκευση';
    save.onclick = function () {
      var t = parseNum(inputs.total.value);
      if (t === null) { inputs.total.focus(); inputs.total.style.borderColor = 'var(--danger)'; return; }
      r.total = t;
      r.vat = parseNum(inputs.vat.value);
      r.net = parseNum(inputs.net.value);
      put(r).then(function () { renderPending(); refreshCount(); });
    };

    var trash = document.createElement('button');
    trash.className = 'btn ghost del';
    trash.textContent = 'Διαγραφή';
    trash.onclick = function () {
      if (!confirm('Διαγραφή αυτού του τιμολογίου;\n\n' + r.supplier + ' · ' + dstr(r.ts) +
                   '\n\nΣβήνεται και η φωτογραφία. Δεν επιστρέφει.')) { return; }
      del(r.id).then(function () { renderPending(); refreshCount(); });
    };

    var acts = document.createElement('div');
    acts.className = 'acts';
    acts.appendChild(save); acts.appendChild(trash);

    c.appendChild(head); c.appendChild(amts); c.appendChild(acts);
    return c;
  }

  /* ══ Ο ΠΡΟΜΗΘΕΥΤΗΣ ΜΟΥ ══ */
  var FIND_MIN = 8;          // κάτω από αυτό, η μπάρα αναζήτησης δεν εμφανίζεται
  function renderSupPage() {
    supView = null;
    var body = el('sup-body');
    body.innerHTML = '';
    all().then(function (rows) {
      if (!rows.length) {
        body.innerHTML = '<p class="empty">Κανένα τιμολόγιο ακόμα.<br>Φωτογράφισε το πρώτο.</p>';
        return;
      }
      var names = {};
      rows.forEach(function (r) { names[r.supplier] = (names[r.supplier] || 0) + 1; });
      var keys = Object.keys(names).sort(function (a, b) { return names[b] - names[a]; });

      var list = document.createElement('div');
      list.className = 'sup-rows';

      var lastQ = '';
      function draw(q) {
        lastQ = q || '';
        list.innerHTML = '';
        var nq = norm(q);
        var hit = keys.filter(function (nm) { return !nq || norm(nm).indexOf(nq) !== -1; });
        if (!hit.length) {
          list.innerHTML = '<p class="empty">Κανένας προμηθευτής με αυτό το όνομα.</p>';
          return;
        }
        hit.forEach(function (nm) {
          /* v21 — Το κουτάκι ΔΕΝ μπαίνει μέσα στο κουμπί: ένα <input> μέσα σε
             <button> δεν πατιέται αξιόπιστα σε κινητό. Χωριστά αδέρφια. */
          var wrap = document.createElement('div');
          wrap.className = 'sup-line';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'sup-cb';
          cb.checked = !!picked[nm];
          cb.setAttribute('aria-label', 'Επίλεξε ' + nm);
          cb.onchange = function () {
            if (cb.checked) { picked[nm] = true; } else { delete picked[nm]; }
            syncBar();
          };
          var b = document.createElement('button');
          b.className = 'row';
          b.innerHTML = '<span class="row-t"></span><span class="row-b"></span>';
          b.querySelector('.row-t').textContent = nm;
          b.querySelector('.row-b').textContent = names[nm] + ' τιμ.';
          b.onclick = function () { openSupplier(nm, rows); };
          wrap.appendChild(cb); wrap.appendChild(b);
          list.appendChild(wrap);
        });
      }

      /* v21 — ΙΣΤΟΡΙΚΟ ΠΟΛΛΩΝ ΠΡΟΜΗΘΕΥΤΩΝ ΜΑΖΙ (#5 της 30/8/2026).
         Η μπάρα εμφανίζεται ΜΟΝΟ με 2+ επιλεγμένους: με έναν, το σκέτο
         πάτημα στη γραμμή κάνει ήδη τη δουλειά. */
      var picked = {};
      var multiBar = document.createElement('div');
      multiBar.className = 'multi-bar';
      var mall = document.createElement('button');
      mall.className = 'btn ghost';
      var mgo = document.createElement('button');
      mgo.className = 'btn primary';
      var mclr = document.createElement('button');
      mclr.className = 'btn ghost';
      mclr.onclick = function () { picked = {}; draw(lastQ); syncBar(); };
      multiBar.appendChild(mall); multiBar.appendChild(mgo); multiBar.appendChild(mclr);
      /* v24 — «Επίλεξε όλους» (αίτημα Stavros 1/9/2026): για συνολικό
         κόστος δεν πατάς έντεκα κουτάκια ένα-ένα. Επιλέγει ό,τι είναι
         ΟΡΑΤΟ μετά την αναζήτηση — ποτέ κρυφά ονόματα εκτός οθόνης. */
      function visible() {
        var nq = norm(lastQ);
        return keys.filter(function (nm) { return !nq || norm(nm).indexOf(nq) !== -1; });
      }
      mall.onclick = function () {
        visible().forEach(function (nm) { picked[nm] = true; });
        draw(lastQ); syncBar();
      };
      function syncBar() {
        var n = Object.keys(picked).length;
        var vis = visible();
        multiBar.hidden = keys.length < 2;
        mall.hidden = vis.length === 0 || n >= vis.length;
        mall.textContent = 'Επίλεξε όλους (' + vis.length + ')';
        mgo.hidden = n < 2;
        mgo.textContent = 'Δες μαζί (' + n + ')';
        mgo.onclick = function () { openSupplier(Object.keys(picked), rows); };
        mclr.hidden = n === 0;
        mclr.textContent = 'Καθάρισε (' + n + ')';
      }

      if (keys.length > FIND_MIN) {
        var find = document.createElement('input');
        find.type = 'text';
        find.className = 'find';
        find.placeholder = 'Βρες προμηθευτή';
        find.setAttribute('autocomplete', 'off');
        find.setAttribute('autocorrect', 'off');
        find.setAttribute('autocapitalize', 'off');
        find.oninput = function () { draw(find.value); };
        /* v43 — δικό της κουτί, ώστε το φόντο να φτάνει ως την άκρη της
           οθόνης όταν κολλάει· αλλιώς οι γραμμές περνούν από πάνω της. */
        var fb = document.createElement('div');
        fb.className = 'findbar-p';
        fb.appendChild(find);
        body.appendChild(fb);
      }
      body.appendChild(list);
      body.appendChild(multiBar);
      draw('');
      syncBar();
    });
  }
  /* ══ ΙΣΤΟΡΙΚΟ ΠΡΟΜΗΘΕΥΤΗ (v10) ══════════════════════════════
     Έτοιμα κουμπιά εύρους αντί για δύο ημερολόγια: στην πράξη θέλεις
     «3 μήνες» ή «φέτος», όχι 14/03 έως 22/07. Το «Επιλογή…» υπάρχει
     για τις υπόλοιπες φορές. Ο άξονας χρόνου είναι ΠΑΝΤΑ το dateOf(). */
  function sumRange(list) {
    var t = { net: 0, vat: 0, total: 0, miss: 0, n: list.length };
    list.forEach(function (r) {
      if (typeof r.total === 'number') { t.total += r.total; } else { t.miss++; }
      if (typeof r.net === 'number') { t.net += r.net; }
      if (typeof r.vat === 'number') { t.vat += r.vat; }
    });
    return t;
  }
  function startOf(kind) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (kind === 'month') { d.setDate(1); }
    if (kind === 'q')     { d.setDate(1); d.setMonth(d.getMonth() - 2); }
    if (kind === 'year')  { d.setMonth(0, 1); }
    return d.getTime();
  }
  /* ══ v43 · Η ΕΠΙΣΤΡΟΦΗ ΓΥΡΙΖΕΙ ΕΚΕΙ ΠΟΥ ΗΣΟΥΝ ══════════════════════
     5/9/2026, Stavros: ανοίγει προμηθευτή, ανοίγει φωτογραφία, πατάει
     «Επιστροφή» — και βρίσκεται στη λίστα ΟΛΩΝ των προμηθευτών, όχι σε
     αυτόν που είχε ανοίξει. Αιτία: η προβολή ενός (ή πολλών μαζί)
     προμηθευτών ζωγραφιζόταν ΜΕΣΑ στην οθόνη «Προμηθευτές» χωρίς να
     αφήνει ίχνος· η επιστροφή έκανε render('s-sup') και ξανάχτιζε τη
     λίστα από την αρχή. Τώρα η επιλογή κρατιέται (supView) — και κρατιέται
     ΟΛΟΚΛΗΡΗ, δηλαδή και το «Δες μαζί (Α/Β/Γ)», όχι μόνο ένα όνομα. */
  var supView = null;
  function openSupplier(name, rows) {
    var body = el('sup-body');
    /* v21 — δέχεται όνομα Ή πίνακα ονομάτων. Μία διαδρομή, όχι δύο. */
    var names = (Object.prototype.toString.call(name) === '[object Array]') ? name.slice() : [name];
    supView = names.slice();
    var polloi = names.length > 1;
    var titlos = polloi ? (names.length + ' προμηθευτές') : names[0];
    var mine = rows.filter(function (r) { return names.indexOf(r.supplier) !== -1; });
    var from = null, to = null;          // null = όλα
    var active = 'all';                  // ποιο κουμπί εύρους είναι πατημένο
    /* v24 — ΔΕΥΤΕΡΟΣ ΑΞΟΝΑΣ (απόφαση Stavros 1/9/2026): το εύρος από
       πάνω απαντάει ΠΟΤΕ, αυτό απαντάει ΤΙ. Δεν αντικαθιστά το χρονικό
       «Όλα» — θα έχανε το εύρος. Εκκρεμές = χωρίς συνολικό ποσό. */
    var stat = 'all';
    function statF(arr) {
      if (stat === 'pend') { return arr.filter(isPending); }
      if (stat === 'done') { return arr.filter(function (r) { return !isPending(r); }); }
      return arr;
    }

    function draw() {
      body.innerHTML = '';
      freeUrls();

      var h = document.createElement('h2');
      h.textContent = titlos;
      body.appendChild(h);
      if (polloi) {
        var who = document.createElement('p');
        who.className = 'multi-who';
        who.textContent = names.join(' · ');
        body.appendChild(who);
      }

      var bar = document.createElement('div');
      bar.className = 'range-bar';
      [['Σήμερα','today'], ['Τρέχων μήνας','month'], ['Όλα','all'], ['Επιλογή…','pick']]
        .forEach(function (o) {
          var b = document.createElement('button');
          /* Το ενεργό βγαίνει από τη μεταβλητή, ΟΧΙ από το στοιχείο:
             το draw() ξαναχτίζει τη μπάρα, άρα κάθε classList.add μετά
             από αυτό πέφτει σε κουμπί που δεν υπάρχει πια. */
          b.className = 'range' + (o[1] === active ? ' on' : '');
          b.textContent = o[0];
          b.onclick = function () {
            if (o[1] === 'pick') { return pick(); }
            active = o[1];
            if (o[1] === 'all') { from = null; to = null; }
            else { from = startOf(o[1]); to = null; }
            draw();
          };
          bar.appendChild(b);
        });
      body.appendChild(bar);

      var sbar = document.createElement('div');
      sbar.className = 'range-bar stat-bar';
      [['Όλα', 'all'], ['Εκκρεμή', 'pend'], ['Ολοκληρωμένα', 'done']]
        .forEach(function (o) {
          var b = document.createElement('button');
          b.className = 'range' + (o[1] === stat ? ' on' : '');
          b.textContent = o[0];
          b.onclick = function () { stat = o[1]; draw(); };
          sbar.appendChild(b);
        });
      body.appendChild(sbar);

      /* v20 — ΤΡΕΙΣ ΚΥΛΙΟΜΕΝΕΣ ΛΙΣΤΕΣ, ΟΧΙ ΗΜΕΡΟΛΟΓΙΟ (απόφαση §2, 30/8/2026).
         Το <input type="date"> ανοίγει το ημερολόγιο του Android: το έτος
         ανοίγει λίστα, ο μήνας όχι, και δεν υπάρχει καμία ρύθμιση να το
         αλλάξεις. Οι <select> είναι native, δουλεύουν παντού και ανοίγουν
         με ένα πάτημα. Ακρίβεια ημέρας. */
      function dateTriple(title, ts) {
        var wrap = document.createElement('div');
        wrap.className = 'dsel';
        var lab = document.createElement('span');
        lab.className = 'dsel-t'; lab.textContent = title;
        var dd = document.createElement('select'), mm = document.createElement('select'),
            yy = document.createElement('select');
        dd.className = mm.className = yy.className = 'dsel-s';
        var MHNES = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
        var d0 = new Date(ts), nowY = new Date().getFullYear();
        var minY = nowY;
        mine.forEach(function (r) { var y = new Date(dateOf(r)).getFullYear(); if (y < minY) { minY = y; } });
        if (minY > nowY - 1) { minY = nowY - 1; }

        MHNES.forEach(function (nm, i) {
          var o = document.createElement('option');
          o.value = i; o.textContent = nm; mm.appendChild(o);
        });
        for (var y = nowY; y >= minY; y--) {
          var oy = document.createElement('option');
          oy.value = y; oy.textContent = y; yy.appendChild(oy);
        }
        /* Οι ημέρες προσαρμόζονται στον μήνα: 28/29/30/31 */
        function fillDays() {
          var keep = parseInt(dd.value, 10) || d0.getDate();
          var last = new Date(parseInt(yy.value, 10), parseInt(mm.value, 10) + 1, 0).getDate();
          dd.innerHTML = '';
          for (var i = 1; i <= last; i++) {
            var od = document.createElement('option');
            od.value = i; od.textContent = i; dd.appendChild(od);
          }
          dd.value = Math.min(keep, last);
        }
        yy.value = d0.getFullYear(); mm.value = d0.getMonth();
        fillDays(); dd.value = d0.getDate();
        mm.onchange = fillDays; yy.onchange = fillDays;

        wrap.appendChild(lab); wrap.appendChild(dd);
        wrap.appendChild(mm); wrap.appendChild(yy);
        return { node: wrap, get: function () {
          return new Date(parseInt(yy.value, 10), parseInt(mm.value, 10),
                          parseInt(dd.value, 10), 12, 0, 0, 0).getTime();
        } };
      }

      function pick() {
        if (body.querySelector('.range-pick')) { return; }   // ήδη ανοιχτό
        var box = document.createElement('div');
        box.className = 'range-pick';
        var a = dateTriple('Από', from || startOf('month'));
        var z = dateTriple('Έως', to || Date.now());
        var go = document.createElement('button');
        go.className = 'btn primary'; go.textContent = 'Δείξε';
        go.onclick = function () {
          var f = a.get(), t = z.get();
          if (f === null || t === null) { return; }
          if (f > t) { var sw = f; f = t; t = sw; }   // ανάποδα άκρα: τα γυρνάμε
          from = new Date(f).setHours(0, 0, 0, 0);
          to = new Date(t).setHours(23, 59, 59, 999);
          active = 'pick';
          draw();
        };
        box.appendChild(a.node); box.appendChild(z.node); box.appendChild(go);
        bar.insertAdjacentElement('afterend', box);
      }

      var list = statF(mine).filter(function (r) {
        var d = dateOf(r);
        return (from === null || d >= from) && (to === null || d <= to);
      });

      if (from !== null) {
        var t = sumRange(list);
        var card = document.createElement('div');
        card.className = 'range-sum';
        var ttl = document.createElement('div');
        ttl.className = 'range-ttl';
        ttl.textContent = dstr(from) + ' – ' + dstr(to === null ? Date.now() : to) +
                          ' · ' + t.n + ' τιμ.';
        card.appendChild(ttl);
        [['Καθαρό', t.net], ['ΦΠΑ', t.vat], ['Σύνολο', t.total]].forEach(function (p, i) {
          var row = document.createElement('div');
          row.className = 'range-row' + (i === 2 ? ' big' : '');
          row.innerHTML = '<span></span><b></b>';
          row.querySelector('span').textContent = p[0];
          row.querySelector('b').textContent = eur(p[1]);
          card.appendChild(row);
        });
        /* Ο κανόνας της 26/8 δεν κάμπτεται πουθενά: αριθμός που αγνοεί
           τα ελλιπή ψεύδεται σιωπηλά, και εδώ αφορά χρήματα. */
        if (t.miss) {
          var m = document.createElement('div');
          m.className = 'range-miss';
          m.textContent = '+' + t.miss + ' χωρίς ποσό — δεν μετρήθηκαν';
          card.appendChild(m);
        }
        /* v21 — Με πολλούς προμηθευτές, το σκέτο σύνολο δεν λέει ΠΟΙΟΣ.
           Ανάλυση ανά προμηθευτή, με το ίδιο «χωρίς ποσό» δίπλα. */
        if (polloi) {
          var brk = document.createElement('div');
          brk.className = 'range-brk';
          names.map(function (nm) {
            return { nm: nm, t: sumRange(list.filter(function (r) { return r.supplier === nm; })) };
          }).sort(function (a, b) { return b.t.total - a.t.total; })
            .forEach(function (o) {
              var row = document.createElement('div');
              row.className = 'range-row';
              row.innerHTML = '<span></span><b></b>';
              row.querySelector('span').textContent = o.nm + ' · ' + o.t.n + ' τιμ.' +
                (o.t.miss ? ' · +' + o.t.miss + ' χωρίς ποσό' : '');
              row.querySelector('b').textContent = eur(o.t.total);
              brk.appendChild(row);
            });
          card.appendChild(brk);
        }
        body.appendChild(card);
        if (!list.length) {
          body.appendChild(Object.assign(document.createElement('p'),
            { className: 'empty', textContent: 'Κανένα τιμολόγιο σε αυτό το διάστημα.' }));
          return;
        }
        list.forEach(function (r) { body.appendChild(invRow(r)); });
        return;
      }

      /* Χωρίς εύρος: η γνωστή προβολή ανά μήνα */
      var monRows = statF(mine);
      if (!monRows.length) {
        body.appendChild(Object.assign(document.createElement('p'),
          { className: 'empty', textContent: stat === 'pend'
              ? 'Κανένα εκκρεμές τιμολόγιο.' : 'Κανένα ολοκληρωμένο τιμολόγιο.' }));
        return;
      }
      var byMonth = {};
      monRows.forEach(function (r) {
        var k = mkey(dateOf(r));
        if (!byMonth[k]) { byMonth[k] = { sum: 0, miss: 0, rows: [] }; }
        if (typeof r.total === 'number') { byMonth[k].sum += r.total; } else { byMonth[k].miss++; }
        byMonth[k].rows.push(r);
      });
      Object.keys(byMonth).sort().reverse().forEach(function (k) {
        var m = document.createElement('div');
        m.className = 'mon';
        m.innerHTML = '<span class="mon-t"></span><span class="mon-v"></span>';
        m.querySelector('.mon-t').textContent = mlabel(k);
        m.querySelector('.mon-v').textContent = eur(byMonth[k].sum) +
          (byMonth[k].miss ? ' · +' + byMonth[k].miss + ' χωρίς ποσό' : '');
        body.appendChild(m);
        byMonth[k].rows.forEach(function (r) { body.appendChild(invRow(r)); });
      });
    }

    function invRow(r) {
      var b = document.createElement('button');
      b.className = 'inv';
      var im = cropImg(r.blob, cropOf(r, 0), 'thumb-in');
      var mt = document.createElement('div'); mt.className = 'inv-m';
      var a = document.createElement('div');
      if (typeof r.total === 'number') { a.className = 'inv-a'; a.textContent = eur(r.total); }
      else { a.className = 'inv-a miss'; a.textContent = 'χωρίς ποσό'; }
      var d = document.createElement('div'); d.className = 'inv-d';
      d.textContent = (polloi ? r.supplier + ' · ' : '') + dstr(dateOf(r));
      mt.appendChild(a); mt.appendChild(d);
      var th = document.createElement('span');
      th.className = 'thumb';
      th.appendChild(im);
      addPgBadge(th, r);
      b.appendChild(th); b.appendChild(mt);
      b.onclick = function () { openShot(r.id); };
      return b;
    }

    draw();
  }

  /* v9 — «3 σελ.» πάνω στη μικρογραφία, μόνο όταν υπάρχουν πολλές */
  function addPgBadge(wrap, r) {
    var n = pageCount(r);
    if (n < 2) { return; }
    var b = document.createElement('span');
    b.className = 'pg-badge';
    b.textContent = n;
    b.title = n + ' σελίδες';
    wrap.appendChild(b);
  }

  /* ══ ΕΠΕΞΕΡΓΑΣΤΗΣ CROP ═══════════════════════════════════════
     Ένα σύρσιμο του δαχτύλου ορίζει το πλαίσιο. Δεν αρέσει; Ξανασύρεις.
     Μοτίβο «η μηχανή προτείνει, ο άνθρωπος εγκρίνει» (απόφαση 29/8) —
     εδώ ο άνθρωπος ΚΑΙ ορίζει ΚΑΙ εγκρίνει, γιατί κόβει τεκμήριο. */
  function openCrop(r, i, done) {
    var pgs = pagesOf(r);
    var ov = document.createElement('div');
    ov.className = 'crop-ov';
    var stage = document.createElement('div');
    stage.className = 'crop-stage';
    var im = document.createElement('img');
    im.src = blobUrl(pgs[i]);
    im.alt = '';
    var sel = document.createElement('div');
    sel.className = 'crop-sel';
    /* Τέσσερις ΜΕΓΑΛΕΣ λαβές — 44px, μέγεθος δαχτύλου */
    ['tl','tr','bl','br'].forEach(function (k) {
      var h = document.createElement('span');
      h.className = 'crop-h h-' + k;
      sel.appendChild(h);
    });
    stage.appendChild(im); stage.appendChild(sel);

    var hint = document.createElement('p');
    hint.className = 'crop-hint';
    hint.textContent = 'Σύρε τις γωνίες για να ρυθμίσεις · σύρε μέσα για μετακίνηση';

    var acts = document.createElement('div');
    acts.className = 'crop-acts';
    var cancel = document.createElement('button');
    cancel.className = 'btn ghost'; cancel.textContent = 'Άκυρο';
    var clear = document.createElement('button');
    clear.className = 'btn ghost'; clear.textContent = 'Χωρίς κόψιμο';
    var save = document.createElement('button');
    save.className = 'btn primary'; save.textContent = 'Αποθήκευση';
    acts.appendChild(cancel); acts.appendChild(clear); acts.appendChild(save);

    ov.appendChild(hint); ov.appendChild(stage); ov.appendChild(acts);
    document.body.appendChild(ov);

    /* 🔴 ΤΟ ΠΛΑΙΣΙΟ ΥΠΑΡΧΕΙ ΠΑΝΤΑ και ΔΕΝ ΓΙΝΕΤΑΙ ΠΟΤΕ null.
       Η v12 το έσβηνε σε κάθε νέο άγγιγμα (box = null στο down), οπότε
       μόλις σήκωνες το δάχτυλο για δεύτερη προσπάθεια, το έχανες.
       Τώρα ανοίγει με έτοιμο πλαίσιο και το ΡΥΘΜΙΖΕΙΣ όσες φορές θέλεις. */
    var cur = cropOf(r, i);
    var box = cur ? { x: cur.x, y: cur.y, w: cur.w, h: cur.h }
                  : { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    var MIN = 0.08;
    var mode = null, gx = 0, gy = 0, start = null;
    /* 🔴 Μετά από touchend ο browser στέλνει ΚΑΙ ψεύτικα mouse events
       (compatibility). Χωρίς αυτό, κάθε σύρσιμο με το δάχτυλο εκτελείται
       ΔΥΟ φορές και το πλαίσιο πηδάει. Μόλις δούμε αφή, τα ποντίκια
       αγνοούνται για πάντα σε αυτή τη συσκευή. */
    var usedTouch = false;

    function rect() { return im.getBoundingClientRect(); }
    function pt(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      var b = rect();
      return { x: Math.min(1, Math.max(0, (t.clientX - b.left) / b.width)),
               y: Math.min(1, Math.max(0, (t.clientY - b.top) / b.height)) };
    }
    function paint() {
      var b = rect(), st = stage.getBoundingClientRect();
      sel.style.left   = (b.left - st.left + box.x * b.width) + 'px';
      sel.style.top    = (b.top - st.top + box.y * b.height) + 'px';
      sel.style.width  = (box.w * b.width) + 'px';
      sel.style.height = (box.h * b.height) + 'px';
    }
    /* Ποια γωνία άγγιξες; Ανοχή 12% της εικόνας — γενναιόδωρη για δάχτυλο. */
    function hitCorner(q) {
      var T = 0.12, c = [
        ['tl', box.x,          box.y],
        ['tr', box.x + box.w,  box.y],
        ['bl', box.x,          box.y + box.h],
        ['br', box.x + box.w,  box.y + box.h]
      ];
      for (var j = 0; j < c.length; j++) {
        if (Math.abs(q.x - c[j][1]) < T && Math.abs(q.y - c[j][2]) < T) { return c[j][0]; }
      }
      return null;
    }
    function inside(q) {
      return q.x > box.x && q.x < box.x + box.w && q.y > box.y && q.y < box.y + box.h;
    }
    function down(e) {
      var q = pt(e);
      mode = hitCorner(q) || (inside(q) ? 'move' : 'new');
      gx = q.x; gy = q.y;
      start = { x: box.x, y: box.y, w: box.w, h: box.h };
      if (mode === 'new') { box = { x: q.x, y: q.y, w: 0, h: 0 }; }
      hint.textContent = (mode === 'move') ? 'Μετακίνηση…'
                       : (mode === 'new')  ? 'Νέο πλαίσιο…' : 'Ρύθμιση γωνίας…';
      paint(); e.preventDefault();
    }
    function move(e) {
      if (!mode) { return; }
      var q = pt(e), dx = q.x - gx, dy = q.y - gy;
      if (mode === 'move') {
        box.x = Math.min(1 - start.w, Math.max(0, start.x + dx));
        box.y = Math.min(1 - start.h, Math.max(0, start.y + dy));
      } else if (mode === 'new') {
        box.x = Math.min(gx, q.x); box.y = Math.min(gy, q.y);
        box.w = Math.abs(q.x - gx); box.h = Math.abs(q.y - gy);
      } else {
        var L = start.x, T2 = start.y, R = start.x + start.w, B = start.y + start.h;
        if (mode === 'tl' || mode === 'bl') { L = Math.min(q.x, R - MIN); }
        if (mode === 'tr' || mode === 'br') { R = Math.max(q.x, L + MIN); }
        if (mode === 'tl' || mode === 'tr') { T2 = Math.min(q.y, B - MIN); }
        if (mode === 'bl' || mode === 'br') { B = Math.max(q.y, T2 + MIN); }
        box = { x: L, y: T2, w: R - L, h: B - T2 };
      }
      paint(); e.preventDefault();
    }
    function up(e) {
      if (!mode) { return; }
      move(e);
      mode = null;
      /* Πολύ μικρό ή κατά λάθος tap → επαναφορά, ΠΟΤΕ κενή οθόνη */
      if (box.w < MIN || box.h < MIN) {
        box = start && start.w >= MIN ? start : { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
        hint.textContent = 'Πολύ μικρό — δοκίμασε ξανά, το πλαίσιο επανήλθε';
      } else {
        hint.textContent = 'Σύρε τις γωνίες για να ρυθμίσεις · σύρε μέσα για μετακίνηση';
      }
      paint();
    }

    stage.addEventListener('touchstart', function (e) { usedTouch = true; down(e); }, { passive: false });
    stage.addEventListener('touchmove',  move, { passive: false });
    stage.addEventListener('touchend',   up,   { passive: false });
    stage.addEventListener('touchcancel', up,  { passive: false });
    stage.addEventListener('mousedown',  function (e) { if (!usedTouch) { down(e); } });
    stage.addEventListener('mousemove',  function (e) { if (!usedTouch) { move(e); } });
    stage.addEventListener('mouseup',    function (e) { if (!usedTouch) { up(e); } });

    if (im.complete) { setTimeout(paint, 0); } else { im.onload = paint; }
    window.addEventListener('resize', paint);

    function close() {
      window.removeEventListener('resize', paint);
      document.body.removeChild(ov);
    }
    cancel.onclick = close;
    clear.onclick = function () {
      if (!r.crops) { r.crops = []; }
      r.crops[i] = null;
      put(r).then(function () { close(); done(); });
    };
    save.onclick = function () {
      if (box.w < MIN || box.h < MIN) { return; }
      if (!r.crops) { r.crops = []; }
      while (r.crops.length < pgs.length) { r.crops.push(null); }
      r.crops[i] = { x: box.x, y: box.y, w: box.w, h: box.h };
      put(r).then(function () { close(); done(); });
    };
  }

  /* ══ ΠΡΟΒΟΛΗ ΤΙΜΟΛΟΓΙΟΥ ══ */
  function openShot(id) {
    get(id).then(function (r) {
      if (!r) { return; }
      el('shot-title').textContent = r.supplier;
      var body = el('shot-body');
      body.innerHTML = '';
      /* v40 — ο αριθμός σελίδων βγαίνει από τον server ΚΑΙ από τα τοπικά:
         μια φωτογραφία που δεν κατέβηκε δεν πρέπει να εξαφανίζει τη σελίδα
         της. Κενή θέση διαβάζεται ως χαμένο τιμολόγιο. */
      var nPg = Math.max(pageCount(r), r.srvPages || 1);
      var pgs = [];
      for (var pi = 0; pi < nPg; pi++) { pgs.push(pi === 0 ? r.blob : (r.pages && r.pages[pi - 1])); }
      pgs.forEach(function (bl, i) {
        var block = document.createElement('div');
        block.className = 'pg-block';
        if (pgs.length > 1) {
          var lab = document.createElement('span');
          lab.className = 'pg-label';
          lab.textContent = 'Σελίδα ' + (i + 1) + ' από ' + pgs.length;
          block.appendChild(lab);
        }
        var c = cropOf(r, i);

        /* 🔴 Η ΦΩΤΟΓΡΑΦΙΑ ΛΕΙΠΕΙ ΤΟΠΙΚΑ — v40, κατ' απαίτηση.
           ΠΟΤΕ κενό: ή κουμπί που την κατεβάζει, ή καθαρή γραμμή που λέει
           ότι χρειάζεται δίκτυο. Ο χρήστης πρέπει να ξέρει ότι το τιμολόγιο
           υπάρχει και δεν χάθηκε. */
        if (!bl && r.srvPages) {
          if (navigator.onLine === false) {
            var off = document.createElement('span');
            off.className = 'pg-label ph-need';
            off.textContent = '📷 Χρειάζεται δίκτυο για να δεις τη φωτογραφία — το τιμολόγιο δεν χάθηκε.';
            block.appendChild(off);
          } else {
            var gb = document.createElement('button');
            gb.className = 'btn ghost';
            gb.textContent = '📷 Δείξε τη φωτογραφία';
            gb.onclick = function () {
              gb.disabled = true; gb.textContent = 'Κατεβαίνει…';
              fetchPhoto(r.id, i).then(function () {
                /* (β) — μία κατ' απαίτηση ανά προμηθευτή. Τρέχει ΜΟΝΟ στο
                   πάτημα του χρήστη· το αυτόματο σύνολο δεν το αγγίζει. */
                return all().then(function (rows) {
                  return pcDropSameSupplier(rows, pidOf(r.id, i), r.supplier);
                }).catch(function () {});
              }).then(function () {
                freeUrls(); nav.pop(); openShot(r.id);
              }).catch(function (e) {
                gb.disabled = false; gb.textContent = '📷 Δείξε τη φωτογραφία';
                var er = document.createElement('span');
                er.className = 'pg-label ph-need';
                er.textContent = 'Δεν κατέβηκε: ' + (e && e.message ? e.message : 'χωρίς δίκτυο') + '. Δοκίμασε ξανά.';
                block.appendChild(er);
              });
            };
            block.appendChild(gb);
          }
          body.appendChild(block);
          return;                     // χωρίς φωτογραφία δεν υπάρχει κόψιμο
        }

        var shown = cropImg(bl, c, 'shot-full');
        block.appendChild(shown);

        var cb = document.createElement('button');
        cb.className = 'btn ghost';
        cb.hidden = isReader();       // v35 — η περικοπή γράφει στη βάση
        cb.textContent = c ? '✂ Άλλαξε το κόψιμο' : '✂ Κόψε';
        cb.onclick = function () {
          openCrop(r, i, function () { freeUrls(); nav.pop(); openShot(r.id); });
        };
        block.appendChild(cb);
        if (c) {
          var note = document.createElement('span');
          note.className = 'pg-label crop-note';
          note.textContent = 'Κομμένο για εμφάνιση — η πλήρης φωτογραφία δεν χάθηκε';
          block.appendChild(note);
        }
        /* Διαγραφή ΜΙΑΣ σελίδας: τράβηξες λάθος δεύτερη, τη σβήνεις
           χωρίς να χάσεις το τιμολόγιο. Η σελίδα 1 σβήνεται μόνο αν
           υπάρχει δεύτερη να πάρει τη θέση της. */
        if (pgs.length > 1) {
          var dp = document.createElement('button');
          dp.className = 'btn ghost del';
          dp.hidden = isReader();
          dp.textContent = 'Διαγραφή σελίδας ' + (i + 1);
          dp.onclick = function () {
            if (!confirm('Διαγραφή της σελίδας ' + (i + 1) + ' από ' + pgs.length + ';\n\nΤο τιμολόγιο και οι υπόλοιπες σελίδες μένουν.')) { return; }
            var left = pgs.slice(0, i).concat(pgs.slice(i + 1));
            r.blob = left[0];
            r.pages = left.slice(1);
            put(r).then(function () { freeUrls(); nav.pop(); openShot(r.id); });
          };
          block.appendChild(dp);
        }
        body.appendChild(block);
      });
      [['Ημερομηνία τιμολογίου', dstr(dateOf(r))],
       ['Καταγράφηκε', dstr(r.ts)], ['Σύνολο', eur(r.total)],
       ['ΦΠΑ', eur(r.vat)], ['Καθαρό ποσό', eur(r.net)]].forEach(function (p) {
        var kv = document.createElement('div');
        kv.className = 'kv';
        kv.innerHTML = '<span></span><b></b>';
        kv.querySelector('span').textContent = p[0];
        kv.querySelector('b').textContent = p[1];
        body.appendChild(kv);
      });
      var dl = document.createElement('button');
      dl.className = 'btn ghost del wide';
      dl.hidden = isReader();
      dl.textContent = 'Διαγραφή τιμολογίου';
      dl.onclick = function () {
        if (!confirm('Διαγραφή αυτού του τιμολογίου;\n\n' + r.supplier + ' · ' + dstr(r.ts) +
                     '\n\nΣβήνεται και η φωτογραφία. Δεν επιστρέφει.')) { return; }
        del(r.id).then(function () { back(); refreshCount(); });
      };
      body.appendChild(dl);
      nav.push('s-shot'); show('s-shot');
    });
  }

  /* ══ ΚΑΛΕΣΕ ══ */
  function refCode() {
    var id = localStorage.getItem(LS.id) || '';
    return id.replace('km_', '').replace('hc_', '').slice(-8);
  }
  function refUrl() { return location.origin + '/kostometro/?ref=' + refCode(); }
  function renderRef() {
    el('ref-link').textContent = refUrl();
    el('ref-note').textContent = navigator.share ? '' : 'Ο browser σου δεν έχει κουμπί κοινοποίησης — χρησιμοποίησε την Αντιγραφή.';
    el('ref-share').hidden = !navigator.share;
  }

  /* ══ ΡΥΘΜΙΣΕΙΣ ══ */
  /* v32 — Η ΓΡΑΜΜΗ ΠΡΕΠΕΙ ΝΑ ΚΙΝΕΙΤΑΙ ΟΣΟ Η ΟΘΟΝΗ ΕΙΝΑΙ ΑΝΟΙΧΤΗ.
     Ως το v31 ζωγραφιζόταν μία φορά, στο άνοιγμα των Ρυθμίσεων: ο αυτόματος
     συγχρονισμός ξεκινάει 2,5″ μετά το άνοιγμα της εφαρμογής, άρα ο Stavros
     έβλεπε «δεν έχει τρέξει ακόμα» ενώ έτρεχε — και συμπέρανε ότι δεν γίνεται
     τίποτα μόνο του. Ακίνητο διαγνωστικό είναι διαγνωστικό που λέει ψέματα. */
  var syncTick = null;
  function stopSyncTick() { if (syncTick) { clearInterval(syncTick); syncTick = null; } }
  function startSyncTick() {
    stopSyncTick();
    syncTick = setInterval(function () {
      if (el('s-settings').hidden) { stopSyncTick(); return; }
      el('st-sync').textContent = syncLine();
    }, 700);
  }

  function renderSettings() {
    el('st-email').textContent = localStorage.getItem(LS.email) || '—';
    el('st-key').textContent = localStorage.getItem(LS.key) ? 'Με κλειδί Gemini' : 'Χειροκίνητα';
    el('st-ver').textContent = APP_VER;
    el('st-diag').textContent = localStorage.getItem(LS.diag) || '—';
    /* v30 — τι τρέχει ΕΔΩ, τι έχει ο server, ποιος worker σερβίρει.
       Χωρίς αυτά, «δεν ενημερώθηκε» είναι εντύπωση, όχι μέτρηση. */
    el('st-srvver').textContent = 'ελέγχεται…';
    serverVersion().then(function (v) {
      el('st-srvver').textContent = v
        ? (v === shortVer(APP_VER) ? v + ' — ενημερωμένο' : v + ' — ΝΕΟΤΕΡΗ ΑΠΟ ΑΥΤΗΝ')
        : 'χωρίς δίκτυο';
    });
    el('st-sw').textContent = (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'ενεργός' : 'κανένας';
    /* v35 — μία γραμμή που απαντάει στην ερώτηση του ΧΡΗΣΤΗ («γιατί δεν
       φωτογραφίζει;»), όχι του προγραμματιστή. */
    var w = whenStr(localStorage.getItem(LS.activeAt));
    el('st-active').textContent = !hasAccount()
      ? 'μία συσκευή'
      : (isReader() ? ('μόνο ανάγνωση' + (w ? ' · από ' + w : '')) : 'ενεργή — γράφει');
    el('st-sync').textContent = syncLine();
    startSyncTick();
    all().then(function (rows) { el('st-shots').textContent = rows.length; });
  }

  /* ══ ΑΝΑΓΝΩΣΗ GEMINI (φέτα 3) ══
     Κανόνες: (α) η φωτογραφία πάει ΑΠΕΥΘΕΙΑΣ συσκευή → Google, με το κλειδί
     του χρήστη — ποτέ μέσω δικού μας server. (β) Το Gemini ΠΡΟΤΕΙΝΕΙ, δεν
     αποφασίζει: οι τιμές προσυμπληρώνονται και το τιμολόγιο μένει εκκρεμές
     μέχρι ο άνθρωπος να πατήσει Αποθήκευση (απόφαση Stavros 29/8: Β).
     (γ) Καμία οθόνη σφάλματος στην πόρτα — αποτυχία = χειροκίνητα, όπως πριν. */
  var APP_VER = 'φέτα 3 · v44';
  /* ΣΕΙΡΑ ΜΟΝΤΕΛΩΝ, νεότερο πρώτα. Η Google αποσύρει μοντέλα χωρίς προειδοποίηση:
     29/8/2026 το gemini-2.5-flash έπαψε να δίνεται σε νέους λογαριασμούς και η
     ανάγνωση γύριζε 404. Σκληρά κωδικοποιημένο όνομα = εφαρμογή που σπάει μόνη της
     στα χέρια του πελάτη. Δοκιμάζουμε με τη σειρά, θυμόμαστε ποιο δούλεψε. */
  var AI_MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
  function aiModels() {
    var saved = localStorage.getItem(LS.model);
    if (!saved) { return AI_MODELS.slice(); }
    var rest = AI_MODELS.filter(function (m) { return m !== saved; });
    return [saved].concat(rest);
  }
  /* Διαγνωστικό: η ΤΕΛΕΥΤΑΙΑ αλήθεια της ανάγνωσης, ωμή. Χωρίς αυτό, η σιωπηλή
     αποτυχία είναι αδιάγνωστη — μάθημα 29/8/2026. Ορατό μόνο στις Ρυθμίσεις. */
  function diag(msg) {
    try {
      var d = new Date();
      var t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      localStorage.setItem(LS.diag, t + ' · ' + msg);
    } catch (e) {}
    if (!el('s-settings').hidden) { renderSettings(); }
  }
  var AI_MAX_TRY = 3;
  /* ΡΥΘΜΟΣ. Το δωρεάν επίπεδο δίνει 5 αιτήματα/λεπτό (μετρήθηκε 29/8/2026:
     «limit: 5 · retry in 19.2s»). Ο πραγματικός χρήστης βγάζει ΜΙΑ φωτογραφία
     στην πόρτα — δεν αγγίζει ποτέ το όριο. Το έσπασε η δική μας ουρά τρέχοντας
     15 κλήσεις στη σειρά. 13 δευτ. μεταξύ κλήσεων = 4,6/λεπτό, μέσα στο όριο. */
  var AI_GAP = 13000;
  var aiBusy = false, aiHalt = false; // aiHalt: άκυρο κλειδί — στοπ ως το επόμενο άνοιγμα
  var aiWait = 0;                     // 429: ώρα (ms) πριν την οποία δεν ξαναδοκιμάζουμε
  /* ⚠ ΜΕΤΡΗΘΗΚΕ 30/8: το aiBusy εμποδίζει μόνο ΤΑΥΤΟΧΡΟΝΕΣ κλήσεις. Η aiSweep
     καλείται από ΤΕΣΣΕΡΑ σημεία (renderPending, assign, boot, η ίδια η ουρά) —
     άρα κάθε ανανέωση οθόνης έστελνε αίτημα ΕΚΤΟΣ ρυθμού και έτρωγε 429.
     Το aiLast είναι το πραγματικό φρένο: καμία κλήση πριν περάσουν AI_GAP ms
     από την προηγούμενη, ΑΠΟ ΟΠΟΙΟ ΣΗΜΕΙΟ ΚΙ ΑΝ ΖΗΤΗΘΕΙ. */
  var aiLast = 0;
  var aiTimer = null;
  /* v14 — ΑΥΤΟΜΑΤΑ ΔΙΑΒΑΖΕΤΑΙ ΜΟΝΟ Ο,ΤΙ ΤΡΑΒΗΞΕΣ ΤΩΡΑ (απόφαση Stavros 30/8).
     Αιτία: με 30 εκκρεμή η ουρά έτρεχε 6,5 λεπτά σε ΚΑΘΕ άνοιγμα, και τα
     σκουπίδια (άσχετες φωτογραφίες) έκαιγαν 3 κλήσεις το καθένα πριν
     παραιτηθούν. Τα παλιά διαβάζονται ΜΟΝΟ όταν το ζητήσει ο χρήστης,
     αφού δει πόσο θα πάρει. */
  var autoIds = {};        // ids αυτής της συνεδρίας — μόνο αυτά τρέχουν μόνα τους
  var manualRun = false;   // ο χρήστης ζήτησε ρητά ολόκληρη την ουρά

  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  /* Ημερομηνία τιμολογίου από το Gemini: δεκτή ΜΟΝΟ ως YYYY-MM-DD και μόνο
     αν είναι αληθινή ημερομηνία σε λογικό εύρος. Ό,τι άλλο πέφτει σε null —
     λάθος ημερομηνία είναι χειρότερη από καμία. */
  function aiDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { return null; }
    var d = new Date(v + 'T12:00:00');
    if (isNaN(d.getTime())) { return null; }
    var y = d.getFullYear();
    if (y < 2000 || d.getTime() > Date.now() + 86400000) { return null; }
    return d.getTime();
  }
  function aiNum(v) {
    if (typeof v === 'number' && isFinite(v)) { return Math.round(v * 100) / 100; }
    return null;
  }
  /* Δοκιμάζει τα μοντέλα με τη σειρά. 404 = αποσυρμένο → επόμενο.
     Κάθε άλλο σφάλμα σταματάει αμέσως (δεν καίμε κλήσεις σε άκυρο κλειδί). */
  function aiRead(rec, key) {
    var list = aiModels(), tried = [];
    function step(i) {
      if (i >= list.length) {
        var e = new Error('http'); e.status = 404;
        e.msg = 'κανένα διαθέσιμο μοντέλο (' + tried.join(', ') + ')';
        return Promise.reject(e);
      }
      return aiOnce(rec, key, list[i]).then(function (out) {
        if (localStorage.getItem(LS.model) !== list[i]) {
          try { localStorage.setItem(LS.model, list[i]); } catch (e2) {}
        }
        return out;
      }).catch(function (err) {
        if (err && err.status === 404) { tried.push(list[i]); return step(i + 1); }
        throw err;
      });
    }
    return step(0);
  }

  function aiOnce(rec, key, model) {
    /* v9 — ΕΠΙΛΟΓΗ Β (απόφαση Stavros 30/8): φεύγουν ΟΛΕΣ οι σελίδες
       σε ΕΝΑ αίτημα. Το σύνολο συχνά είναι στην τελευταία σελίδα.
       Μία κλήση όσες σελίδες κι αν έχει — το όριο των 5/λεπτό μένει άθικτο. */
    return Promise.all(pagesOf(rec).map(blobB64)).then(function (b64s) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var tmr = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({
          contents: [{ parts: b64s.map(function (b64) {
            return { inline_data: { mime_type: 'image/jpeg', data: b64 } };
          }).concat([
            { text: (b64s.length > 1
                ? ('Οι ' + b64s.length + ' φωτογραφίες είναι ΣΕΛΙΔΕΣ ΤΟΥ ΙΔΙΟΥ τιμολογίου, με τη σειρά. Δώσε ΕΝΑ σύνολο για ολόκληρο το τιμολόγιο — το τελικό πληρωτέο, που συνήθως βρίσκεται στην ΤΕΛΕΥΤΑΙΑ σελίδα. ΠΟΤΕ μην προσθέσεις μερικά σύνολα από διαφορετικές σελίδες. ')
                : 'Φωτογραφία τιμολογίου ή απόδειξης (ελληνικά ή αγγλικά). ') +
              'Απάντησε ΜΟΝΟ με JSON: {"net": καθαρή αξία ΠΡΟ ΦΠΑ (ελληνικά: καθαρή αξία, μερικό σύνολο, υποσύνολο · αγγλικά: net, subtotal, amount before VAT), "vat": συνολικό ποσό ΦΠΑ όλων των συντελεστών μαζί (ελληνικά: ΦΠΑ · αγγλικά: VAT, tax), "total": τελικό πληρωτέο ΜΕ ΦΠΑ (ελληνικά: σύνολο, γενικό σύνολο, πληρωτέο · αγγλικά: total, grand total, amount due), "date": η ημερομηνία ΤΟΥ ΤΙΜΟΛΟΓΙΟΥ ως "YYYY-MM-DD", ή null}. ' +
              'ΠΡΟΣΟΧΗ ΣΤΟΥΣ ΑΡΙΘΜΟΥΣ: το χαρτί μπορεί να γράφει 1.234,56 (ελληνικά) ή 1,234.56 (αγγλικά) — και τα δύο σημαίνουν χίλια διακόσια τριάντα τέσσερα και 56 λεπτά. Κατάλαβε ποιο σύστημα χρησιμοποιεί το ΣΥΓΚΕΚΡΙΜΕΝΟ χαρτί και δώσε τον αριθμό ΠΑΝΤΑ με τελεία δεκαδικών και ΧΩΡΙΣ διαχωριστή χιλιάδων: 1234.56. ' +
              'Χωρίς σύμβολα, χωρίς κείμενο. Αν κάτι δεν διαβάζεται ΚΑΘΑΡΑ, βάλε null — ποτέ μην μαντεύεις.' }
          ]) }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0 }
        })
      }).then(function (res) {
        if (tmr) { clearTimeout(tmr); }
        if (res.ok) { return res.json(); }
        return res.text().then(function (body) {
          var m = '';
          try { m = JSON.parse(body).error.message; } catch (e2) { m = String(body).slice(0, 120); }
          var e = new Error('http'); e.status = res.status; e.msg = m;
          if (res.status === 429) {
            var s = /retry in ([0-9.]+)s/i.exec(m);
            e.retryAfter = (s ? Math.ceil(parseFloat(s[1])) : 30) * 1000 + 2000;
          }
          throw e;
        });
      });
    }).then(function (j) {
      var txt = '';
      try { txt = j.candidates[0].content.parts[0].text; } catch (e) {}
      var o = null;
      try { o = JSON.parse(txt); } catch (e) {}
      if (!o || typeof o !== 'object') {
        var pe = new Error('parse'); pe.soft = true;
        pe.msg = 'δεν γύρισε JSON: ' + String(txt).slice(0, 60);
        throw pe;
      }
      return { net: aiNum(o.net), vat: aiNum(o.vat), total: aiNum(o.total), date: aiDate(o.date) };
    });
  }
  /* Ένα και μόνο χρονόμετρο. Χωρίς αυτό, δέκα ανανεώσεις οθόνης άφηναν
     πίσω τους δέκα setTimeout που ξυπνούσαν όλα μαζί. */
  function schedule(ms) {
    if (aiTimer) { clearTimeout(aiTimer); }
    aiTimer = setTimeout(function () { aiTimer = null; aiSweep(); }, ms);
  }
  function aiSweep() {
    /* v35 · Η.3 — Η ΑΝΑΓΝΩΣΗ ΕΙΝΑΙ ΓΡΑΨΙΜΟ. Αποθηκεύει προτάσεις ποσών στη
       βάση· σε αναγνώστρια συσκευή αυτά δεν θα ανέβαιναν ποτέ και θα τα
       πατούσε το επόμενο κατέβασμα. Χειρότερα: θα έκαιγε το όριο του
       κλειδιού Gemini για δουλειά που πετιέται. */
    if (isReader()) { diag('μόνο ανάγνωση — γράφει η ενεργή συσκευή'); return; }
    var key = localStorage.getItem(LS.key);
    if (!key) { diag('χωρίς κλειδί — χειροκίνητα'); return; }
    if (aiHalt) { diag('σταματημένο μετά από σφάλμα — άλλαξε/ξαναβάλε κλειδί'); return; }
    if (!navigator.onLine) { diag('χωρίς σύνδεση'); return; }
    if (aiBusy) { return; }
    var left = aiWait - Date.now();
    if (left > 0) {
      diag('αναμονή ορίου · ξανά σε ' + Math.ceil(left / 1000) + 'ς');
      schedule(left + 500);
      return;
    }
    /* Το φρένο του ρυθμού — ισχύει για ΚΑΘΕ κλήση, όχι μόνο για την ουρά */
    var since = Date.now() - aiLast;
    if (aiLast && since < AI_GAP) {
      diag('στη σειρά · επόμενη ανάγνωση σε ' + Math.ceil((AI_GAP - since) / 1000) + 'ς');
      schedule(AI_GAP - since + 200);
      return;
    }
    aiBusy = true;
    all().then(function (rows) {
      var q = rows.filter(function (r) {
        return isPending(r) && !r.sug && (r.aiTry || 0) < AI_MAX_TRY &&
               (manualRun || autoIds[r.id]);
      }).sort(function (a, b) { return b.ts - a.ts; }); // ΝΕΟΤΕΡΟ πρώτα: ο χρήστης
      // περιμένει αυτό που μόλις τράβηξε, όχι κάτι περσινό
      if (!q.length) {
        aiBusy = false;
        if (manualRun) { manualRun = false; diag('η ουρά ολοκληρώθηκε'); }
        else { diag('τίποτα σε αναμονή ανάγνωσης'); }
        /* v17 — ΠΟΤΕ renderPending() εδώ. Το renderPending() καλεί aiSweep()
           στην πρώτη του γραμμή· όταν η ουρά ήταν άδεια, ο άδειος κλάδος
           ξανακαλούσε renderPending() και οι δύο καλούσαν η μία την άλλη
           χωρίς τέλος. Μετρήθηκε 31/8/2026: 932 ξαναχτισίματα σε 5 δευτ. —
           τα πεδία ποσών καταστρέφονταν πριν προλάβει ο χρήστης να γράψει.
           Εδώ ΔΕΝ άλλαξε καμία εγγραφή, άρα δεν υπάρχει τι να ξαναχτιστεί. */
        return;
      }
      var rec = q[0];
      aiLast = Date.now();   // ΜΟΝΟ όταν όντως φεύγει αίτημα
      diag('διαβάζω…');
      aiRead(rec, key).then(function (sug) {
        if (sug.total === null && sug.vat === null && sug.net === null) {
          rec.aiTry = (rec.aiTry || 0) + 1; // διάβασε αλλά δεν είδε τίποτα
          diag('απάντησε αλλά δεν διάβασε ποσά (' + rec.aiTry + '/3)');
        } else {
          rec.sug = sug; rec.aiAt = Date.now();
          diag('✓ διάβασε: ' + num(sug.total) + ' / ' + num(sug.vat) +
               ' · ' + (localStorage.getItem(LS.model) || '?'));
        }
        return put(rec).then(function () {
          if (!el('s-pend').hidden) { renderPending(); }
          aiBusy = false;
          schedule(AI_GAP);           // επόμενο της ουράς, με σεβασμό στο όριο
        });
      }).catch(function (err) {
        if (err && err.soft) {
          rec.aiTry = (rec.aiTry || 0) + 1; put(rec);
          diag('ακατάλληλη απάντηση · ' + (err.msg || ''));
        } else if (err && err.status === 429) {
          /* Όριο ρυθμού: ΔΕΝ είναι βλάβη. Περιμένουμε όσο λέει η Google και συνεχίζουμε. */
          aiWait = Date.now() + (err.retryAfter || 32000);
          diag('όριο ρυθμού · συνεχίζω σε ' + Math.ceil((err.retryAfter || 32000) / 1000) + 'ς');
          aiBusy = false;
          schedule((err.retryAfter || 32000) + 500);
          return;
        } else if (err && err.status) {
          aiHalt = true;
          diag('σφάλμα ' + err.status + ' · ' + (err.msg || 'άγνωστο'));
        } else {
          diag('δεν έφτασε στη Google · ' + (err && err.name ? err.name : 'δίκτυο/CORS'));
        }
        aiBusy = false;
      });
    }).catch(function () { aiBusy = false; });
  }

  /* ── Κάμερα ── */
  function stopCam() {
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); }
    stream = null;
    el('vid').srcObject = null;
  }
  function startCam() {
    /* v35 · Η.3 — ΠΡΩΤΟ ΦΡΕΝΟ. Σε αναγνώστρια συσκευή η κάμερα δεν ανοίγει
       καν: ούτε άδεια ζητιέται, ούτε μπαταρία καίγεται, και — το κύριο —
       δεν υπάρχει τρόπος να τραβηχτεί φωτογραφία που δεν θα φύγει ποτέ. */
    if (isReader()) {
      stopCam();
      el('cam-err').hidden = true;
      var wasHidden = el('ro').hidden;
      roRender();
      if (wasHidden) { roClear(); }   // καθαρή οθόνη μόνο στο άνοιγμα
      el('ro').hidden = false;
      return;
    }
    el('ro').hidden = true;
    el('cam-err').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return camFail('Ο browser δεν υποστηρίζει κάμερα. Άνοιξε τη σελίδα σε Chrome ή Safari.');
    }
    /* v18 — «Υπάρχει stream» ΔΕΝ σημαίνει «ζωντανή κάμερα». Όταν το Android
       παίρνει την κάμερα (παρασκήνιο, κλείδωμα οθόνης, άλλη εφαρμογή), τα
       κανάλια γίνονται 'ended' αλλά το αντικείμενο μένει — και η οθόνη κρατάει
       ΠΑΓΩΜΕΝΟ το τελευταίο καρέ, χωρίς κανένα μήνυμα. Μετρήθηκε 31/8/2026:
       μετά το 'ended', ούτε έξοδος-είσοδος στην οθόνη δεν το επανέφερε. */
    if (stream) {
      var zontano = stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; });
      if (zontano) {
        /* v19 — ΖΩΝΤΑΝΟ ΚΑΝΑΛΙ ΔΕΝ ΣΗΜΑΙΝΕΙ ΚΙΝΟΥΜΕΝΗ ΕΙΚΟΝΑ. Το <video autoplay>
           ξεκινάει ΜΙΑ φορά· όταν το Android παγώνει την εφαρμογή στο παρασκήνιο,
           το στοιχείο μένει σε pause και δείχνει το τελευταίο καρέ — με το κανάλι
           ακόμα 'live'. Σε ΟΛΟ το αρχείο δεν υπήρχε ούτε μία κλήση .play().
           Γι' αυτό η διόρθωση της v18 έπιασε μόνο τη μισή περίπτωση. */
        var v0 = el('vid');
        if (v0.srcObject !== stream) { v0.srcObject = stream; }
        if (v0.paused) { v0.play().catch(function () {}); }
        return;
      }
      stopCam();
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false
    }).then(function (s) {
      stream = s;
      var v = el('vid');
      v.srcObject = s;
      /* v19 — ρητό play(): το autoplay δεν είναι εγγύηση σε κινητό */
      v.play().catch(function () {});
    }).catch(function (err) {
      var m = 'Σφάλμα: ' + (err && err.name ? err.name : 'άγνωστο');
      if (err && err.name === 'NotAllowedError') { m = 'Δεν δόθηκε άδεια κάμερας. Άνοιξε τις ρυθμίσεις του browser για αυτή τη σελίδα και επίτρεψε την κάμερα.'; }
      if (err && err.name === 'NotFoundError') { m = 'Δεν βρέθηκε κάμερα σε αυτή τη συσκευή.'; }
      camFail(m);
    });
  }
  function camFail(msg) {
    el('cam-err-msg').textContent = msg;
    el('cam-err').hidden = false;
  }
  /* v22 — ΦΥΛΑΚΑΣ ΕΙΚΟΝΑΣ. Οι v18/v19 πιάνουν την κάμερα που πέθανε ΟΤΑΝ
     ΦΕΥΓΕΙΣ ΚΑΙ ΓΥΡΝΑΣ. Υπάρχει όμως τρίτος δρόμος: η εικόνα παγώνει ΕΝΩ
     είσαι μέσα στην οθόνη — το κανάλι δηλώνει 'live', το <video> δηλώνει ότι
     παίζει, και απλώς δεν έρχονται καρέ. Καμία διαδρομή επαναφοράς δεν
     ενεργοποιείται, γιατί ο χρήστης δεν πάει πουθενά.
     Μετρήθηκε 31/8/2026: με νεκρό κανάλι, το v.paused ήταν false — το
     στοιχείο δήλωνε ότι παίζει. Η ΜΟΝΗ αξιόπιστη ένδειξη είναι το
     currentTime: αν δεν προχωράει, η εικόνα είναι νεκρή όσο «ζωντανή» κι αν
     δηλώνεται. Δύο δείγματα των 2 δευτ. = 4 δευτ. ακινησίας πριν την
     επανεκκίνηση, ώστε να μην ξαναζητάει κάμερα σε κάθε μικροκόλλημα. */
  var camWatch = null, camLastT = -1, camStuck = 0;
  function camHardRestart() {
    stopCam();
    startCam();
  }
  function camWatchStart() {
    if (camWatch) { return; }
    camWatch = setInterval(function () {
      var pv = el('preview');
      /* Δεν επεμβαίνουμε: εκτός οθόνης κάμερας, στο παρασκήνιο, ή όσο ο
         χρήστης κοιτάει την προεπισκόπηση της λήψης. */
      if (el('s-cam').hidden || document.hidden || (pv && !pv.hidden) || isReader()) {
        camLastT = -1; camStuck = 0; return;
      }
      var v = el('vid');
      if (!stream) { camLastT = -1; camStuck = 0; startCam(); return; }
      var t = v.currentTime;
      if (t === camLastT) {
        camStuck++;
        if (camStuck >= 2) { camStuck = 0; camLastT = -1; camHardRestart(); }
      } else { camStuck = 0; camLastT = t; }
    }, 2000);
  }
  camWatchStart();

  /* v18 — Η επιστροφή από το παρασκήνιο είναι η πιο συχνή στιγμή που έχει
     πεθάνει η κάμερα: ο χρήστης απαντάει μήνυμα και γυρνάει. Χωρίς αυτό,
     βλέπει παγωμένο καρέ και νομίζει ότι η εφαρμογή χάλασε. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !el('s-cam').hidden) { startCam(); }
  });

  function toCam() { nav = []; supView = null; clearPending(); show('s-cam'); startCam(); refreshCount(); }

  function capture() {
    /* Δεύτερο φρένο, επίτηδες: το πρώτο είναι η οθόνη. Αν ποτέ μια διαδρομή
       φτάσει εδώ με την κάμερα ανοιχτή σε αναγνώστρια συσκευή, η λήψη δεν
       γίνεται — καλύτερα ένα κουμπί που δεν κάνει τίποτα παρά ένα τιμολόγιο
       που ο χρήστης νομίζει ότι κατέγραψε. */
    if (isReader()) { startCam(); return; }
    var v = el('vid');
    if (!v.videoWidth) { return; }
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    el('flash').classList.remove('on');
    void el('flash').offsetWidth;
    el('flash').classList.add('on');
    c.toBlob(function (blob) {
      pendingBlob = blob;
      if (pendingUrl) { URL.revokeObjectURL(pendingUrl); }
      pendingUrl = URL.createObjectURL(blob);
      showPreview();
    }, 'image/jpeg', 0.85);
  }

  /* ── ΠΡΟΕΠΙΣΚΟΠΗΣΗ (v9) ──────────────────────────────────────
     Ο χρήστης βλέπει ΟΛΟΚΛΗΡΗ τη φωτογραφία πριν αποφασίσει.
     Τρία κουμπιά, στη θέση του πράσινου κουμπιού:
       Ξανά      → σβήνει αυτή τη λήψη, πίσω στην κάμερα
       + Σελίδα  → την κρατά ως σελίδα του ίδιου τιμολογίου
       OK        → «Ποιος;» και αποθήκευση                        */
  function showPreview() {
    el('prev-img').src = pendingUrl;
    var n = pendingPages.length;
    var badge = el('prev-count');
    if (n) {
      badge.textContent = 'Σελίδα ' + (n + 1) + ' · ίδιο τιμολόγιο';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    el('prev-page').disabled = (n + 1 >= MAX_PAGES);
    el('preview').hidden = false;
  }
  function hidePreview() {
    el('preview').hidden = true;
    el('prev-img').removeAttribute('src');
  }
  function dropPending() {
    pendingBlob = null;
    if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
  }
  function clearPending() {
    dropPending();
    pendingPages = [];
  }
  function previewRetake() {   /* σβήνει ΜΟΝΟ την τελευταία λήψη */
    dropPending();
    hidePreview();
    show('s-cam');
    startCam();
  }
  function previewAddPage() {
    if (!pendingBlob) { return; }
    if (pendingPages.length + 1 >= MAX_PAGES) { return; }
    pendingPages.push(pendingBlob);
    dropPending();
    hidePreview();
    show('s-cam');
    startCam();
  }
  var whoDate = null;   // ms — τι ημερομηνία θα πάρει το επόμενο τιμολόγιο
  function renderWhoDate() {
    el('who-date-txt').textContent = '📅 ' + dstr(whoDate);
    el('who-date-inp').hidden = true;
    el('who-date-edit').hidden = false;
  }
  el('who-date-edit') && (el('who-date-edit').onclick = function () {
    var inp = el('who-date-inp');
    inp.value = ymd(whoDate);
    inp.max = ymd(Date.now());
    inp.hidden = false;
    el('who-date-edit').hidden = true;
    el('who-date-txt').textContent = 'Ημερομηνία τιμολογίου:';
    if (inp.showPicker) { try { inp.showPicker(); } catch (e) {} }
    else { inp.focus(); }
  });
  el('who-date-inp') && (el('who-date-inp').onchange = function () {
    var t = fromYmd(el('who-date-inp').value);
    if (t !== null) { whoDate = t; }
    renderWhoDate();
  });

  function previewOk() {
    if (!pendingBlob) { return; }
    hidePreview();
    var n = pendingPages.length + 1;
    var wb = el('who-pages');
    if (n > 1) { wb.textContent = n; wb.hidden = false; } else { wb.hidden = true; }
    if (thumbUrl) { URL.revokeObjectURL(thumbUrl); }
    thumbUrl = URL.createObjectURL(pendingPages[0] || pendingBlob);
    el('thumb').src = thumbUrl;
    whoDate = Date.now();          // προεπιλογή: σήμερα
    renderWhoDate();
    el('in-sup').value = '';
    /* Πρώτα η λίστα, μετά η οθόνη — ποτέ κενή λίστα για μια στιγμή. */
    renderSuppliers().then(function () { show('s-who'); }, function () { whoMode('new'); show('s-who'); });
  }

  /* ── Καταχώρηση ── */
  function assign(name) {
    if (!name || !pendingBlob) { return; }
    /* Σελίδα 1 = η ΠΡΩΤΗ που τραβήχτηκε. Το pendingBlob είναι η τελευταία. */
    var seq = pendingPages.concat([pendingBlob]);
    var rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      supplier: name,
      invDate: whoDate || Date.now(),
      blob: seq[0],
      pages: seq.slice(1),
      net: null, vat: null, total: null
    };
    autoIds[rec.id] = 1;   // μόλις τραβήχτηκε → διαβάζεται μόνο του
    put(rec).then(function () {
      clearPending();
      show('s-cam');
      aiSweep();
      var t = el('toast');
      t.hidden = false;
      setTimeout(function () { t.hidden = true; }, 1100);
      refreshCount();
    }).catch(function (e) {
      alert('Δεν αποθηκεύτηκε: ' + e);
    });
  }
  function refreshCount() {
    all().then(function (rows) {
      var n = rows.filter(isPending).length;
      el('pending').textContent = n + ' εκκρεμ' + (n === 1 ? 'ές' : 'ή');
    });
  }

  /* ── Εγγραφή ── */
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  /* ── v35 · Η.3 · ΕΝΕΡΓΗ ΣΥΣΚΕΥΗ ────────────────────────────────────
     ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ: ο server επιβάλλει από 2/9 «μία γράφει, οι άλλες
     διαβάζουν» — ανέβασμα από μη-ενεργή γυρίζει 409. Η ΟΘΟΝΗ όμως δεν το
     έλεγε πουθενά: η αναγνώστρια συσκευή άφηνε τον χρήστη να φωτογραφίσει,
     το έσωζε τοπικά, και δεν έφευγε ΠΟΤΕ. Δουλειά που καταπίνεται σιωπηλά.
     Ο ΚΑΝΟΝΑΣ: όποια συσκευή βάλει τις 12 λέξεις γίνεται η ενεργή· κάθε
     άλλη περνάει σε ανάγνωση — βλέπει τα πάντα, δεν φωτογραφίζει, δεν
     επεξεργάζεται. Καμία συγχώνευση, άρα κανένα λογιστικό τεκμήριο δεν
     χάνεται ποτέ από σύγκρουση δύο συσκευών. */

  /* ✅ ΑΠΟΦΑΣΗ STAVROS 4/9/2026 — ΕΠΙΒΕΒΑΙΩΣΗ, ΟΧΙ 12 ΛΕΞΕΙΣ.
     Αναθεωρεί το Brief Α Η.3, που έλεγε «ζητάει τις 12 λέξεις».
     Το σκεπτικό, μετρημένο στον ίδιο τον κώδικα: η συσκευή έχει ΗΔΗ τις 12
     λέξεις αποθηκευμένες (μπήκαν όταν συνδέθηκε) και τις διαβάζει μόνη της
     σε κάθε κρυπτογράφηση. Όποιος κρατάει το ξεκλείδωτο κινητό τις έχει —
     άρα το πληκτρολόγιο δεν αγοράζει ασφάλεια. Αγοράζει μόνο προστασία από
     το κατά λάθος πάτημα, και αυτό το δίνει εξίσου μια επιβεβαίωση, σε δύο
     δευτερόλεπτα αντί για δώδεκα λέξεις από χαρτί στην πόρτα.
     ⚠ ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ: η σύνδεση σε ΝΕΑ συσκευή θέλει ΠΑΝΤΑ τις 12 λέξεις.
     Εκεί δεν υπάρχει τίποτα αποθηκευμένο — οι λέξεις ΕΙΝΑΙ το κλειδί. */
  var ACTIVATE_NEEDS_WORDS = false;

  function hasAccount() {
    return !!localStorage.getItem(LS.folder) && !!localStorage.getItem(LS.wordsOk);
  }
  /* ⚠ Χωρίς λογαριασμό ΔΕΝ υπάρχει αναγνώστρια κατάσταση: μία συσκευή, δική
     της βάση, γράφει πάντα. Αλλιώς μια αποτυχία δικτύου θα κλείδωνε την
     κάμερα σε χρήστη που δεν έχει καν φάκελο. */
  function isReader() {
    return hasAccount() && localStorage.getItem(LS.active) === '0';
  }
  function setActiveState(on, since) {
    var was = localStorage.getItem(LS.active);
    localStorage.setItem(LS.active, on ? '1' : '0');
    if (since) { localStorage.setItem(LS.activeAt, since); }
    if (was === (on ? '1' : '0')) { return; }
    /* Η αλλαγή φαίνεται ΑΜΕΣΩΣ, όχι στο επόμενο άνοιγμα: αν ο χρήστης
       στέκεται στην κάμερα τη στιγμή που άλλη συσκευή πήρε τη σκυτάλη,
       πρέπει να το δει πριν τραβήξει φωτογραφία που δεν θα φύγει ποτέ. */
    if (!el('s-cam').hidden) { startCam(); }
    if (!el('s-pend').hidden) { renderPending(); }
    if (!el('s-settings').hidden) { renderSettings(); }
  }
  /* Ρωτάει τον server. Χωρίς δίκτυο ΔΕΝ αλλάζει τίποτα — κρατιέται η
     τελευταία γνωστή κατάσταση (Α400 §Γ: «δεν μπόρεσα να ελέγξω» δεν
     είναι απάντηση). */
  function refreshActive() {
    if (!hasAccount()) { return Promise.resolve(null); }
    return kmStatus().then(function (st) {
      if (!st) { return null; }
      setActiveState(st.this_device_active !== false,
                     st.state && st.state.active_since);
      return st;
    });
  }
  function whenStr(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    return dstr(d.getTime()) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  /* Η οθόνη ανάγνωσης — γεμίζει κάθε φορά που εμφανίζεται, ώστε η ώρα και
     ο αριθμός των μη-ανεβασμένων να λένε την ΤΩΡΙΝΗ αλήθεια. */
  function roRender() {
    var w = whenStr(localStorage.getItem(LS.activeAt));
    el('ro-when').textContent = w
      ? ('Η επεξεργασία μεταφέρθηκε σε άλλη συσκευή στις ' + w + '.')
      : 'Η επεξεργασία έχει μεταφερθεί σε άλλη συσκευή.';
    var n = pullInfo.notUp || 0;
    var pe = el('ro-pend');
    if (n > 0) {
      pe.hidden = false;
      pe.textContent = n === 1
        ? '1 τιμολόγιο από αυτή τη συσκευή δεν έχει ανέβει. Θα ανέβει μόλις την ξανακάνεις ενεργή — δεν χάνεται.'
        : n + ' τιμολόγια από αυτή τη συσκευή δεν έχουν ανέβει. Θα ανέβουν μόλις την ξανακάνεις ενεργή — δεν χάνονται.';
    } else { pe.hidden = true; }
    el('ro-wbox').hidden = !ACTIVATE_NEEDS_WORDS;
  }
  /* Το πεδίο καθαρίζει ΜΟΝΟ όταν η οθόνη πρωτοεμφανίζεται — ποτέ σε ανανέωση
     από δουλειά του παρασκηνίου. */
  function roClear() {
    el('ro-err').hidden = true;
    if (!ACTIVATE_NEEDS_WORDS) { return; }
    el('ro-words').value = '';
    el('ro-count').textContent = '0 από 12 λέξεις';
    el('ro-count').style.color = '';
  }

  /* ── v26 · Ο ΛΟΓΑΡΙΑΣΜΟΣ (Η.2β-1) ────────────────────────────────
     Τι κάνει αυτό το κομμάτι: πρώτη οθόνη «έχεις λογαριασμό;», οι 12
     λέξεις με υποχρεωτικό τσεκάρισμα, και εγγραφή του email στο μητρώο.
     ⛔ Τι ΔΕΝ κάνει ακόμα: ΔΕΝ ανεβάζει και ΔΕΝ κατεβάζει τιμολόγια
     (Η.2). Καμία γραμμή εδώ δεν αγγίζει το IndexedDB. */
  var KM_API = '/api/km/';
  var pendingWords = null;   // οι λέξεις που μόλις φτιάχτηκαν, πριν τσεκαριστούν

  function kmHead() {
    return {
      'Content-Type': 'application/json',
      'X-Km-Folder':  localStorage.getItem(LS.folder) || '',
      'X-Km-Auth':    localStorage.getItem(LS.auth)   || '',
      'X-Km-Device':  localStorage.getItem(LS.id)     || ''
    };
  }
  function devName() {
    var m = /\(([^)]+)\)/.exec(navigator.userAgent || '');
    return (m ? m[1] : (navigator.platform || 'συσκευή')).slice(0, 60);
  }

  /* Αποθηκεύει λέξεις + παράγωγα ΤΟΠΙΚΑ. Το κλειδί δεν αποθηκεύεται —
     ξαναβγαίνει από τις λέξεις όποτε χρειαστεί (Η.2, επόμενο κομμάτι). */
  function kmStore(words, d) {
    localStorage.setItem(LS.words,  words.join(' '));
    localStorage.setItem(LS.folder, d.folderId);
    localStorage.setItem(LS.auth,   d.authToken);
  }

  /* Εγγραφή στο μητρώο. ΠΟΤΕ δεν μπλοκάρει τον χρήστη: χωρίς δίκτυο
     μένει εκκρεμής και ξαναδοκιμάζεται στο επόμενο άνοιγμα (Α400 §Γ —
     η φωτογραφία στην πόρτα δεν περιμένει ποτέ το δίκτυο). */
  function kmRegister() {
    var email = localStorage.getItem(LS.email);
    if (!email || !localStorage.getItem(LS.folder)) { return Promise.resolve(false); }
    var src = localStorage.getItem(LS.src) || 'link';
    var ref = /^ref:(.+)$/.exec(src);
    return fetch(KM_API + 'register', {
      method: 'POST',
      headers: kmHead(),
      body: JSON.stringify({
        email: email,
        source: ref ? 'link' : src,
        ref: ref ? ref[1] : null,
        has_key: !!localStorage.getItem(LS.key),
        device_name: devName()
      })
    }).then(function (r) {
      if (!r.ok) { return false; }
      localStorage.setItem(LS.reg, '1');
      /* Το register ΚΑΝΕΙ αυτή τη συσκευή ενεργή στον server (Η.3: όποια
         βάλει τις 12 λέξεις γίνεται η ενεργή). Το γράφουμε ρητά, τη στιγμή
         που το μαθαίνουμε από την απάντηση — όχι με υπόθεση αργότερα. */
      return r.json().then(function (j) {
        setActiveState(true, j && j.state && j.state.active_since);
        return true;
      }).catch(function () { setActiveState(true); return true; });
    }).catch(function () { return false; });
  }

  function renderWords(words) {
    var ol = el('w-list');
    ol.innerHTML = '';
    words.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w;
      ol.appendChild(li);
    });
    el('w-ok').checked = false;
    el('w-go').disabled = true;
    el('w-err').hidden = true;
  }

  /* Φτιάχνει 12 λέξεις και τις δείχνει. existing = υπάρχων χρήστης που
     αποκτά λογαριασμό τώρα (τα τιμολόγιά του μένουν άθικτα). */
  var wordsMode = 'new';    // 'new' | 'existing' | 'rotate'
  var TITLES = {
    'new':      'Οι 12 λέξεις σου',
    'existing': 'Το κλειδί του αρχείου σου',
    'rotate':   'Οι νέες 12 λέξεις σου'
  };
  var LEDES = {
    'new':      'Αυτές οι 12 λέξεις είναι <b>το κλειδί σου</b>. Με αυτές — και μόνο με αυτές — ανοίγεις τα τιμολόγιά σου σε άλλη συσκευή.',
    'existing': 'Τα τιμολόγιά σου <b>δεν πειράχτηκαν</b> — είναι όλα εδώ. Από σήμερα έχουν και <b>κλειδί</b>: αυτές τις 12 λέξεις. Με αυτές θα τα ανοίγεις σε άλλη συσκευή.',
    'rotate':   'Αυτές αντικαθιστούν τις προηγούμενες, που <b>δεν ισχύουν πια</b>. Γράψε τις καινούριες και σκίσε το παλιό χαρτί.'
  };
  function startWords(mode) {
    if (mode === true)  { mode = 'existing'; }
    if (mode === false) { mode = 'new'; }
    /* 'auto' = δεν ξέρουμε από ποια διαδρομή ήρθε (π.χ. ξαναάνοιγμα χωρίς
       τσεκάρισμα). Το κρίνει το ΜΟΝΟ αντικειμενικό στοιχείο: έχει τιμολόγια
       ή όχι; Αλλιώς ένας ολοκαίνουριος χρήστης διάβαζε «τα τιμολόγιά σου
       δεν πειράχτηκαν» ενώ δεν έχει κανένα. */
    if (mode === 'auto') {
      all().then(function (rows) { startWords(rows.length ? 'existing' : 'new'); })
           .catch(function () { startWords('new'); });
      return;
    }
    wordsMode = mode || 'new';
    show('s-words');
    /* v36 — η διαδρομή διαφυγής. Στη «rotate» ο χρήστης έχει ήδη λογαριασμό
       και βρίσκεται εδώ επίτηδες, άρα το κουμπί θα ήταν παραπλανητικό. */
    el('w-signin').hidden = (wordsMode === 'rotate');
    el('w-title').textContent = TITLES[wordsMode];
    el('w-lede').innerHTML = LEDES[wordsMode];
    el('w-list').innerHTML = '<li>…</li>';
    kmNewWords().then(function (words) {
      pendingWords = words;
      renderWords(words);
    }).catch(function () {
      el('w-err').textContent = 'Κάτι πήγε στραβά στη δημιουργία των λέξεων. Κλείσε και ξανάνοιξε την εφαρμογή.';
      el('w-err').hidden = false;
    });
  }

  /* Μετά το τσεκάρισμα: παράγει ταυτότητα, αποθηκεύει, εγγράφει, προχωράει. */
  function wordsAccepted() {
    if (!pendingWords) { return; }
    el('w-go').disabled = true;
    el('w-go').textContent = 'Ένα δευτερόλεπτο…';
    kmDerive(pendingWords).then(function (d) {
      kmStore(pendingWords, d);
      localStorage.setItem(LS.wordsOk, '1');
      pendingWords = null;
      /* Στην αλλαγή λέξεων ο φάκελος είναι ΚΑΙΝΟΥΡΙΟΣ (άλλο folder_id), άρα
         ξαναγράφεται από την αρχή στο μητρώο. */
      localStorage.removeItem(LS.reg);
      kmRegister();            // δεν περιμένουμε το δίκτυο
      el('w-go').textContent = 'Συνέχεια';
      if (wordsMode === 'rotate') {
        wordsMode = 'new';
        goto('s-settings');
        return;
      }
      afterAccount();
    }).catch(function () {
      el('w-go').disabled = false;
      el('w-go').textContent = 'Συνέχεια';
      el('w-err').textContent = 'Δεν μπόρεσα να φτιάξω το κλειδί σε αυτή τη συσκευή.';
      el('w-err').hidden = false;
    });
  }

  /* v29 · Ο ΦΡΟΥΡΟΣ ΤΗΣ ΑΛΛΑΓΗΣ ΛΕΞΕΩΝ.
     Σήμερα ο φάκελος στον server είναι άδειος (το Η.2 δεν έχει γίνει), άρα
     νέες λέξεις δεν κοστίζουν τίποτα. Μόλις μπει ο συγχρονισμός, αλλαγή
     λέξεων ΧΩΡΙΣ επανακρυπτογράφηση κάνει τα δεδομένα αδιάβαστα για πάντα.
     Γι' αυτό ο έλεγχος μπαίνει ΤΩΡΑ και όχι τότε: όταν έρθει το Η.2, το
     κουμπί κλειδώνει μόνο του αντί να καταστρέψει σιωπηλά το αρχείο.
     ⚠ Χωρίς δίκτυο ΔΕΝ προχωράει: «δεν μπόρεσα να ελέγξω» δεν είναι «καθαρό». */
  function folderState() {
    return fetch(KM_API + 'status', { headers: kmHead() }).then(function (r) {
      if (r.status === 404) { return { empty: true }; }   // δεν υπάρχει καν λογαριασμός
      if (!r.ok) { return { unknown: true }; }
      return r.json().then(function (j) {
        var v = j && j.state ? j.state.folder_version : 0;
        return { empty: !v, bytes: (j && j.state && j.state.folder_bytes) || 0 };
      });
    }).catch(function () { return { unknown: true }; });
  }

  /* ── v31 · ΤΟ ΑΝΕΒΑΣΜΑ (Η.2β, Δρόμος Β) ───────────────────────────
     🔴 ΑΥΤΟ ΤΟ ΜΠΛΟΚ ΔΙΑΒΑΖΕΙ ΜΟΝΟ. Δεν γράφει, δεν σβήνει και δεν
     πειράζει ΤΙΠΟΤΑ στην τοπική βάση. Το κατέβασμα, που είναι το μέρος
     που γράφει, έρχεται σε ξεχωριστό κομμάτι — έτσι ένα λάθος εδώ δεν
     μπορεί να αγγίξει τιμολόγιο.
     Τι ταξιδεύει: τα ΣΤΟΙΧΕΙΑ σε ένα μικρό μπλοκ σε κάθε αποθήκευση, και
     κάθε ΦΩΤΟΓΡΑΦΙΑ μία φορά. Όλα σφραγισμένα στη συσκευή. */
  var kmKey = null;          // κλειδί AES στη μνήμη — ποτέ στον δίσκο
  var syncBusy = false, syncAgain = false, syncTimer = null;
  var syncInfo = { photos: 0, total: 0, want: 0, onSrv: 0, ver: null, at: null, msg: null };

  function kmKeyReady() {
    if (kmKey) { return Promise.resolve(kmKey); }
    var w = localStorage.getItem(LS.words);
    if (!w) { return Promise.reject(new Error('χωρίς λέξεις')); }
    return kmDerive(w.split(' ')).then(function (d) { kmKey = d.key; return kmKey; });
  }

  /* Τα στοιχεία ενός τιμολογίου — ΧΩΡΙΣ καμία φωτογραφία. */
  function metaOf(r) {
    return { id: r.id, ts: r.ts, supplier: r.supplier, invDate: r.invDate,
             net: r.net, vat: r.vat, total: r.total,
             pages: 1 + ((r.pages && r.pages.length) || 0) };
  }
  /* Τα id των φωτογραφιών ενός τιμολογίου: η πρώτη σελίδα παίρνει το id του
     τιμολογίου, οι υπόλοιπες <id>-p2, <id>-p3… Σταθερά, ώστε να μην
     ξαναστέλνεται ποτέ ό,τι έχει ήδη σταλεί. */
  function photoIds(r) {
    var out = [{ id: r.id, blob: r.blob }];
    (r.pages || []).forEach(function (b, i) { out.push({ id: r.id + '-p' + (i + 2), blob: b }); });
    return out.filter(function (x) { return !!x.blob; });
  }

  function blobBytes(b) {
    return (b.arrayBuffer ? b.arrayBuffer() : new Response(b).arrayBuffer())
      .then(function (ab) { return new Uint8Array(ab); });
  }

  function kmStatus() {
    return fetch(KM_API + 'status', { headers: kmHead() }).then(function (r) {
      if (!r.ok) { return null; }
      return r.json();
    }).catch(function () { return null; });
  }

  function pushMeta(rows, key, baseVer) {
    /* v43 — «gone»: τα id όσων διαγράφηκαν. Παλιότερες εκδόσεις αγνοούν
       άγνωστο πεδίο, οπότε ο φάκελος μένει συμβατός προς τα πίσω. */
    var payload = new TextEncoder().encode(JSON.stringify({ v: 1, shots: rows.map(metaOf), gone: goneRead() }));
    return kmSeal(key, payload).then(function (sealed) {
      var h = kmHead();
      h['Content-Type'] = 'application/octet-stream';
      if (baseVer !== null && baseVer !== undefined) { h['X-Km-Base-Version'] = String(baseVer); }
      return fetch(KM_API + 'folder', { method: 'PUT', headers: h, body: sealed });
    });
  }

  /* v43 — Η ταφόπετρα σβήνει και τη φωτογραφία από τον server. Χωρίς αυτό
     το τιμολόγιο εξαφανιζόταν από την οθόνη αλλά τα megabyte του έμεναν
     να πληρώνονται για πάντα. Ο server έχει ήδη DELETE /api/km/photo. */
  function killPhotos(have) {
    var dead = goneMap();
    var out = have.filter(function (id) { return dead[pidSplit(id).rec]; });
    if (!out.length) { return Promise.resolve(); }
    var step = function (i) {
      if (i >= out.length) { return Promise.resolve(); }
      return fetch(KM_API + 'photo?id=' + encodeURIComponent(out[i]), { method: 'DELETE', headers: kmHead() })
        .catch(function () {})
        .then(function () { return step(i + 1); });
    };
    return step(0).then(function () {
      var g = {};
      out.forEach(function (id) { g[id] = 1; });
      pcWrite(pcRead().filter(function (x) { return !g[x.id]; }));
    });
  }

  function pushPhotos(rows, key, have) {
    var jobs = [], want = 0;
    rows.forEach(function (r) {
      photoIds(r).forEach(function (x) { want++; if (have.indexOf(x.id) < 0) { jobs.push(x); } });
    });
    /* v34 — Ο ΜΕΤΡΗΤΗΣ ΕΔΕΙΧΝΕ ΤΗ ΔΟΥΛΕΙΑ ΤΟΥ ΓΥΡΟΥ, ΟΧΙ ΤΗΝ ΚΑΤΑΣΤΑΣΗ.
       Όταν όλα είχαν ήδη ανέβει έγραφε «0/0 φωτογραφίες», που ο Stavros
       διάβασε ως «καμία φωτογραφία» και σκέφτηκε ότι κάτι χάθηκε. Σωστό
       νούμερο, λάθος ερώτηση: αυτό που θέλει να ξέρει είναι πόσες από τις
       δικές του βρίσκονται στον server — «24/24», όχι «0/0». */
    syncInfo.want = want;
    syncInfo.onSrv = want - jobs.length;
    syncInfo.total = jobs.length;
    syncInfo.photos = 0;
    /* Μία-μία, όχι όλες μαζί: σε δεδομένα κινητής οι παράλληλες αποστολές
       μεγάλων αρχείων αποτυγχάνουν όλες μαζί. */
    var step = function (i) {
      if (i >= jobs.length) { return Promise.resolve(); }
      return blobBytes(jobs[i].blob)
        .then(function (bytes) { return kmSeal(key, bytes); })
        .then(function (sealed) {
          var h = kmHead();
          h['Content-Type'] = 'application/octet-stream';
          return fetch(KM_API + 'photo?id=' + encodeURIComponent(jobs[i].id), { method: 'PUT', headers: h, body: sealed });
        })
        .then(function (res) {
          if (res.ok) { syncInfo.photos++; syncInfo.onSrv++; return step(i + 1); }
          if (res.status === 409) { setActiveState(false); syncInfo.msg = 'δεν είναι η ενεργή συσκευή'; return; }
          if (res.status === 413) { syncInfo.msg = 'μία φωτογραφία είναι πολύ μεγάλη'; return step(i + 1); }
          syncInfo.msg = 'σφάλμα ' + res.status;
        });
    };
    return step(0);
  }

  function syncNow() {
    if (!localStorage.getItem(LS.folder) || !localStorage.getItem(LS.wordsOk)) { return Promise.resolve(); }
    /* 🔴 Ο ΠΙΟ ΕΠΙΚΙΝΔΥΝΟΣ ΕΛΕΓΧΟΣ ΟΛΟΥ ΤΟΥ ΣΥΓΧΡΟΝΙΣΜΟΥ.
       Τα στοιχεία χτίζονται από την ΤΟΠΙΚΗ βάση. Σε συσκευή που μόλις μπήκε
       σε υπάρχοντα λογαριασμό, η τοπική βάση είναι ΑΔΕΙΑ — και ένα ανέβασμα
       πριν το κατέβασμα θα έγραφε «μηδέν τιμολόγια» πάνω από το αρχείο του
       χρήστη. Όσο εκκρεμεί κατέβασμα, ΔΕΝ ανεβαίνει τίποτα. */
    if (localStorage.getItem(LS.needPull)) {
      syncInfo.msg = 'περιμένει κατέβασμα';
      return pullNow();
    }
    if (syncBusy) { syncAgain = true; return Promise.resolve(); }
    syncBusy = true; syncInfo.msg = null;
    var key, rows;
    return kmKeyReady().then(function (k) { key = k; return all(); })
      .then(function (rs) { rows = rs; return kmStatus(); })
      .then(function (st) {
        if (!st) { syncInfo.msg = 'χωρίς δίκτυο'; return null; }
        /* v35 — Η ΑΠΑΝΤΗΣΗ ΤΟΥ SERVER ΓΙΝΕΤΑΙ ΟΘΟΝΗ, ΟΧΙ ΜΟΝΟ ΓΡΑΜΜΗ.
           Ως το v34 αυτό έμενε μια σημείωση στις Ρυθμίσεις που κανείς δεν
           διάβαζε, ενώ η κάμερα συνέχιζε να δέχεται φωτογραφίες. */
        if (st.this_device_active === false) {
          setActiveState(false, st.state && st.state.active_since);
          syncInfo.msg = 'δεν είναι η ενεργή συσκευή';
          return null;
        }
        setActiveState(true, st.state && st.state.active_since);
        return pushMeta(rows, key, st.state ? st.state.folder_version : null).then(function (res) {
          if (res.ok) { return res.json().then(function (j) { syncInfo.ver = j.folder_version; }); }
          if (res.status === 409) { setActiveState(false); syncInfo.msg = 'δεν είναι η ενεργή συσκευή'; return null; }
          syncInfo.msg = 'σφάλμα στοιχείων ' + res.status;
          return null;
        }).then(function () {
          if (syncInfo.msg) { return null; }
          return fetch(KM_API + 'photos', { headers: kmHead() })
            .then(function (r) { return r.ok ? r.json() : { photos: [] }; })
            .then(function (j) {
              var ids = (j.photos || []).map(function (p) { return p.id; });
              return killPhotos(ids).then(function () {
                return pushPhotos(rows, key, ids.filter(function (id) { return !goneMap()[pidSplit(id).rec]; }));
              });
            });
        });
      })
      .catch(function (e) { syncInfo.msg = 'σφάλμα: ' + (e && e.message ? e.message : e); })
      .then(function () {
        syncInfo.at = new Date();
        syncBusy = false;
        if (syncAgain) { syncAgain = false; scheduleSync(400); }
      });
  }

  /* ── v33 · ΤΟ ΚΑΤΕΒΑΣΜΑ (Η.2γ) ────────────────────────────────────
     🔴 ΕΔΩ ΓΡΑΦΟΥΜΕ ΣΤΗ ΒΑΣΗ — και γι' αυτό ισχύουν δύο απόλυτοι κανόνες:
       1. ΠΟΤΕ δεν σβήνεται τοπική εγγραφή. Ό,τι λείπει από τον server μένει.
       2. ΠΟΤΕ δεν πατιέται τοπική εγγραφή που υπάρχει ήδη. Μόνο ΠΡΟΣΘΗΚΗ.
     Άρα το χειρότερο που μπορεί να κάνει αυτός ο κώδικας είναι να μη φέρει
     κάτι — ποτέ να χάσει κάτι. Η συγχώνευση διορθώσεων (ποιο νικάει όταν
     αλλάξει το ίδιο τιμολόγιο σε δύο συσκευές) θέλει χρονοσήμανση ανά
     εγγραφή και έρχεται χωριστά· μέχρι τότε δεν προσποιούμαστε ότι γίνεται. */
  var pulling = false;
  var pullInfo = { added: 0, upd: 0, photos: 0, need: 0, notUp: 0, del: 0, msg: null, at: null };

  /* v35 — ΤΟ ΚΕΝΟ ΠΟΥ ΒΡΕΘΗΚΕ ΔΙΑΒΑΖΟΝΤΑΣ ΤΟΝ ΚΩΔΙΚΑ ΤΟΥ v34.
     Ως το v34 το κατέβασμα έφερνε ΜΟΝΟ τιμολόγια που δεν υπήρχαν τοπικά.
     Στην πραγματική χρήση όμως η σειρά είναι: φωτογραφία στην πόρτα →
     ανέβασμα → ποσά αργότερα, με την ησυχία του. Άρα η αναγνώστρια συσκευή
     έπαιρνε το τιμολόγιο ΑΔΕΙΟ και δεν έβλεπε ΠΟΤΕ τα ποσά — έμενε
     «εκκρεμές» για πάντα, ενώ στην ενεργή ήταν κλεισμένο. */
  function metaDiffers(a, b) {
    return a.supplier !== b.supplier || a.invDate !== b.invDate ||
           a.net !== b.net || a.vat !== b.vat || a.total !== b.total;
  }

  function pullMeta(key) {
    return fetch(KM_API + 'folder', { headers: kmHead() }).then(function (r) {
      if (r.status === 404) { return null; }                 // άδειος φάκελος
      if (!r.ok) { pullInfo.msg = 'σφάλμα ' + r.status; return null; }
      return r.arrayBuffer().then(function (buf) { return kmOpen(key, buf); });
    }).then(function (plain) {
      if (!plain) { return null; }
      var data = JSON.parse(new TextDecoder().decode(plain));
      if (!data) { return null; }
      return { shots: data.shots || [], gone: data.gone || [] };
    }).catch(function (e) {
      pullInfo.msg = 'δεν άνοιξε ο φάκελος: ' + (e && e.message ? e.message : e);
      return null;
    });
  }

  /* ══ v40 · ΦΩΤΟΓΡΑΦΙΕΣ ΚΑΤ' ΑΠΑΙΤΗΣΗ ══════════════════════════════
     Ως τη v39 κατέβαιναν ΟΛΕΣ οι φωτογραφίες κάθε τιμολογίου. Μετρημένο
     (Α320, 4/9): 20 τιμολόγια/μέρα × ~400 KB = 8 MB/μέρα · ~2,4 GB/χρόνο —
     και ο browser μπορεί να σβήσει μόνος του τον χώρο όταν πιέζεται η
     συσκευή. Δεν έσπαγε τίποτα σήμερα· χτυπούσε τον πρώτο πραγματικό
     πελάτη μέσα στον πρώτο χρόνο, σιωπηλά.
     Από εδώ και μπρος: **αυτόματα μόνο το τελευταίο τιμολόγιο ΑΝΑ
     ΠΡΟΜΗΘΕΥΤΗ** (διατύπωση Stavros: «έτσι θα έχει εικόνα συνολική»),
     κάθε άλλη **με πάτημα**. Τα ΣΤΟΙΧΕΙΑ κατεβαίνουν πάντα, όλα — είναι
     κείμενο και ψάχνονται χωρίς δίκτυο. Ίδιο σε ΔΩΡΕΑΝ και PRO. */
  var PHOTO_BUDGET = 200 * 1024 * 1024;   // ο «κάδος»: 200 MB

  function pcRead() {
    try { var a = JSON.parse(localStorage.getItem(LS.pcache) || '[]'); return a.length ? a : []; }
    catch (e) { return []; }
  }
  function pcWrite(a) { try { localStorage.setItem(LS.pcache, JSON.stringify(a)); } catch (e) {} }
  function pcBytes(a) { return a.reduce(function (n, x) { return n + (x.b || 0); }, 0); }
  /* Κάθε φορά που μια φωτογραφία κατεβαίνει ή ξαναζητιέται, πάει στο τέλος
     της ουράς — ο κάδος πετάει ΠΑΝΤΑ την παλαιότερη (απόφαση Stavros 5/9). */
  function pcTouch(pid, bytes) {
    var a = pcRead().filter(function (x) { return x.id !== pid; });
    a.push({ id: pid, b: bytes || 0, at: Date.now() });
    pcWrite(a);
  }
  /* `<id>` = σελίδα 1 · `<id>-pN` = σελίδα N. Σταθερό από τη v31. */
  function pidOf(recId, slot) { return slot === 0 ? recId : recId + '-p' + (slot + 1); }
  function pidSplit(pid) {
    var m = /^(.*)-p(\d+)$/.exec(pid);
    return m ? { rec: m[1], slot: (+m[2]) - 1 } : { rec: pid, slot: 0 };
  }

  /* Το τελευταίο τιμολόγιο κάθε προμηθευτή, με κριτήριο την ΗΜΕΡΟΜΗΝΙΑ ΤΟΥ
     ΤΙΜΟΛΟΓΙΟΥ (dateOf), όχι την ώρα λήψης: «τι πλήρωσα την τελευταία φορά
     σε αυτόν» είναι ερώτηση του τιμολογίου. Ισοπαλία → το νεότερο ts. */
  function lastPerSupplier(rows) {
    var best = {};
    rows.forEach(function (r) {
      var k = String(r.supplier || '').trim().toLowerCase();
      if (!k) { return; }
      var cur = best[k];
      if (!cur || dateOf(r) > dateOf(cur) || (dateOf(r) === dateOf(cur) && r.ts > cur.ts)) { best[k] = r; }
    });
    return best;
  }
  /* ⚠ ΟΧΙ «autoIds» — το όνομα ΥΠΑΡΧΕΙ ΗΔΗ (var autoIds = {}, η ουρά
     αυτόματης ανάγνωσης). Η δήλωση συνάρτησης ανυψώνεται και μετά η παλιά
     μεταβλητή τη σβήνει: «autoIds is not a function», σιωπηλά, μέσα σε
     catch. Το node --check δεν το πιάνει· το έπιασε το τεστ 43. */
  function autoPhotoIds(rows) {
    var keep = {}, best = lastPerSupplier(rows);
    Object.keys(best).forEach(function (k) {
      var r = best[k], n = Math.max(pageCount(r), r.srvPages || 1);
      for (var i = 0; i < n; i++) { keep[pidOf(r.id, i)] = 1; }
    });
    return keep;
  }

  /* 🔴 Ο ΦΡΟΥΡΟΣ: πετιέται ΜΟΝΟ ό,τι είναι γραμμένο στο ευρετήριο, δηλαδή
     μόνο ό,τι κατέβηκε από τον server και άρα υπάρχει ακόμα εκεί. Ποτέ
     φωτογραφία που τραβήχτηκε εδώ και μπορεί να μην έχει ανέβει — αυτό θα
     ήταν διαγραφή δεδομένων που φτιάξαμε μόνοι μας (παγίδα 3/9). Και ποτέ
     ό,τι είναι στο σημερινό αυτόματο σύνολο. */
  function pcEvict(keep) {
    var a = pcRead();
    var total = pcBytes(a);
    if (total <= PHOTO_BUDGET) { return Promise.resolve(0); }
    a.sort(function (x, y) { return x.at - y.at; });
    var drop = [];
    for (var i = 0; i < a.length && total > PHOTO_BUDGET; i++) {
      if (keep && keep[a[i].id]) { continue; }
      drop.push(a[i]); total -= (a[i].b || 0);
    }
    if (!drop.length) { return Promise.resolve(0); }
    var step = function (i) {
      if (i >= drop.length) { return Promise.resolve(drop.length); }
      var q = pidSplit(drop[i].id);
      return get(q.rec).then(function (fresh) {
        if (!fresh) { return; }
        if (q.slot === 0) { fresh.blob = null; }
        else if (fresh.pages) { fresh.pages[q.slot - 1] = null; }
        return put(fresh);
      }).catch(function () {}).then(function () { return step(i + 1); });
    };
    return step(0).then(function (n) {
      var gone = {};
      drop.forEach(function (x) { gone[x.id] = 1; });
      pcWrite(pcRead().filter(function (x) { return !gone[x.id]; }));
      return n;
    });
  }

  /* v40 (β) — ΜΙΑ ΚΑΤ' ΑΠΑΙΤΗΣΗ ΦΩΤΟΓΡΑΦΙΑ ΑΝΑ ΠΡΟΜΗΘΕΥΤΗ (απόφαση Stavros
     5/9). Όταν ζητηθεί δεύτερη φωτογραφία του ΙΔΙΟΥ προμηθευτή, η
     προηγούμενη φεύγει αμέσως αντί να περιμένει τον κάδο.
     ⚠ Ένσταση Claude που ΑΠΟΡΡΙΦΘΗΚΕ και δεν ξανασυζητιέται: «χαλάει τη
     σύγκριση δύο τιμολογίων του ίδιου προμηθευτή». Διατύπωση Stavros:
     *«Η σύγκριση γίνεται ΠΑΝΤΑ με τα δεδομένα, ΠΟΤΕ με τη φωτογραφία. Η
     φωτογραφία είναι απλά η επιβεβαίωση των γραπτών δεδομένων»*. Άρα δύο
     φωτογραφίες του ίδιου προμηθευτή δεν χρειάζονται ποτέ ταυτόχρονα.
     🔴 Ο ΙΔΙΟΣ ΦΡΟΥΡΟΣ ΙΣΧΥΕΙ: φεύγει μόνο ό,τι είναι στο ευρετήριο (άρα
     κατέβηκε από τον server) και μόνο ό,τι ΔΕΝ είναι στο αυτόματο σύνολο. */
  function pcDropSameSupplier(rows, keepPid, supplier) {
    var keepAuto = autoPhotoIds(rows);
    var sup = String(supplier || '').trim().toLowerCase();
    if (!sup) { return Promise.resolve(0); }
    var mine = {};
    rows.forEach(function (r) {
      if (String(r.supplier || '').trim().toLowerCase() !== sup) { return; }
      var n = Math.max(pageCount(r), r.srvPages || 1);
      for (var i = 0; i < n; i++) { mine[pidOf(r.id, i)] = 1; }
    });
    var out = pcRead().filter(function (x) {
      return mine[x.id] && x.id !== keepPid && !keepAuto[x.id];
    });
    if (!out.length) { return Promise.resolve(0); }
    var step = function (i) {
      if (i >= out.length) { return Promise.resolve(out.length); }
      var q = pidSplit(out[i].id);
      return get(q.rec).then(function (fresh) {
        if (!fresh) { return; }
        if (q.slot === 0) { fresh.blob = null; }
        else if (fresh.pages) { fresh.pages[q.slot - 1] = null; }
        return put(fresh);
      }).catch(function () {}).then(function () { return step(i + 1); });
    };
    return step(0).then(function (n) {
      var gone = {};
      out.forEach(function (x) { gone[x.id] = 1; });
      pcWrite(pcRead().filter(function (x) { return !gone[x.id]; }));
      return n;
    });
  }

  /* Μία φωτογραφία, τώρα. Χρησιμοποιείται ΚΑΙ από το αυτόματο κατέβασμα
     ΚΑΙ από το πάτημα του χρήστη — ένας δρόμος, ένα ευρετήριο. */
  function fetchPhoto(recId, slot) {
    var pid = pidOf(recId, slot);
    return kmKeyReady().then(function (key) {
      return fetch(KM_API + 'photo?id=' + encodeURIComponent(pid), { headers: kmHead() })
        .then(function (res) { if (!res.ok) { throw new Error('η φωτογραφία δεν βρέθηκε στον server'); } return res.arrayBuffer(); })
        .then(function (buf) { return kmOpen(key, buf); })
        .then(function (plain) {
          var blob = new Blob([plain], { type: 'image/jpeg' });
          return get(recId).then(function (fresh) {
            if (!fresh) { throw new Error('η εγγραφή δεν υπάρχει πια'); }
            if (slot === 0) { fresh.blob = blob; }
            else { fresh.pages = fresh.pages || []; fresh.pages[slot - 1] = blob; }
            return put(fresh).then(function () { pcTouch(pid, blob.size); return blob; });
          });
        });
    });
  }

  function pullPhotos(key) {
    return all().then(function (rows) {
      /* v40 — ΤΟ ΑΥΤΟΜΑΤΟ ΣΥΝΟΛΟ, ΚΑΙ ΤΙΠΟΤΑ ΑΛΛΟ: μία εγγραφή ανά
         προμηθευτή, η τελευταία. Ό,τι λείπει από αυτήν κατεβαίνει μόνο του·
         κάθε άλλη φωτογραφία περιμένει πάτημα (openShot). */
      var keep = autoPhotoIds(rows);
      var jobs = [];
      rows.forEach(function (r) {
        if (!r.srvPages) { return; }                          // ντόπιο τιμολόγιο
        var n = Math.max(pageCount(r), r.srvPages || 1);
        for (var i = 0; i < n; i++) {
          var pid = pidOf(r.id, i);
          if (!keep[pid]) { continue; }                       // δεν είναι το τελευταίο του προμηθευτή
          var have = (i === 0) ? r.blob : (r.pages && r.pages[i - 1]);
          if (!have) { jobs.push({ rec: r, slot: i }); }
        }
      });
      pullInfo.need = jobs.length;
      pullInfo.photos = 0;
      var step = function (i) {
        if (i >= jobs.length) { return Promise.resolve(); }
        return fetchPhoto(jobs[i].rec.id, jobs[i].slot)
          .then(function () { pullInfo.photos++; })
          .catch(function () {})
          .then(function () { return step(i + 1); });
      };
      /* Ο κάδος αδειάζει ΜΕΤΑ το κατέβασμα, ώστε ό,τι μόλις ήρθε να μετράει
         και αυτό — και ποτέ δεν πετάει κάτι από το σημερινό αυτόματο σύνολο. */
      return step(0).then(function () { return pcEvict(keep); });
    });
  }

  function pullNow() {
    if (!localStorage.getItem(LS.folder) || !localStorage.getItem(LS.wordsOk)) { return Promise.resolve(); }
    if (pulling) { return Promise.resolve(); }
    pulling = true; pullInfo.msg = null; pullInfo.added = 0;
    var key;
    return kmKeyReady().then(function (k) { key = k; return pullMeta(k); })
      .then(function (folder) {
        if (!folder) { return null; }
        var shots = folder.shots;
        /* Ο κατάλογος του φακέλου ΕΝΩΝΕΤΑΙ με τον δικό μας: ταφόπετρα από
           άλλη συσκευή εκτελείται εδώ, και η δική μας δεν χάνεται όταν
           ανέβει ξανά ο φάκελος. */
        goneAdd(folder.gone || []);
        var dead = goneMap();
        shots = shots.filter(function (m) { return !dead[m.id]; });
        return all().then(function (rows) {
          /* 🔴 Το ΜΟΝΟ σημείο όπου το κατέβασμα σβήνει τοπική εγγραφή —
             και μόνο επειδή κάποιος ζήτησε ρητά τη διαγραφή. */
          var kill = rows.filter(function (r) { return dead[r.id]; });
          var killed = kill.length ? Promise.all(kill.map(function (r) { return dbDel(r.id); })) : Promise.resolve();
          rows = rows.filter(function (r) { return !dead[r.id]; });
          pullInfo.del = kill.length;
          return killed.then(function () {
          var have = {};
          rows.forEach(function (r) { have[r.id] = r; });
          /* Πόσα ΔΙΚΑ ΜΑΣ δεν έχουν φτάσει στον φάκελο — το λέει η οθόνη
             ανάγνωσης, ώστε κανείς να μη νομίσει ότι χάθηκε δουλειά. */
          var srv = {};
          shots.forEach(function (m) { srv[m.id] = 1; });
          pullInfo.notUp = rows.filter(function (r) { return !srv[r.id]; }).length;
          var reader = isReader();
          pullInfo.upd = 0;
          var step = function (i) {
            if (i >= shots.length) { return Promise.resolve(); }
            var m = shots[i];
            var cur = have[m.id];
            if (!cur) {
              return put({ id: m.id, ts: m.ts, supplier: m.supplier, invDate: m.invDate,
                           net: m.net, vat: m.vat, total: m.total,
                           pages: [], srvPages: m.pages || 1 })
                .then(function () { pullInfo.added++; return step(i + 1); });
            }
            /* 🔴 ΜΟΝΟ σε ΑΝΑΓΝΩΣΤΡΙΑ συσκευή ενημερώνονται τα στοιχεία
               υπάρχοντος τιμολογίου. Είναι ασφαλές ΑΚΡΙΒΩΣ επειδή η
               αναγνώστρια δεν έχει δικές της διορθώσεις — δεν της
               επιτρέπεται να γράψει. Στην ΕΝΕΡΓΗ ισχύει αναλλοίωτος ο
               κανόνας του v33: ποτέ δεν πατιέται τοπική εγγραφή, γιατί
               εκεί οι δικές της αλλαγές μπορεί να μην έχουν ανέβει ακόμα.
               Η φωτογραφία δεν αγγίζεται ποτέ, σε καμία περίπτωση. */
            if (!reader || !metaDiffers(cur, m)) { return step(i + 1); }
            return get(m.id).then(function (fresh) {
              if (!fresh) { return; }
              fresh.supplier = m.supplier;
              fresh.invDate = m.invDate;
              fresh.net = m.net;
              fresh.vat = m.vat;
              fresh.total = m.total;
              fresh.srvPages = m.pages || fresh.srvPages || 1;
              return put(fresh).then(function () { pullInfo.upd++; });
            }).then(function () { return step(i + 1); });
          };
          return step(0);
          });
        });
      })
      .then(function () { return key ? pullPhotos(key) : null; })
      .catch(function (e) { pullInfo.msg = 'σφάλμα: ' + (e && e.message ? e.message : e); })
      .then(function () {
        pullInfo.at = new Date();
        /* Το σήμα φεύγει ΜΟΝΟ αν το κατέβασμα πέτυχε. Σφάλμα ή χωρίς δίκτυο
           σημαίνει ότι η συσκευή μένει σε «μόνο κατέβασμα» — και δεν
           μπορεί να πατήσει τον φάκελο με τα δικά της μισά δεδομένα. */
        if (!pullInfo.msg) { localStorage.removeItem(LS.needPull); }
        pulling = false;
        refreshCount();
        /* Ό,τι μόλις ήρθε φαίνεται ΤΩΡΑ. Χωρίς αυτό, ο χρήστης που στέκεται
           στα Εκκρεμή βλέπει την παλιά εικόνα και συμπεραίνει ότι δεν ήρθε
           τίποτα (Α400 §Γ: ακίνητο διαγνωστικό λέει ψέματα εξίσου). */
        if (!el('s-pend').hidden) { renderPending(); }
        if (!el('s-cam').hidden && isReader()) { roRender(); }
      });
  }

  /* Περιμένει το τρέχον κατέβασμα αντί να επιστρέψει «έτοιμο» από πάνω του.
     Το pullNow() βγαίνει αμέσως αν τρέχει ήδη — χωρίς αυτό, η ενεργοποίηση
     θα νόμιζε ότι κατέβασε ενώ το κατέβασμα ήταν στη μέση. */
  function pullSettled() {
    if (!pulling) { return pullNow(); }
    /* Περιμένει να ησυχάσει το τρέχον ΚΑΙ ΜΕΤΑ τρέχει δικό του: μόνο έτσι
       είναι βέβαιο ότι ό,τι ανέβηκε στο μεταξύ βρίσκεται εδώ. */
    return new Promise(function (res) {
      var t = setInterval(function () {
        if (!pulling) { clearInterval(t); res(pullNow()); }
      }, 300);
    });
  }

  /* v35 · Η.3 — ΤΟ ΚΑΤΕΒΑΣΜΑ ΤΡΕΧΕΙ ΚΑΙ ΣΤΗΝ ΕΠΑΝΑΦΟΡΑ.
     Ως το v34 έτρεχε ΜΟΝΟ στο boot: η δεύτερη συσκευή έβλεπε νέο τιμολόγιο
     μόνο αν την έκλεινες και την ξανάνοιγες — και ένα εγκατεστημένο PWA που
     ξυπνάει από το παρασκήνιο δεν κάνει πλοήγηση (Α440, μετρημένο 3/9).
     Φρένο 30″: εναλλαγή εφαρμογών στο κινητό είναι δεκάδες φορές τη μέρα. */
  var PULL_GAP = 30000;
  var lastPull = 0;
  function maybePull() {
    if (document.hidden || !hasAccount()) { return; }
    if (Date.now() - lastPull < PULL_GAP) { return; }
    lastPull = Date.now();
    refreshActive();
    pullNow();
  }

  /* Καθυστέρηση επίτηδες: η ανάγνωση Gemini γράφει στη βάση αρκετές φορές
     στη σειρά, και δεν έχει νόημα ένα ανέβασμα ανά γράψιμο. */
  function scheduleSync(ms) {
    if (syncTimer) { clearTimeout(syncTimer); }
    syncTimer = setTimeout(function () { syncTimer = null; syncNow(); }, ms || 3000);
  }

  /* Μία γραμμή που λέει την ΑΛΗΘΕΙΑ για τον συγχρονισμό. Κανόνας Α400:
     σιωπηλή αυτόματη εργασία δεν είναι ελεγχόμενη — «έτρεξε και όλα καλά»
     και «δεν έτρεξε ποτέ» μοιάζουν ολόιδια. */
  function syncLine() {
    if (!localStorage.getItem(LS.folder)) { return 'χωρίς λογαριασμό'; }
    if (syncBusy) {
      return syncInfo.total ? ('ανεβαίνει… ' + syncInfo.photos + '/' + syncInfo.total) : 'σε εξέλιξη…';
    }
    if (syncInfo.msg) { return syncInfo.msg; }
    if (pulling) { return 'κατεβάζει… ' + pullInfo.photos + '/' + pullInfo.need; }
    if (localStorage.getItem(LS.needPull)) { return 'εκκρεμεί κατέβασμα'; }
    if (!syncInfo.at) { return syncTimer ? 'ξεκινάει σε λίγο…' : 'δεν έχει τρέξει ακόμα'; }
    var t = syncInfo.at;
    var hh = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
    return syncInfo.onSrv + '/' + syncInfo.want + ' φωτογραφίες στον server · στοιχεία v' + (syncInfo.ver === null ? '—' : syncInfo.ver) + ' · ' + hh;
  }

  /* Πού πάει ο χρήστης μόλις αποκτήσει λογαριασμό — η παλιά ροή, ίδια. */
  function afterAccount() {
    if (!localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip)) { return show('s-key'); }
    if (!localStorage.getItem(LS.perm)) { return show('s-perm'); }
    toCam();
  }

  /* ══ v36 · Γ.3 — ΟΙ 12 ΛΕΞΕΙΣ ΜΟΥ, ΠΙΣΩ ΑΠΟ ΤΟ ΚΛΕΙΔΩΜΑ ΤΗΣ ΣΥΣΚΕΥΗΣ ══
     Το κενό της 4/9: οι λέξεις ήταν στη συσκευή (km_words) και καμία οθόνη
     δεν τις έδειχνε — όποιος έχανε το χαρτί κρατούσε το κλειδί στο χέρι του
     χωρίς να μπορεί να το δει.
     🔴 ΓΙΑΤΙ ΠΥΛΗ ΚΑΙ ΟΧΙ ΣΚΕΤΟ ΚΟΥΜΠΙ: οι 12 λέξεις ΕΙΝΑΙ ο λογαριασμός.
     Χωρίς επιβεβαίωση, όποιος πιάσει το ξεκλείδωτο κινητό για ένα λεπτό τις
     αντιγράφει και ανοίγει τα τιμολόγια για πάντα, από παντού.
     Ο κώδικας είναι αυτός που επαληθεύτηκε στο Η.0 (bio-test, 2/9) σε
     κινητό ΚΑΙ tablet — μαζί με τον «Τρόπο Β», που χρειάστηκε πραγματικά. */
  function lockAvailable() {
    if (!window.PublicKeyCredential || !window.isSecureContext) { return Promise.resolve(false); }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(function (ok) { return !!ok; })
      .catch(function () { return false; });
  }
  function lockRnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function lockB64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) { s += String.fromCharCode(b[i]); }
    return btoa(s);
  }
  function lockUnb64(str) {
    var raw = atob(str), a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { a[i] = raw.charCodeAt(i); }
    return a;
  }
  /* Πρώτη φορά: καταχώριση. Η ίδια η καταχώριση ζητάει δακτυλικό/PIN με
     userVerification:'required', άρα είναι κι αυτή πραγματικό ξεκλείδωμα. */
  function lockEnroll() {
    return navigator.credentials.create({ publicKey: {
      rp: { name: 'Kostometro', id: location.hostname },
      user: { id: lockRnd(16), name: 'km@' + location.hostname, displayName: 'Kostometro' },
      challenge: lockRnd(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none'
    }}).then(function (c) {
      try { localStorage.setItem(LS.lockCred, lockB64(c.rawId)); } catch (e) {}
      return true;
    });
  }
  function lockAsk(allow) {
    return navigator.credentials.get({ publicKey: {
      challenge: lockRnd(32), rpId: location.hostname,
      userVerification: 'required', timeout: 60000, allowCredentials: allow
    }}).then(function () { return true; });
  }
  /* Επιστρέφει Promise<true> μόνο αν ο κάτοχος επιβεβαιώθηκε τώρα. */
  function lockVerify() {
    var id = localStorage.getItem(LS.lockCred);
    if (!id) { return lockEnroll(); }
    var allow;
    try { allow = [{ type: 'public-key', id: lockUnb64(id), transports: ['internal'] }]; }
    catch (e) { allow = []; }
    return lockAsk(allow).catch(function () {
      /* Τρόπος Β (Η.0, 2/9): σε μερικές συσκευές το allowCredentials πέφτει
         ενώ το ίδιο διαπιστευτήριο υπάρχει. Ζητάμε ό,τι έχει η συσκευή για
         αυτό το site. Αν πέσει κι αυτό, ΔΕΝ δείχνουμε τίποτα. */
      return lockAsk([]);
    });
  }

  function showMyWords() {
    var w = localStorage.getItem(LS.words);
    if (!w) { return; }
    var ol = el('mw-list');
    ol.innerHTML = '';
    w.split(' ').forEach(function (word) {
      var li = document.createElement('li');
      li.textContent = word;
      ol.appendChild(li);
    });
    goto('s-mywords');
  }

  function boot() {
    if (!localStorage.getItem(LS.id)) {
      localStorage.setItem(LS.id, 'km_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    }
    /* Πηγή εγκατάστασης — κρατιέται τοπικά, θα σταλεί όταν υπάρξει backend (Ζ.6) */
    if (!localStorage.getItem(LS.src)) {
      var m = /[?&]ref=([A-Za-z0-9]+)/.exec(location.search);
      var st = /[?&]src=([A-Za-z0-9:_-]+)/.exec(location.search);
      localStorage.setItem(LS.src, m ? ('ref:' + m[1]) : (st ? st[1] : 'link'));
    }
    /* v26 · Η.2β-1 — τρεις καταστάσεις, με αυτή τη σειρά:
       (α) ούτε email ούτε λέξεις  -> εντελώς νέος, πρώτη οθόνη
       (β) email αλλά ΟΧΙ λέξεις   -> υπάρχων χρήστης· αποκτά κλειδί τώρα,
           χωρίς να χάσει ούτε ένα τιμολόγιο
       (γ) λέξεις αλλά ΑΤΣΕΚΑΡΙΣΤΕΣ -> ξαναδείχνονται μέχρι να τις γράψει */
    var hasEmail = !!localStorage.getItem(LS.email);
    var hasWords = !!localStorage.getItem(LS.words);
    /* λέξεις χωρίς email = ασύμφωνη κατάσταση· ξεκινάει από την αρχή */
    if (!hasEmail)                          { return show('s-acc'); }
    if (!hasWords)                          { return startWords('auto'); }
    if (!localStorage.getItem(LS.wordsOk))  { return startWords('auto'); }
    if (!localStorage.getItem(LS.reg))      { kmRegister(); }   // εκκρεμής εγγραφή
    lastPull = Date.now();
    refreshActive();      // v35 — ενεργή ή αναγνώστρια; πριν ανοίξει η κάμερα
    pullNow();            // v33 — πρώτα ό,τι ήρθε από άλλη συσκευή…
    scheduleSync(2500);   // v31 — …και μετά ό,τι έμεινε πίσω από εδώ
    if (!localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip)) { return show('s-key'); }
    if (!localStorage.getItem(LS.perm)) { return show('s-perm'); }
    toCam();
  }

  /* ── Χειριστές ── */
  el('acc-no').onclick  = function () { show('s-email'); };

  /* v36 — Η σύνδεση ανοίγει πλέον από ΔΥΟ σημεία: την πρώτη οθόνη και την
     οθόνη των 12 λέξεων. Το «Πίσω» πρέπει να γυρίζει εκεί απ' όπου ήρθε,
     αλλιώς ο χρήστης της δεύτερης διαδρομής πέφτει σε οθόνη που δεν είδε
     ποτέ. */
  var signinFrom = 's-acc';
  function openSignin(from) {
    signinFrom = from || 's-acc';
    el('si-err').hidden = true;
    el('si-email').value = localStorage.getItem(LS.email) || '';
    el('si-words').value = '';
    el('si-count').textContent = '0 από 12 λέξεις';
    el('si-count').style.color = '';
    show('s-signin');
  }
  el('acc-yes').onclick = function () { openSignin('s-acc'); };
  el('w-signin').onclick = function () { openSignin('s-words'); };
  el('si-back').onclick = function () {
    /* 🔴 ΟΧΙ startWords() εδώ: θα παρήγαγε ΑΛΛΕΣ 12 λέξεις, και όποιος
       τις είχε ήδη γράψει στο χαρτί θα κρατούσε λάθος κλειδί. Η οθόνη
       ξαναδείχνεται όπως ήταν — το pendingWords μένει άθικτο. */
    if (signinFrom === 's-words') { show('s-words'); return; }
    show('s-acc');
  };

  /* v34 — ΖΩΝΤΑΝΟΣ ΜΕΤΡΗΤΗΣ. Ο Stavros στάθηκε μπροστά σε ένα σκέτο πλαίσιο
     και ρώτησε «τι κάνω, θα τις γράψω όλες ενωμένες;». Η οδηγία από πάνω
     λέει το πώς· ο μετρητής λέει αν το πέτυχε, ΠΡΙΝ πατήσει Σύνδεση. */
  el('si-words').oninput = function () {
    var n = String(this.value || '').trim().split(/\s+/).filter(function (x) { return x.length; }).length;
    var e = el('si-count');
    e.textContent = n + ' από 12 λέξεις' + (n === 12 ? ' ✓' : '');
    e.style.color = (n === 12) ? '#2ee6a8' : '';
  };

  /* v26 — «Έχω ήδη λογαριασμό». ⚠ ΔΕΝ καλείται το register πριν
     επιβεβαιωθεί ότι ο λογαριασμός ΥΠΑΡΧΕΙ: το register με άγνωστο
     folder_id φτιάχνει ΝΕΟ λογαριασμό, οπότε λάθος (αλλά έγκυρες)
     λέξεις θα έδιναν σιωπηλά άδειο αρχείο αντί για μήνυμα λάθους. */
  el('si-go').onclick = function () {
    var email = el('si-email').value.trim();
    var raw   = el('si-words').value;
    var e = el('si-err');
    e.hidden = true;
    if (!validEmail(email)) { e.textContent = 'Γράψε μια σωστή διεύθυνση email.'; e.hidden = false; return; }
    var btn = el('si-go'); btn.disabled = true; btn.textContent = 'Έλεγχος…';
    function fail(msg) { btn.disabled = false; btn.textContent = 'Σύνδεση'; e.textContent = msg; e.hidden = false; }
    kmCheckWords(raw).then(function (c) {
      if (!c.ok) { fail(c.error); return null; }
      return kmDerive(c.words).then(function (d) {
        var h = {
          'X-Km-Folder': d.folderId,
          'X-Km-Auth':   d.authToken,
          'X-Km-Device': localStorage.getItem(LS.id) || ''
        };
        return fetch(KM_API + 'status', { headers: h }).then(function (r) {
          if (r.status === 404) { fail('Δεν βρέθηκε λογαριασμός με αυτές τις 12 λέξεις. Έλεγξε τη σειρά τους.'); return; }
          if (r.status === 403) { fail('Οι λέξεις δεν ταιριάζουν με αυτόν τον λογαριασμό.'); return; }
          if (!r.ok)            { fail('Δεν έχεις δίκτυο αυτή τη στιγμή. Δοκίμασε ξανά.'); return; }
          localStorage.setItem(LS.email, email);
          kmStore(c.words, d);
          localStorage.setItem(LS.wordsOk, '1');
          localStorage.setItem(LS.needPull, '1');   // v33 — πρώτα κατεβάζει, μετά ανεβάζει
          return kmRegister().then(function () {
            pullNow();
            btn.disabled = false; btn.textContent = 'Σύνδεση';
            afterAccount();
          });
        });
      });
    }).catch(function () { fail('Δεν έχεις δίκτυο αυτή τη στιγμή. Δοκίμασε ξανά.'); });
  };

  el('w-ok').onchange = function () { el('w-go').disabled = !this.checked; };
  el('w-go').onclick  = wordsAccepted;
  /* v27 — ΤΟ «ΑΝΤΙΓΡΑΦΗ» ΑΦΑΙΡΕΘΗΚΕ ΕΠΙΤΗΔΕΣ (3/9/2026, εύρημα Stavros).
     Το πρόχειρο του Android το διαβάζει κάθε εφαρμογή και οι διαχειριστές
     προχείρου κρατούν ιστορικό· και το κουμπί οδηγούσε τον χρήστη να τις
     επικολλήσει σε Σημειώσεις ή WhatsApp, που συγχρονίζονται. Το στιγμιότυπο
     ΔΕΝ μπλοκάρεται — καμία web τεχνολογία δεν το μπορεί (το FLAG_SECURE
     είναι native). Άρα λέμε την αλήθεια αντί να προσποιούμαστε ότι φυλάμε. */

  el('go-email').onclick = function () {
    var v = el('in-email').value.trim();
    if (!validEmail(v)) { el('err-email').hidden = false; return; }
    el('err-email').hidden = true;
    localStorage.setItem(LS.email, v);
    startWords(false);
  };
  el('go-key').onclick = function () {
    var v = el('in-key').value.trim();
    if (v) { localStorage.setItem(LS.key, v); localStorage.removeItem(LS.skip); aiHalt = false; }
    else { localStorage.setItem(LS.skip, '1'); }
    show('s-perm');
  };
  el('skip-key').onclick = function () {
    localStorage.setItem(LS.skip, '1');
    show('s-perm');
  };
  el('go-perm').onclick = function () {
    localStorage.setItem(LS.perm, '1');
    toCam();
  };
  el('shutter').onclick = capture;
  el('cam-retry').onclick = startCam;

  /* ── v35 · Η.3 — ΕΠΙΣΤΡΟΦΗ ΤΗΣ ΕΠΕΞΕΡΓΑΣΙΑΣ ΣΕ ΑΥΤΗ ΤΗ ΣΥΣΚΕΥΗ ────
     🔴 Η ΣΕΙΡΑ ΕΙΝΑΙ ΔΕΣΜΕΥΤΙΚΗ: ΚΑΤΕΒΑΖΕΙ ΠΡΩΤΑ, ΓΙΝΕΤΑΙ ΕΝΕΡΓΗ ΜΕΤΑ.
     Αν γινόταν πρώτα ενεργή και το κατέβασμα αποτύγχανε, το επόμενο
     ανέβασμα θα έγραφε τα ΜΙΣΑ δεδομένα αυτής της συσκευής πάνω στον
     φάκελο — ακριβώς η παγίδα που πιάστηκε στις 3/9 («ποτέ ανέβασμα πριν
     το κατέβασμα»). Γι' αυτό μπαίνει ΚΑΙ το σήμα km_need_pull πριν από
     οτιδήποτε: όσο εκκρεμεί, τίποτα δεν ανεβαίνει. */
  el('ro-menu').onclick = function () { goto('s-menu'); };
  if (ACTIVATE_NEEDS_WORDS) {
    el('ro-words').oninput = function () {
      var n = String(this.value || '').trim().split(/\s+/).filter(function (x) { return x.length; }).length;
      var e = el('ro-count');
      e.textContent = n + ' από 12 λέξεις' + (n === 12 ? ' ✓' : '');
      e.style.color = (n === 12) ? '#2ee6a8' : '';
    };
  }
  el('ro-go').onclick = function () {
    var b = el('ro-go'), e = el('ro-err');
    e.hidden = true;
    var stop = function (msg) {
      b.disabled = false; b.textContent = 'Κάνε αυτή τη συσκευή ενεργή';
      e.textContent = msg; e.hidden = false;
    };
    var run = function () {
      b.disabled = true; b.textContent = 'Κατεβάζει…';
      localStorage.setItem(LS.needPull, '1');
      return pullSettled().then(function () {
        if (pullInfo.msg) { stop('Δεν κατέβηκαν τα τιμολόγια της άλλης συσκευής: ' + pullInfo.msg + ' Δοκίμασε ξανά με δίκτυο.'); return; }
        b.textContent = 'Ενεργοποιεί…';
        return fetch(KM_API + 'activate', { method: 'POST', headers: kmHead() }).then(function (r) {
          if (!r.ok) { stop('Δεν έγινε η ενεργοποίηση (σφάλμα ' + r.status + '). Δοκίμασε ξανά.'); return; }
          return r.json().then(function (j) {
            setActiveState(true, j.active_since);
            b.disabled = false; b.textContent = 'Κάνε αυτή τη συσκευή ενεργή';
            scheduleSync(400);
            startCam();
          });
        });
      }).catch(function () { stop('Δεν έχεις δίκτυο αυτή τη στιγμή. Δοκίμασε ξανά.'); });
    };
    if (!ACTIVATE_NEEDS_WORDS) {
      if (!confirm('Να γίνει ΑΥΤΗ η συσκευή η ενεργή;\n\nΗ άλλη συσκευή περνάει σε ανάγνωση: θα βλέπει τα πάντα, δεν θα φωτογραφίζει.\n\nΚανένα τιμολόγιο δεν χάνεται.')) { return; }
      return run();
    }
    b.disabled = true; b.textContent = 'Έλεγχος…';
    kmCheckWords(el('ro-words').value).then(function (c) {
      if (!c.ok) { stop(c.error); return; }
      return kmDerive(c.words).then(function (d) {
        /* Σύγκριση με τον ΔΙΚΟ ΜΑΣ φάκελο: λάθος (αλλά έγκυρες) λέξεις
           δείχνουν άλλον λογαριασμό — δεν στέλνουμε τίποτα στον server. */
        if (d.folderId !== localStorage.getItem(LS.folder)) {
          stop('Αυτές οι 12 λέξεις ανοίγουν άλλον λογαριασμό, όχι αυτόν. Έλεγξε τη σειρά τους.');
          return;
        }
        return run();
      });
    }).catch(function () { stop('Κάτι πήγε στραβά στον έλεγχο των λέξεων. Δοκίμασε ξανά.'); });
  };
  el('prev-retake').onclick = previewRetake;
  el('prev-page').onclick   = previewAddPage;
  el('prev-ok').onclick     = previewOk;
  el('add-sup').onclick = function () { assign(el('in-sup').value.trim()); };
  el('in-sup').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { assign(el('in-sup').value.trim()); }
  });

  /* Το μενού άνοιξε: κανονική οθόνη, ΟΧΙ καταστροφική ενέργεια με ένα πάτημα.
     Κάθεται ΑΡΙΣΤΕΡΑ — μακριά από το ⋮ του browser. */
  el('btn-menu').onclick = function () { goto('s-menu'); };

  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
    b.onclick = function () {
      /* v43 — μέσα στους Προμηθευτές η «Επιστροφή» έχει δύο σκαλιά:
         προβολή προμηθευτή → λίστα ονομάτων → έξω. Χωρίς αυτό, ένα πάτημα
         πετούσε τον χρήστη δύο επίπεδα πίσω. */
      if (!el('s-sup').hidden && supView) { renderSupPage(); return; }
      back();
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.onclick = function () { goto(b.getAttribute('data-go')); };
  });

  el('ref-share').onclick = function () {
    if (!navigator.share) { return; }
    navigator.share({
      title: 'Kostometro',
      text: 'Φωτογραφίζεις το τιμολόγιο στην παραλαβή. Δωρεάν.',
      url: refUrl()
    }).catch(function () {});
  };
  el('ref-copy').onclick = function () {
    var u = refUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(u).then(function () {
        el('ref-copy').textContent = '✓ Αντιγράφηκε';
        setTimeout(function () { el('ref-copy').textContent = 'Αντιγραφή'; }, 1600);
      }).catch(function () {});
    }
  };

  el('st-editkey').onclick = function () {
    var cur = localStorage.getItem(LS.key) || '';
    var v = prompt('Κλειδί Gemini (άδειο = χειροκίνητα):', cur);
    if (v === null) { return; }
    v = v.trim();
    if (v) { localStorage.setItem(LS.key, v); localStorage.removeItem(LS.skip); }
    else { localStorage.removeItem(LS.key); localStorage.setItem(LS.skip, '1'); }
    aiHalt = false;
    renderSettings();
    aiSweep();
  };
  el('st-test').onclick = function () {
    aiHalt = false; aiBusy = false;
    diag('δοκιμή…');
    all().then(function (rows) {
      if (!rows.length) { diag('δεν υπάρχει φωτογραφία για δοκιμή'); return; }
      var key = localStorage.getItem(LS.key);
      if (!key) { diag('χωρίς κλειδί — χειροκίνητα'); return; }
      var target = rows.filter(isPending)[0] || rows[0];
      aiRead(target, key).then(function (s) {
        if (s.total !== null || s.vat !== null || s.net !== null) {
          target.sug = s; target.aiAt = Date.now();
          return put(target).then(function () {
            diag('✓ αποθηκεύτηκε: σύνολο ' + num(s.total) + ' · ΦΠΑ ' + num(s.vat) +
                 ' · ' + (localStorage.getItem(LS.model) || '?'));
            refreshCount();
          });
        }
        diag('απάντησε αλλά δεν διάβασε ποσά · ' + (localStorage.getItem(LS.model) || '?'));
      }).catch(function (err) {
        if (err && err.status === 429) {
          aiWait = Date.now() + (err.retryAfter || 32000);
          diag('όριο ρυθμού · ξανά σε ' + Math.ceil((err.retryAfter || 32000) / 1000) + 'ς');
        } else if (err && err.status) { diag('σφάλμα ' + err.status + ' · ' + (err.msg || '')); }
        else if (err && err.soft) { diag('ακατάλληλη απάντηση · ' + (err.msg || '')); }
        else { diag('δεν έφτασε στη Google · ' + (err && err.name ? err.name : 'δίκτυο/CORS')); }
      });
    });
  };
  el('st-sync-now').onclick = function () {
    var b = el('st-sync-now');
    b.disabled = true; b.textContent = 'Συγχρονίζεται…';
    startSyncTick();
    /* v43 — «Συγχρονισμός τώρα» σημαίνει ΚΑΙ ΤΑ ΔΥΟ. Ως τη v42 έκανε μόνο
       ανέβασμα: ο χρήστης που πατούσε το κουμπί περιμένοντας να δει τι
       άλλαξε σε άλλη συσκευή, έβλεπε την ίδια οθόνη και συμπέραινε ότι ο
       συγχρονισμός δεν δουλεύει. Το κατέβασμα ΠΡΩΤΑ (κανόνας v33). */
    pullNow().then(function () { return syncNow(); }).then(function () {
      b.disabled = false; b.textContent = 'Συγχρονισμός τώρα';
      renderSettings();
    });
  };
  el('st-update').onclick = function () {
    var b = el('st-update');
    b.disabled = true; b.textContent = 'Έλεγχος…';
    checkVersion(true).then(function (newer) {
      b.disabled = false;
      b.textContent = newer ? 'Βρέθηκε νέα — φορτώνει…' : 'Είσαι στη νεότερη έκδοση ✓';
      renderSettings();
    });
  };
  el('st-mywords').onclick = function () {
    var b = el('st-mywords'), e = el('mw-err');
    e.hidden = true;
    b.disabled = true; b.textContent = 'Επιβεβαίωση…';
    function done() { b.disabled = false; b.textContent = 'Οι 12 λέξεις μου'; }
    function stop(msg) { done(); e.textContent = msg; e.hidden = false; }
    if (!localStorage.getItem(LS.words)) {
      stop('Αυτή η συσκευή δεν έχει 12 λέξεις.');
      return;
    }
    lockAvailable().then(function (ok) {
      if (!ok) {
        /* Συσκευή χωρίς κανένα κλείδωμα. Δεν δείχνουμε: όποιος τη σηκώσει
           θα κρατούσε τον λογαριασμό. Λέμε ΤΙ να κάνει, όχι σκέτο «όχι». */
        stop('Για να δεις τις 12 λέξεις, η συσκευή σου πρέπει να έχει κλείδωμα (δακτυλικό, πρόσωπο ή PIN). Βάλ᾽ το από τις Ρυθμίσεις της συσκευής και ξαναδοκίμασε.');
        return;
      }
      lockVerify().then(function () {
        done();
        showMyWords();
      }).catch(function () {
        stop('Δεν επιβεβαιώθηκε το κλείδωμα της συσκευής. Δοκίμασε ξανά.');
      });
    });
  };

  /* v39 — Οι χειριστές του «Νέες 12 λέξεις» αφαιρέθηκαν μαζί με το κουμπί
     (απόφαση Stavros 5/9). Το mode 'rotate' του startWords() και το
     folderState() ΜΕΝΟΥΝ: είναι ο μηχανισμός που θα χρειαστεί η
     επανακρυπτογράφηση, και ο φρουρός της v29 δεν χάνεται. */

  el('st-reset').onclick = function () {
    if (!confirm('Μηδενισμός εγγραφής σε αυτή τη συσκευή;\n\nΣβήνονται το email, το κλειδί ΚΑΙ ο λογαριασμός — θα πάρεις νέες 12 λέξεις.\nΤα τιμολόγια, οι φωτογραφίες και τα ποσά τους μένουν ακέραια.')) { return; }
    if (!confirm('Σίγουρα; Οι τωρινές 12 λέξεις δεν θα ισχύουν πια.')) { return; }
    localStorage.removeItem(LS.email);
    localStorage.removeItem(LS.key);
    localStorage.removeItem(LS.skip);
    localStorage.removeItem(LS.perm);
    /* v29 — ΚΑΙ ο λογαριασμός. Ως το v28 έμεναν πίσω οι λέξεις: η εφαρμογή
       προσπερνούσε την οθόνη του email και ο χρήστης έμενε ΧΩΡΙΣ email αλλά
       ΜΕ λογαριασμό — κατάσταση που δεν προβλέπεται πουθενά. */
    localStorage.removeItem(LS.words);
    localStorage.removeItem(LS.folder);
    localStorage.removeItem(LS.auth);
    localStorage.removeItem(LS.wordsOk);
    localStorage.removeItem(LS.reg);
    location.reload();
  };

  /* Το κουμπί «πίσω» του κινητού κλείνει την τρέχουσα σελίδα, δεν βγάζει από την εφαρμογή */
  window.addEventListener('popstate', function () {
    if (!el('preview').hidden) {
      history.pushState(null, '', location.href);
      previewRetake();
      return;
    }
    if (nav.length) { history.pushState(null, '', location.href); back(); }
  });
  history.pushState(null, '', location.href);

  /* v35 · Η.3 — το κατέβασμα και ο έλεγχος «ποια συσκευή γράφει» τρέχουν σε
     κάθε επαναφορά. ΕΞΩ από το μπλοκ του service worker επίτηδες: πρέπει να
     δουλεύουν ακόμα κι αν η καταχώρηση του worker αποτύχει. */
  document.addEventListener('visibilitychange', maybePull);
  window.addEventListener('focus', maybePull);

  checkVersion(false);   // v30 — πρώτο πράγμα σε κάθε φόρτωση
  openDB().then(boot).then(function () { schedule(800); }).catch(function (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#e6e8ec">Δεν άνοιξε η τοπική βάση: ' + e + '</div>';
  });

  /* ── v30 · ΤΟ ΡΟΛΟΪ ΤΗΣ ΕΚΔΟΣΗΣ ────────────────────────────────────
     ΓΙΑΤΙ ΥΠΑΡΧΕΙ: ως το v29 η εφαρμογή δεν είχε κανέναν τρόπο να ΞΕΡΕΙ ότι
     τρέχει παλιά. Ο worker σερβίρει δίκτυο-πρώτα με φρένο 2,5″ — σε κινητό
     που ξυπνάει με δεδομένα κινητής το πρώτο αίτημα ξεπερνάει συχνά τα 2,5″,
     οπότε σερβίρεται η μνήμη και ο χρήστης βλέπει την ΠΑΛΙΑ έκδοση, χωρίς
     κανένα σημάδι. Μετρήθηκε τρεις φορές στο κινητό του Stavros (v27, v28, v29).
     ΤΙ ΚΑΝΕΙ: ένα αρχείο 20 bytes που ΔΕΝ περνάει ποτέ από τον worker λέει
     ποια έκδοση έχει ο server. Αν διαφέρει από αυτήν που τρέχει, η εφαρμογή
     ζητάει ενημέρωση και ξαναφορτώνει ΜΙΑ φορά. Το «μία φορά» φυλάγεται σε
     sessionStorage: αν κάτι πάει στραβά, χάνεται μία ανανέωση, όχι ο χρήστης
     σε ατέρμονο βρόχο. */
  var srvVer = null;
  function shortVer(v) { var m = /v\d+/.exec(v || ''); return m ? m[0] : (v || '—'); }
  function serverVersion() {
    return fetch('/kostometro/version.json?nc=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { srvVer = (j && j.v) || null; return srvVer; })
      .catch(function () { return null; });
  }
  function checkVersion(force) {
    return serverVersion().then(function (v) {
      if (!v || v === shortVer(APP_VER)) { return false; }
      var tries = Number(sessionStorage.getItem('km_upd') || 0);
      if (!force && tries >= 1) { return true; }   // το ξέρουμε, δεν ξαναφορτώνουμε
      sessionStorage.setItem('km_upd', String(tries + 1));
      if ('serviceWorker' in navigator) {
        return navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg) { try { reg.update(); } catch (e) {} }
          setTimeout(function () { location.reload(); }, 1200);
          return true;
        }).catch(function () { location.reload(); return true; });
      }
      location.reload();
      return true;
    });
  }

  if ('serviceWorker' in navigator) {
    /* v28 — ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ register(). Το register ελέγχει για νέα έκδοση
       μόνο πάνω σε ΠΛΟΗΓΗΣΗ. Ένα εγκατεστημένο PWA που ξυπνάει από το
       παρασκήνιο δεν κάνει πλοήγηση — άρα δεν ελέγχει ποτέ, και μένει στην
       παλιά έκδοση όσες φορές κι αν το «κλείσεις». Μετρήθηκε 3/9/2026:
       4+ ανοίγματα, καμία ενημέρωση. Τώρα ο έλεγχος γίνεται και κάθε φορά
       που η εφαρμογή έρχεται μπροστά. */
    navigator.serviceWorker.register('/kostometro/sw.js').then(function (reg) {
      var check = function () {
        if (document.visibilityState !== 'visible') { return; }
        try { reg.update(); } catch (e) {}
        checkVersion(false);
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      setInterval(check, 3600000);
    }).catch(function () {});
    /* Νέα έκδοση → η σελίδα ξαναφορτώνει ΜΟΝΗ της. Τέλος το «κλείσ' το δύο φορές».
       ⚠ v35 — ΑΛΛΑ ΜΟΝΟ ΑΝ ΤΡΕΧΟΥΜΕ ΟΝΤΩΣ ΠΑΛΙΑ ΕΚΔΟΣΗ. Στην ΠΡΩΤΗ
       εγκατάσταση ο worker αναλαμβάνει σελίδα που μόλις κατέβηκε φρέσκια από
       το δίκτυο: το reload εκεί δεν διορθώνει τίποτα — είναι ένα ορατό
       τρεμόπαιγμα πάνω στην πρώτη οθόνη που βλέπει ποτέ ο νέος χρήστης.
       Το ρολόι της έκδοσης (v30) ξέρει ήδη την απάντηση· τη ρωτάμε. */
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded) { return; }
      serverVersion().then(function (v) {
        if (reloaded) { return; }
        if (!v || v === shortVer(APP_VER)) { return; }   // ήδη τρέχει η σωστή
        reloaded = true;
        location.reload();
      });
    });
  }
})();

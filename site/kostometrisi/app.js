/* Kostometrisi — φέτα 3 (29/8/2026)
   φέτα 1: εγγραφή, κάμερα, ουρά, προμηθευτής.
   φέτα 2: Τα εκκρεμή · Ο προμηθευτής μου · Κάλεσε · κανονικό μενού ·
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
    sups:  'km_suppliers',
    perm:  'km_perm_seen',
    src:   'km_source',
    diag:  'km_ai_diag',
    model: 'km_ai_model'
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
  function del(id) {
    return new Promise(function (res, rej) {
      var t = db.transaction('shots', 'readwrite');
      t.objectStore('shots').delete(id);
      t.oncomplete = res; t.onerror = function () { rej(t.error); };
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
  var SCREENS = ['s-email','s-key','s-perm','s-cam','s-who',
                 's-menu','s-pend','s-sup','s-ref','s-settings','s-shot'];
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
    if (id === 's-sup')      { renderSupPage(); }
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
  function suppliers() {
    try { return JSON.parse(localStorage.getItem(LS.sups) || '[]'); } catch (e) { return []; }
  }
  function bumpSupplier(name) {
    var list = suppliers(), hit = null;
    list.forEach(function (s) { if (s.name === name) { hit = s; } });
    if (hit) { hit.n++; } else { list.push({ name: name, n: 1 }); }
    list.sort(function (a, b) { return b.n - a.n; });
    localStorage.setItem(LS.sups, JSON.stringify(list));
  }
  function renderSuppliers() {
    var box = el('sup-list');
    box.innerHTML = '';
    suppliers().slice(0, 5).forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'sup';
      b.textContent = s.name;
      b.onclick = function () { assign(s.name); };
      box.appendChild(b);
    });
  }

  /* ══ ΜΕΝΟΥ ══ */
  function renderMenu() {
    all().then(function (rows) {
      var p = rows.filter(isPending).length;
      var m = el('m-pend');
      m.textContent = p;
      m.className = 'row-b' + (p > 0 ? ' hot' : '');
      /* v18 — Ο αριθμός εδώ ΠΡΕΠΕΙ να μετράει ό,τι μετράει και η οθόνη.
         Το suppliers() είναι η ΜΝΗΜΗ ονομάτων για τα γρήγορα κουμπιά: μεγαλώνει
         όταν γράφεις όνομα και δεν μικραίνει ποτέ όταν σβήνεις τιμολόγιο.
         Στις 31/8/2026 το μενού έλεγε 4 και η λίστα έδειχνε 3. */
      var supNames = {};
      rows.forEach(function (r) { if (r.supplier) { supNames[r.supplier] = 1; } });
      el('m-sup').textContent = Object.keys(supNames).length;
    });
  }

  /* ══ ΤΑ ΕΚΚΡΕΜΗ ══ */
  var pendOrder = null;      // παγωμένη σειρά όσο είσαι μέσα στην οθόνη
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
      if (waiting.length && localStorage.getItem(LS.key) && !manualRun) {
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
    if (sug && sug.date && Math.abs(sug.date - dateOf(r)) > 86400000) {
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

      function draw(q) {
        list.innerHTML = '';
        var nq = norm(q);
        var hit = keys.filter(function (nm) { return !nq || norm(nm).indexOf(nq) !== -1; });
        if (!hit.length) {
          list.innerHTML = '<p class="empty">Κανένας προμηθευτής με αυτό το όνομα.</p>';
          return;
        }
        hit.forEach(function (nm) {
          var b = document.createElement('button');
          b.className = 'row';
          b.innerHTML = '<span class="row-t"></span><span class="row-b"></span>';
          b.querySelector('.row-t').textContent = nm;
          b.querySelector('.row-b').textContent = names[nm] + ' τιμ.';
          b.onclick = function () { openSupplier(nm, rows); };
          list.appendChild(b);
        });
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
        body.appendChild(find);
      }
      body.appendChild(list);
      draw('');
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
  function openSupplier(name, rows) {
    var body = el('sup-body');
    var mine = rows.filter(function (r) { return r.supplier === name; });
    var from = null, to = null;          // null = όλα
    var active = 'all';                  // ποιο κουμπί είναι πατημένο

    function draw() {
      body.innerHTML = '';
      freeUrls();

      var h = document.createElement('h2');
      h.textContent = name;
      body.appendChild(h);

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

      var list = mine.filter(function (r) {
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
      var byMonth = {};
      mine.forEach(function (r) {
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
      var d = document.createElement('div'); d.className = 'inv-d'; d.textContent = dstr(dateOf(r));
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
      var pgs = pagesOf(r);
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
        var shown = cropImg(bl, c, 'shot-full');
        block.appendChild(shown);

        var cb = document.createElement('button');
        cb.className = 'btn ghost';
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
  function refUrl() { return location.origin + '/kostometrisi/?ref=' + refCode(); }
  function renderRef() {
    el('ref-link').textContent = refUrl();
    el('ref-note').textContent = navigator.share ? '' : 'Ο browser σου δεν έχει κουμπί κοινοποίησης — χρησιμοποίησε την Αντιγραφή.';
    el('ref-share').hidden = !navigator.share;
  }

  /* ══ ΡΥΘΜΙΣΕΙΣ ══ */
  function renderSettings() {
    el('st-email').textContent = localStorage.getItem(LS.email) || '—';
    el('st-key').textContent = localStorage.getItem(LS.key) ? 'Με κλειδί Gemini' : 'Χειροκίνητα';
    el('st-ver').textContent = APP_VER;
    el('st-diag').textContent = localStorage.getItem(LS.diag) || '—';
    all().then(function (rows) { el('st-shots').textContent = rows.length; });
  }

  /* ══ ΑΝΑΓΝΩΣΗ GEMINI (φέτα 3) ══
     Κανόνες: (α) η φωτογραφία πάει ΑΠΕΥΘΕΙΑΣ συσκευή → Google, με το κλειδί
     του χρήστη — ποτέ μέσω δικού μας server. (β) Το Gemini ΠΡΟΤΕΙΝΕΙ, δεν
     αποφασίζει: οι τιμές προσυμπληρώνονται και το τιμολόγιο μένει εκκρεμές
     μέχρι ο άνθρωπος να πατήσει Αποθήκευση (απόφαση Stavros 29/8: Β).
     (γ) Καμία οθόνη σφάλματος στην πόρτα — αποτυχία = χειροκίνητα, όπως πριν. */
  var APP_VER = 'φέτα 3 · v20';
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
  function startCam() {
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
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      stream = null;
      el('vid').srcObject = null;
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
  /* v18 — Η επιστροφή από το παρασκήνιο είναι η πιο συχνή στιγμή που έχει
     πεθάνει η κάμερα: ο χρήστης απαντάει μήνυμα και γυρνάει. Χωρίς αυτό,
     βλέπει παγωμένο καρέ και νομίζει ότι η εφαρμογή χάλασε. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !el('s-cam').hidden) { startCam(); }
  });

  function toCam() { nav = []; clearPending(); show('s-cam'); startCam(); refreshCount(); }

  function capture() {
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
    renderSuppliers();
    el('in-sup').value = '';
    show('s-who');
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
      bumpSupplier(name);
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
    if (!localStorage.getItem(LS.email)) { return show('s-email'); }
    if (!localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip)) { return show('s-key'); }
    if (!localStorage.getItem(LS.perm)) { return show('s-perm'); }
    toCam();
  }

  /* ── Χειριστές ── */
  el('go-email').onclick = function () {
    var v = el('in-email').value.trim();
    if (!validEmail(v)) { el('err-email').hidden = false; return; }
    el('err-email').hidden = true;
    localStorage.setItem(LS.email, v);
    show('s-key');
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
    b.onclick = back;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.onclick = function () { goto(b.getAttribute('data-go')); };
  });

  el('ref-share').onclick = function () {
    if (!navigator.share) { return; }
    navigator.share({
      title: 'Kostometrisi',
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
  el('st-reset').onclick = function () {
    if (!confirm('Μηδενισμός εγγραφής σε αυτή τη συσκευή;\n\nΣβήνονται email και κλειδί.\nΤα τιμολόγια και οι φωτογραφίες ΔΕΝ σβήνονται.')) { return; }
    if (!confirm('Σίγουρα; Θα ξαναγράψεις το email σου.')) { return; }
    localStorage.removeItem(LS.email);
    localStorage.removeItem(LS.key);
    localStorage.removeItem(LS.skip);
    localStorage.removeItem(LS.perm);
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

  openDB().then(boot).then(function () { schedule(800); }).catch(function (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#e6e8ec">Δεν άνοιξε η τοπική βάση: ' + e + '</div>';
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/kostometrisi/sw.js').catch(function () {});
    /* Νέα έκδοση → η σελίδα ξαναφορτώνει ΜΟΝΗ της. Τέλος το «κλείσ' το δύο φορές». */
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded) { return; }
      reloaded = true;
      location.reload();
    });
  }
})();

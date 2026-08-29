/* Hand Control — φέτα 3 (29/8/2026)
   φέτα 1: εγγραφή, κάμερα, ουρά, προμηθευτής.
   φέτα 2: Τα εκκρεμή · Ο προμηθευτής μου · Κάλεσε · κανονικό μενού ·
           οδηγία άδειας κάμερας.
   φέτα 3: ανάγνωση Gemini (BYOK) · αυτόματη ανανέωση έκδοσης.
   Δεδομένα τοπικά. Η ΜΟΝΗ εξωτερική κλήση: φωτογραφία → Gemini,
   απευθείας από τη συσκευή, με το κλειδί του χρήστη. Κανένας δικός μας server. */
(function () {
  'use strict';

  var LS = {
    email: 'hc_email',
    key:   'hc_key',
    skip:  'hc_key_skipped',
    id:    'hc_install_id',
    sups:  'hc_suppliers',
    perm:  'hc_perm_seen',
    src:   'hc_source'
  };

  var el = function (id) { return document.getElementById(id); };
  var stream = null, pendingBlob = null, pendingUrl = null;
  var nav = [];            // στοίβα πλοήγησης για το «πίσω»
  var urls = [];           // objectURLs προς απελευθέρωση

  /* ── Τοπική βάση (IndexedDB) ── */
  var db = null;
  function openDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('handcontrol', 1);
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
        else { out.sort(function (a, b) { return b.ts - a.ts; }); res(out); }
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
  function isPending(r) { return r.total === null || r.total === undefined; }

  /* ── Πλοήγηση ── */
  var SCREENS = ['s-email','s-key','s-perm','s-cam','s-who',
                 's-menu','s-pend','s-sup','s-ref','s-settings','s-shot'];
  function show(id) {
    SCREENS.forEach(function (s) { el(s).hidden = (s !== id); });
  }
  function goto(id) { nav.push(id); render(id); show(id); }
  function back() {
    freeUrls();
    nav.pop();
    var prev = nav[nav.length - 1];
    if (!prev) { show('s-cam'); refreshCount(); return; }
    render(prev); show(prev);
  }
  function freeUrls() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
  }
  function blobUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }

  function render(id) {
    if (id === 's-menu')     { renderMenu(); }
    if (id === 's-pend')     { renderPending(); }
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
      el('m-sup').textContent = suppliers().length;
    });
  }

  /* ══ ΤΑ ΕΚΚΡΕΜΗ ══ */
  function renderPending() {
    aiSweep();
    var body = el('pend-body');
    body.innerHTML = '';
    all().then(function (rows) {
      var list = rows.filter(isPending);
      if (!list.length) {
        body.innerHTML = '<p class="empty">Δεν έχεις εκκρεμή.<br>Ό,τι φωτογράφισες έχει ποσά.</p>';
        return;
      }
      list.forEach(function (r) { body.appendChild(pendCard(r)); });
    });
  }
  function pendCard(r) {
    var c = document.createElement('div');
    c.className = 'card';

    var head = document.createElement('div');
    head.className = 'card-head';
    var img = document.createElement('img');
    img.src = blobUrl(r.blob);
    img.alt = '';
    img.onclick = function () { openShot(r.id); };
    var meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = '<div class="card-sup"></div><div class="card-date"></div>';
    meta.querySelector('.card-sup').textContent = r.supplier;
    meta.querySelector('.card-date').textContent = dstr(r.ts);
    var thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.appendChild(img);
    head.appendChild(thumb); head.appendChild(meta);

    var amts = document.createElement('div');
    amts.className = 'amts';
    var fields = [['Σύνολο','total'], ['ΦΠΑ','vat'], ['Υπόλοιπο','balance']];
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
      i.addEventListener('input', function () { i.classList.remove('ai'); });
      inputs[f[1]] = i;
      w.appendChild(s); w.appendChild(i);
      amts.appendChild(w);
    });
    if (prefilled) {
      var note = document.createElement('p');
      note.className = 'ai-note';
      note.textContent = 'Διαβάστηκαν από το Gemini — έλεγξε με τη φωτογραφία και πάτα Αποθήκευση.';
      amts.appendChild(note);
    }

    var save = document.createElement('button');
    save.className = 'btn primary';
    save.textContent = 'Αποθήκευση';
    save.onclick = function () {
      var t = parseNum(inputs.total.value);
      if (t === null) { inputs.total.focus(); inputs.total.style.borderColor = 'var(--danger)'; return; }
      r.total = t;
      r.vat = parseNum(inputs.vat.value);
      r.balance = parseNum(inputs.balance.value);
      put(r).then(function () { renderPending(); refreshCount(); });
    };

    c.appendChild(head); c.appendChild(amts); c.appendChild(save);
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
  function openSupplier(name, rows) {
    var body = el('sup-body');
    body.innerHTML = '';
    var mine = rows.filter(function (r) { return r.supplier === name; });

    var h = document.createElement('h2');
    h.textContent = name;
    body.appendChild(h);

    var byMonth = {};
    mine.forEach(function (r) {
      var k = mkey(r.ts);
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

      byMonth[k].rows.forEach(function (r) {
        var b = document.createElement('button');
        b.className = 'inv';
        var im = document.createElement('img'); im.src = blobUrl(r.blob); im.alt = '';
        var mt = document.createElement('div'); mt.className = 'inv-m';
        var a = document.createElement('div');
        if (typeof r.total === 'number') { a.className = 'inv-a'; a.textContent = eur(r.total); }
        else { a.className = 'inv-a miss'; a.textContent = 'χωρίς ποσό'; }
        var d = document.createElement('div'); d.className = 'inv-d'; d.textContent = dstr(r.ts);
        mt.appendChild(a); mt.appendChild(d);
        var th = document.createElement('span');
        th.className = 'thumb';
        th.appendChild(im);
        b.appendChild(th); b.appendChild(mt);
        b.onclick = function () { openShot(r.id); };
        body.appendChild(b);
      });
    });
  }

  /* ══ ΠΡΟΒΟΛΗ ΤΙΜΟΛΟΓΙΟΥ ══ */
  function openShot(id) {
    get(id).then(function (r) {
      if (!r) { return; }
      el('shot-title').textContent = r.supplier;
      var body = el('shot-body');
      body.innerHTML = '';
      var img = document.createElement('img');
      img.className = 'shot-full';
      img.src = blobUrl(r.blob);
      img.alt = 'Τιμολόγιο ' + r.supplier;
      body.appendChild(img);
      [['Ημερομηνία', dstr(r.ts)], ['Σύνολο', eur(r.total)],
       ['ΦΠΑ', eur(r.vat)], ['Υπόλοιπο', eur(r.balance)]].forEach(function (p) {
        var kv = document.createElement('div');
        kv.className = 'kv';
        kv.innerHTML = '<span></span><b></b>';
        kv.querySelector('span').textContent = p[0];
        kv.querySelector('b').textContent = p[1];
        body.appendChild(kv);
      });
      nav.push('s-shot'); show('s-shot');
    });
  }

  /* ══ ΚΑΛΕΣΕ ══ */
  function refCode() {
    var id = localStorage.getItem(LS.id) || '';
    return id.replace('hc_', '').slice(-8);
  }
  function refUrl() { return location.origin + '/hc/?ref=' + refCode(); }
  function renderRef() {
    el('ref-link').textContent = refUrl();
    el('ref-note').textContent = navigator.share ? '' : 'Ο browser σου δεν έχει κουμπί κοινοποίησης — χρησιμοποίησε την Αντιγραφή.';
    el('ref-share').hidden = !navigator.share;
  }

  /* ══ ΡΥΘΜΙΣΕΙΣ ══ */
  function renderSettings() {
    el('st-email').textContent = localStorage.getItem(LS.email) || '—';
    el('st-key').textContent = localStorage.getItem(LS.key) ? 'Με κλειδί Gemini' : 'Χειροκίνητα';
    all().then(function (rows) { el('st-shots').textContent = rows.length; });
  }

  /* ══ ΑΝΑΓΝΩΣΗ GEMINI (φέτα 3) ══
     Κανόνες: (α) η φωτογραφία πάει ΑΠΕΥΘΕΙΑΣ συσκευή → Google, με το κλειδί
     του χρήστη — ποτέ μέσω δικού μας server. (β) Το Gemini ΠΡΟΤΕΙΝΕΙ, δεν
     αποφασίζει: οι τιμές προσυμπληρώνονται και το τιμολόγιο μένει εκκρεμές
     μέχρι ο άνθρωπος να πατήσει Αποθήκευση (απόφαση Stavros 29/8: Β).
     (γ) Καμία οθόνη σφάλματος στην πόρτα — αποτυχία = χειροκίνητα, όπως πριν. */
  var AI_MODEL = 'gemini-2.5-flash';
  var AI_MAX_TRY = 3;
  var aiBusy = false, aiHalt = false; // aiHalt: άκυρο κλειδί/όριο — στοπ ως το επόμενο άνοιγμα

  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function aiNum(v) {
    if (typeof v === 'number' && isFinite(v)) { return Math.round(v * 100) / 100; }
    return null;
  }
  function aiRead(rec, key) {
    return blobB64(rec.blob).then(function (b64) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var tmr = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + AI_MODEL + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'image/jpeg', data: b64 } },
            { text: 'Φωτογραφία τιμολογίου ή απόδειξης (ελληνικά ή αγγλικά). Απάντησε ΜΟΝΟ με JSON: {"total": τελικό πληρωτέο ποσό με ΦΠΑ, "vat": συνολικό ποσό ΦΠΑ, "balance": υπόλοιπο οφειλής ΜΟΝΟ αν αναγράφεται ρητά, αλλιώς null}. Αριθμοί με τελεία δεκαδικών, χωρίς σύμβολα και χωρίς κείμενο. Αν ένα ποσό δεν διαβάζεται ΚΑΘΑΡΑ, βάλε null — ποτέ μην μαντεύεις.' }
          ] }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0 }
        })
      }).then(function (res) {
        if (tmr) { clearTimeout(tmr); }
        if (!res.ok) { var e = new Error('http'); e.status = res.status; throw e; }
        return res.json();
      });
    }).then(function (j) {
      var txt = '';
      try { txt = j.candidates[0].content.parts[0].text; } catch (e) {}
      var o = null;
      try { o = JSON.parse(txt); } catch (e) {}
      if (!o || typeof o !== 'object') { var pe = new Error('parse'); pe.soft = true; throw pe; }
      return { total: aiNum(o.total), vat: aiNum(o.vat), balance: aiNum(o.balance) };
    });
  }
  function aiSweep() {
    var key = localStorage.getItem(LS.key);
    if (!key || aiBusy || aiHalt || !navigator.onLine) { return; }
    aiBusy = true;
    all().then(function (rows) {
      var q = rows.filter(function (r) {
        return isPending(r) && !r.sug && (r.aiTry || 0) < AI_MAX_TRY;
      }).sort(function (a, b) { return a.ts - b.ts; }); // παλαιότερο πρώτα, ένα-ένα
      if (!q.length) { aiBusy = false; return; }
      var rec = q[0];
      aiRead(rec, key).then(function (sug) {
        if (sug.total === null && sug.vat === null && sug.balance === null) {
          rec.aiTry = (rec.aiTry || 0) + 1; // διάβασε αλλά δεν είδε τίποτα
        } else {
          rec.sug = sug; rec.aiAt = Date.now();
        }
        return put(rec).then(function () {
          if (!el('s-pend').hidden) { renderPending(); }
          aiBusy = false;
          setTimeout(aiSweep, 400); // επόμενο της ουράς
        });
      }).catch(function (err) {
        if (err && err.soft) { rec.aiTry = (rec.aiTry || 0) + 1; put(rec); }
        else if (err && err.status) { aiHalt = true; } // άκυρο κλειδί/όριο — μη χτυπάς συνέχεια
        // δικτυακό σφάλμα: τίποτα δεν καίγεται, ξανά στο επόμενο άνοιγμα
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
    if (stream) { return; }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false
    }).then(function (s) {
      stream = s;
      el('vid').srcObject = s;
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
  function toCam() { nav = []; show('s-cam'); startCam(); refreshCount(); }

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
      el('thumb').src = pendingUrl;
      renderSuppliers();
      el('in-sup').value = '';
      show('s-who');
    }, 'image/jpeg', 0.85);
  }

  /* ── Καταχώρηση ── */
  function assign(name) {
    if (!name || !pendingBlob) { return; }
    var rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      supplier: name,
      blob: pendingBlob,
      total: null, vat: null, balance: null
    };
    put(rec).then(function () {
      bumpSupplier(name);
      pendingBlob = null;
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
      localStorage.setItem(LS.id, 'hc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
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
    if (v) { localStorage.setItem(LS.key, v); localStorage.removeItem(LS.skip); }
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
      title: 'Hand Control',
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
    renderSettings();
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
    if (nav.length) { history.pushState(null, '', location.href); back(); }
  });
  history.pushState(null, '', location.href);

  openDB().then(boot).then(function () { setTimeout(aiSweep, 800); }).catch(function (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#e6e8ec">Δεν άνοιξε η τοπική βάση: ' + e + '</div>';
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/hc/sw.js').catch(function () {});
    /* Νέα έκδοση → η σελίδα ξαναφορτώνει ΜΟΝΗ της. Τέλος το «κλείσ' το δύο φορές». */
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded) { return; }
      reloaded = true;
      location.reload();
    });
  }
})();

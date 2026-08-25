/* Hand Control — φέτα 1: εγγραφή, κάμερα, ουρά, προμηθευτής.
   Όλα τοπικά στη συσκευή. Καμία αποστολή πουθενά σε αυτή τη φέτα. */
(function () {
  'use strict';

  var LS = {
    email: 'hc_email',
    key:   'hc_key',
    skip:  'hc_key_skipped',
    id:    'hc_install_id',
    sups:  'hc_suppliers'
  };

  var el = function (id) { return document.getElementById(id); };
  var stream = null, pendingBlob = null, pendingUrl = null;

  /* ── Τοπική βάση (IndexedDB) — οι φωτογραφίες δεν χωράνε σε localStorage ── */
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
  function countPending() {
    return new Promise(function (res) {
      var n = 0, t = db.transaction('shots', 'readonly');
      t.objectStore('shots').openCursor().onsuccess = function (e) {
        var c = e.target.result;
        if (c) { if (!c.value.total && c.value.total !== 0) n++; c.continue(); } else { res(n); }
      };
    });
  }

  /* ── Πλοήγηση ── */
  function show(id) {
    ['s-email', 's-key', 's-cam', 's-who'].forEach(function (s) { el(s).hidden = (s !== id); });
  }

  /* ── Προμηθευτές ── */
  function suppliers() {
    try { return JSON.parse(localStorage.getItem(LS.sups) || '[]'); } catch (e) { return []; }
  }
  function bumpSupplier(name) {
    var list = suppliers(), hit = null;
    list.forEach(function (s) { if (s.name === name) hit = s; });
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

  /* ── Κάμερα ── */
  function startCam() {
    el('cam-err').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return camFail('Ο browser δεν υποστηρίζει κάμερα. Άνοιξε τη σελίδα σε Chrome ή Safari.');
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false
    }).then(function (s) {
      stream = s;
      el('vid').srcObject = s;
    }).catch(function (err) {
      var m = 'Σφάλμα: ' + (err && err.name ? err.name : 'άγνωστο');
      if (err && err.name === 'NotAllowedError') m = 'Δεν δόθηκε άδεια κάμερας. Άνοιξε τις ρυθμίσεις του browser για αυτή τη σελίδα και επίτρεψε την κάμερα.';
      if (err && err.name === 'NotFoundError') m = 'Δεν βρέθηκε κάμερα σε αυτή τη συσκευή.';
      camFail(m);
    });
  }
  function camFail(msg) {
    el('cam-err-msg').textContent = msg;
    el('cam-err').hidden = false;
  }

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
      var t = el('toast');
      t.hidden = false;
      setTimeout(function () { t.hidden = true; }, 1100);
      refreshCount();
    }).catch(function (e) {
      alert('Δεν αποθηκεύτηκε: ' + e);
    });
  }
  function refreshCount() {
    countPending().then(function (n) {
      el('pending').textContent = n + ' εκκρεμ' + (n === 1 ? 'ές' : 'ή');
    });
  }

  /* ── Εγγραφή ── */
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function boot() {
    if (!localStorage.getItem(LS.id)) {
      localStorage.setItem(LS.id, 'hc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    }
    if (!localStorage.getItem(LS.email)) { return show('s-email'); }
    if (!localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip)) { return show('s-key'); }
    show('s-cam'); startCam(); refreshCount();
  }

  el('go-email').onclick = function () {
    var v = el('in-email').value.trim();
    if (!validEmail(v)) { el('err-email').hidden = false; return; }
    el('err-email').hidden = true;
    localStorage.setItem(LS.email, v);
    show('s-key');
  };
  el('go-key').onclick = function () {
    var v = el('in-key').value.trim();
    if (v) { localStorage.setItem(LS.key, v); }
    else { localStorage.setItem(LS.skip, '1'); }
    show('s-cam'); startCam(); refreshCount();
  };
  el('skip-key').onclick = function () {
    localStorage.setItem(LS.skip, '1');
    show('s-cam'); startCam(); refreshCount();
  };
  el('shutter').onclick = capture;
  el('cam-retry').onclick = startCam;
  el('add-sup').onclick = function () { assign(el('in-sup').value.trim()); };
  el('in-sup').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { assign(el('in-sup').value.trim()); }
  });
  el('btn-menu').onclick = function () {
    if (confirm('Μηδενισμός εγγραφής σε αυτή τη συσκευή; (οι φωτογραφίες παραμένουν)')) {
      localStorage.removeItem(LS.email);
      localStorage.removeItem(LS.key);
      localStorage.removeItem(LS.skip);
      location.reload();
    }
  };

  openDB().then(boot).catch(function (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#e6e8ec">Δεν άνοιξε η τοπική βάση: ' + e + '</div>';
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/hc/sw.js').catch(function () {});
  }
})();

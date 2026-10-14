/* KM-PRO-F4 · FastWrite «γραμματοκιβώτιο» — η σελίδα «Kostometro» (14/10/2026)
   Ο λογιστής βλέπει τα τιμολόγια των πελατών του που έχουν Kostometro PRO: γραμμές, φωτογραφία,
   αναζήτηση με σελιδοποίηση, «άλλαξε η αντιστοίχιση», διόρθωση που ισχύει αμέσως, Xero ως έχει. */
(function () {
  'use strict';
  var KM = { page: 1, size: 25, mode: 'inv', q: '', link: '', sup: '', from: '', to: '', flag: '', open: null, timer: null };
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* 🔴 ΚΑΘΕ τιμή που έρχεται από τον πελάτη περνά από esc() — ακόμα και «αριθμοί» και ημερομηνίες (εύρημα αναθεώρησης 14/10) */
  function money(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? '—' : n.toFixed(2).replace('.', ','); }
  function num(v) { return v === null || v === undefined || v === '' ? '' : esc(String(v).replace('.', ',')); }
  function dt(s) { if (!s) { return '—'; } var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? m[3] + '/' + m[2] + '/' + m[1] : esc(s); }
  function call(method, path, body) { return api(method, path, body); }

  window.loadKostometro = function () { kmStatus(); kmSearch(); };
  /* Η σελίδα υπάρχει ΜΟΝΟ στο desktop (στον server οι διαδρομές δεν φορτώνονται) → αλλιώς το κουμπί κρύβεται */
  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/km/status', { credentials: 'include' }).then(function (r) { if (r.status === 404) { var b = $('nav-kostometro'); if (b) { b.style.display = 'none'; } } }).catch(function () {});
  });

  function kmStatus() {
    return call('GET', '/api/km/status').then(function (j) {
      var box = $('km-links'), sel = $('km-f-link');
      if (!j || !j.ok) { box.innerHTML = '<div class="empty-sub">Δεν φόρτωσε: ' + esc((j && j.error) || '') + '</div>'; return; }
      var links = j.links || [];
      $('km-connect').style.display = links.length ? 'none' : 'block';
      box.innerHTML = links.map(function (l) {
        var st = l.status === 'active' ? '<span class="badge badge-green">συνδεδεμένο</span>' :
                 l.status === 'joined' ? '<span class="badge badge-yellow">περιμένει ενεργοποίηση από το κινητό του πελάτη</span>' +
                   (l.code ? ' <span class="km-code" style="font-size:12px">Κωδικός επιβεβαίωσης: <b>' + esc(l.code) + '</b> — ο πελάτης βλέπει τον ίδιο</span>' : '') :
                 l.status === 'revoked' ? '<span class="badge badge-red">η πρόσβαση έκλεισε</span>' : '<span class="badge badge-gray">' + esc(l.status) + '</span>';
        return '<div class="card km-link" data-link="' + l.id + '" style="padding:10px 14px;margin-bottom:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
          '<b>' + esc(l.biz || l.name || ('Επιχείρηση #' + l.id)) + '</b> ' + st +
          '<span style="color:var(--text2);font-size:12px">' + l.invoices + ' τιμολόγια' + (l.map_changed ? ' · <span style="color:#f5a524">⚠ ' + l.map_changed + ' με αλλαγή αντιστοίχισης</span>' : '') +
          (l.last_pull ? ' · λήψη ' + esc(l.last_pull.replace('T', ' ').slice(0, 16)) : '') + (l.last_error ? ' · ' + esc(l.last_error) : '') + '</span>' +
          (l.status !== 'revoked' ? '<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="kmLeave(' + l.id + ')">Αποσύνδεση</button>' : '') + '</div>';
      }).join('');
      var cur = sel.value;
      sel.innerHTML = '<option value="">Όλες οι επιχειρήσεις</option>' + links.map(function (l) { return '<option value="' + l.id + '">' + esc(l.biz || l.name || ('#' + l.id)) + '</option>'; }).join('');
      sel.value = cur;
    });
  }
  window.kmConnect = function () {
    var link = $('km-c-link').value.trim(), office = $('km-c-office').value.trim();
    if (!link) { $('km-c-link').focus(); return; }
    $('km-c-go').disabled = true; $('km-c-msg').textContent = 'Σύνδεση…';
    call('POST', '/api/km/connect', { link: link, office: office }).then(function (j) {
      $('km-c-go').disabled = false;
      if (!j || !j.ok) {
        $('km-c-msg').textContent = j && j.error === 'invite_expired' ? 'Η πρόσκληση έληξε (48 ώρες) — ζήτα νέα από τον πελάτη.' :
          j && j.error === 'bad_invite' ? 'Η πρόσκληση δεν ισχύει ή χρησιμοποιήθηκε ήδη — ζήτα νέα.' :
          j && j.error === 'bad_code' ? 'Δεν βρέθηκε κωδικός στο κείμενο. Επικόλλησε ολόκληρο τον σύνδεσμο.' : 'Σφάλμα: ' + esc((j && j.error) || 'δίκτυο');
        return;
      }
      $('km-c-msg').textContent = '✓ Συνδέθηκε. Ενεργοποιείται μόλις ο πελάτης ανοίξει το Kostometro στο κινητό του.';
      $('km-c-link').value = '';
      kmStatus();
      setTimeout(kmSyncNow, 1500);
    });
  };
  window.kmShowConnect = function () { var c = $('km-connect'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; };
  window.kmLeave = function (id) {
    if (!confirm('Αποσύνδεση από αυτή την επιχείρηση;\n\nΤα τιμολόγια που έχεις ήδη μένουν εδώ. Για να ξαναμπείς χρειάζεσαι νέα πρόσκληση από τον πελάτη.')) { return; }
    call('POST', '/api/km/links/' + id + '/disconnect').then(function () { kmStatus(); });
  };
  /* Η λήψη τρέχει στο παρασκήνιο (χιλιάδες γράμματα δεν «παγώνουν» την οθόνη): η σελίδα ρωτά ως να τελειώσει. */
  window.kmSyncNow = function () {
    $('km-sync').disabled = true; $('km-sync').textContent = '↻ Λήψη…';
    var t0 = Date.now();
    function poll() {
      return call('GET', '/api/km/status').then(function (j) {
        if (j && j.busy && Date.now() - t0 < 600000) { return new Promise(function (r) { setTimeout(r, 700); }).then(poll); }
        $('km-sync').disabled = false; $('km-sync').textContent = '↻ Λήψη τώρα';
        kmStatus(); kmSearch();
      });
    }
    return call('POST', '/api/km/sync').then(function () { return new Promise(function (r) { setTimeout(r, 300); }); }).then(poll);
  };
  window.kmFilter = function () {
    KM.q = $('km-f-q').value; KM.link = $('km-f-link').value; KM.from = $('km-f-from').value; KM.to = $('km-f-to').value;
    KM.flag = $('km-f-flag').value; KM.mode = $('km-f-mode').value; KM.page = 1;
    if (KM.timer) { clearTimeout(KM.timer); }
    KM.timer = setTimeout(kmSearch, 250);
  };
  window.kmPage = function (d) { KM.page = Math.max(1, KM.page + d); kmSearch(); };
  function qs() {
    var p = ['page=' + KM.page, 'size=' + KM.size];
    [['q', KM.q], ['link', KM.link], ['from', KM.from], ['to', KM.to], ['flag', KM.flag]].forEach(function (x) { if (x[1]) { p.push(x[0] + '=' + encodeURIComponent(x[1])); } });
    return p.join('&');
  }
  function kmSearch() {
    var path = (KM.mode === 'lines' ? '/api/km/lines?' : '/api/km/invoices?') + qs();
    return call('GET', path).then(function (j) {
      var t = $('km-table');
      if (!j || !j.ok) { t.innerHTML = '<tr><td>Σφάλμα</td></tr>'; return; }
      if (KM.mode === 'lines') {
        t.innerHTML = '<thead><tr><th>Ημερομηνία</th><th>Προμηθευτής</th><th>Κωδ.</th><th>Περιγραφή</th><th>Προϊόν</th><th>Ποσ.</th><th>Τιμή</th><th>Αξία</th><th>Τιμή μονάδας</th></tr></thead><tbody>' +
          j.items.map(function (r) {
            return '<tr class="km-row" data-inv="' + r.inv_id + '" style="cursor:pointer" onclick="kmOpen(' + r.inv_id + ')"><td>' + dt(r.inv_date) + '</td><td>' + esc(r.supplier) + '</td><td>' + esc(r.code) +
              '</td><td>' + esc(r.desc) + (r.map_changed ? ' <span title="' + esc(r.map_note) + '" style="color:#f5a524">⚠</span>' : '') + '</td><td>' + esc(r.pname || '') + '</td><td>' + num(r.qty) + ' ' + esc(r.unit || '') +
              '</td><td>' + money(r.unit_price) + '</td><td>' + money(r.line_net) + '</td><td>' + (r.base_price !== null && r.base_price !== undefined ? num(Math.round(r.base_price * 1000) / 1000) + ' €/' + ({ L: 'λτ', kg: 'κιλό', pc: 'τεμ.' }[r.base] || '') : '—') + '</td></tr>';
          }).join('') + '</tbody>';
      } else {
        t.innerHTML = '<thead><tr><th>Ημερομηνία</th><th>Επιχείρηση</th><th>Προμηθευτής</th><th>Αρ.</th><th>Γραμμές</th><th>Καθαρό</th><th>ΦΠΑ</th><th>Σύνολο</th><th>Σημάνσεις</th></tr></thead><tbody>' +
          j.items.map(function (r) {
            var fl = [];
            if (r.map_changed) { fl.push('<span class="badge badge-yellow">⚠ άλλαξε η αντιστοίχιση</span>'); }
            if (r.fix_state === 'pending') { fl.push('<span class="badge badge-yellow">✏️ διόρθωση σε αναμονή</span>'); }
            if (r.fix_state === 'applied') { fl.push('<span class="badge badge-green">✏️ διόρθωση πέρασε</span>'); }
            if (r.fix_state === 'undone') { fl.push('<span class="badge badge-red">↩ αναιρέθηκε</span>'); }
            if (r.fix_state === 'rejected') { fl.push('<span class="badge badge-red">✏️ δεν πέρασε</span>'); }
            if (r.approved === 'auto') { fl.push('<span class="badge badge-gray">αυτόματη έγκριση</span>'); }
            if (r.by_name) { fl.push('<span class="badge badge-gray">από ' + esc(r.by_name) + '</span>'); }
            return '<tr class="km-row" data-inv="' + r.id + '" style="cursor:pointer" onclick="kmOpen(' + r.id + ')"><td>' + dt(r.inv_date) + '</td><td>' + esc(r.biz || r.link_name || '') + '</td><td>' + esc(r.supplier) +
              '</td><td>' + esc(r.number || '') + '</td><td>' + r.n_lines + '</td><td>' + money(r.net) + '</td><td>' + money(r.vat) + '</td><td><b>' + money(r.total) + '</b></td><td>' + fl.join(' ') + '</td></tr>';
          }).join('') + '</tbody>';
      }
      if (!j.items.length) { t.innerHTML += '<tbody><tr><td colspan="9" style="color:var(--text2);padding:18px">Κανένα αποτέλεσμα.</td></tr></tbody>'; }
      $('km-pager').textContent = 'Σελίδα ' + j.page + ' από ' + j.pages + ' · ' + j.total + ' αποτελέσματα';
      $('km-prev').disabled = j.page <= 1; $('km-next').disabled = j.page >= j.pages;
    });
  }
  window.kmOpen = function (id) {
    return call('GET', '/api/km/invoices/' + id).then(function (j) {
      if (!j || !j.ok) { toast('Δεν βρέθηκε', 'error'); return; }
      var v = j.invoice; KM.open = v;
      var d = $('km-detail');
      var ph = v.photos.map(function (p, i) { return '<img class="km-photo" src="/api/km/invoices/' + v.id + '/photo/' + i + '" style="max-width:100%;border:1px solid var(--border);border-radius:8px;margin-bottom:8px" alt="σελίδα ' + (i + 1) + '" onerror="this.outerHTML=\'<div class=empty-sub>📷 η φωτογραφία δεν έχει κατέβει ακόμα</div>\'">'; }).join('');
      var hdr = [['number', 'Αρ. τιμολογίου', v.number], ['date', 'Ημερομηνία', v.inv_date], ['sup_vat', 'Αρ. ΦΠΑ προμηθευτή', v.sup_vat],
                 ['net', 'Καθαρό', num(v.net)], ['vat', 'ΦΠΑ', num(v.vat)], ['total', 'Σύνολο', num(v.total)]];
      var notes = [];
      if (v.fix_note) { notes.push('<div class="km-fixnote" style="padding:8px 10px;border-radius:8px;background:var(--bg3);margin-bottom:8px">' + esc(v.fix_note) + '</div>'); }
      if (v.doc_note) { notes.push('<div class="km-docnote" style="padding:8px 10px;border-radius:8px;background:rgba(245,165,36,.12);color:#f5a524;margin-bottom:8px">' + esc(v.doc_note) + '</div>'); }
      if (v.map_changed) {
        notes.push('<div class="km-mapnote" style="padding:8px 10px;border-radius:8px;background:rgba(245,165,36,.12);color:#f5a524;margin-bottom:8px">⚠ Ο πελάτης άλλαξε την αντιστοίχιση προϊόντων σε γραμμές αυτού του τιμολογίου (δες ⚠ στις γραμμές). <button class="btn btn-secondary btn-sm" id="km-seen" onclick="kmSeen(' + v.id + ')">✔ Το είδα</button></div>');
      }
      d.innerHTML = '<div class="modal-header" style="padding:14px 18px;margin:0;border-bottom:1px solid var(--border)"><div class="modal-title">' + esc(v.supplier) + ' · ' + esc(v.number || '') + ' · ' + dt(v.inv_date) + '</div>' +
        '<button class="modal-close" onclick="kmClose()">✕</button></div>' +
        '<div style="display:grid;grid-template-columns:minmax(260px,40%) 1fr;gap:16px;padding:16px;max-height:78vh;overflow:auto">' +
        '<div>' + (ph || '<div class="empty-sub">χωρίς φωτογραφία</div>') + '</div><div>' + notes.join('') +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">' + hdr.map(function (x) {
          return '<label class="form-label" style="font-size:11px">' + x[1] + '<input class="form-input km-h" data-f="' + x[0] + '" value="' + esc(x[2] === null || x[2] === undefined ? '' : x[2]) + '" style="padding:6px 8px"></label>';
        }).join('') + '</div>' +
        '<div class="line-items-wrap"><table class="line-items-table" id="km-lines"><thead><tr><th>Κωδ.</th><th>Περιγραφή</th><th>Μον.</th><th>Ποσ.</th><th>Τιμή</th><th>Έκπτ.%</th><th>Αξία</th><th>Προϊόν / συσκευασία</th></tr></thead><tbody>' +
        v.lines.map(function (ln, i) {
          var cell = function (f, val, w) { return '<td><input class="form-input km-l" data-i="' + i + '" data-f="' + f + '" value="' + esc(val) + '" style="padding:4px 6px;width:' + w + 'px"></td>'; };
          return '<tr class="km-ln' + (ln.map_changed ? ' km-map' : '') + '">' + cell('code', ln.code || '', 70) + cell('desc', ln.desc || '', 200) + cell('unit', ln.unit || '', 50) +
            cell('qty', num(ln.qty), 60) + cell('unit_price', num(ln.unit_price), 70) + cell('disc_pct', num(ln.disc_pct), 50) + cell('line_net', num(ln.line_net), 70) +
            '<td style="font-size:11px">' + esc(ln.pname || '') + (ln.per ? ' · 1 = ' + num(ln.per) + ' ' + ({ L: 'λτ', kg: 'κιλά', pc: 'τεμ.' }[ln.base] || '') : '') +
            (ln.map_changed ? '<div style="color:#f5a524">⚠ ' + esc(ln.map_note || 'άλλαξε η αντιστοίχιση') + '</div>' : '') + (ln.fixed ? '<div style="color:var(--accent)">✏️ διορθωμένο</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn btn-primary btn-sm" id="km-save" onclick="kmSaveFix()">💾 Αποθήκευση διόρθωσης</button>' +
        (v.doc_id ? '<button class="btn btn-secondary btn-sm" id="km-xero" onclick="xeroOpenPushModal(' + v.doc_id + ')">↗ Xero</button>' +
                    '<button class="btn btn-secondary btn-sm" onclick="kmClose();showPage(\'documents\')">📄 Στα Έγγραφα (#' + v.doc_id + ')</button>' : '') +
        '</div><p style="font-size:11px;color:var(--text2);margin-top:8px">Η διόρθωση ισχύει αμέσως εδώ και στις εξαγωγές. Ο πελάτης την παίρνει αυτόματα στο κινητό του και μπορεί να την αναιρέσει.' +
        (v.approved === 'auto' ? ' · Εγκρίθηκε αυτόματα στο κινητό (κλείνει με το άθροισμα).' : '') + (v.by_name ? ' · Φωτογραφήθηκε από: ' + esc(v.by_name) + '.' : '') + '</p></div></div>';
      $('km-modal').classList.add('open');
    });
  };
  window.kmClose = function () { $('km-modal').classList.remove('open'); $('km-detail').innerHTML = ''; KM.open = null; };
  window.kmSeen = function (id) { call('POST', '/api/km/invoices/' + id + '/seen').then(function () { kmOpen(id); kmSearch(); kmStatus(); }); };
  window.kmSaveFix = function () {
    var v = KM.open; if (!v) { return; }
    var h = {}, l = [];
    document.querySelectorAll('#km-detail .km-h').forEach(function (x) { h[x.getAttribute('data-f')] = x.value; });
    document.querySelectorAll('#km-detail .km-l').forEach(function (x) { l.push({ i: +x.getAttribute('data-i'), f: x.getAttribute('data-f'), n: x.value }); });
    call('POST', '/api/km/invoices/' + v.id + '/fix', { h: h, l: l }).then(function (j) {
      if (!j || !j.ok) { toast(j && j.error === 'nothing' ? 'Δεν άλλαξε τίποτα.' : 'Δεν αποθηκεύτηκε: ' + ((j && j.error) || ''), j && j.error === 'nothing' ? 'info' : 'error'); return; }
      toast('Η διόρθωση ισχύει. Φεύγει για το κινητό του πελάτη.', 'success');
      kmOpen(v.id); kmSearch();
    });
  };
})();

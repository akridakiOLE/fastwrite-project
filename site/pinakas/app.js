/* ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — app.js — 16/9/2026 (Brief Β) — Kostometro Free · PRO · FastWrite
   Μία κλήση: GET /api/km/admin/pinakas με το κλειδί στο header X-Km-Admin.
   Το πεδίο `fastwrite` της απάντησης το φέρνει ο Worker από τον Hetzner.
   ⚠ Το κλειδί ΔΕΝ μπαίνει ποτέ στο URL: θα έμενε στο ιστορικό του browser και
   στα logs κάθε proxy. Header μόνο. */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var KEY = 'pk_admin_key';
  var API = '/api/km/admin/pinakas';
  var PAGE = 100;

  /* 🔴 ΚΑΝΟΝΑΣ (Stavros, 16/9): σχεδιάζουμε για το ΜΕΓΑΛΟ. Τα φίλτρα και οι
     σελίδες ζητούνται από τον server. Ο μετρητής λέει ΠΑΝΤΑ «δείχνω X από Y»
     — ποτέ δεν παριστάνει ότι τα Y είναι X. */
  var st = { kmShown: 0, kmTotal: 0, fwShown: 0, fwTotal: 0 };

  var KM_F = { 'f-from': 'from', 'f-to': 'to', 'f-q': 'q', 'f-src': 'src', 'f-ref': 'ref', 'f-cty': 'cty', 'f-st': 'st' };
  /* Δ4 · 19/9/2026 — το 'g-plan' έφυγε μαζί με τα παλιά πακέτα. */
  var FW_F = { 'g-from': 'ffrom', 'g-to': 'fto', 'g-q': 'fq', 'g-st': 'fst' };

  /* ══ Δ2 · ΟΛΟΚΛΗΡΟ ΤΟ ΠΕΔΙΟ ΑΝΟΙΓΕΙ ΤΟ ΗΜΕΡΟΛΟΓΙΟ (19/9/2026) ══════════
     Το CSS κάνει το native εικονίδιο ορατό και μεγαλύτερο, αλλά ο χρήστης
     πατάει το ΠΕΔΙΟ — και τότε δεν ανοίγει τίποτα.
     ⚠ Το showPicker() ΡΙΧΝΕΙ εξαίρεση αν κληθεί χωρίς ενέργεια χρήστη ή αν
     το ημερολόγιο είναι ΗΔΗ ανοιχτό (ακριβώς όταν πατήθηκε το εικονίδιο).
     Χωρίς try/catch, το πάτημα στο εικονίδιο θα έριχνε σφάλμα στην κονσόλα
     σε κάθε χρήση. Και δεν υπάρχει παντού — γι' αυτό έλεγχος ύπαρξης. */
  /* Δ3 · πόσους τη φορά. Το «άλλο…» ανοίγει ελεύθερο πεδίο.
     ⚠ Ο έλεγχος εδώ είναι ΕΥΓΕΝΕΙΑ, όχι ασφάλεια: ο server κόβει στο 500
     ούτως ή άλλως, γιατί το URL το γράφει ο χρήστης και όχι εμείς. */
  function accN() {
    var sel = el('acc-n'), nx = el('acc-nx');
    var v = (sel && sel.value === '__x') ? parseInt((nx && nx.value) || '100', 10)
                                         : parseInt((sel && sel.value) || '100', 10);
    if (!isFinite(v) || v < 1) { v = 100; }
    return Math.min(v, 500);
  }
  function wireAccN() {
    var sel = el('acc-n'), nx = el('acc-nx');
    if (!sel || !nx) { return; }
    sel.onchange = function () {
      nx.hidden = sel.value !== '__x';
      if (sel.value !== '__x') { loadKm(false); } else { nx.focus(); }
    };
    /* Αλλαγή μεγέθους = ΞΑΝΑ από την κορυφή. Αλλιώς ανακατεύονται σελίδες
       δύο μεγεθών πάνω από τον ίδιο σελιδοδείκτη και βλέπεις διπλές γραμμές. */
    nx.onchange = function () { loadKm(false); };
  }

  function wireDatePickers() {
    var ds = document.querySelectorAll('input[type="date"]');
    for (var i = 0; i < ds.length; i++) {
      ds[i].addEventListener('click', function (e) {
        var inp = e.currentTarget;
        if (typeof inp.showPicker !== 'function') { return; }
        try { inp.showPicker(); } catch (err) {}
      });
    }
  }

  function val(id) { var e = el(id); return e ? String(e.value || '').trim() : ''; }
  function qsFrom(map) {
    var p = new URLSearchParams();
    for (var id in map) { if (val(id)) p.set(map[id], val(id)); }
    return p;
  }
  function countOn(map) { var k = 0; for (var id in map) { if (val(id)) k++; } return k; }
  function badge(id, map) { el(id).textContent = countOn(map) ? '(' + countOn(map) + ')' : ''; }
  function fmtN(n) { return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function counter(host, btn, shown, total) {
    el(host).innerHTML = total === 0 ? '<span class="muted">κανένας</span>'
      : (shown >= total ? 'όλοι οι <b>' + fmtN(total) + '</b>'
                        : 'δείχνω <b>' + fmtN(shown) + '</b> από <b>' + fmtN(total) + '</b>');
    el(btn).hidden = shown >= total;
  }
  function api(p) {
    var k = key();
    p.set('nc', Date.now());
    return fetch(API + '?' + p.toString(), { headers: { 'X-Km-Admin': k }, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) { throw { key: true }; }
        if (!r.ok) { throw new Error('Ο server απάντησε ' + r.status); }
        return r.json();
      });
  }
  function fillSel(id, values, allLabel) {
    var e = el(id), cur = e.value;
    var opts = ['<option value="">' + allLabel + '</option>'];
    (values || []).forEach(function (v) {
      if (v === null || v === undefined || v === '') return;
      opts.push('<option value="' + esc(v) + '">' + esc(v) + '</option>');
    });
    e.innerHTML = opts.join('');
    if (cur) { e.value = cur; if (e.value !== cur) { e.insertAdjacentHTML('beforeend', '<option value="' + esc(cur) + '">' + esc(cur) + '</option>'); e.value = cur; } }
  }

  function key() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  }
  function ago(iso) {
    if (!iso) return '<span class="muted">ποτέ</span>';
    var ms = Date.now() - Date.parse(iso);
    if (isNaN(ms)) return '—';
    var m = Math.floor(ms / 60000);
    if (m < 60) return m + '′';
    var h = Math.floor(m / 60);
    if (h < 48) return h + ' ώρ.';
    return Math.floor(h / 24) + ' ημ.';
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bars(host, rows, labKey) {
    if (!rows || !rows.length) { host.innerHTML = '<p class="fine muted">τίποτα ακόμα</p>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; })) || 1;
    host.innerHTML = rows.map(function (r) {
      return '<div class="bar"><div class="lab" title="' + esc(r[labKey]) + '">' + esc(r[labKey]) + '</div>' +
             '<div class="trk"><div class="fil" style="width:' + Math.round(100 * r.n / max) + '%"></div></div>' +
             '<div class="val">' + r.n + '</div></div>';
    }).join('');
  }

  /* Ο διακόπτης του φράγματος (Δ1). Γυρίζει ΜΑΖΙ με τις οθόνες — αλλιώς το
     CSS με !important θα κρατούσε κρυφή την οθόνη που μόλις ζητήθηκε. */
  function gate(which) {
    try { document.documentElement.setAttribute('data-gate', which); } catch (e) {}
  }
  function showKeyScreen(msg) {
    gate('key');
    el('s-key').hidden = false; el('s-data').hidden = true;
    el('key-err').hidden = !msg; el('key-err').textContent = msg || '';
    el('key').value = '';
    el('key').focus();
  }

  function render(j) {
    var t = j.totals;
    el('at').textContent = 'ανανεώθηκε ' + fmtDate(j.at);
    el('k-live').textContent = t.live;
    el('k-new1').textContent = t.new_1d;
    el('k-new7').textContent = t.new_7d;
    el('k-new30').textContent = t.new_30d;
    el('k-act7').textContent = t.active_7d;
    el('k-data').textContent = t.with_data;
    el('k-pend').textContent = t.pending_delete;
    el('k-tomb').textContent = t.tombstones;
    el('k-bytes').textContent = fmtBytes(t.bytes);
    el('k-gem').textContent = t.with_gemini_key;

    /* 30 ημέρες — γεμίζουμε ΚΑΙ τις άδειες μέρες, αλλιώς το γράφημα λέει ψέματα
       (τρεις εγγραφές σε τρεις διαδοχικές στήλες μοιάζουν με τρεις συνεχόμενες
       μέρες ακόμα κι αν είναι 1/9, 12/9, 15/9). */
    var byDay = {}; (j.per_day || []).forEach(function (r) { byDay[r.day] = r.n; });
    var days = [], today = new Date(j.at);
    for (var i = 29; i >= 0; i--) {
      var d = new Date(today); d.setUTCDate(d.getUTCDate() - i);
      var k = d.toISOString().slice(0, 10);
      days.push({ day: k, n: byDay[k] || 0 });
    }
    var mx = Math.max.apply(null, days.map(function (x) { return x.n; })) || 1;
    el('days').innerHTML = days.map(function (x) {
      return '<div class="d' + (x.n ? '' : ' zero') + '" style="height:' + (x.n ? Math.max(6, Math.round(100 * x.n / mx)) : 3) + '%" title="' + x.day + ': ' + x.n + '"></div>';
    }).join('');
    el('days-from').textContent = days[0].day.slice(5).split('-').reverse().join('/');
    el('days-to').textContent = 'σήμερα';

    bars(el('src'), j.by_source, 'source');
    bars(el('ref'), j.by_ref, 'ref');

    el('k-dev').textContent = j.devices.distinct;
    el('k-dev7').textContent = j.devices.seen_7d;
    el('k-mail').textContent = j.mail_30d.ok + (j.mail_30d.failed ? ' / ' + j.mail_30d.failed + '🔴' : '');
    el('k-fb').textContent = j.feedback.n;
    el('k-more').innerHTML =
      'Συσκευές με ανέβαστα: <b>' + j.devices.with_unsynced + '</b> · ' +
      'Email που απέτυχαν (30 ημ.): <b>' + j.mail_30d.failed + '</b> · ' +
      'Μέσος όρος αστεριών: <b>' + (j.feedback.avg_stars || '—') + '</b> · ' +
      'Θέλουν απάντηση: <b>' + j.feedback.want_reply + '</b>';

    var p = j.pending_deletions || [];
    el('c-pend').hidden = !p.length;
    el('pend').innerHTML = p.map(function (r) {
      return '<tr><td class="mono">' + esc(r.folder) + '…</td><td>' + fmtDate(r.delete_requested_at) + '</td><td><b>' + fmtDate(r.delete_due_at) + '</b></td></tr>';
    }).join('');

    /* ── ΖΩΝΗ 2: Kostometro PRO ── */
    var paid = (j.subscriptions && j.subscriptions.paid) || 0;
    el('k-paid').textContent = paid;
    el('k-free').textContent = Math.max(0, (t.live || 0) - paid);
    el('sub').innerHTML = '<b>(δ) Συνδρομές:</b> ' + (paid ? paid + ' πληρωμένες.' : 'καμία πληρωμένη ακόμα — όλοι στο δωρεάν. Ανοίγει όταν μπει το PRO.');
    el('rew').innerHTML = '<b>(β) Επιβράβευση:</b> ' + esc(j.rewards && j.rewards.note ? j.rewards.note : 'περιμένει');

    /* ── ΖΩΝΗ 3: FastWrite Desktop ── */
    renderFastWrite(j.fastwrite);

    var o = j.options || {};
    fillSel('f-src', o.sources, 'όλες');
    fillSel('f-ref', o.refs, 'όλες');
    fillSel('f-cty', o.countries, 'όλες');
    renderKmAcc(j, false);
  }

  function kmRow(r) {
    var tags = '';
    if (r.delete_due_at) tags += ' <span class="tag dng">διαγραφή ' + fmtDate(r.delete_due_at) + '</span>';
    if (r.plan) tags += ' <span class="tag acc">' + esc(r.plan) + '</span>';
    return '<div class="row">' +
      '<div class="em">' + esc(r.email) + tags + '</div>' +
      '<div class="meta">' +
        '<span>από <b>' + esc(r.source || '?') + '</b>' + (r.country ? ' · ' + esc(r.country) : '') + '</span>' +
        '<span>σύσταση ' + (r.ref ? '<b class="tag acc">' + esc(r.ref) + '</b>' : '<span class="muted">—</span>') + '</span>' +
        '<span>εγγραφή <b>' + fmtDate(r.created) + '</b></span>' +
        '<span>sync <b>' + ago(r.last_sync) + '</b>' + (r.folder_version ? ' <span class="muted">v' + r.folder_version + '</span>' : '') + '</span>' +
        '<span>συσκευές <b>' + (r.devices || 0) + '</b></span>' +
      '</div></div>';
  }

  function renderKmAcc(j, append) {
    var a = j.accounts || [];
    /* Δ3 · το σύνολο μετριέται ΜΙΑ φορά ανά φίλτρο: σε «κι άλλους» ο server
       στέλνει null και κρατάμε αυτό που ήδη ξέρουμε. Χωρίς αυτό, το
       ακριβό COUNT(*) θα έτρεχε σε κάθε πάτημα. */
    if (j.accounts_total !== null && j.accounts_total !== undefined) {
      st.kmTotal = Number(j.accounts_total) || 0;
    }
    st.kmNext = j.next || null;
    st.kmShown = append ? st.kmShown + a.length : a.length;
    var html = a.map(kmRow).join('');
    if (append) { el('acc').insertAdjacentHTML('beforeend', html); }
    else { el('acc').innerHTML = html || '<p class="fine muted">κανένας λογαριασμός με αυτά τα φίλτρα</p>'; }
    el('n-acc').textContent = '(' + fmtN(st.kmTotal) + ')';
    counter('acc-cnt', 'acc-more', st.kmShown, st.kmTotal);
    /* Ο σελιδοδείκτης είναι η ΑΛΗΘΕΙΑ για το αν υπάρχει συνέχεια — όχι η
       σύγκριση shown >= total, που ψεύδεται αν μπει νέα εγγραφή όσο κυλάμε. */
    el('acc-more').hidden = !st.kmNext;
    badge('km-flt-on', KM_F);
  }

  function renderFastWrite(f) {
    var off = !f || f.ok !== true;
    el('fw-off').hidden = !off;
    el('fw-err').hidden = !off;
    ['fw-c1', 'fw-c2', 'fw-c3'].forEach(function (id) { el(id).hidden = off; });
    if (off) {
      var why = (f && f.error) || 'no_data';
      var txt = {
        no_key: 'Ο Worker δεν έχει κλειδί για τον Hetzner.',
        http_404: 'Ο Hetzner απάντησε «δεν υπάρχει» — λείπει το km_admin_key.txt στον server ή δεν ταιριάζει το κλειδί.',
        TimeoutError: 'Ο Hetzner δεν απάντησε σε 4 δευτερόλεπτα.',
        bad_body: 'Ο Hetzner απάντησε κάτι που δεν είναι ο πίνακας.'
      }[why] || ('Ο Hetzner δεν απάντησε (' + esc(why) + ').');
      el('fw-err').textContent = 'FastWrite: ' + txt + ' Τα νούμερα Kostometro είναι κανονικά.';
      return;
    }
    var u = f.users || {}, i = f.installs || {}, sb = f.subscriptions || {}, d = f.documents || {}, fb = f.feedback || {};
    el('f-users').textContent = u.total || 0;
    el('f-active').textContent = u.active || 0;
    el('f-new7').textContent = u.new_7d || 0;
    el('f-new30').textContent = u.new_30d || 0;
    el('f-inst').textContent = i.total || 0;
    el('f-seen7').textContent = i.seen_7d || 0;
    /* έγγραφα στον server / έγγραφα που μέτρησαν οι εγκαταστάσεις (τοπικά) */
    el('f-docs').innerHTML = (Number(d.total) || 0) +
      (Number(i.docs_total) ? ' <span class="muted" style="font-size:14px">/ ' + Number(i.docs_total) + '</span>' : '');
    el('f-pay').textContent = sb.paying || 0;
    el('f-more').innerHTML =
      'Νέοι σήμερα: <b>' + (u.new_1d || 0) + '</b> · ' +
      'Με 2FA: <b>' + (u.with_2fa || 0) + '</b> · ' +
      'Διαχειριστές: <b>' + (u.admins || 0) + '</b> · ' +
      'Είδαμε 30 ημ.: <b>' + (i.seen_30d || 0) + '</b> · ' +
      'Έγγραφα 30 ημ.: <b>' + (d.d30 === null || d.d30 === undefined ? '—' : d.d30) + '</b> · ' +
      'Γνώμες: <b>' + (fb.total || 0) + '</b>' + (fb.d30 ? ' (' + fb.d30 + ' σε 30 ημ.)' : '');

    var vers = (i.by_version || []).map(function (r) { return { lab: r.v || '(χωρίς έκδοση)', n: r.n }; });
    bars(el('f-vers'), vers, 'lab');

    renderFwAcc(f, false);
  }

  function fwRow(r) {
    var tags = '';
    if (r.role === 'admin') tags += ' <span class="tag">admin</span>';
    if (!r.is_active) tags += ' <span class="tag dng">ανενεργός</span>';
    if (r.plan) tags += ' <span class="tag acc">' + esc(r.plan) + (r.sub_status && r.sub_status !== 'active' ? ' · ' + esc(r.sub_status) : '') + '</span>';
    return '<div class="row">' +
      '<div class="em">' + esc(r.username) + (r.email ? ' <span class="muted" style="font-weight:400">' + esc(r.email) + '</span>' : '') + tags + '</div>' +
      '<div class="meta">' +
        '<span>εγγραφή <b>' + fmtDate(r.created_at) + '</b></span>' +
        '<span>είδαμε <b>' + ago(r.last_seen) + '</b></span>' +
        '<span>έγγραφα <b>' + (r.docs || 0) + '</b></span>' +
        '<span>συσκευές <b>' + (r.devices || 0) + '</b></span>' +
      '</div></div>';
  }

  function renderFwAcc(f, append) {
    var a = f.accounts || [];
    st.fwTotal = Number(f.accounts_total) || 0;
    st.fwShown = append ? st.fwShown + a.length : a.length;
    var html = a.map(fwRow).join('');
    if (append) { el('f-acc').insertAdjacentHTML('beforeend', html); }
    else { el('f-acc').innerHTML = html || '<p class="fine muted">κανένας λογαριασμός με αυτά τα φίλτρα</p>'; }
    el('f-nacc').textContent = '(' + fmtN(st.fwTotal) + ')';
    counter('f-acc-cnt', 'f-acc-more', st.fwShown, st.fwTotal);
    badge('fw-flt-on', FW_F);
  }

  var busy = false;
  function fail(e) {
    if (e && e.key) {
      /* 404 = λάθος κλειδί (ή κανένα). Ο server δεν ξεχωρίζει επίτηδες. */
      try { localStorage.removeItem(KEY); } catch (x) {}
      showKeyScreen('Το κλειδί δεν έγινε δεκτό. Ο server απαντά ότι η διαδρομή δεν υπάρχει — έτσι κάνει σε κάθε λάθος κλειδί.');
      return;
    }
    el('s-data').hidden = false;
    el('err').hidden = false;
    el('err').textContent = (e && e.message) ? e.message
      : 'Χωρίς σύνδεση. Τα νούμερα ΔΕΝ ανανεώθηκαν — δεν δείχνουμε παλιά νούμερα σαν σημερινά.';
  }
  function done() { busy = false; el('b-refresh').disabled = false; el('b-refresh').textContent = 'Ανανέωση'; }

  /* Πλήρης φόρτωση: σύνολα + πρώτη σελίδα και των δύο λιστών, μία κλήση. */
  function load() {
    if (!key()) { showKeyScreen(); return; }
    if (busy) return; busy = true;
    el('b-refresh').disabled = true; el('b-refresh').textContent = '…';
    el('err').hidden = true;
    var p = qsFrom(KM_F);
    qsFrom(FW_F).forEach(function (v, k) { p.set(k, v); });
    /* Η πρώτη φόρτωση σέβεται κι αυτή την επιλογή μεγέθους. Το fn μένει
       PAGE: η ζώνη FastWrite είναι ο Hetzner και δεν άλλαξε (Δ3 = Kostometro). */
    p.set('n', accN()); p.set('fn', PAGE);
    api(p).then(function (j) {
      gate('data');
      el('s-key').hidden = true; el('s-data').hidden = false;
      render(j);
    }).catch(fail).then(done);
  }

  /* Μόνο η λίστα του Kostometro: αλλαγή φίλτρου ή «κι άλλους».
     ΔΕΝ ξαναϋπολογίζει σύνολα, ΔΕΝ ξαναρωτάει τον Hetzner. */
  function loadKm(append) {
    if (!key() || busy) return; busy = true;
    var b = el('acc-more'); b.disabled = true;
    var p = qsFrom(KM_F);
    /* Δ3 · ΣΕΛΙΔΟΔΕΙΚΤΗΣ αντί για OFFSET. Στέλνουμε πού σταματήσαμε, όχι
       πόσα να προσπεράσει: η 200ή σελίδα κοστίζει όσο η πρώτη. */
    p.set('only', 'km'); p.set('n', accN());
    if (append && st.kmNext) { p.set('ac', st.kmNext.c); p.set('ar', st.kmNext.r); }
    api(p).then(function (j) { renderKmAcc(j, append); })
      .catch(fail).then(function () { busy = false; b.disabled = false; done(); });
  }

  /* Μόνο η λίστα του FastWrite. */
  function loadFw(append) {
    if (!key() || busy) return; busy = true;
    var b = el('f-acc-more'); b.disabled = true;
    var p = qsFrom(FW_F);
    p.set('only', 'fw'); p.set('fn', PAGE); p.set('foff', append ? st.fwShown : 0);
    api(p).then(function (j) {
      var f = j.fastwrite || {};
      if (f.ok !== true) { renderFastWrite(f); return; }
      renderFwAcc(f, append);
    }).catch(fail).then(function () { busy = false; b.disabled = false; done(); });
  }

  function clearF(map) { for (var id in map) { el(id).value = ''; } }

  el('f-go').onclick = function () { loadKm(false); };
  el('f-clr').onclick = function () { clearF(KM_F); loadKm(false); };
  el('acc-more').onclick = function () { loadKm(true); };
  el('g-go').onclick = function () { loadFw(false); };
  el('g-clr').onclick = function () { clearF(FW_F); loadFw(false); };
  el('f-acc-more').onclick = function () { loadFw(true); };
  el('f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); loadKm(false); } });
  el('g-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); loadFw(false); } });

  el('b-save').onclick = function () {
    var v = (el('key').value || '').trim();
    if (v.length < 16) { el('key-err').hidden = false; el('key-err').textContent = 'Πολύ κοντό για κλειδί.'; return; }
    try { localStorage.setItem(KEY, v); } catch (e) {}
    load();
  };
  el('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('b-save').click(); });
  el('b-refresh').onclick = load;
  el('b-key').onclick = function () { showKeyScreen(); };

  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/pinakas/sw.js').catch(function () {}); }
  wireDatePickers();
  wireAccN();
  load();
})();

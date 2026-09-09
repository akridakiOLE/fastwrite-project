/* Η.11 · ΟΡΙΣΤΙΚΗ ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ (Brief Η.11, 9/9/2026)
   Τρέχει κατά του τοπικού wrangler dev (127.0.0.1:8788, D1/R2 τοπικά).
   Κάθε φρουρός εδώ ΠΡΕΠΕΙ να αποδειχθεί ότι κοκκινίζει όταν βγει (Α400 §Γ 3/9).

   🔴 Η ΑΠΟΔΕΙΞΗ ΔΕΝ ΕΙΝΑΙ Η ΑΠΑΝΤΗΣΗ ΤΗΣ ΔΙΑΓΡΑΦΗΣ. Κάθε έλεγχος εδώ διαβάζει
   τη ΒΑΣΗ και το R2 μέσω /api/km/admin/inspect (read-only) — όχι το «ok» που
   τύπωσε αυτός που έκανε τη δουλειά. Κανόνας 29/8: ο έλεγχος στο τεκμήριο. */
const { test, expect, request: pwRequest } = require('@playwright/test');
const B = 'http://127.0.0.1:8788';
const crypto = require('crypto');

const ADMIN = 'test-admin-key-h11';
function hex(n) { return crypto.randomBytes(n).toString('hex'); }
const J = { 'Content-Type': 'application/json' };
const email = (p) => p + Date.now() + Math.random().toString(36).slice(2) + '@example.com';
const wrapped = () => hex(60);

function ldev(folder, lock, auth, device) {
  return { 'X-Km-Folder': folder, 'X-Km-Lock': lock, 'X-Km-Auth': auth, 'X-Km-Device': device };
}
const bin = (n) => Buffer.alloc(n, 7);

// Λογαριασμός v47 με ΠΡΑΓΜΑΤΙΚΟ περιεχόμενο: folder.bin + 2 φωτογραφίες + 1 inbox.
// Χωρίς περιεχόμενο, ένα «σβήστηκαν όλα» δεν αποδεικνύει τίποτα.
async function fullAccount(api, extra) {
  const id = { folder: hex(32), lock: hex(32), auth: hex(32), device: 'km_' + hex(6),
               wk: wrapped(), email: email('h11-') };
  const H = ldev(id.folder, id.lock, id.auth, id.device);
  const r = await api.post(B + '/api/km/register', {
    headers: Object.assign({}, J, H),
    data: Object.assign({ email: id.email, wrapped_k: id.wk, device_name: 'Α', source: 'store:play', ref: 'REF7' }, extra || {})
  });
  expect(r.status(), await r.text()).toBe(200);
  expect((await r.json()).account).toBe('new');

  expect((await api.put(B + '/api/km/folder', { headers: H, data: bin(400) })).status()).toBe(200);
  expect((await api.put(B + '/api/km/photo?id=inv1', { headers: H, data: bin(300) })).status()).toBe(200);
  expect((await api.put(B + '/api/km/photo?id=inv2', { headers: H, data: bin(300) })).status()).toBe(200);

  // δεύτερη συσκευή που έγινε ενεργή και μετά έβαλε τα δικά της στο inbox
  const d2 = 'km_' + hex(6);
  const H2 = ldev(id.folder, id.lock, id.auth, d2);
  expect((await api.post(B + '/api/km/activate', { headers: H2 })).status()).toBe(200);
  expect((await api.put(B + '/api/km/inbox', { headers: H, data: bin(120) })).status()).toBe(200);
  // η πρώτη ξαναγίνεται ενεργή, ώστε τα τεστ να ξέρουν ποια είναι
  expect((await api.post(B + '/api/km/activate', { headers: H })).status()).toBe(200);
  id.H = H; id.other = d2; id.Hother = H2;
  return id;
}

async function inspect(api, folder) {
  const r = await api.post(B + '/api/km/admin/inspect?k=' + ADMIN, { headers: J, data: { folder_id: folder } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

test('Η11-1 · η διαγραφή αφήνει ΜΗΔΕΝ στο R2 — και στα τρία prefixes — και μηδέν γραμμές στους τρεις πίνακες', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);

  const before = await inspect(api, id.folder);
  expect(before.r2.folder).toBe(1);
  expect(before.r2.photos).toBe(2);
  expect(before.r2.inbox).toBe(1);
  expect(before.rows.locks).toBe(1);
  expect(before.rows.device_links).toBe(2);
  expect(before.rows.devices).toBeGreaterThan(0);

  const del = await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.H), data: { confirm: 'ΔΙΑΓΡΑΦΗ' } });
  expect(del.status(), await del.text()).toBe(200);
  const dj = await del.json();
  expect(dj.deleted.r2.objects).toBe(4);

  const after = await inspect(api, id.folder);
  expect(after.r2.objects).toBe(0);
  expect(after.r2.folder).toBe(0);
  expect(after.r2.photos).toBe(0);
  expect(after.r2.inbox).toBe(0);
  expect(after.rows.locks).toBe(0);
  expect(after.rows.device_links).toBe(0);
  expect(after.rows.devices).toBe(0);
});

test('Η11-2 · η ταφόπετρα ΚΡΑΤΑΕΙ στατιστικά (source/ref/country/created) και ΔΕΝ κρατάει πρόσωπο', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.H), data: { confirm: 'ΔΙΑΓΡΑΦΗ' } });

  const a = (await inspect(api, id.folder)).account;
  expect(a).not.toBeNull();                 // η γραμμή ΜΕΝΕΙ (απόφαση Stavros 9/9)
  expect(a.source).toBe('store:play');      // τα στατιστικά ΜΕΝΟΥΝ
  expect(a.ref).toBe('REF7');
  expect(a.created).toBeTruthy();
  expect(a.deleted).toBeTruthy();
  expect(a.email_empty).toBe(true);         // το πρόσωπο ΦΕΥΓΕΙ
  expect(a.auth_hash_empty).toBe(true);
  expect(a.active_device_id).toBeFalsy();
  expect(a.folder_bytes).toBe(0);
  expect(a.folder_version).toBe(0);

  // και δεν ξαναβρίσκεται από το email
  const look = await api.get(B + '/api/km/lookup?email=' + encodeURIComponent(id.email));
  expect((await look.json()).exists).toBe(false);
});

test('Η11-3 · 🔴 ΣΥΣΚΕΥΗ ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ ΔΕΝ ΔΙΑΓΡΑΦΕΙ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ — ούτε με σωστές 12 λέξεις', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  // η id.other έχει ΣΩΣΤΟ auth αλλά ΔΕΝ είναι πια η ενεργή (κλεμμένο κινητό)
  const r = await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.Hother), data: { confirm: 'ΔΙΑΓΡΑΦΗ' } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error).toBe('not_active_device');

  const after = await inspect(api, id.folder);   // ΤΙΠΟΤΑ δεν άλλαξε
  expect(after.account.deleted).toBeNull();
  expect(after.r2.objects).toBe(4);
  expect(after.rows.locks).toBe(1);
});

test('Η11-4 · χωρίς τη λέξη ΔΙΑΓΡΑΦΗ δεν σβήνει τίποτα — ο έλεγχος ζει στον server, όχι στην οθόνη', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  for (const body of [{}, { confirm: '' }, { confirm: 'ναι' }, { confirm: 'DELETE' }, { confirm: 'διαγραφη' }]) {
    const r = await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.H), data: body });
    expect(r.status(), JSON.stringify(body)).toBe(400);
    expect((await r.json()).error).toBe('confirm_required');
  }
  expect((await inspect(api, id.folder)).r2.objects).toBe(4);
});

test('Η11-5 · μετά τη διαγραφή ΚΑΘΕ πόρτα είναι κλειστή — και οι ίδιες 12 λέξεις είναι νεκρές για πάντα', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.H), data: { confirm: 'ΔΙΑΓΡΑΦΗ' } });

  expect((await api.get(B + '/api/km/status', { headers: id.H })).status()).toBe(410);
  expect((await api.get(B + '/api/km/folder', { headers: id.H })).status()).toBe(410);
  expect((await api.put(B + '/api/km/folder', { headers: id.H, data: bin(50) })).status()).toBe(410);
  expect((await api.put(B + '/api/km/photo?id=inv9', { headers: id.H, data: bin(50) })).status()).toBe(410);
  expect((await api.post(B + '/api/km/activate', { headers: id.H })).status()).toBe(410);
  expect((await api.put(B + '/api/km/inbox', { headers: id.H, data: bin(50) })).status()).toBe(410);

  // ΚΑΜΙΑ ΕΠΑΝΑΦΟΡΑ: ίδιο folder_id (= ίδιες 12 λέξεις) δεν ξαναφτιάχνει λογαριασμό
  const re = await api.post(B + '/api/km/register', {
    headers: Object.assign({}, J, id.H), data: { email: id.email, wrapped_k: id.wk }
  });
  expect(re.status()).toBe(410);

  // η κλειδαριά έφυγε: το unlock δεν βρίσκει τίποτα (403, ίδια απάντηση με λάθος κωδικό)
  const u = await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_new' } });
  expect(u.status()).toBe(403);
});

test('Η11-6 · η πράξη είναι idempotent: δεύτερη κλήση δεν σπάει και ΔΕΝ ξαναγράφει το πότε έφυγε', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  await api.post(B + '/api/km/delete', { headers: Object.assign({}, J, id.H), data: { confirm: 'ΔΙΑΓΡΑΦΗ' } });
  // ⚠ Η ΩΡΑ ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΤΗ ΒΑΣΗ, ΟΧΙ ΑΠΟ ΤΗΝ ΑΠΑΝΤΗΣΗ ΤΗΣ ΔΙΑΓΡΑΦΗΣ.
  // Η πρώτη γραφή του τεστ σύγκρινε δύο ΑΝΑΦΟΡΕΣ μεταξύ τους — και έμενε
  // πράσινη ακόμα κι όταν η βάση ξαναγραφόταν, γιατί η αναφορά κρατούσε την
  // παλιά τιμή στη μνήμη. Το έπιασε η μετάλλαξη, όχι η ανάγνωση (κανόνας 29/8).
  const when = (await inspect(api, id.folder)).account.deleted;
  expect(when).toBeTruthy();

  await new Promise((r) => setTimeout(r, 1100));
  const second = await api.post(B + '/api/km/admin/delete?k=' + ADMIN, { headers: J, data: { folder_id: id.folder } });
  expect(second.status()).toBe(200);
  const sj = await second.json();
  expect(sj.deleted.was_already_deleted).toBe(true);
  expect(sj.deleted.r2.objects).toBe(0);
  expect((await inspect(api, id.folder)).account.deleted).toBe(when);
});

test('Η11-7 · χωρίς το μυστικό, οι admin διαδρομές ΔΕΝ ΥΠΑΡΧΟΥΝ (404, όχι 403)', async () => {
  const api = await pwRequest.newContext();
  const id = await fullAccount(api);
  for (const p of ['/api/km/admin/delete', '/api/km/admin/purge', '/api/km/admin/inspect']) {
    expect((await api.post(B + p, { headers: J, data: { folder_id: id.folder } })).status()).toBe(404);
    expect((await api.post(B + p + '?k=wrong', { headers: J, data: { folder_id: id.folder } })).status()).toBe(404);
  }
  expect((await inspect(api, id.folder)).r2.objects).toBe(4);
});

test('Η11-8 · 🔴 Ο ΚΑΘΑΡΙΣΜΟΣ ΜΗΤΡΩΟΥ ΔΕΝ ΑΓΓΙΖΕΙ ΛΟΓΑΡΙΑΣΜΟ ΜΕ ΔΕΔΟΜΕΝΑ — ίδιο email, διαφορετική τύχη', async () => {
  const api = await pwRequest.newContext();
  const shared = email('h11same-');

  // ο ΖΩΝΤΑΝΟΣ: ίδιο email, έχει φάκελο και κλειδαριά (= ο πραγματικός του Stavros)
  const live = await fullAccount(api);
  await api.post(B + '/api/km/register', { headers: Object.assign({}, J, live.H), data: { email: shared } });
  // ⚠ το email δεν αλλάζει από το register σε υπάρχοντα — φτιάχνουμε ρητά ζωντανό με το κοινό email:
  const live2 = { folder: hex(32), lock: hex(32), auth: hex(32), device: 'km_' + hex(6), wk: wrapped() };
  const H2 = ldev(live2.folder, live2.lock, live2.auth, live2.device);
  await api.post(B + '/api/km/register', { headers: Object.assign({}, J, H2), data: { email: shared, wrapped_k: live2.wk } });
  expect((await api.put(B + '/api/km/folder', { headers: H2, data: bin(500) })).status()).toBe(200);

  // δύο ΑΔΕΙΟΙ με ΤΟ ΙΔΙΟ email (ακριβώς οι δύο του Stavros από παλιό «Μηδενισμό εγγραφής»)
  const empties = [];
  for (let i = 0; i < 2; i++) {
    const e = { folder: hex(32), auth: hex(32), device: 'km_' + hex(6) };
    await api.post(B + '/api/km/register', {
      headers: Object.assign({}, J, { 'X-Km-Folder': e.folder, 'X-Km-Auth': e.auth, 'X-Km-Device': e.device }),
      data: { email: shared }
    });
    empties.push(e.folder);
  }

  // dry_run (προεπιλογή): βλέπει ΜΟΝΟ τους δύο άδειους, και ΔΕΝ σβήνει τίποτα
  const dry = await api.post(B + '/api/km/admin/purge?k=' + ADMIN, { headers: J, data: { email_like: shared } });
  expect(dry.status(), await dry.text()).toBe(200);
  const dj = await dry.json();
  expect(dj.dry_run).toBe(true);
  expect(dj.found).toBe(2);
  expect(dj.plan.map((p) => p.folder_id).sort()).toEqual(empties.slice().sort());
  expect((await inspect(api, empties[0])).exists).toBe(true);

  // εκτέλεση
  const run = await api.post(B + '/api/km/admin/purge?k=' + ADMIN, { headers: J, data: { email_like: shared, dry_run: false } });
  const rj = await run.json();
  expect(rj.purged).toBe(2);

  // οι άδειοι έγιναν ταφόπετρες...
  for (const f of empties) expect((await inspect(api, f)).account.deleted).toBeTruthy();
  // ...και ο ΖΩΝΤΑΝΟΣ με το ΙΔΙΟ email δεν αγγίχτηκε καθόλου
  const survivor = await inspect(api, live2.folder);
  expect(survivor.account.deleted).toBeNull();
  expect(survivor.account.email).toBe(shared);
  expect(survivor.r2.folder).toBe(1);
  expect(survivor.rows.locks).toBe(1);
});

test('Η11-9 · ο καθαρισμός αρνείται πολύ πλατύ φίλτρο, και δέχεται ρητή λίστα', async () => {
  const api = await pwRequest.newContext();
  for (const bad of ['%', '%%', 'a%b']) {
    const r = await api.post(B + '/api/km/admin/purge?k=' + ADMIN, { headers: J, data: { email_like: bad } });
    expect(r.status(), bad).toBe(400);
    expect((await r.json()).error).toBe('email_like_too_broad');
  }
  const r2 = await api.post(B + '/api/km/admin/purge?k=' + ADMIN, { headers: J, data: {} });
  expect((await r2.json()).error).toBe('need_folder_ids_or_email_like');

  // ρητή λίστα: σβήνει ΚΑΙ γεμάτο φάκελο (η Πόρτα Β — αίτημα με email στο support)
  const id = await fullAccount(api);
  const run = await api.post(B + '/api/km/admin/purge?k=' + ADMIN, { headers: J, data: { folder_ids: [id.folder], dry_run: false } });
  expect((await run.json()).purged).toBe(1);
  expect((await inspect(api, id.folder)).r2.objects).toBe(0);
});

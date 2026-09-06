/* Η.13 · Η ΝΕΑ ΒΑΣΗ Κ (Brief Γ, Α350 §9.8 Η.13, 6/9/2026) — server + crypto.
   Τρέχει κατά του τοπικού wrangler dev (127.0.0.1:8788, D1/R2 τοπικά).
   Κάθε φρουρός εδώ αποδείχθηκε ότι κοκκινίζει όταν βγει (Α400 §Γ, 3/9). */
const { test, expect, request: pwRequest } = require('@playwright/test');
const B = 'http://127.0.0.1:8788';
const APP = B + '/kostometro/';
const crypto = require('crypto');

function hex(n) { return crypto.randomBytes(n).toString('hex'); }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const J = { 'Content-Type': 'application/json' };
// v46 ταυτότητα (χωρίς κλειδαριά)
function dev(folder, auth, device) {
  return { 'X-Km-Folder': folder, 'X-Km-Auth': auth, 'X-Km-Device': device };
}
// v47 ταυτότητα (με κλειδαριά)
function ldev(folder, lock, auth, device, unsynced) {
  const h = { 'X-Km-Folder': folder, 'X-Km-Lock': lock, 'X-Km-Auth': auth, 'X-Km-Device': device };
  if (unsynced !== undefined) h['X-Km-Unsynced'] = String(unsynced);
  return h;
}
const wrapped = () => hex(60);   // 120 hex — ο server δεν ανοίγει το Κ, μόνο το φυλάει
const email = (p) => p + Date.now() + Math.random().toString(36).slice(2) + '@example.com';

// Νέος λογαριασμός v47: folder τυχαίο, κλειδαριά στην ίδια κλήση.
async function newV47(api, extra) {
  const id = { folder: hex(32), lock: hex(32), auth: hex(32), device: 'km_' + hex(6), wk: wrapped() };
  const r = await api.post(B + '/api/km/register', {
    headers: Object.assign({}, J, ldev(id.folder, id.lock, id.auth, id.device)),
    data: Object.assign({ email: email('h13-'), wrapped_k: id.wk, device_name: 'Α' }, extra || {})
  });
  expect(r.status(), await r.text()).toBe(200);
  const j = await r.json();
  expect(j.account).toBe('new');
  expect(j.has_lock).toBe(true);
  return id;
}
// Παλιός λογαριασμός v46: όπως τον έφτιαχνε η v46 (χωρίς κλειδαριά).
async function newV46(api) {
  const id = { folder: hex(32), auth: hex(32), device: 'km_' + hex(6) };
  const r = await api.post(B + '/api/km/register', {
    headers: Object.assign({}, J, dev(id.folder, id.auth, id.device)),
    data: { email: email('h13old-') }
  });
  expect(r.status()).toBe(200);
  return id;
}

test('Η13-1 · εγγραφή v47: κλειδαριά αποθηκεύεται, unlock δίνει folder + wrapped_k ΧΩΡΙΣ να ενεργοποιεί', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);

  // unlock από «άλλη» συσκευή: μόνο lock + auth + device
  const u = await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_other' } });
  expect(u.status()).toBe(200);
  const j = await u.json();
  expect(j.folder_id).toBe(id.folder);
  expect(j.wrapped_k).toBe(id.wk);
  expect(j.kind).toBe('words');
  expect(j.this_device_active).toBe(false);
  expect(j.active.device_id).toBe(id.device);          // η Α είναι ακόμα η ενεργή
  expect(j.active.unsynced).toBe(0);

  // το unlock ΔΕΝ άγγιξε τίποτα: η Α παραμένει ενεργή, η άλλη ΔΕΝ γράφτηκε στο μητρώο
  const st = await (await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device) })).json();
  expect(st.state.active_device_id).toBe(id.device);
  expect(st.devices.map((d) => d.install_id)).toEqual([id.device]);
  expect(st.has_lock).toBe(true);
  expect(st.locks.length).toBe(1);
  expect(JSON.stringify(st)).not.toContain(id.auth);   // ο κωδικός δεν γυρίζει ποτέ πίσω
  await api.dispose();
});

test('Η13-2 · λάθος κωδικός ή άγνωστη κλειδαριά: 403, ΙΔΙΑ απάντηση — δεν μαθαίνεις αν «υπάρχουν» λέξεις', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);
  const bad = await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': hex(32), 'X-Km-Device': 'km_x' } });
  const unknown = await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': hex(32), 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_x' } });
  expect(bad.status()).toBe(403);
  expect(unknown.status()).toBe(403);
  expect(await bad.text()).toBe(await unknown.text());
  // και η κλειδαριά με λάθος auth δεν ανοίγει ούτε το status
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, hex(32), id.device) })).status()).toBe(403);
  // ούτε κλειδαριά άλλου φακέλου πάνω στον δικό μας
  const other = await newV47(api);
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, other.lock, other.auth, id.device) })).status()).toBe(403);
  await api.dispose();
});

test('Η13-3 · αλλαγή λέξεων = νέα κλειδαριά, ίδιο Κ, η παλιά πεθαίνει· χωρίς replace → 409· μόνο η ενεργή', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);
  const n = { lock: hex(32), auth: hex(32), wk: wrapped() };

  // δεύτερη words-κλειδαριά χωρίς replace: απορρίπτεται — ο φάκελος έχει ΠΑΝΤΑ μία
  let r = await api.post(B + '/api/km/lock', { headers: Object.assign({}, J, ldev(id.folder, id.lock, id.auth, id.device)),
    data: { lock_id: n.lock, auth_token: n.auth, wrapped_k: n.wk, kind: 'words' } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error).toBe('words_lock_exists');

  // από ΜΗ ενεργή συσκευή: 409 not_active_device
  r = await api.post(B + '/api/km/lock', { headers: Object.assign({}, J, ldev(id.folder, id.lock, id.auth, 'km_notactive')),
    data: { lock_id: n.lock, auth_token: n.auth, wrapped_k: n.wk, kind: 'words', replace: id.lock } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error).toBe('not_active_device');

  // σωστά: replace από την ενεργή
  r = await api.post(B + '/api/km/lock', { headers: Object.assign({}, J, ldev(id.folder, id.lock, id.auth, id.device)),
    data: { lock_id: n.lock, auth_token: n.auth, wrapped_k: n.wk, kind: 'words', replace: id.lock } });
  expect(r.status(), await r.text()).toBe(200);
  const j = await r.json();
  expect(j.replaced).toBe(id.lock);
  expect(j.locks.map((l) => l.kind)).toEqual(['words']);

  // η παλιά κλειδαριά ΔΕΝ ανοίγει πια, η νέα ανοίγει και δίνει τον ΙΔΙΟ φάκελο
  expect((await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_x' } })).status()).toBe(403);
  const u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': n.lock, 'X-Km-Auth': n.auth, 'X-Km-Device': 'km_x' } })).json();
  expect(u.folder_id).toBe(id.folder);
  expect(u.wrapped_k).toBe(n.wk);
  await api.dispose();
});

test('Η13-4 · ΜΕΤΑΝΑΣΤΕΥΣΗ: λογαριασμός v46 → status λέει has_lock=false → πρώτη κλειδαριά με ΠΑΛΙΑ ταυτότητα', async () => {
  const api = await pwRequest.newContext();
  const old = await newV46(api);
  let st = await (await api.get(B + '/api/km/status', { headers: dev(old.folder, old.auth, old.device) })).json();
  expect(st.has_lock).toBe(false);
  expect(st.locks).toEqual([]);

  const n = { lock: hex(32), auth: hex(32), wk: wrapped() };
  const r = await api.post(B + '/api/km/lock', { headers: Object.assign({}, J, dev(old.folder, old.auth, old.device)),
    data: { lock_id: n.lock, auth_token: n.auth, wrapped_k: n.wk, kind: 'words' } });
  expect(r.status(), await r.text()).toBe(200);

  // από εδώ και πέρα ζει με τη νέα ταυτότητα, στον ΙΔΙΟ φάκελο
  st = await (await api.get(B + '/api/km/status', { headers: ldev(old.folder, n.lock, n.auth, old.device) })).json();
  expect(st.has_lock).toBe(true);
  expect(st.state.active_device_id).toBe(old.device);
  const u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': n.lock, 'X-Km-Auth': n.auth, 'X-Km-Device': 'km_new' } })).json();
  expect(u.folder_id).toBe(old.folder);
  await api.dispose();
});

test('Η13-5 · Ν ανέβαστα: η συσκευή το λέει σε κάθε κλήση, ο server το θυμάται, η νέα το ρωτάει στο unlock', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);
  // η Α λέει «3 δεν ανέβηκαν»
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device, 3) })).status()).toBe(200);
  let u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_b' } })).json();
  expect(u.active.unsynced).toBe(3);
  expect(u.active.unsynced_at).toBeTruthy();
  expect(u.active.last_seen).toBeTruthy();

  // κλήση ΧΩΡΙΣ header: ο αριθμός ΔΕΝ μηδενίζει σιωπηλά (μένει 3)
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device) })).status()).toBe(200);
  u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_b' } })).json();
  expect(u.active.unsynced).toBe(3);

  // σκουπίδι στο header αγνοείται (δεν σπάει την κλήση, δεν αλλάζει τον αριθμό)
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device, 'abc') })).status()).toBe(200);
  u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_b' } })).json();
  expect(u.active.unsynced).toBe(3);

  // η Α ανέβασε: λέει 0
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device, 0) })).status()).toBe(200);
  u = await (await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': id.lock, 'X-Km-Auth': id.auth, 'X-Km-Device': 'km_b' } })).json();
  expect(u.active.unsynced).toBe(0);
  await api.dispose();
});

test('Η13-6 · ενεργοποίηση Β: το activate γυρίζει τι ήξερε για την Α· η Α μετά ΔΕΝ γράφει folder αλλά γράφει inbox + φωτογραφία', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);
  const A = ldev(id.folder, id.lock, id.auth, id.device);
  // η Α ανέβασε στοιχεία και έχει 2 που δεν πρόλαβε
  expect((await api.put(B + '/api/km/folder', { headers: Object.assign({ 'X-Km-Base-Version': '0' }, A), data: Buffer.alloc(300, 1) })).status()).toBe(200);
  expect((await api.get(B + '/api/km/status', { headers: ldev(id.folder, id.lock, id.auth, id.device, 2) })).status()).toBe(200);

  // η Β γίνεται ενεργή
  const Bd = ldev(id.folder, id.lock, id.auth, 'km_' + hex(6));
  const act = await api.post(B + '/api/km/activate', { headers: Bd });
  expect(act.status()).toBe(200);
  const aj = await act.json();
  expect(aj.previous_device_id).toBe(id.device);
  expect(aj.previous.unsynced).toBe(2);

  // η Α: folder → 409 (θα πατούσε τη Β)
  const f = await api.put(B + '/api/km/folder', { headers: Object.assign({ 'X-Km-Base-Version': '1' }, A), data: Buffer.alloc(300, 2) });
  expect(f.status()).toBe(409);
  expect((await f.json()).error).toBe('not_active_device');

  // η Α: inbox → 200, και τα «ανέβαστά» της μηδενίζουν
  const blob = crypto.randomBytes(500);
  const ib = await api.put(B + '/api/km/inbox', { headers: A, data: blob });
  expect(ib.status(), await ib.text()).toBe(200);
  // η Α: φωτογραφία → 200 (αμετάβλητη, ασφαλής)
  expect((await api.put(B + '/api/km/photo?id=late-1', { headers: A, data: Buffer.alloc(64, 7) })).status()).toBe(200);
  // αλλά ΔΕΝ σβήνει
  expect((await api.delete(B + '/api/km/photo?id=late-1', { headers: A })).status()).toBe(409);

  const st = await (await api.get(B + '/api/km/status', { headers: Bd })).json();
  const devA = st.devices.find((d) => d.install_id === id.device);
  expect(devA.unsynced).toBe(0);

  // η Β βλέπει το inbox, το κατεβάζει ΑΚΕΡΑΙΟ, το σβήνει
  let list = await (await api.get(B + '/api/km/inbox', { headers: Bd })).json();
  expect(list.inbox.map((i) => i.device)).toEqual([id.device]);
  expect(list.inbox[0].bytes).toBe(500);
  const got = await api.get(B + '/api/km/inbox?id=' + id.device, { headers: Bd });
  expect(got.status()).toBe(200);
  expect(sha(Buffer.from(await got.body()))).toBe(sha(blob));
  expect((await api.delete(B + '/api/km/inbox?id=' + id.device, { headers: Bd })).status()).toBe(200);
  list = await (await api.get(B + '/api/km/inbox', { headers: Bd })).json();
  expect(list.count).toBe(0);

  // η Α (μη ενεργή) ΔΕΝ διαβάζει και ΔΕΝ σβήνει inbox
  expect((await api.get(B + '/api/km/inbox', { headers: A })).status()).toBe(409);
  expect((await api.delete(B + '/api/km/inbox?id=' + id.device, { headers: A })).status()).toBe(409);
  // κακό id στη διαδρομή απορρίπτεται
  expect((await api.get(B + '/api/km/inbox?id=' + encodeURIComponent('../x'), { headers: Bd })).status()).toBe(400);
  await api.dispose();
});

test('Η13-7 · km_device_links ΚΡΑΤΑΕΙ το ιστορικό: μία συσκευή, δύο λογαριασμοί, και οι δύο δεσμοί ζουν', async () => {
  const api = await pwRequest.newContext();
  const one = await newV47(api);
  // η ΙΔΙΑ εγκατάσταση φτιάχνει δεύτερο λογαριασμό («ξεκινάω καθαρά»)
  const two = { folder: hex(32), lock: hex(32), auth: hex(32), device: one.device, wk: wrapped() };
  const r = await api.post(B + '/api/km/register', { headers: Object.assign({}, J, ldev(two.folder, two.lock, two.auth, two.device)),
    data: { email: email('h13b-'), wrapped_k: two.wk } });
  expect(r.status()).toBe(200);
  // ο πρώτος λογαριασμός ΑΚΟΜΑ βλέπει τη συσκευή στη λίστα του (v46: την έχανε)
  const s1 = await (await api.get(B + '/api/km/status', { headers: ldev(one.folder, one.lock, one.auth, 'km_probe') })).json();
  expect(s1.devices.map((d) => d.install_id)).toContain(one.device);
  const s2 = await (await api.get(B + '/api/km/status', { headers: ldev(two.folder, two.lock, two.auth, 'km_probe') })).json();
  expect(s2.devices.map((d) => d.install_id)).toContain(one.device);
  await api.dispose();
});

test('Η13-8 · είσοδος (register σε υπάρχοντα) με κλειδαριά: 403 με λάθος, 200 + previous με σωστό', async () => {
  const api = await pwRequest.newContext();
  const id = await newV47(api);
  const Bd = ldev(id.folder, id.lock, hex(32), 'km_' + hex(6));
  let r = await api.post(B + '/api/km/register', { headers: Object.assign({}, J, Bd), data: { email: email('x-') } });
  expect(r.status()).toBe(403);
  r = await api.post(B + '/api/km/register', { headers: Object.assign({}, J, ldev(id.folder, id.lock, id.auth, 'km_' + hex(6))), data: { email: email('x-') } });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.account).toBe('existing');
  expect(j.previous.device_id).toBe(id.device);
  // κακοσχηματισμένο wrapped_k σε ΝΕΑ εγγραφή: 400, τίποτα δεν γράφεται
  const f = hex(32), l = hex(32);
  r = await api.post(B + '/api/km/register', { headers: Object.assign({}, J, ldev(f, l, hex(32), 'km_z')), data: { email: email('y-'), wrapped_k: 'zz' } });
  expect(r.status()).toBe(400);
  expect((await api.post(B + '/api/km/unlock', { headers: { 'X-Km-Lock': l, 'X-Km-Auth': hex(32), 'X-Km-Device': 'km_z' } })).status()).toBe(403);
  await api.dispose();
});

/* ── crypto στον πραγματικό browser (WebCrypto), όπως στη συσκευή ────────── */
test('Η13-9 · km-crypto: Κ τυχαίο, κλειδώνει/ξεκλειδώνει με λέξεις, ΑΛΛΕΣ λέξεις = ίδιο Κ, ΛΑΘΟΣ λέξεις = τίποτα', async ({ page }) => {
  await page.goto(APP);
  await page.waitForFunction(() => typeof kmUnwrapK === 'function' && typeof kmDeriveLock === 'function');
  const out = await page.evaluate(async () => {
    const w1 = await kmNewWords(), w2 = await kmNewWords();
    const K = kmNewK();
    const L1 = await kmDeriveLock(w1), L1b = await kmDeriveLock(w1.join('  ').toUpperCase()), L2 = await kmDeriveLock(w2);
    const old = await kmDerive(w1);                       // το ΠΑΛΙΟ σχήμα, ίδιες λέξεις
    const wrapped1 = await kmWrapK(L1.kek, K);
    const wrapped1b = await kmWrapK(L1.kek, K);
    const wrapped2 = await kmWrapK(L2.kek, K);           // «αλλαγή λέξεων»: ίδιο Κ, άλλη κλειδαριά
    const k1 = await kmUnwrapK(L1b.kek, wrapped1);
    const k2 = await kmUnwrapK(L2.kek, wrapped2);
    let wrong = null; try { wrong = await kmUnwrapK(L2.kek, wrapped1); } catch (e) { wrong = 'ERR'; }
    let bad = null; try { bad = await kmUnwrapK(L1.kek, 'zz'); } catch (e) { bad = 'ERR'; }
    // τα δεδομένα: σφραγίζονται με το Κ, ανοίγουν με το Κ που βγήκε από ΑΛΛΕΣ λέξεις
    const data = new TextEncoder().encode('τιμολόγιο 42');
    const sealed = await kmSeal(await kmImportK(K), data);
    const opened = new TextDecoder().decode(await kmOpen(await kmImportK(k2), sealed));
    let oldOpens = null; try { await kmOpen(old.key, sealed); oldOpens = true; } catch (e) { oldOpens = false; }
    const H = (b) => kmBytesToHex(b);
    return {
      klen: K.length, wlen: wrapped1.length, stable: L1.lockId === L1b.lockId && L1.authToken === L1b.authToken,
      distinct: L1.lockId !== L1.authToken && L1.lockId !== L2.lockId,
      notOld: L1.lockId !== old.folderId && L1.authToken !== old.authToken,
      k1ok: H(k1) === H(K), k2ok: H(k2) === H(K), wrong, bad, opened, oldOpens,
      nonce: wrapped1 !== wrapped1b, fid: kmNewFolderId(),
    };
  });
  expect(out.klen).toBe(32);
  expect(out.wlen).toBe(120);
  expect(out.stable).toBe(true);        // ίδιες λέξεις όπως κι αν γραφτούν → ίδια κλειδαριά
  expect(out.distinct).toBe(true);
  expect(out.notOld).toBe(true);        // το νέο σχήμα δεν ξαναχρησιμοποιεί τίποτα από το παλιό
  expect(out.k1ok).toBe(true);
  expect(out.k2ok).toBe(true);          // αλλαγή λέξεων → ΙΔΙΟ Κ
  expect(out.wrong).toBe('ERR');        // λάθος λέξεις → σφάλμα, όχι σκουπίδια
  expect(out.bad).toBe('ERR');
  expect(out.opened).toBe('τιμολόγιο 42');
  expect(out.oldOpens).toBe(false);     // οι λέξεις ΜΟΝΕΣ τους δεν ανοίγουν πια δεδομένα
  expect(out.nonce).toBe(true);
  expect(out.fid).toMatch(/^[0-9a-f]{64}$/);
});

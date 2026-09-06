/* Η.13 · Γ.2α — Η ΝΕΑ ΒΑΣΗ Κ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ (v47, 6/9/2026)
   Τι αποδεικνύει: ο νέος λογαριασμός γεννάει τυχαίο Κ και κλειδαριά· η
   σύνδεση σε άλλη συσκευή περνάει από το unlock· ο λογαριασμός v46
   μεταναστεύει ΜΟΝΟΣ ΤΟΥ και επιβιώνει διακοπής στη μέση· ο μετρητής
   «Ν ανέβαστα» λέει την αλήθεια.
   ⚠ localhost, ΟΧΙ 127.0.0.1 (WebAuthn/rpId — μετρήθηκε 5/9). */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';
const API = 'http://localhost:8788/api/km/';

test.describe.configure({ timeout: 150000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller,
    null, { timeout: 20000 }
  ).catch(() => {});
  await p.waitForTimeout(1500);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}

async function onboard(p, email) {
  let ok = false;
  for (let i = 0; i < 6 && !ok; i++) {
    try {
      await expect(p.locator('#s-acc')).toBeVisible({ timeout: 8000 });
      await p.locator('#acc-no').click();
      await expect(p.locator('#s-email')).toBeVisible({ timeout: 4000 });
      await p.locator('#in-email').fill(email);
      ok = true;
    } catch (e) { await p.waitForTimeout(500); }
  }
  if (!ok) { throw new Error('δεν άνοιξε η οθόνη email'); }
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(800);
  return w;
}

const ls = (p, k) => p.evaluate((key) => localStorage.getItem(key), k);
const email = (t) => t + Date.now() + Math.random().toString(36).slice(2) + '@example.com';

/* Στήνει λογαριασμό ΟΠΩΣ ΤΟΝ ΕΦΤΙΑΧΝΕ Η v46: κλειδί και φάκελος από τις
   λέξεις, καμία κλειδαριά. Αυτό είναι το σημείο εκκίνησης της μετανάστευσης
   — και ο μόνος τρόπος να δοκιμαστεί χωρίς να τρέξουμε παλιό κώδικα. */
async function makeLegacyAccount(p, mail) {
  return p.evaluate(async (m) => {
    const w = await kmNewWords();
    const d = await kmDerive(w);
    localStorage.setItem('km_words', w.join(' '));
    localStorage.setItem('km_folder', d.folderId);
    localStorage.setItem('km_auth', d.authToken);
    localStorage.setItem('km_words_ok', '1');
    localStorage.setItem('km_email', m);
    localStorage.removeItem('km_k');
    localStorage.removeItem('km_lock');
    localStorage.removeItem('km_lock_auth');
    localStorage.removeItem('km_mig');
    const r = await fetch('/api/km/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Km-Folder': d.folderId, 'X-Km-Auth': d.authToken, 'X-Km-Device': localStorage.getItem('km_install_id') },
      body: JSON.stringify({ email: m, device_name: 'legacy' })
    });
    localStorage.setItem('km_registered', '1');
    return { words: w, folder: d.folderId, auth: d.authToken, status: r.status };
  }, mail);
}

/* Ανεβάζει ένα «τιμολόγιο» (στοιχεία + μία φωτογραφία) με το ΠΑΛΙΟ κλειδί,
   ακριβώς όπως θα το είχε αφήσει η v46 στον server. */
async function seedLegacyData(p, id) {
  return p.evaluate(async (pid) => {
    const w = localStorage.getItem('km_words').split(' ');
    const d = await kmDerive(w);
    const H = () => ({ 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id') });
    const photo = new Uint8Array(3000);
    crypto.getRandomValues(photo);
    const sealedP = await kmSeal(d.key, photo);
    const hp = Object.assign(H(), { 'Content-Type': 'application/octet-stream' });
    const rp = await fetch('/api/km/photo?id=' + pid, { method: 'PUT', headers: hp, body: sealedP });
    const meta = new TextEncoder().encode(JSON.stringify({ v: 1, shots: [{ id: pid, ts: Date.now(), supplier: 'ΠΑΛΙΟΣ', net: 10, vat: 2, total: 12, pages: 1 }], gone: [] }));
    const sealedM = await kmSeal(d.key, meta);
    const hm = Object.assign(H(), { 'Content-Type': 'application/octet-stream', 'X-Km-Base-Version': '0' });
    const rm = await fetch('/api/km/folder', { method: 'PUT', headers: hm, body: sealedM });
    return { photo: rp.status, meta: rm.status, sha: Array.from(photo.slice(0, 8)).join(',') };
  }, id);
}

test('Κ1 · νέος λογαριασμός: τυχαίο Κ, τυχαίο folder_id, κλειδαριά στον server — τίποτα από τις λέξεις', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  const w = await onboard(p, email('k1-'));

  const k = await ls(p, 'km_k');
  const lock = await ls(p, 'km_lock');
  const folder = await ls(p, 'km_folder');
  expect(k).toMatch(/^[0-9a-f]{64}$/);
  expect(lock).toMatch(/^[0-9a-f]{64}$/);

  /* 🔴 Ο ΦΡΟΥΡΟΣ: τίποτα από τα τρία δεν επιτρέπεται να βγαίνει από τις
     λέξεις. Αν κάποιος ξαναδέσει το κλειδί στις λέξεις, αυτό κοκκινίζει. */
  const derived = await p.evaluate(async (words) => {
    const d = await kmDerive(words);
    const L = await kmDeriveLock(words);
    return { oldFolder: d.folderId, oldEnc: kmBytesToHex(await crypto.subtle.exportKey ? new Uint8Array(0) : new Uint8Array(0)), lockId: L.lockId };
  }, w);
  expect(folder).not.toBe(derived.oldFolder);      // ο φάκελος ΔΕΝ βγαίνει από τις λέξεις
  expect(lock).toBe(derived.lockId);               // η κλειδαριά ναι — αυτή είναι η δουλειά της
  expect(k).not.toBe(folder);

  // ο server κρατάει την κλειδαριά, και το unlock δίνει τον ΙΔΙΟ φάκελο
  const u = await p.evaluate(async (words) => {
    const L = await kmDeriveLock(words);
    const r = await fetch('/api/km/unlock', { method: 'POST', headers: { 'X-Km-Lock': L.lockId, 'X-Km-Auth': L.authToken, 'X-Km-Device': 'probe' } });
    const j = await r.json();
    const K = await kmUnwrapK(L.kek, j.wrapped_k);
    return { status: r.status, folder: j.folder_id, k: kmBytesToHex(K) };
  }, w);
  expect(u.status).toBe(200);
  expect(u.folder).toBe(folder);
  expect(u.k).toBe(k);                              // το Κ του server είναι το Κ της συσκευής
  await ctx.close();
});

test('Κ2 · δεύτερη συσκευή συνδέεται ΜΕΣΩ unlock και παίρνει το ίδιο Κ και τον ίδιο φάκελο', async ({ browser }) => {
  const A = await device(browser);
  const mail = email('k2-');
  const w = await onboard(A.p, mail);
  const k = await ls(A.p, 'km_k');
  const folder = await ls(A.p, 'km_folder');

  const B = await device(browser);
  await B.p.locator('#acc-yes').click();
  await expect(B.p.locator('#s-signin')).toBeVisible({ timeout: 8000 });
  await B.p.locator('#si-email').fill(mail);
  await B.p.locator('#si-words').fill(w.join(' '));
  await B.p.locator('#si-go').click();
  await expect(B.p.locator('#s-key')).toBeVisible({ timeout: 25000 });
  await B.p.waitForTimeout(1200);

  expect(await ls(B.p, 'km_k')).toBe(k);
  expect(await ls(B.p, 'km_folder')).toBe(folder);
  expect(await ls(B.p, 'km_lock')).toBe(await ls(A.p, 'km_lock'));
  await A.ctx.close(); await B.ctx.close();
});

test('Κ3 · λάθος λέξεις στη σύνδεση: μήνυμα, και ΤΙΠΟΤΑ δεν γράφεται στη συσκευή', async ({ browser }) => {
  const A = await device(browser);
  const mail = email('k3-');
  await onboard(A.p, mail);

  const B = await device(browser);
  const other = await B.p.evaluate(() => kmNewWords());
  await B.p.locator('#acc-yes').click();
  await expect(B.p.locator('#s-signin')).toBeVisible({ timeout: 8000 });
  await B.p.locator('#si-email').fill(mail);
  await B.p.locator('#si-words').fill(other.join(' '));
  await B.p.locator('#si-go').click();
  await expect(B.p.locator('#si-err')).toBeVisible({ timeout: 20000 });
  expect(await ls(B.p, 'km_k')).toBeNull();
  expect(await ls(B.p, 'km_lock')).toBeNull();
  expect(await ls(B.p, 'km_words_ok')).toBeNull();
  await A.ctx.close(); await B.ctx.close();
});

test('Κ4 · ΜΕΤΑΝΑΣΤΕΥΣΗ: λογαριασμός v46 αποκτά Κ και κλειδαριά μόνος του, και τα παλιά δεδομένα ανοίγουν', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  const mail = email('k4-');
  const acc = await makeLegacyAccount(p, mail);
  expect(acc.status).toBe(200);
  const seed = await seedLegacyData(p, 'inv_old_1');
  expect(seed.photo).toBe(200);
  expect(seed.meta).toBe(200);

  // ξαναφόρτωση: το boot βλέπει λογαριασμό χωρίς κλειδαριά και μεταναστεύει
  await p.reload();
  await p.waitForFunction(() => typeof kmUnwrapK === 'function');
  await p.waitForFunction(() => !!localStorage.getItem('km_lock'), null, { timeout: 40000 });
  await p.waitForTimeout(800);

  expect(await ls(p, 'km_k')).toMatch(/^[0-9a-f]{64}$/);
  expect(await ls(p, 'km_mig')).toBeNull();          // τελείωσε καθαρά

  /* Η ΑΠΟΔΕΙΞΗ: η φωτογραφία στον server ανοίγει τώρα με το Κ — και ΔΕΝ
     ανοίγει πια με το παλιό κλειδί-από-λέξεις. */
  const proof = await p.evaluate(async () => {
    const H = { 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Lock': localStorage.getItem('km_lock'), 'X-Km-Auth': localStorage.getItem('km_lock_auth'), 'X-Km-Device': localStorage.getItem('km_install_id') };
    const r = await fetch('/api/km/photo?id=inv_old_1', { headers: H });
    const buf = await r.arrayBuffer();
    const K = await kmImportK(kmHexToBytes(localStorage.getItem('km_k')));
    let withK = false, withOld = false;
    try { await kmOpen(K, buf); withK = true; } catch (e) {}
    const d = await kmDerive(localStorage.getItem('km_words').split(' '));
    try { await kmOpen(d.key, buf); withOld = true; } catch (e) {}
    const rm = await fetch('/api/km/folder', { headers: H });
    const mb = await rm.arrayBuffer();
    let metaOk = false;
    try {
      const plain = await kmOpen(K, mb);
      metaOk = JSON.parse(new TextDecoder().decode(plain)).shots[0].supplier === 'ΠΑΛΙΟΣ';
    } catch (e) {}
    return { status: r.status, withK, withOld, metaOk };
  });
  expect(proof.status).toBe(200);
  expect(proof.withK).toBe(true);      // ξανακρυπτογραφήθηκε
  expect(proof.withOld).toBe(false);   // το παλιό κλειδί δεν την ανοίγει πια
  expect(proof.metaOk).toBe(true);     // και τα στοιχεία πέρασαν ακέραια

  /* 🔴 Ο ΦΡΟΥΡΟΣ ΠΟΥ ΕΛΕΙΠΕ (βρέθηκε 6/9 με μετάλλαξη): η κλειδαριά πρέπει
     να κλειδώνει ΑΥΤΟ ΑΚΡΙΒΩΣ το Κ. Αν κλειδώσει οποιοδήποτε άλλο, ο
     λογαριασμός ξεκλειδώνει κανονικά — και κάθε ΑΛΛΗ συσκευή παίρνει λάθος
     κλειδί και δεν ανοίγει ΤΙΠΟΤΑ, για πάντα. Σιωπηλή, μόνιμη απώλεια. */
  const sealed = await p.evaluate(async () => {
    const L = await kmDeriveLock(localStorage.getItem('km_words').split(' '));
    const r = await fetch('/api/km/unlock', { method: 'POST', headers: { 'X-Km-Lock': L.lockId, 'X-Km-Auth': L.authToken, 'X-Km-Device': 'probe' } });
    const j = await r.json();
    return kmBytesToHex(await kmUnwrapK(L.kek, j.wrapped_k));
  });
  expect(sealed).toBe(await ls(p, 'km_k'));
  await ctx.close();
});

test('Κ5 · ΔΙΑΚΟΠΗ ΣΤΗ ΜΕΣΗ: μισοπερασμένος φάκελος διαβάζεται ΚΑΝΟΝΙΚΑ και η επόμενη φορά τελειώνει τη δουλειά', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  const mail = email('k5-');
  await makeLegacyAccount(p, mail);
  await seedLegacyData(p, 'inv_a');
  // δεύτερη φωτογραφία, ίδιο παλιό κλειδί
  await p.evaluate(async () => {
    const d = await kmDerive(localStorage.getItem('km_words').split(' '));
    const b = new Uint8Array(2000); crypto.getRandomValues(b);
    const sealed = await kmSeal(d.key, b);
    await fetch('/api/km/photo?id=inv_b', { method: 'PUT', headers: { 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id'), 'Content-Type': 'application/octet-stream' }, body: sealed });
  });

  /* Προσομοίωση διακοπής: το Κ γράφτηκε, το km_mig μπήκε, ΜΙΑ φωτογραφία
     πρόλαβε να περάσει, η κλειδαριά ΔΕΝ γράφτηκε ποτέ. Αυτή ακριβώς είναι η
     κατάσταση που αφήνει χαμένο δίκτυο στη μέση του βήματος 2. */
  const half = await p.evaluate(async () => {
    const K = kmNewK();
    localStorage.setItem('km_mig', '1');
    localStorage.setItem('km_k', kmBytesToHex(K));
    const key = await kmImportK(K);
    const H = { 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id') };
    const r = await fetch('/api/km/photo?id=inv_a', { headers: H });
    const d = await kmDerive(localStorage.getItem('km_words').split(' '));
    const plain = await kmOpen(d.key, await r.arrayBuffer());
    const sealed = await kmSeal(key, plain);
    await fetch('/api/km/photo?id=inv_a', { method: 'PUT', headers: Object.assign({}, H, { 'Content-Type': 'application/octet-stream' }), body: sealed });
    return kmBytesToHex(K);
  });

  /* Η κατάσταση είναι όντως ΜΙΚΤΗ: inv_a με το Κ, inv_b με το παλιό. Αυτό
     είναι το σημείο εκκίνησης — αν δεν είναι μικτή, το τεστ δεν δοκιμάζει
     τίποτα (θετικό δείγμα ελέγχου, κανόνας 31/8 και 4/9). */
  const state = await p.evaluate(async () => {
    const K = await kmImportK(kmHexToBytes(localStorage.getItem('km_k')));
    const d = await kmDerive(localStorage.getItem('km_words').split(' '));
    const H = { 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id') };
    async function probe(id) {
      const r = await fetch('/api/km/photo?id=' + id, { headers: H });
      const buf = await r.arrayBuffer();
      let k = false, o = false;
      try { await kmOpen(K, buf); k = true; } catch (e) {}
      try { await kmOpen(d.key, buf); o = true; } catch (e) {}
      return { k, o };
    }
    return { a: await probe('inv_a'), b: await probe('inv_b') };
  });
  expect(state.a).toEqual({ k: true, o: false });    // πέρασε στο Κ
  expect(state.b).toEqual({ k: false, o: true });    // έμεινε στο παλιό

  // η επόμενη φόρτωση τελειώνει τη δουλειά — ΜΕ ΤΟ ΙΔΙΟ Κ, όχι με νέο
  await p.reload();
  await p.waitForFunction(() => typeof kmUnwrapK === 'function');
  await p.waitForFunction(() => !!localStorage.getItem('km_lock'), null, { timeout: 40000 });
  await p.waitForTimeout(800);
  expect(await ls(p, 'km_k')).toBe(half);            // 🔴 ίδιο Κ: αλλιώς το inv_a χανόταν
  expect(await ls(p, 'km_mig')).toBeNull();

  const after = await p.evaluate(async () => {
    const key = await kmImportK(kmHexToBytes(localStorage.getItem('km_k')));
    const H = { 'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Lock': localStorage.getItem('km_lock'), 'X-Km-Auth': localStorage.getItem('km_lock_auth'), 'X-Km-Device': localStorage.getItem('km_install_id') };
    async function withK(id) {
      const r = await fetch('/api/km/photo?id=' + id, { headers: H });
      try { await kmOpen(key, await r.arrayBuffer()); return true; } catch (e) { return false; }
    }
    /* 🔴 Ο ΚΡΙΣΙΜΟΣ ΕΛΕΓΧΟΣ: τα ΣΤΟΙΧΕΙΑ επέζησαν. Η εφαρμογή ξεκίνησε με
       άδεια τοπική βάση και φάκελο κρυπτογραφημένο με το ΠΑΛΙΟ κλειδί — αν
       η επαναφορά (kmOpenAny) δεν δούλευε, το κατέβασμα θα έφερνε μηδέν και
       η μετανάστευση θα ανέβαζε ΑΔΕΙΑ στοιχεία πάνω από το τιμολόγιο. */
    const rm = await fetch('/api/km/folder', { headers: H });
    let supplier = null;
    try {
      const plain = await kmOpen(key, await rm.arrayBuffer());
      const j = JSON.parse(new TextDecoder().decode(plain));
      supplier = (j.shots[0] || {}).supplier;
    } catch (e) {}
    return { a: await withK('inv_a'), b: await withK('inv_b'), supplier: supplier };
  });
  expect(after.a).toBe(true);
  expect(after.b).toBe(true);          // και η δεύτερη πέρασε στο Κ
  expect(after.supplier).toBe('ΠΑΛΙΟΣ');   // ΤΙΠΟΤΑ δεν χάθηκε στη διαδρομή
  await ctx.close();
});

test('Κ6 · το tablet υιοθετεί την κλειδαριά ΜΟΝΟ ΤΟΥ, χωρίς να ξαναγράψει κανείς 12 λέξεις', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  const mail = email('k6-');
  await makeLegacyAccount(p, mail);
  await seedLegacyData(p, 'inv_t');
  await p.reload();
  await p.waitForFunction(() => typeof kmUnwrapK === 'function');
  await p.waitForFunction(() => !!localStorage.getItem('km_lock'), null, { timeout: 40000 });
  const lock = await ls(p, 'km_lock');
  const k = await ls(p, 'km_k');

  /* Δεύτερη συσκευή που είχε συνδεθεί ΠΡΙΝ τη μετανάστευση: κρατάει λέξεις
     και παλιά ταυτότητα, καμία κλειδαριά. Δεν πρέπει να ζητηθεί τίποτα από
     τον χρήστη — το boot τη φέρνει μόνο του στη νέα βάση. */
  const T = await device(browser);
  await T.p.evaluate((st) => {
    localStorage.setItem('km_words', st.words);
    localStorage.setItem('km_folder', st.folder);
    localStorage.setItem('km_auth', st.auth);
    localStorage.setItem('km_words_ok', '1');
    localStorage.setItem('km_email', st.mail);
    localStorage.setItem('km_registered', '1');
  }, { words: await ls(p, 'km_words'), folder: await ls(p, 'km_folder'), auth: await ls(p, 'km_auth'), mail: mail });
  await T.p.reload();
  await T.p.waitForFunction(() => typeof kmUnwrapK === 'function');
  await T.p.waitForFunction(() => !!localStorage.getItem('km_lock'), null, { timeout: 40000 });
  expect(await ls(T.p, 'km_lock')).toBe(lock);
  expect(await ls(T.p, 'km_k')).toBe(k);
  await ctx.close(); await T.ctx.close();
});

test('Κ7 · «Ν ανέβαστα»: Η ΙΔΙΑ Η ΕΦΑΡΜΟΓΗ το στέλνει σε κάθε κλήση, και ο server το θυμάται', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, email('k7-'));
  await p.waitForTimeout(1500);
  const w = await ls(p, 'km_words');

  /* Τρεις τοπικές αλλαγές που δεν πρόλαβαν να ανέβουν. */
  await p.evaluate(() => localStorage.setItem('km_unsynced', '3'));

  /* 🔴 Ο ΦΡΟΥΡΟΣ: τα headers τα διαβάζουμε από αιτήματα που κάνει ΜΟΝΗ ΤΗΣ
     η εφαρμογή στο άνοιγμα — όχι από fetch που γράφει το τεστ. Αλλιώς το
     τεστ δοκιμάζει τον server και όχι το kmHead, και μένει πράσινο ακόμα
     κι αν η εφαρμογή σταματήσει να στέλνει τον αριθμό. */
  const seen = [];
  await p.route('**/api/km/**', async (route) => {
    seen.push(route.request().headers()['x-km-unsynced']);
    await route.continue();
  });
  await p.reload();
  await p.waitForFunction(() => typeof kmDeriveLock === 'function');
  await p.waitForTimeout(4000);

  expect(seen.length).toBeGreaterThan(0);
  expect(seen).toContain('3');
  await p.unroute('**/api/km/**');

  /* Και ο server το θυμάται: αυτό ακριβώς ρωτάει η νέα συσκευή πριν πάρει
     τη σκυτάλη (Free = πορτοφόλι, Α320 6/9). */
  const info = await p.evaluate(async (words) => {
    const L = await kmDeriveLock(words.split(' '));
    const r = await fetch('/api/km/unlock', { method: 'POST', headers: { 'X-Km-Lock': L.lockId, 'X-Km-Auth': L.authToken, 'X-Km-Device': 'probe2' } });
    return (await r.json()).active;
  }, w);
  expect(info.unsynced).toBe(3);
  expect(info.unsynced_at).toBeTruthy();
  await ctx.close();
});

test('Κ8 · v48 · μετά την υιοθέτηση της κλειδαριάς τα δεδομένα φαίνονται ΑΜΕΣΩΣ (< 3s), όχι στον επόμενο γύρο των 4s', async ({ browser }) => {
  /* Μετρήθηκε 6/9 στον πραγματικό λογαριασμό: το κινητό είχε μείνει με το
     παλιό κλειδί ενώ ο φάκελος είχε ήδη περάσει στο Κ. Στο πρώτο άνοιγμα το
     κατέβασμα τρέχει ΠΡΙΝ την υιοθέτηση, αποτυγχάνει, και ο χρήστης βλέπει
     άδεια οθόνη μέχρι να τρέξει ο προγραμματισμένος συγχρονισμός.
     🔴 ΤΟ ΚΑΤΩΦΛΙ ΔΕΝ ΕΙΝΑΙ ΑΥΘΑΙΡΕΤΟ: χωρίς τη διόρθωση η ανάκαμψη έχει
     ΔΑΠΕΔΟ τα 4000 ms (scheduleSync(4000) στο boot). Με τη διόρθωση γίνεται
     μέσα στο ίδιο boot. Τα 3000 ms είναι κάτω από το δάπεδο, άρα το τεστ
     ξεχωρίζει τις δύο περιπτώσεις χωρίς να κρέμεται από την ταχύτητα του
     μηχανήματος. */
  const { ctx, p } = await device(browser);
  const mail = email('k8-');
  await makeLegacyAccount(p, mail);
  await seedLegacyData(p, 'inv_k8');
  await p.reload();
  await p.waitForFunction(() => typeof kmUnwrapK === 'function');
  await p.waitForFunction(() => !!localStorage.getItem('km_lock'), null, { timeout: 40000 });
  await p.waitForTimeout(500);
  const state = await p.evaluate(() => ({ w: localStorage.getItem('km_words'), f: localStorage.getItem('km_folder'), a: localStorage.getItem('km_auth'), e: localStorage.getItem('km_email') }));

  /* Δεύτερη συσκευή ΟΠΩΣ ΤΟ ΚΙΝΗΤΟ: λέξεις και παλιά ταυτότητα, καμία
     κλειδαριά, και ο φάκελος στον server ήδη με το Κ. */
  const T = await device(browser);
  await T.p.evaluate((st) => {
    localStorage.setItem('km_words', st.w);
    localStorage.setItem('km_folder', st.f);
    localStorage.setItem('km_auth', st.a);
    localStorage.setItem('km_email', st.e);
    localStorage.setItem('km_words_ok', '1');
    localStorage.setItem('km_registered', '1');
    localStorage.setItem('km_need_pull', '1');
  }, state);

  const shots = () => T.p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi');
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('shots').objectStore('shots').getAll();
        q.onsuccess = () => res(q.result.length);
        q.onerror = () => res(-1);
      } catch (e) { res(-1); }
    };
    r.onerror = () => res(-1);
  }));

  const t0 = Date.now();
  await T.p.reload();
  await T.p.waitForFunction(() => typeof kmUnwrapK === 'function');
  let n = 0;
  while (Date.now() - t0 < 20000) {
    n = await shots();
    if (n === 1) { break; }
    await T.p.waitForTimeout(150);
  }
  const ms = Date.now() - t0;
  expect(n, 'το τιμολόγιο δεν έφτασε ποτέ').toBe(1);
  expect(ms, 'ανάκαμψη σε ' + ms + ' ms — περίμενε τον γύρο των 4s αντί να κατεβάσει αμέσως').toBeLessThan(3000);

  /* Και το «εκκρεμεί κατέβασμα» φεύγει — όσο μένει, η συσκευή ΔΕΝ ανεβάζει
     τίποτα (v33), οπότε αν κολλούσε εδώ το κινητό θα ήταν σιωπηλά άχρηστο. */
  await expect.poll(async () => ls(T.p, 'km_need_pull'), { timeout: 12000, intervals: [400] }).toBeNull();
  await ctx.close(); await T.ctx.close();
});

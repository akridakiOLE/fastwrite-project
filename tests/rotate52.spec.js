/* v52 · ΑΛΛΑΓΗ 12 ΛΕΞΕΩΝ — Α300 §3 βήμα 4 (Α320 6/9: η τελευταία πράξη της
   ανάκτησης είναι ακριβώς αυτή). Νέες λέξεις κλειδώνουν το ΙΔΙΟ Κ· ο server
   σβήνει την παλιά κλειδαριά στην ίδια πράξη και κλείνει τον παλιό κωδικό
   του λογαριασμού. Κανένα τιμολόγιο δεν ξαναγράφεται.
   Οι τρεις φρουροί εδώ φυλάνε τρία διαφορετικά πράγματα, σε ένα σημείο ο
   καθένας — κανένας δεν καλύπτει τον άλλο. */
const { test, expect } = require('@playwright/test');
/* ⚠ localhost, ΟΧΙ 127.0.0.1 — το WebAuthn απορρίπτει τη διεύθυνση IP ως
   rpId (μετρήθηκε 5/9) και το τεστ θα έπεφτε για λόγο που δεν υπάρχει στην
   παραγωγή. */
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 180000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}
async function onboard(p, email) {
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(700);
  return w;
}
async function seedShots(p, n, tag) {
  return p.evaluate(async ({ n, tag }) => {
    const mk = (seed) => new Blob([new Uint8Array(16 * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        st.put({ id: tag + i + '-' + Math.random().toString(36).slice(2, 8), ts: Date.now(),
                 supplier: 'ΠΡΟΜ ' + tag + i, invDate: Date.now(), blob: mk(i), pages: [],
                 net: 100 + i, vat: 19, total: 119 + i });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, { n, tag });
}
async function settings(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
}
async function runSync(p) {
  await settings(p);
  await p.evaluate(() => new Promise((res) => {
    document.getElementById('st-sync-now').click();
    const t = setInterval(() => { if (!document.getElementById('st-sync-now').disabled) { clearInterval(t); res(); } }, 200);
  }));
  await p.waitForTimeout(1500);
}
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => x.supplier).sort()); };
  }));
}
/* Το δακτυλικό δεν υπάρχει σε headless Chromium· ο εικονικός αυθεντικοποιητής
   του CDP απαντάει «ναι», ώστε να δοκιμάζεται ο ΔΙΚΟΣ μας κώδικας και όχι το
   υλικό (ίδιος τρόπος με το words.spec.js, v36). */
async function addAuthenticator(ctx, p) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
               hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });
  return { cdp, authenticatorId };
}
/* Η ΑΛΛΑΓΗ, ΟΠΩΣ ΤΗΝ ΚΑΝΕΙ Ο ΑΝΘΡΩΠΟΣ: Ρυθμίσεις → «Αλλαγή 12 λέξεων» →
   δακτυλικό → επιβεβαίωση → οθόνη με τις νέες λέξεις → τσεκάρισμα → Συνέχεια.
   Κανένα κάλεσμα εσωτερικής συνάρτησης. */
async function rotate(p) {
  await settings(p);
  p.once('dialog', (d) => d.accept());
  await p.locator('#st-rotate').click();
  await expect(p.locator('#s-words')).toBeVisible({ timeout: 20000 });
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  return w;
}
async function signIn(p, email, words) {
  await p.locator('#acc-yes').click();
  await p.locator('#si-email').fill(email);
  await p.locator('#si-words').fill(words.join(' '));
  await p.locator('#si-go').click();
}
const mail = (t) => t + Date.now() + Math.random().toString(36).slice(2) + '@example.com';

test('Ρ1 · 🔴 ΜΕΤΑ ΤΗΝ ΑΛΛΑΓΗ: ΟΙ ΝΕΕΣ ΛΕΞΕΙΣ ΑΝΟΙΓΟΥΝ ΤΑ ΙΔΙΑ ΤΙΜΟΛΟΓΙΑ — ΚΑΝΕΝΑ ΔΕΝ ΞΑΝΑΓΡΑΦΤΗΚΕ', async ({ browser }) => {
  const e = mail('r1-');
  const A = await device(browser);
  await addAuthenticator(A.ctx, A.p);
  await onboard(A.p, e);
  await seedShots(A.p, 3, 'ROT');
  await runSync(A.p);
  const before = await A.p.evaluate(() => ({ k: localStorage.getItem('km_k'), folder: localStorage.getItem('km_folder'), lock: localStorage.getItem('km_lock') }));
  expect(before.k).toBeTruthy();

  const neo = await rotate(A.p);
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_words')),
    { timeout: 30000, intervals: [400] }).toBe(neo.join(' '));

  /* 🔴 ΤΟ ΚΛΕΙΔΙ ΔΕΔΟΜΕΝΩΝ ΚΑΙ Ο ΦΑΚΕΛΟΣ ΔΕΝ ΑΛΛΑΞΑΝ — η κλειδαριά ναι. */
  const after = await A.p.evaluate(() => ({ k: localStorage.getItem('km_k'), folder: localStorage.getItem('km_folder'), lock: localStorage.getItem('km_lock') }));
  expect(after.k).toBe(before.k);
  expect(after.folder).toBe(before.folder);
  expect(after.lock).not.toBe(before.lock);

  /* Και η απόδειξη που μετράει: ΝΕΑ συσκευή, ΝΕΕΣ λέξεις, τα ίδια τιμολόγια. */
  const B = await device(browser);
  await signIn(B.p, e, neo);
  await expect(B.p.locator('#s-key')).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => (await rows(B.p)).length, { timeout: 60000 }).toBe(3);
  expect(await rows(B.p)).toEqual(['ΠΡΟΜ ROT0', 'ΠΡΟΜ ROT1', 'ΠΡΟΜ ROT2']);
  await A.ctx.close(); await B.ctx.close();
});

test('Ρ2 · 🔴 ΟΙ ΠΑΛΙΕΣ ΛΕΞΕΙΣ ΠΕΘΑΙΝΟΥΝ — ΚΑΙ Η ΚΛΕΙΔΑΡΙΑ ΚΑΙ Ο ΠΑΛΙΟΣ ΚΩΔΙΚΟΣ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ', async ({ browser }) => {
  const e = mail('r2-');
  const A = await device(browser);
  await addAuthenticator(A.ctx, A.p);
  const palies = await onboard(A.p, e);
  await seedShots(A.p, 1, 'OLD');
  await runSync(A.p);
  const before = await A.p.evaluate(() => ({ folder: localStorage.getItem('km_folder'), lockAuth: localStorage.getItem('km_lock_auth'), lock: localStorage.getItem('km_lock') }));
  await rotate(A.p);
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_lock')),
    { timeout: 30000, intervals: [400] }).not.toBe(before.lock);

  /* (α) Η ΠΑΛΙΑ ΚΛΕΙΔΑΡΙΑ: σύνδεση με τις παλιές λέξεις πρέπει να ΑΠΟΤΥΧΕΙ. */
  const B = await device(browser);
  await signIn(B.p, e, palies);
  await expect(B.p.locator('#si-err')).toBeVisible({ timeout: 25000 });
  await expect(B.p.locator('#s-key')).toBeHidden();

  await A.ctx.close(); await B.ctx.close();
});

/* Χωριστό τεστ ΕΠΙΤΗΔΕΣ: στο Ρ2 η μετάλλαξη χτυπάει πρώτα τη σύνδεση, οπότε
   η πλάγια πόρτα δεν θα αποδεικνυόταν ποτέ μόνη της (μετρήθηκε 7/9). Ένας
   φρουρός, ένα τεστ, ένα κόκκινο. */
test('Ρ2β · 🔴 Η ΠΛΑΓΙΑ ΠΟΡΤΑ ΚΛΕΙΝΕΙ: ο κωδικός της παλιάς κλειδαριάς δεν περνάει ούτε χωρίς κεφαλίδα κλειδαριάς', async ({ browser }) => {
  const e = mail('r2b-');
  const A = await device(browser);
  await addAuthenticator(A.ctx, A.p);
  await onboard(A.p, e);
  await seedShots(A.p, 1, 'SIDE');
  await runSync(A.p);
  const before = await A.p.evaluate(() => ({ folder: localStorage.getItem('km_folder'), lockAuth: localStorage.getItem('km_lock_auth') }));
  const B = await device(browser);
  const call = (folder, auth) => B.p.evaluate(async ({ folder, auth }) => {
    const r = await fetch('/api/km/status', { headers: {
      'X-Km-Folder': folder, 'X-Km-Auth': auth, 'X-Km-Device': localStorage.getItem('km_install_id')
    } });
    return r.status;
  }, { folder, auth });

  /* 🔴 ΘΕΤΙΚΟ ΔΕΙΓΜΑ ΕΛΕΓΧΟΥ, ΠΡΙΝ την αλλαγή: η ίδια ακριβώς κλήση ΠΕΡΝΑΕΙ.
     Χωρίς αυτό, ένα 403 από άλλη αιτία θα έδειχνε «φρουρός» εκεί που δεν
     υπάρχει — ακριβώς η ψευδώς πράσινη πρώτη μορφή αυτού του τεστ. */
  expect(await call(before.folder, before.lockAuth)).toBe(200);

  await rotate(A.p);
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_lock_auth')),
    { timeout: 30000, intervals: [400] }).not.toBe(before.lockAuth);

  /* Και τώρα η ΙΔΙΑ κλήση πρέπει να κλείσει. */
  expect(await call(before.folder, before.lockAuth)).toBe(403);
  await A.ctx.close(); await B.ctx.close();
});

test('Ρ3 · 🔴 ΑΝ Ο SERVER ΔΕΝ ΔΕΧΤΕΙ, ΤΙΠΟΤΑ ΤΟΠΙΚΑ ΔΕΝ ΑΛΛΑΖΕΙ — ΟΙ ΠΑΛΙΕΣ ΛΕΞΕΙΣ ΜΕΝΟΥΝ ΖΩΝΤΑΝΕΣ', async ({ browser }) => {
  const e = mail('r3-');
  const A = await device(browser);
  await addAuthenticator(A.ctx, A.p);
  const palies = await onboard(A.p, e);
  await seedShots(A.p, 2, 'KEEP');
  await runSync(A.p);
  const before = await A.p.evaluate(() => ({ words: localStorage.getItem('km_words'), lock: localStorage.getItem('km_lock'), auth: localStorage.getItem('km_auth'), k: localStorage.getItem('km_k') }));

  /* Ο server απαντάει «όχι» σε κάθε νέα κλειδαριά. */
  await A.p.route('**/api/km/lock', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }));
  await rotate(A.p);
  await expect(A.p.locator('#w-err')).toBeVisible({ timeout: 30000 });
  await A.p.unroute('**/api/km/lock');

  const after = await A.p.evaluate(() => ({ words: localStorage.getItem('km_words'), lock: localStorage.getItem('km_lock'), auth: localStorage.getItem('km_auth'), k: localStorage.getItem('km_k') }));
  expect(after).toEqual(before);

  /* Και η απόδειξη ότι οι παλιές λέξεις ΟΝΤΩΣ ισχύουν ακόμα. */
  const B = await device(browser);
  await signIn(B.p, e, palies);
  await expect(B.p.locator('#s-key')).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => (await rows(B.p)).length, { timeout: 60000 }).toBe(2);
  await A.ctx.close(); await B.ctx.close();
});

/* v35 · Η.3 — ΕΝΕΡΓΗ ΣΥΣΚΕΥΗ, ΟΙ ΑΛΛΕΣ ΑΝΑΓΝΩΣΗ
   ⚠ ΓΙΑΤΙ ΔΥΟ CONTEXTS ΚΑΙ ΟΧΙ ΔΥΟ ΚΑΡΤΕΛΕΣ: δύο καρτέλες του ίδιου
   context μοιράζονται localStorage και IndexedDB — θα ήταν η ΙΔΙΑ συσκευή
   με δύο παράθυρα, και το τεστ θα «περνούσε» χωρίς να δοκιμάσει τίποτα.
   Κάθε context είναι δικός του αποθηκευτικός χώρος, δηλαδή άλλο κινητό. */
const { test, expect } = require('@playwright/test');
const APP = 'http://127.0.0.1:8788/kostometro/';

/* Κάθε τεστ εδώ στήνει ΔΥΟ ολόκληρες συσκευές (εγγραφή, 12 λέξεις,
   συγχρονισμό, σύνδεση) πριν φτάσει σε αυτό που δοκιμάζει. Το προεπιλεγμένο
   όριο των 45″ το κόβει στη μέση και δίνει «αποτυχία» που δεν είναι
   αποτυχία — ακριβώς το τυχαία πεσμένο τεστ που μαθαίνεις να αγνοείς. */
test.describe.configure({ timeout: 150000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  /* ⚠ Η ΠΡΩΤΗ ΦΟΡΤΩΣΗ ΚΑΘΕ ΚΑΘΑΡΗΣ ΣΥΣΚΕΥΗΣ ΞΑΝΑΦΟΡΤΩΝΕΤΑΙ ΜΟΝΗ ΤΗΣ.
     Ο service worker εγκαθίσταται, παίρνει τον έλεγχο, και το
     'controllerchange' κάνει location.reload() — σκόπιμα (v30: τέλος το
     «κλείσ' το δύο φορές»). Το τεστ που δεν το περιμένει πατάει κουμπιά σε
     σελίδα που φεύγει κάτω από τα πόδια του και πέφτει τυχαία. Περιμένουμε
     να ησυχάσει, όπως θα έκανε και ο άνθρωπος. */
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
  await p.waitForTimeout(600);
  return w;
}
async function signIn(p, email, words) {
  for (let i = 0; i < 6; i++) {
    try {
      await expect(p.locator('#s-acc')).toBeVisible({ timeout: 8000 });
      await p.locator('#acc-yes').click();
      await expect(p.locator('#s-signin')).toBeVisible({ timeout: 4000 });
      await p.locator('#si-email').fill(email);
      await p.locator('#si-words').fill(words.join(' '));
      await p.locator('#si-go').click();
      await expect(p.locator('#s-key')).toBeVisible({ timeout: 25000 });
      return;
    } catch (e) { await p.waitForTimeout(500); }
  }
  throw new Error('δεν έγινε η σύνδεση');
}
async function seedShots(p, n, tag, amounts) {
  return p.evaluate(async ({ n, tag, amounts }) => {
    const mk = (seed) => new Blob([new Uint8Array(20 * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const ids = [];
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        const id = tag + i + '-' + Math.random().toString(36).slice(2, 8);
        ids.push(id);
        st.put({ id, ts: Date.now(), supplier: 'ΠΡΟΜ ' + tag + i, invDate: Date.now(),
                 blob: mk(i), pages: [],
                 net: amounts ? 100 + i : null, vat: amounts ? 19 : null, total: amounts ? 119 + i : null });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    return ids;
  }, { n, tag, amounts });
}
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier, total: x.total, blob: x.blob ? x.blob.size : 0 }))); };
  }));
}
async function settings(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
}
async function settled(p) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    let now;
    try { now = await p.locator('#st-sync').textContent(); } catch (e) { now = null; }
    if (now && now === last && !/ανεβαίνει|κατεβάζει|εξέλιξη|ξεκινάει/.test(now)) { return now; }
    last = now;
    await p.waitForTimeout(500);
  }
  return last;
}
async function runSync(p) {
  await settings(p);
  await p.evaluate(() => new Promise((res) => {
    document.getElementById('st-sync-now').click();
    const t = setInterval(() => { if (!document.getElementById('st-sync-now').disabled) { clearInterval(t); res(); } }, 200);
  }));
  return settled(p);
}
/* Ο μόνος έντιμος τρόπος να ρωτήσεις «τι νομίζει η ΕΦΑΡΜΟΓΗ ότι είναι»:
   το ίδιο κλειδί που διαβάζει ο κώδικας, όχι μια οθόνη που μπορεί να μην
   έχει ξαναζωγραφιστεί (Α400 §Γ, 3/9: ακίνητο διαγνωστικό λέει ψέματα). */
/* Η οθόνη ανάγνωσης εμφανίζεται από την ΙΔΙΑ διαδρομή που τη βλέπει ο
   χρήστης: πας στην κάμερα, η εφαρμογή καταλαβαίνει ότι δεν είναι ενεργή και
   βάζει την οθόνη μόνη της. Στήσιμο του DOM με το χέρι θα δοκίμαζε το τεστ,
   όχι την εφαρμογή. */
async function showReader(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-cam').hidden = false; });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(p.locator('#ro')).toBeVisible({ timeout: 10000 });
}
async function state(p) { return p.evaluate(() => localStorage.getItem('km_active')); }

/* Η ενεργοποίηση ζητάει επιβεβαίωση, όχι 12 λέξεις (απόφαση Stavros 4/9).
   Ο Playwright ΑΠΟΡΡΙΠΤΕΙ κάθε διάλογο από προεπιλογή — χωρίς ρητό handler
   το τεστ θα δοκίμαζε το «Άκυρο» νομίζοντας ότι δοκιμάζει το «ΟΚ». */
async function activate(p, answer) {
  p.once('dialog', (d) => (answer ? d.accept() : d.dismiss()));
  await p.locator('#ro-go').click();
}

test('36 · η ΝΕΑ συσκευή γίνεται ενεργή και η παλιά περνάει ΜΟΝΗ ΤΗΣ σε ανάγνωση', async ({ browser }) => {
  const email = 'act' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 2, 'A', true);
  expect(await runSync(d1.p)).toContain('2/2 φωτογραφίες στον server');
  expect(await state(d1.p)).toBe('1');                 // ενεργή, όπως πρέπει

  const d2 = await device(browser);                     // άλλο κινητό
  await signIn(d2.p, email, words);
  await expect.poll(async () => state(d2.p), { timeout: 20000 }).toBe('1');

  /* Η ΠΡΩΤΗ το μαθαίνει ΑΠΟ ΤΗΝ ΙΔΙΑ ΤΗΝ ΠΡΟΣΠΑΘΕΙΑ ΝΑ ΑΝΕΒΑΣΕΙ — καμία
     επαναφορά, κανένα visibilitychange. Είναι η πραγματική στιγμή: ο χρήστης
     κάθεται μέσα στην εφαρμογή και δεν πάει πουθενά, ενώ η σκυτάλη έχει ήδη
     περάσει αλλού. Αν το τεστ έστελνε visibilitychange, θα περνούσε μέσω του
     maybePull και δεν θα δοκίμαζε αυτή τη διαδρομή καθόλου. */
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');
  await d1.ctx.close(); await d2.ctx.close();
});

test('37 · σε αναγνώστρια συσκευή η κάμερα ΔΕΝ ανοίγει και η λήψη δεν καταγράφει', async ({ browser }) => {
  const email = 'cam' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 1, 'C', true);
  await runSync(d1.p);
  const d2 = await device(browser);
  await signIn(d2.p, email, words);                     // η d2 παίρνει τη σκυτάλη
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');

  // ο χρήστης πάει στην κάμερα
  await d1.p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); });
  await d1.p.evaluate(() => { document.getElementById('s-cam').hidden = false; });
  await d1.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await d1.p.waitForTimeout(1200);

  const before = (await rows(d1.p)).length;
  await d1.p.evaluate(() => document.getElementById('shutter').click());
  await d1.p.waitForTimeout(800);
  expect((await rows(d1.p)).length).toBe(before);        // τίποτα δεν καταγράφηκε
  expect(await d1.p.locator('#ro').isVisible()).toBe(true);
  expect(await d1.p.evaluate(() => !!document.getElementById('vid').srcObject)).toBe(false);
  await d1.ctx.close(); await d2.ctx.close();
});

test('38 · «Κάνε αυτή τη συσκευή ενεργή»: κατεβάζει ΠΡΩΤΑ, ενεργοποιεί ΜΕΤΑ', async ({ browser }) => {
  const email = 'back' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 2, 'B', true);
  await runSync(d1.p);

  const d2 = await device(browser);
  await signIn(d2.p, email, words);
  await expect.poll(async () => (await rows(d2.p)).length, { timeout: 45000 }).toBe(2);
  await seedShots(d2.p, 1, 'NEW', true);                // η d2 προσθέτει ένα δικό της
  await runSync(d2.p);

  // η d1 παίρνει πίσω την επεξεργασία
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');
  await showReader(d1.p);
  await activate(d1.p, true);
  await expect.poll(async () => {
    return { act: await state(d1.p), err: await d1.p.locator('#ro-err').textContent(), btn: await d1.p.locator('#ro-go').textContent() };
  }, { timeout: 45000 }).toEqual({ act: '1', err: '', btn: 'Κάνε αυτή τη συσκευή ενεργή' });
  // ΤΟ ΚΑΤΕΒΑΣΜΑ ΕΓΙΝΕ ΠΡΙΝ: το τιμολόγιο της d2 είναι εδώ
  const ids = (await rows(d1.p)).map((r) => r.id);
  expect(ids.filter((i) => i.indexOf('NEW') === 0).length).toBe(1);
  expect(ids.length).toBe(3);
  // και η d2 έπεσε σε ανάγνωση
  await runSync(d2.p);
  await expect.poll(async () => state(d2.p), { timeout: 20000 }).toBe('0');
  await d1.ctx.close(); await d2.ctx.close();
});

test('39 · 🔴 αν το κατέβασμα ΑΠΟΤΥΧΕΙ, η συσκευή ΔΕΝ γίνεται ενεργή', async ({ browser }) => {
  const email = 'guard' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 2, 'G', true);
  await runSync(d1.p);
  const d2 = await device(browser);
  await signIn(d2.p, email, words);
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');

  await d1.p.route('**/api/km/folder*', (r) => r.abort());   // πέφτει το δίκτυο
  await showReader(d1.p);
  await activate(d1.p, true);
  await expect(d1.p.locator('#ro-err')).toBeVisible({ timeout: 30000 });
  expect(await state(d1.p)).toBe('0');                        // ΠΑΡΕΜΕΙΝΕ αναγνώστρια
  await d1.p.unroute('**/api/km/folder*');
  // και ο server συμφωνεί: η d2 είναι ακόμα η ενεργή
  await runSync(d2.p);
  expect(await state(d2.p)).toBe('1');
  await d1.ctx.close(); await d2.ctx.close();
});

test('40 · τα ποσά που συμπληρώθηκαν στην ΕΝΕΡΓΗ φτάνουν στην αναγνώστρια', async ({ browser }) => {
  const email = 'amt' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  const ids = await seedShots(d1.p, 1, 'P', false);       // ΧΩΡΙΣ ποσά — όπως στην πόρτα
  await runSync(d1.p);

  const d2 = await device(browser);
  await signIn(d2.p, email, words);                       // η d2 γίνεται ενεργή
  await expect.poll(async () => (await rows(d2.p)).length, { timeout: 45000 }).toBe(1);
  expect((await rows(d2.p))[0].total).toBe(null);

  // η ΕΝΕΡΓΗ συμπληρώνει τα ποσά αργότερα, με την ησυχία της
  await d2.p.evaluate(async (id) => {
    const db = await new Promise((res) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); });
    const g = db.transaction('shots', 'readonly').objectStore('shots').get(id);
    await new Promise((res) => { g.onsuccess = res; });
    const rec = g.result; rec.net = 100; rec.vat = 19; rec.total = 119;
    await new Promise((res) => { const t = db.transaction('shots', 'readwrite'); t.objectStore('shots').put(rec); t.oncomplete = res; });
  }, ids[0]);
  await runSync(d2.p);

  // η ΑΝΑΓΝΩΣΤΡΙΑ τα βλέπει — αυτό έλειπε ως το v34
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');
  await d1.p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => (await rows(d1.p))[0].total, { timeout: 45000 }).toBe(119);
  // και η φωτογραφία της ΔΕΝ πειράχτηκε
  expect((await rows(d1.p))[0].blob).toBeGreaterThan(0);
  await d1.ctx.close(); await d2.ctx.close();
});

test('41 · το κατέβασμα τρέχει στην ΕΠΑΝΑΦΟΡΑ, χωρίς να ξανανοίξει η εφαρμογή', async ({ browser }) => {
  const email = 'res' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 1, 'R', true);
  await runSync(d1.p);

  const d2 = await device(browser);
  await signIn(d2.p, email, words);
  await expect.poll(async () => (await rows(d2.p)).length, { timeout: 45000 }).toBe(1);

  // η ενεργή (d2) προσθέτει ΝΕΟ τιμολόγιο
  await seedShots(d2.p, 1, 'LATE', true);
  await runSync(d2.p);

  // η d1 ΔΕΝ ξαναφορτώνεται· απλώς επιστρέφει στο προσκήνιο
  const before = (await rows(d1.p)).length;
  await d1.p.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await rows(d1.p)).length, { timeout: 45000 }).toBe(before + 1);
  await d1.ctx.close(); await d2.ctx.close();
});

test('42 · η ΑΚΥΡΩΣΗ της επιβεβαίωσης ΔΕΝ αλλάζει τίποτα, σε καμία από τις δύο συσκευές', async ({ browser }) => {
  /* Με επιβεβαίωση αντί για 12 λέξεις (απόφαση Stavros 4/9), το «Άκυρο»
     γίνεται ο μόνος φρουρός απέναντι στο κατά λάθος πάτημα. Αν δεν κρατάει,
     ένα άγγιγμα στην τσέπη περνάει τη σκυτάλη χωρίς να το πάρει κανείς
     είδηση — και η άλλη συσκευή σταματάει σιωπηλά να ανεβάζει. */
  const email = 'cancel' + Date.now() + '@example.com';
  const d1 = await device(browser);
  const words = await onboard(d1.p, email);
  await seedShots(d1.p, 1, 'X', true);
  await runSync(d1.p);
  const d2 = await device(browser);
  await signIn(d2.p, email, words);
  await runSync(d1.p);
  await expect.poll(async () => state(d1.p), { timeout: 20000 }).toBe('0');

  await showReader(d1.p);
  // το πεδίο των 12 λέξεων ΔΕΝ εμφανίζεται πια εδώ
  expect(await d1.p.locator('#ro-wbox').isVisible()).toBe(false);

  await activate(d1.p, false);              // ο χρήστης πατάει «Άκυρο»
  await d1.p.waitForTimeout(4000);
  expect(await state(d1.p)).toBe('0');      // τίποτα δεν άλλαξε εδώ
  await runSync(d2.p);
  expect(await state(d2.p)).toBe('1');      // ούτε εκεί: η d2 είναι ακόμα η ενεργή
  await d1.ctx.close(); await d2.ctx.close();
});

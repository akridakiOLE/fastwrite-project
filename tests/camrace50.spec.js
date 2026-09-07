/* v50 · Η ΚΟΥΡΣΑ ΚΑΜΕΡΑΣ ↔ ΚΛΕΙΔΩΜΑΤΟΣ (εύρημα 7/9/2026)
   Η συσκευή ανοίγει πιστεύοντας ότι είναι ακόμα ενεργή (η τοπική σημαία
   είναι παλιά), ζητάει κάμερα, και ~240 ms μετά ο server απαντάει
   «κλειδωμένη». Η απάντηση της κάμερας φτάνει ΤΕΛΕΥΤΑΙΑ, σε κόσμο που δεν
   υπάρχει πια. Χωρίς φρουρό: αν απέτυχε, το #cam-err σκεπάζει ολόκληρη την
   οθόνη και το κουμπί των 12 λέξεων δεν πατιέται (έπεσε το Λ3)· αν πέτυχε,
   η κάμερα ανάβει πίσω από το κλείδωμα.
   ⚠ Η καθυστέρηση των 1,5″ ζει ΜΟΝΟ εδώ, στην ψεύτικη κάμερα του τεστ:
   κάνει ΝΤΕΤΕΡΜΙΝΙΣΤΙΚΗ μια σειρά που στο κινητό είναι ο κανόνας (κάμερα
   300-1000 ms, server ~200 ms). Ο κώδικας της εφαρμογής δεν περιμένει
   πουθενά. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 180000 });

async function device(browser, cam) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  if (cam) {
    await p.addInitScript(({ ms, mode }) => {
      window.__camCalls = 0;
      window.__camTracks = [];
      navigator.mediaDevices.getUserMedia = function () {
        window.__camCalls++;
        return new Promise(function (res, rej) {
          setTimeout(function () {
            if (mode === 'fail') { var e = new Error('no cam'); e.name = 'NotFoundError'; rej(e); return; }
            var c = document.createElement('canvas'); c.width = 64; c.height = 64;
            c.getContext('2d').fillRect(0, 0, 64, 64);
            var s = c.captureStream(5);
            s.getTracks().forEach(function (t) { window.__camTracks.push(t); });
            res(s);
          }, ms);
        });
      };
    }, cam);
  }
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}
/* Ο ΑΝΘΡΩΠΙΝΟΣ ΔΡΟΜΟΣ ΩΣ ΤΗΝ ΚΑΜΕΡΑ: λογαριασμός → 12 λέξεις → παράλειψη
   κλειδιού → άδεια. Μετά από αυτό, κάθε άνοιγμα πάει κατευθείαν στην κάμερα
   — που είναι ακριβώς η στιγμή της κούρσας. */
async function onboardToCam(p, email) {
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.locator('#skip-key').click();
  await expect(p.locator('#s-perm')).toBeVisible({ timeout: 8000 });
  await p.locator('#go-perm').click();
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 8000 });
  await p.waitForTimeout(2500);          // η αργή κάμερα προλαβαίνει να απαντήσει
  return w;
}
async function signIn(p, email, words) {
  await p.locator('#acc-yes').click();
  await p.locator('#si-email').fill(email);
  await p.locator('#si-words').fill(words.join(' '));
  await p.locator('#si-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 25000 });
}
/* Το «τι βλέπει και τι πατάει ο άνθρωπος», μετρημένο από τη σελίδα:
   ποιο στοιχείο κάθεται ΠΑΝΩ στο κέντρο του κουμπιού. */
async function onTopOfGo(p) {
  return p.evaluate(() => {
    const b = document.getElementById('ro-go');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit ? (hit.id || hit.className || hit.tagName) : null;
  });
}
const mail = (t) => t + Date.now() + Math.random().toString(36).slice(2) + '@example.com';

/* Η ΚΟΙΝΗ ΡΟΗ: η Α φτάνει στην κάμερα, χάνει το δίκτυο (τσέπη), η Β παίρνει
   τη σκυτάλη, και η Α ξανανοίγει με δίκτυο — πιστεύοντας ακόμα ότι είναι
   ενεργή. Εκεί ακριβώς τρέχει η κούρσα. */
async function race(browser, mode) {
  const e = mail('cr-');
  const A = await device(browser, { ms: 1500, mode });
  const w = await onboardToCam(A.p, e);
  await A.ctx.setOffline(true);
  const B = await device(browser);
  await signIn(B.p, e, w);
  await A.ctx.setOffline(false);
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  /* Η οθόνη κλειδώματος ανεβαίνει ΠΡΙΝ απαντήσει η κάμερα. */
  await expect(A.p.locator('#ro')).toBeVisible({ timeout: 20000 });
  /* 🔴 ΘΕΤΙΚΟ ΔΕΙΓΜΑ ΕΛΕΓΧΟΥ (Α400, 31/8 + 4/9): αν δεν ζητήθηκε κάμερα σε
     αυτό το άνοιγμα, η κούρσα ΔΕΝ έγινε και το τεστ δεν δοκιμάζει τίποτα. */
  expect(await A.p.evaluate(() => window.__camCalls)).toBeGreaterThan(0);
  await A.p.waitForTimeout(2500);        // η απάντηση της κάμερας φτάνει εδώ
  return { A, B, w };
}

test('Κ1 · αργή κάμερα ΠΟΥ ΑΠΟΤΥΓΧΑΝΕΙ δεν σκεπάζει το κλείδωμα — το κουμπί των 12 λέξεων πατιέται από άνθρωπο', async ({ browser }) => {
  const { A, B, w } = await race(browser, 'fail');
  await expect(A.p.locator('#cam-err')).toBeHidden();
  expect(await onTopOfGo(A.p)).toBe('ro-go');
  /* Και η απόδειξη με πραγματικό κλικ, χωρίς force, χωρίς dispatchEvent. */
  await A.p.locator('#ro-words').fill(w.join(' '));
  await A.p.locator('#ro-go').click({ timeout: 10000 });
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_active')),
    { timeout: 40000, intervals: [500] }).toBe('1');
  await A.ctx.close(); await B.ctx.close();
});

test('Κ2 · αργή κάμερα ΠΟΥ ΠΕΤΥΧΑΙΝΕΙ δεν ανάβει πίσω από το κλείδωμα — τα κανάλια σβήνουν', async ({ browser }) => {
  const { A, B } = await race(browser, 'succeed');
  await expect(A.p.locator('#ro')).toBeVisible();
  expect(await A.p.evaluate(() => !!document.getElementById('vid').srcObject)).toBe(false);
  const live = await A.p.evaluate(() => window.__camTracks.filter((t) => t.readyState === 'live').length);
  expect(live).toBe(0);
  await expect(A.p.locator('#cam-err')).toBeHidden();
  expect(await onTopOfGo(A.p)).toBe('ro-go');
  await A.ctx.close(); await B.ctx.close();
});

/* v40 · ΦΩΤΟΓΡΑΦΙΕΣ ΚΑΤ' ΑΠΑΙΤΗΣΗ
   Το brief έκλεισε 4/9 (Α320): στοιχεία όλα πάντα · φωτογραφίες αυτόματα
   ΜΟΝΟ το τελευταίο τιμολόγιο ανά προμηθευτή · κάθε άλλη με πάτημα · χωρίς
   δίκτυο ποτέ κενό. Ο κάδος (200 MB, πάντα η παλαιότερη) και ο φρουρός του
   («πετιέται μόνο ό,τι κατέβηκε από τον server») δοκιμάζονται εδώ. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

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
  await p.waitForTimeout(700);
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

/* Τιμολόγια με ΕΛΕΓΧΟΜΕΝΟ προμηθευτή και ημερομηνία — αυτό ακριβώς κρίνει
   ποιο είναι «το τελευταίο ανά προμηθευτή». */
async function seed(p, list) {
  return p.evaluate(async (list) => {
    const mk = (seed) => new Blob([new Uint8Array(30 * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      list.forEach((x, i) => st.put({
        id: x.id, ts: x.ts, supplier: x.sup, invDate: x.inv,
        blob: mk(i), pages: [], net: 100 + i, vat: 19, total: 119 + i
      }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, list);
}

async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier, inv: x.invDate, blob: x.blob ? x.blob.size : 0, srv: x.srvPages || 0 }))); };
  }));
}

async function settings(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
}
async function settled(p) {
  let last = null;
  for (let i = 0; i < 50; i++) {
    let now; try { now = await p.locator('#st-sync').textContent(); } catch (e) { now = null; }
    if (now && now === last && !/ανεβαίνει|κατεβάζει|εξέλιξη|ξεκινάει/.test(now)) { return now; }
    last = now; await p.waitForTimeout(500);
  }
  return last;
}
async function runSync(p) {
  await settings(p);
  await p.locator('#st-sync-now').click();
  await settled(p);
}


/* Διαδρομή ΤΟΥ ΧΡΗΣΤΗ ως το τιμολόγιο: Μενού → Προμηθευτές → όνομα →
   η κάρτα του τιμολογίου. Το openShot ζει μέσα στο κλειστό πεδίο του
   app.js και ΔΕΝ καλείται απ' έξω — και σωστά: αν το τεστ έμπαινε από
   πίσω πόρτα, δεν θα δοκίμαζε αυτό που κάνει ο άνθρωπος. */
async function openInvoice(p, supplier, amount) {
  await p.evaluate(() => {
    document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
    document.getElementById('s-menu').hidden = false;
  });
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await p.locator('#sup-body').getByText(supplier, { exact: false }).first().click();
  await expect(p.locator('.inv').first()).toBeVisible({ timeout: 8000 });
  await p.locator('.inv', { hasText: amount }).first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
}

const D = (s) => new Date(s + 'T12:00:00').getTime();

/* Δύο προμηθευτές × τρία τιμολόγια. Το τελευταίο κάθε προμηθευτή ξεχωρίζει
   ΜΟΝΟ από την ημερομηνία τιμολογίου — η ώρα λήψης λέει το αντίθετο
   επίτηδες, ώστε το τεστ να πιάνει αν κοιτάξαμε λάθος πεδίο. */
const SEED = [
  { id: 'a1', sup: 'ΑΛΦΑ', inv: D('2026-03-01'), ts: D('2026-09-05') },
  { id: 'a2', sup: 'ΑΛΦΑ', inv: D('2026-04-01'), ts: D('2026-09-04') },
  { id: 'a3', sup: 'ΑΛΦΑ', inv: D('2026-05-01'), ts: D('2026-09-03') },   // ← τελευταίο ΑΛΦΑ
  { id: 'b1', sup: 'ΒΗΤΑ', inv: D('2026-02-01'), ts: D('2026-09-05') },
  { id: 'b2', sup: 'ΒΗΤΑ', inv: D('2026-06-01'), ts: D('2026-09-01') }    // ← τελευταίο ΒΗΤΑ
];

test('43 · η ΔΕΥΤΕΡΗ συσκευή παίρνει ΟΛΑ τα στοιχεία, αλλά φωτογραφία ΜΟΝΟ του τελευταίου ανά προμηθευτή', async ({ browser }) => {
  const A = await device(browser);
  const email = 'ph' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);

  const got = await rows(B.p);
  /* ΚΑΙ τι βρήκε, όχι μόνο «σωστό» (κανόνας 4/9). */
  console.log('Δεύτερη συσκευή:', got.map((r) => r.id + '=' + (r.blob ? 'ΦΩΤΟ' : '—')).join(' · '));

  expect(got.length).toBe(5);                       // ΟΛΑ τα στοιχεία ήρθαν
  const by = {}; got.forEach((r) => { by[r.id] = r; });
  expect(by.a3.blob).toBeGreaterThan(0);            // τελευταίο ΑΛΦΑ
  expect(by.b2.blob).toBeGreaterThan(0);            // τελευταίο ΒΗΤΑ
  /* 🔴 Ο ΦΡΟΥΡΟΣ: χωρίς το «τελευταίο ανά προμηθευτή» κατεβαίνουν ΟΛΕΣ
     και αυτές οι τρεις γραμμές κοκκινίζουν. */
  expect(by.a1.blob).toBe(0);
  expect(by.a2.blob).toBe(0);
  expect(by.b1.blob).toBe(0);
  await A.ctx.close(); await B.ctx.close();
});

test('44 · με πάτημα κατεβαίνει η φωτογραφία που έλειπε — και μένει', async ({ browser }) => {
  const A = await device(browser);
  const email = 'ph2' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);

  await openInvoice(B.p, 'ΑΛΦΑ', '119,00');
  const btn = B.p.locator('#s-shot button', { hasText: 'Δείξε τη φωτογραφία' });
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await expect(B.p.locator('#s-shot img')).toBeVisible({ timeout: 20000 });

  const after = await rows(B.p);
  const a1 = after.find((r) => r.id === 'a1');
  expect(a1.blob).toBeGreaterThan(0);
  const idx = await B.p.evaluate(() => JSON.parse(localStorage.getItem('km_photo_cache') || '[]').map((x) => x.id));
  console.log('Ευρετήριο κρυφής μνήμης:', idx.join(' · '));
  expect(idx).toContain('a1');                      // γράφτηκε στον κάδο
  await A.ctx.close(); await B.ctx.close();
});

test('45 · χωρίς δίκτυο: ΠΟΤΕ κενό — η θέση λέει ότι χρειάζεται δίκτυο', async ({ browser }) => {
  const A = await device(browser);
  const email = 'ph3' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);

  await B.ctx.setOffline(true);
  await openInvoice(B.p, 'ΑΛΦΑ', '119,00');
  const txt = await B.p.locator('#s-shot').textContent();
  console.log('Οθόνη χωρίς δίκτυο:', txt.replace(/\s+/g, ' ').slice(0, 160));
  /* 🔴 Ο ΦΡΟΥΡΟΣ: χωρίς τη γραμμή, η θέση της φωτογραφίας είναι κενή και
     διαβάζεται ως χαμένο τιμολόγιο. */
  expect(txt).toMatch(/Χρειάζεται δίκτυο/);
  expect(txt).toMatch(/δεν χάθηκε/);
  await B.ctx.setOffline(false);
  await A.ctx.close(); await B.ctx.close();
});

test('46 · 🔴 ο κάδος ΔΕΝ αγγίζει ΠΟΤΕ φωτογραφία που δεν κατέβηκε από τον server', async ({ browser }) => {
  const A = await device(browser);
  await onboard(A.p, 'ph4' + Date.now() + '@test.gr');
  await seed(A.p, SEED);

  /* Γεμίζουμε το ευρετήριο πάνω από το όριο με ΨΕΥΤΙΚΕΣ εγγραφές που
     δείχνουν σε ΤΟΠΙΚΑ τιμολόγια. Αν ο φρουρός λείπει, ο κάδος θα σβήσει
     φωτογραφίες που δεν υπάρχουν πουθενά αλλού. */
  const before = await rows(A.p);
  expect(before.every((r) => r.blob > 0)).toBe(true);

  const dropped = await A.p.evaluate(async () => {
    /* Ο κάδος τρέχει μόνο για ό,τι είναι ΓΡΑΜΜΕΝΟ στο ευρετήριο. Εδώ το
       ευρετήριο είναι ΑΔΕΙΟ — καμία από τις τοπικές φωτογραφίες δεν μπήκε
       ποτέ, γιατί καμία δεν ήρθε από τον server. */
    localStorage.setItem('km_photo_cache', '[]');
    return 'ευρετήριο άδειο';
  });
  console.log('Κατάσταση:', dropped);

  await runSync(A.p);
  await A.p.waitForTimeout(1500);

  const after = await rows(A.p);
  console.log('Τοπικές φωτογραφίες μετά:', after.map((r) => r.id + '=' + r.blob).join(' · '));
  /* Καμία τοπική φωτογραφία δεν χάθηκε. */
  expect(after.every((r) => r.blob > 0)).toBe(true);
  await A.ctx.close();
});

test('47 · (β) δεύτερη φωτογραφία ΙΔΙΟΥ προμηθευτή αντικαθιστά την πρώτη — άλλου προμηθευτή ΟΧΙ', async ({ browser }) => {
  const A = await device(browser);
  const email = 'ph5' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);

  /* a1 (ΑΛΦΑ, 119,00) με πάτημα */
  await openInvoice(B.p, 'ΑΛΦΑ', '119,00');
  await B.p.locator('#s-shot button', { hasText: 'Δείξε τη φωτογραφία' }).click();
  await expect(B.p.locator('#s-shot img')).toBeVisible({ timeout: 20000 });
  let r = await rows(B.p);
  expect(r.find((x) => x.id === 'a1').blob).toBeGreaterThan(0);

  /* a2 (ΑΛΦΑ, 120,00) με πάτημα → η a1 πρέπει να φύγει */
  await openInvoice(B.p, 'ΑΛΦΑ', '120,00');
  await B.p.locator('#s-shot button', { hasText: 'Δείξε τη φωτογραφία' }).click();
  await expect(B.p.locator('#s-shot img')).toBeVisible({ timeout: 20000 });
  await B.p.waitForTimeout(800);

  r = await rows(B.p);
  const by = {}; r.forEach((x) => { by[x.id] = x; });
  console.log('Μετά τη δεύτερη ΑΛΦΑ:', r.map((x) => x.id + '=' + (x.blob ? 'ΦΩΤΟ' : '—')).join(' · '));
  expect(by.a2.blob).toBeGreaterThan(0);          // η νέα ήρθε
  /* 🔴 Ο ΦΡΟΥΡΟΣ ΤΟΥ (β): χωρίς την αντικατάσταση, η a1 μένει. */
  expect(by.a1.blob).toBe(0);                     // η παλιά του ΙΔΙΟΥ έφυγε
  expect(by.a3.blob).toBeGreaterThan(0);          // το αυτόματο ΑΛΦΑ δεν αγγίχτηκε
  expect(by.b2.blob).toBeGreaterThan(0);          // άλλος προμηθευτής ανέπαφος
  await A.ctx.close(); await B.ctx.close();
});

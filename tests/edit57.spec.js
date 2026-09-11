/* v57 · Brief Γ — ΕΠΕΞΕΡΓΑΣΙΑ ΣΤΟΙΧΕΙΩΝ ΤΙΜΟΛΟΓΙΟΥ
   Ανοιχτό από 28/8/2026: τιμολόγιο της 10/04 καταχωρήθηκε 01/09 και δεν
   διορθωνόταν με τίποτα. Αιτία (μετρήθηκε 10/9): η ΜΟΝΗ οθόνη που
   επεξεργαζόταν τιμολόγιο ήταν τα «Εκκρεμή» — και το τιμολόγιο έφευγε από
   εκεί μόλις έμπαινε το Σύνολο.

   🔴 Ο ΚΑΝΟΝΑΣ ΠΟΥ ΦΥΛΑΝΕ ΤΑ ΤΕΣΤ 63-65 (απόφαση Stavros 10/9/2026):
      η πρόθεση διαβάζεται από το ΠΟΥ στέκεσαι, ποτέ από το τι πληκτρολόγησες.
        οθόνη τιμολογίου  -> αλλάζει ΜΟΝΟ αυτό, πάντα, καμία ερώτηση
        κάρτα προμηθευτή  -> αλλάζει ΟΛΑ, ρητά, με αναίρεση
      Η εφαρμογή ΔΕΝ έχει απόδειξη ότι «ΧΑΡΑΛΑΜΠΟΥΣ» και «ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ»
      είναι ο ίδιος προμηθευτής — άρα δεν το υποθέτει ποτέ.

   ⚠ Τα τεστ πατάνε ό,τι πατάει ο άνθρωπος (Α400 §Γ 6/9): καμία κλήση σε
   εσωτερική συνάρτηση, κανένα click({force:true}). */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 150000 });

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
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
}

async function seed(p, list) {
  return p.evaluate(async (list) => {
    const mk = (s) => new Blob([new Uint8Array(20 * 1024).map((_, i) => (i * 31 + s) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      list.forEach((x, i) => st.put({
        id: x.id, ts: x.ts, supplier: x.sup, invDate: x.inv,
        blob: mk(i), pages: [],
        net: x.net === undefined ? null : x.net,
        vat: x.vat === undefined ? null : x.vat,
        total: x.total === undefined ? null : x.total
      }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, list);
}

/* Η ΒΑΣΗ είναι η απόδειξη, όχι η οθόνη (Α400 §Γ). */
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier, inv: x.invDate, total: x.total, vat: x.vat, net: x.net })));
    };
  }));
}
const byId = (rs, id) => rs.filter((r) => r.id === id)[0];

async function toMenu(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-menu').hidden = false; });
}
async function openSupCard(p, name) {
  await toMenu(p);
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await p.locator('#sup-body .row-t', { hasText: name }).first().click();
  await expect(p.locator('#sup-body h2')).toHaveText(name, { timeout: 8000 });
}
async function openShotOf(p, name) {
  await openSupCard(p, name);
  await p.locator('.inv').first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
}

const D = (s) => new Date(s + 'T12:00:00').getTime();
const SEED = [
  { id: 'e1', ts: D('2026-09-01'), inv: D('2026-09-01'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ', total: 100, vat: 19, net: 81 },
  { id: 'e2', ts: D('2026-09-02'), inv: D('2026-09-02'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ', total: 200, vat: 38, net: 162 },
  { id: 'e3', ts: D('2026-09-03'), inv: D('2026-09-03'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ', total: 300, vat: 57, net: 243 },
  { id: 'k1', ts: D('2026-09-04'), inv: D('2026-09-04'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ', total: 400, vat: 76, net: 324 }
];

async function fresh(browser, email) {
  const d = await device(browser);
  await onboard(d.p, email);
  await seed(d.p, SEED);
  await d.p.reload();
  await d.p.waitForFunction(() => typeof kmNewWords === 'function');
  await d.p.waitForTimeout(1200);
  return d;
}

/* ── 61 · Η ΠΟΡΤΑ ΥΠΑΡΧΕΙ ────────────────────────────────────────────── */
test('61 · το αποθηκευμένο τιμολόγιο ανοίγει σε επεξεργασία και δείχνει τον προμηθευτή', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e61@fastwrite.tech');
  await openShotOf(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');

  /* Ο προμηθευτής ΔΕΝ υπήρχε καθόλου στη λίστα στοιχείων ως τη v56 */
  await expect(p.locator('#shot-body .kv', { hasText: 'Προμηθευτής' })).toBeVisible();
  await p.locator('#shot-edit').click();
  await expect(p.locator('#shot-sup-edit')).toBeVisible();
  await expect(p.locator('#shot-date-edit')).toBeVisible();
  await expect(p.locator('#shot-save')).toBeVisible();
  await ctx.close();
});

/* ── 62 · Η ΗΜΕΡΟΜΗΝΙΑ ΚΑΙ ΤΑ ΠΟΣΑ ΔΙΟΡΘΩΝΟΝΤΑΙ ─────────────────────── */
test('62 · η ημερομηνία και το ποσό διορθώνονται ΜΕΤΑ την αποθήκευση — το ανοιχτό της 28/8', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e62@fastwrite.tech');
  await openShotOf(p, 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ');
  await p.locator('#shot-edit').click();

  await p.locator('#shot-date-edit').click();
  await p.locator('#shot-date-inp').fill('2026-04-10');
  await p.locator('#shot-date-inp').dispatchEvent('change');
  await p.locator('.amts input').nth(2).fill('444,00');
  await p.locator('#shot-save').click();
  await p.waitForTimeout(900);

  const r = byId(await rows(p), 'k1');
  expect(new Date(r.inv).toISOString().slice(0, 10), 'η ημερομηνία δεν γράφτηκε').toBe('2026-04-10');
  expect(r.total, 'το ποσό δεν γράφτηκε').toBe(444);
  await ctx.close();
});

/* ── 63 · Ο ΦΡΟΥΡΟΣ ΤΗΣ ΑΠΟΦΑΣΗΣ: ΤΟ ΤΙΜΟΛΟΓΙΟ ΑΓΓΙΖΕΙ ΜΟΝΟ ΤΟΝ ΕΑΥΤΟ ΤΟΥ */
test('63 · αλλαγή προμηθευτή από το τιμολόγιο αλλάζει ΜΟΝΟ αυτό — τα άλλα 2 μένουν άθικτα', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e63@fastwrite.tech');
  await openShotOf(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#shot-edit').click();
  await p.locator('#shot-sup-edit').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });

  /* Γράφουμε ΝΕΟ όνομα — ακριβώς η περίπτωση όπου η παλιά σχεδίαση θα
     ρωτούσε «και στα άλλα 2;». Δεν ρωτάει. Δεν επιτρέπεται να ρωτήσει. */
  await p.locator('#who-tab-new').click();
  await p.locator('#in-sup').fill('ΝΕΟΣ ΠΡΟΜΗΘΕΥΤΗΣ');
  await p.locator('#add-sup').click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });

  const rs = await rows(p);
  const moved = rs.filter((r) => r.sup === 'ΝΕΟΣ ΠΡΟΜΗΘΕΥΤΗΣ');
  const stayed = rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ');
  expect(moved.length, 'μετακινήθηκε παραπάνω από ένα').toBe(1);
  expect(stayed.length, 'παρασύρθηκαν τιμολόγια που δεν έπρεπε').toBe(2);
  await ctx.close();
});

/* ── 64 · Η ΜΕΤΟΝΟΜΑΣΙΑ ΑΓΓΙΖΕΙ ΟΛΑ ─────────────────────────────────── */
test('64 · μετονομασία από την κάρτα προμηθευτή αλλάζει ΚΑΙ ΤΑ ΤΡΙΑ τιμολόγια', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e64@fastwrite.tech');
  await openSupCard(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#sup-rename').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
  await p.locator('#who-tab-new').click();
  await p.locator('#in-sup').fill('ΧΑΡΑΛΑΜΠΟΥΣ ΑΕ');
  p.once('dialog', (d) => d.accept());
  await p.locator('#add-sup').click();
  await p.waitForTimeout(1200);

  const rs = await rows(p);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ ΑΕ').length, 'δεν άλλαξαν όλα').toBe(3);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ').length, 'έμεινε πίσω τιμολόγιο').toBe(0);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ').length, 'πειράχτηκε άσχετος προμηθευτής').toBe(1);
  await ctx.close();
});

/* ── 65 · Η ΣΥΓΧΩΝΕΥΣΗ ΔΕΝ ΕΙΝΑΙ ΕΙΔΙΚΗ ΠΕΡΙΠΤΩΣΗ ───────────────────── */
test('65 · μετονομασία σε ΥΠΑΡΧΟΝ όνομα ενώνει τις δύο κάρτες σε μία με 4', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e65@fastwrite.tech');
  await openSupCard(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#sup-rename').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });

  /* Διαλέγουμε τον ΗΔΗ ΥΠΑΡΧΟΝΤΑ από τη λίστα — εδώ γεννιέται η συγχώνευση */
  let seen = '';
  p.once('dialog', (d) => { seen = d.message(); d.accept(); });
  await p.locator('#sup-list .sup', { hasText: 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ' }).first().click();
  await p.waitForTimeout(1200);

  expect(seen, 'η επιβεβαίωση δεν προειδοποίησε για ένωση').toContain('ενωθούν');
  const rs = await rows(p);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ').length, 'δεν ενώθηκαν').toBe(4);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ').length).toBe(0);
  await ctx.close();
});

/* ── 66 · Η ΑΝΑΙΡΕΣΗ ΣΗΚΩΝΕΙ ΤΗ ΜΑΖΙΚΗ ──────────────────────────────── */
test('66 · η αναίρεση 10″ επαναφέρει το παλιό όνομα και στα τρία', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e66@fastwrite.tech');
  await openSupCard(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#sup-rename').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
  await p.locator('#who-tab-new').click();
  await p.locator('#in-sup').fill('ΛΑΘΟΣ ΟΝΟΜΑ');
  p.once('dialog', (d) => d.accept());
  await p.locator('#add-sup').click();
  await p.waitForTimeout(1200);
  expect((await rows(p)).filter((r) => r.sup === 'ΛΑΘΟΣ ΟΝΟΜΑ').length).toBe(3);

  await p.locator('#sup-rename-undo').click();
  await p.waitForTimeout(1200);
  const rs = await rows(p);
  expect(rs.filter((r) => r.sup === 'ΧΑΡΑΛΑΜΠΟΥΣ').length, 'η αναίρεση δεν επανέφερε').toBe(3);
  expect(rs.filter((r) => r.sup === 'ΛΑΘΟΣ ΟΝΟΜΑ').length).toBe(0);
  await ctx.close();
});

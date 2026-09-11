/* v59 · «‹ ΕΠΙΣΤΡΟΦΗ» ΑΠΟ ΤΗ ΔΙΟΡΘΩΣΗ
   11/9/2026, εύρημα Stavros στο κινητό, αμέσως μετά τη v58: μπαίνεις σε
   μετονομασία, αλλάζεις γνώμη — και η εφαρμογή δεν έχει κουμπί εξόδου.
   Στο Android μόνο το «πίσω» του κινητού· στο iPhone τίποτα. Ο χρήστης
   έπρεπε να μετονομάσει και να πατήσει αναίρεση, κάτι που δεν μπορεί να
   ξέρει. Τα τεστ 70-72 πατάνε το κουμπί όπως ο άνθρωπος και ελέγχουν στη
   ΒΑΣΗ ότι δεν άλλαξε τίποτα.

   (Το ιστορικό της v58, για τα βοηθητικά που ακολουθούν:)
   v58 · Η ΟΘΟΝΗ «ΠΡΟΜΗΘΕΥΤΗΣ» ΣΕ ΛΕΙΤΟΥΡΓΙΑ ΔΙΟΡΘΩΣΗΣ
   11/9/2026, εύρημα Stavros από στιγμιότυπα της πρώτης δοκιμής της v57 σε
   πραγματικό κινητό: πίσω από την επιβεβαίωση μετονομασίας φαινόταν
   «Ημερομηνία τιμολογίου: 01/01/1970» και μια άδεια μικρογραφία. Η v57
   ξαναχρησιμοποιεί την οθόνη της λήψης (s-who) και δεν έκρυβε ό,τι έχει
   νόημα ΜΟΝΟ στη λήψη. Το πεδίο ημερομηνίας εκεί δεν έκανε τίποτα — αλλαγή
   που θα χανόταν σιωπηλά.

   🔴 ΚΑΙ ΤΟ ΣΟΒΑΡΟΤΕΡΟ, ΠΟΥ ΒΡΕΘΗΚΕ ΨΑΧΝΟΝΤΑΣ ΤΟ ΠΡΩΤΟ (ανάγνωση κώδικα,
   μετά μέτρηση εδώ): η s-who σε διόρθωση δεν έχει κουμπί «Επιστροφή» —
   φεύγεις μόνο με το «πίσω» του κινητού. Το «πίσω» ΔΕΝ καθάριζε τη
   σημαία διόρθωσης (whoEdit). Η ΕΠΟΜΕΝΗ κανονική λήψη έπεφτε σε
   διόρθωση: η νέα φωτογραφία δεν αποθηκευόταν, και
     · από τιμολόγιο: άλλαζε ΣΙΩΠΗΛΑ ο προμηθευτής του ΠΑΛΙΟΥ τιμολογίου
     · από κάρτα: έβγαινε ερώτηση μετονομασίας όλων των παλιών
   Τα τεστ 68/69 το αναπαράγουν όπως ο άνθρωπος: κουμπί, «πίσω», κλείστρο.

   ⚠ ΨΕΥΤΙΚΗ ΚΑΜΕΡΑ, όπως στο who42: κλείστρο → πραγματικό blob. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.use({
  launchOptions: {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  },
  permissions: ['camera']
});
test.describe.configure({ timeout: 150000 });

async function device(browser) {
  const ctx = await browser.newContext({ permissions: ['camera'] });
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
      list.forEach((x, i) => st.put({ id: x.id, ts: x.ts, supplier: x.sup, invDate: x.inv, blob: mk(i), pages: [], net: 81, vat: 19, total: 100 }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, list);
}
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier, total: x.total, inv: x.invDate })));
    };
  }));
}
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
/* Το «πίσω» του κινητού, όσες φορές χρειαστεί, ως την κάμερα. */
async function phoneBackToCam(p) {
  for (let i = 0; i < 6; i++) {
    if (await p.locator('#s-cam').isVisible()) { break; }
    await p.goBack().catch(() => {});
    await p.waitForTimeout(400);
  }
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('vid').videoWidth > 0, null, { timeout: 15000 });
}
async function shoot(p) {
  await p.locator('#shutter').click();
  await expect(p.locator('#preview')).toBeVisible({ timeout: 8000 });
  await p.locator('#prev-ok').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
}

const D = (s) => new Date(s + 'T12:00:00').getTime();
const SEED = [
  { id: 'e1', ts: D('2026-09-01'), inv: D('2026-09-01'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ' },
  { id: 'e2', ts: D('2026-09-02'), inv: D('2026-09-02'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ' },
  { id: 'e3', ts: D('2026-09-03'), inv: D('2026-09-03'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ' },
  { id: 'k1', ts: D('2026-09-04'), inv: D('2026-09-04'), sup: 'ΧΑΡΑΛΑΜΠΟΥΣ ΛΤΔ' }
];
async function fresh(browser, email) {
  const d = await device(browser);
  await onboard(d.p, email);
  await d.p.locator('#skip-key').click();
  if (await d.p.locator('#s-perm').isVisible()) { await d.p.locator('#go-perm').click(); }
  await seed(d.p, SEED);
  await d.p.reload();
  await d.p.waitForFunction(() => typeof kmNewWords === 'function');
  await d.p.waitForTimeout(1200);
  return d;
}
const whoChromeVisible = (p) => p.evaluate(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  return { date: vis(document.querySelector('#s-who .who-date')), thumb: vis(document.querySelector('#s-who .thumb-wrap')) };
});


const snapshot = (rs) => JSON.stringify(rs.slice().sort((a, b) => a.id < b.id ? -1 : 1));

/* ── 70 · Από την κάρτα: Επιστροφή = τίποτα δεν άλλαξε, η κάρτα μένει ── */
test('70 · κάρτα → Μετονομασία → «‹ Επιστροφή» της εφαρμογής: πίσω στην ίδια κάρτα, καμία εγγραφή δεν άλλαξε, καμία ερώτηση', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e70@fastwrite.tech');
  const dialogs = [];
  p.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const before = snapshot(await rows(p));

  await openSupCard(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#sup-rename').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
  await expect(p.locator('#who-back'), 'δεν υπάρχει κουμπί εξόδου').toBeVisible();
  await p.locator('#who-back').click();

  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await expect(p.locator('#s-who')).toBeHidden();
  await expect(p.locator('#sup-body h2'), 'δεν γύρισε στην ίδια κάρτα').toHaveText('ΧΑΡΑΛΑΜΠΟΥΣ');
  expect(dialogs).toEqual([]);
  expect(snapshot(await rows(p)), 'άλλαξε εγγραφή').toBe(before);
  await ctx.close();
});

/* ── 71 · Από το τιμολόγιο: η φόρμα κρατάει ό,τι γράφτηκε, τίποτα δεν σώζεται */
test('71 · τιμολόγιο → Αλλαγή προμηθευτή → «‹ Επιστροφή»: πίσω στη φόρμα με το ποσό που είχες γράψει, τίποτα δεν αποθηκεύτηκε', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e71@fastwrite.tech');
  const before = snapshot(await rows(p));

  await openShotOf(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#shot-edit').click();
  await p.locator('.amts input').nth(2).fill('999,00');     // γραμμένο, ΟΧΙ αποθηκευμένο
  await p.locator('#shot-sup-edit').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
  await expect(p.locator('#who-back')).toBeVisible();
  await p.locator('#who-back').click();

  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
  await expect(p.locator('#s-who')).toBeHidden();
  await expect(p.locator('#shot-save'), 'η φόρμα έκλεισε').toBeVisible();
  await expect(p.locator('.amts input').nth(2), 'χάθηκε ό,τι είχε γράψει').toHaveValue('999,00');
  expect(snapshot(await rows(p)), 'αποθηκεύτηκε κάτι χωρίς «Αποθήκευση»').toBe(before);
  await ctx.close();
});

/* ── 72 · Στη λήψη το κουμπί ΔΕΝ υπάρχει ─────────────────────────────── */
test('72 · μετά από διόρθωση, στην κανονική λήψη η «Επιστροφή» της διόρθωσης δεν φαίνεται', async ({ browser }) => {
  const { ctx, p } = await fresh(browser, 'e72@fastwrite.tech');
  await openSupCard(p, 'ΧΑΡΑΛΑΜΠΟΥΣ');
  await p.locator('#sup-rename').click();
  await expect(p.locator('#who-back')).toBeVisible({ timeout: 8000 });
  await phoneBackToCam(p);
  await shoot(p);
  await expect(p.locator('#who-back'), 'κουμπί διόρθωσης μέσα στη λήψη').toBeHidden();
  expect(await whoChromeVisible(p)).toEqual({ date: true, thumb: true });
  await ctx.close();
});

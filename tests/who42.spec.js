/* v42 · «ΠΡΟΜΗΘΕΥΤΗΣ» ΜΕΤΑ ΤΗ ΛΗΨΗ — Η ΛΙΣΤΑ ΒΓΑΙΝΕΙ ΑΠΟ ΤΑ ΤΙΜΟΛΟΓΙΑ
   5/9/2026, Stavros σε incognito υπολογιστή: 14 προμηθευτές στην οθόνη
   Προμηθευτές, ΚΑΝΕΝΑ κουμπί στο «Ποιος;». Αιτία: τα κουμπιά έβγαιναν από
   τοπική μνήμη ονομάτων (km_suppliers) που γέμιζε μόνο με πληκτρολόγηση
   στη συσκευή αυτή, έδειχνε 5, και δεν ξαναχτιζόταν ποτέ από τον φάκελο.

   ⚠ ΨΕΥΤΙΚΗ ΚΑΜΕΡΑ: το Chromium παίρνει --use-fake-device-for-media-stream
   ώστε το κλείστρο να δίνει πραγματικό blob. Δοκιμάζεται η ΔΙΑΔΡΟΜΗ ΤΟΥ
   ΧΡΗΣΤΗ (κλείστρο → OK → Προμηθευτής), όχι κλήση από πίσω πόρτα. */
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
async function seed(p, list) {
  return p.evaluate(async (list) => {
    const mk = (s) => new Blob([new Uint8Array(20 * 1024).map((_, i) => (i * 31 + s) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      list.forEach((x, i) => st.put({ id: x.id, ts: x.ts, supplier: x.sup, invDate: x.inv, blob: mk(i), pages: [], net: 100 + i, vat: 19, total: 119 + i }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, list);
}
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier }))); };
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
async function runSync(p) { await settings(p); await p.locator('#st-sync-now').click(); await settled(p); }

/* Από την οθόνη κλειδιού ως το «Προμηθευτής»: όπως ο άνθρωπος. */
async function toCam(p) {
  if (await p.locator('#s-key').isVisible()) { await p.locator('#skip-key').click(); }
  if (await p.locator('#s-perm').isVisible()) { await p.locator('#go-perm').click(); }
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('vid').videoWidth > 0, null, { timeout: 15000 });
}
async function shoot(p) {
  await p.locator('#shutter').click();
  await expect(p.locator('#preview')).toBeVisible({ timeout: 8000 });
  await p.locator('#prev-ok').click();
  await expect(p.locator('#s-who')).toBeVisible({ timeout: 8000 });
}
async function names(p) { return p.locator('#sup-list .sup').evaluateAll((b) => b.map((x) => x.firstChild.textContent)); }

const D = (s) => new Date(s + 'T12:00:00').getTime();
const SEED = [
  { id: 'q1', sup: 'ΑΛΦΑ',  inv: D('2026-03-01'), ts: D('2026-09-05') },
  { id: 'q2', sup: 'ΒΗΤΑ',  inv: D('2026-06-01'), ts: D('2026-09-01') },
  { id: 'q3', sup: 'ΓΑΜΜΑ', inv: D('2026-05-01'), ts: D('2026-09-03') },
  { id: 'q4', sup: 'αλφα',  inv: D('2026-01-01'), ts: D('2026-09-02') }   // ίδιος με ΑΛΦΑ, άλλη γραφή
];

test('48 · η λίστα βγαίνει από τα ΤΙΜΟΛΟΓΙΑ: όλα τα ονόματα, το πιο πρόσφατο πρώτο, χωρίς τοπική μνήμη', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'w48' + Date.now() + '@test.gr');
  await seed(p, SEED);
  /* Καμία πληκτρολόγηση ποτέ σε αυτή τη συσκευή — η παλιά μνήμη θα ήταν άδεια. */
  expect(await p.evaluate(() => localStorage.getItem('km_suppliers'))).toBeNull();
  await toCam(p); await shoot(p);

  await expect(p.locator('#s-who h2')).toHaveText('Προμηθευτής');
  await expect(p.locator('#who-tab-list')).toHaveClass(/on/);
  const got = await names(p);
  console.log('Λίστα:', got.join(' · '));
  /* 🔴 Ο ΦΡΟΥΡΟΣ: με την παλιά μνήμη εδώ ήταν 0. */
  expect(got).toEqual(['ΒΗΤΑ', 'ΓΑΜΜΑ', 'ΑΛΦΑ']);      // κατά ημερομηνία ΤΙΜΟΛΟΓΙΟΥ, όχι λήψης
  await expect(p.locator('#sup-list .sup', { hasText: 'ΑΛΦΑ' }).locator('.sup-n')).toHaveText('2 τιμ.');
  await ctx.close();
});

test('49 · το φίλτρο στενεύει τη λίστα και το πάτημα καταχωρεί στον υπάρχοντα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'w49' + Date.now() + '@test.gr');
  await seed(p, SEED);
  await toCam(p); await shoot(p);
  await p.locator('#who-find').fill('βη');
  expect(await names(p)).toEqual(['ΒΗΤΑ']);
  await p.locator('#sup-list .sup').first().click();
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 8000 });
  const r = await rows(p);
  expect(r.filter((x) => x.sup === 'ΒΗΤΑ').length).toBe(2);
  await ctx.close();
});

test('50 · «Νέος προμηθευτής»: γράφεις, καταχωρείς — και στην επόμενη λήψη είναι ΠΡΩΤΟΣ στη λίστα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'w50' + Date.now() + '@test.gr');
  await seed(p, SEED);
  await toCam(p); await shoot(p);
  await expect(p.locator('#in-sup')).toBeHidden();          // στη λίστα, το πεδίο δεν μπερδεύει
  await p.locator('#who-tab-new').click();
  await expect(p.locator('#in-sup')).toBeVisible();
  await p.locator('#in-sup').fill('ΔΕΛΤΑ');
  await p.locator('#add-sup').click();
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 8000 });
  expect((await rows(p)).some((x) => x.sup === 'ΔΕΛΤΑ')).toBe(true);

  await p.waitForFunction(() => document.getElementById('vid').videoWidth > 0, null, { timeout: 15000 });
  await shoot(p);
  expect((await names(p))[0]).toBe('ΔΕΛΤΑ');
  await ctx.close();
});

test('51 · χωρίς κανένα τιμολόγιο ανοίγει κατευθείαν το «Νέος προμηθευτής»', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'w51' + Date.now() + '@test.gr');
  await toCam(p); await shoot(p);
  await expect(p.locator('#who-tab-new')).toHaveClass(/on/);
  await expect(p.locator('#in-sup')).toBeVisible();
  await ctx.close();
});

test('52 · Η ΠΕΡΙΠΤΩΣΗ ΤΗΣ 5/9: νέα συσκευή με 12 λέξεις βλέπει τους προμηθευτές του φακέλου', async ({ browser }) => {
  const A = await device(browser);
  const email = 'w52' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);
  expect(await B.p.evaluate(() => localStorage.getItem('km_suppliers'))).toBeNull();
  await B.p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-key').hidden = false; });
  await toCam(B.p); await shoot(B.p);
  const got = await names(B.p);
  console.log('Νέα συσκευή:', got.join(' · '));
  expect(got).toEqual(['ΒΗΤΑ', 'ΓΑΜΜΑ', 'ΑΛΦΑ']);
  await A.ctx.close(); await B.ctx.close();
});

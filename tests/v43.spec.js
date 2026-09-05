/* v43 · ΤΡΙΑ ΕΥΡΗΜΑΤΑ ΤΟΥ STAVROS ΤΗΣ 5/9/2026
   (3) «το κάνω διαγραφή αλλά μετά εμφανίζεται» — η διαγραφή έσβηνε μόνο
       τοπικά και ο φάκελος την ξανάφερνε στον επόμενο γύρο.
   (4) «πατώντας επιστροφή με μεταφέρει στην αρχική» — η προβολή προμηθευτή
       (ενός Ή πολλών μαζί) χανόταν στην επιστροφή από τη φωτογραφία.
   (2) η μπάρα αναζήτησης έφευγε από την οθόνη μόλις κύλαγε η λίστα. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 150000 });

async function device(browser) {
  const ctx = await browser.newContext();
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
      list.forEach((x, i) => st.put({ id: x.id, ts: x.ts, supplier: x.sup, invDate: x.inv, blob: mk(i), pages: [], net: null, vat: null, total: x.total === undefined ? null : x.total }));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, list);
}
async function ids(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => x.id).sort()); };
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
async function runSync(p) { await settings(p); await p.locator('#st-sync-now').click(); return settled(p); }
async function toMenu(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-menu').hidden = false; });
}

/* Η διαγραφή γίνεται όπως τη ζει ο χρήστης: Προμηθευτές → όνομα → κάρτα →
   «Διαγραφή τιμολογίου». Καμία πίσω πόρτα — αλλιώς δεν δοκιμάζεται η
   διαδρομή που έσπασε. Ο Playwright απορρίπτει κάθε διάλογο από προεπιλογή. */
async function delViaUi(p, supplier) {
  await toMenu(p);
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await p.locator('#sup-body .row-t', { hasText: supplier }).click();
  await expect(p.locator('#sup-body h2')).toHaveText(supplier);
  await p.locator('.inv').first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
  p.once('dialog', (d) => d.accept());
  await p.locator('#shot-body button', { hasText: 'Διαγραφή τιμολογίου' }).click();
  await p.waitForTimeout(800);
}

const D = (s) => new Date(s + 'T12:00:00').getTime();
const SEED = [
  { id: 'g1', sup: 'ΑΛΦΑ',  inv: D('2026-03-01'), ts: D('2026-09-05'), total: 10 },
  { id: 'g2', sup: 'ΒΗΤΑ',  inv: D('2026-06-01'), ts: D('2026-09-04'), total: 20 },
  { id: 'g3', sup: 'ΓΑΜΜΑ', inv: D('2026-05-01'), ts: D('2026-09-03'), total: 30 }
];

/* ── (3) Η ΔΙΑΓΡΑΦΗ ΠΟΥ ΤΑΞΙΔΕΥΕΙ ────────────────────────────────── */

test('53 · ΤΟ ΕΥΡΗΜΑ ΤΗΣ 5/9: το διαγραμμένο τιμολόγιο ΔΕΝ ξαναγυρίζει από τον φάκελο', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'g53' + Date.now() + '@test.gr');
  await seed(p, SEED);
  await runSync(p);                                   // ο φάκελος έχει και τα τρία

  await delViaUi(p, 'ΒΗΤΑ');
  expect(await ids(p)).toEqual(['g1', 'g3']);

  await runSync(p);                                   // ανεβαίνει η ταφόπετρα
  await runSync(p);                                   // ο γύρος που τα ξανάφερνε
  await p.waitForTimeout(1500);
  const after = await ids(p);
  console.log('Μετά το κατέβασμα:', after.join(' · '));
  /* 🔴 Ο ΦΡΟΥΡΟΣ: χωρίς την ταφόπετρα εδώ ξαναεμφανίζεται το g2. */
  expect(after).toEqual(['g1', 'g3']);
  await ctx.close();
});

test('54 · η διαγραφή φτάνει και στη ΔΕΥΤΕΡΗ συσκευή', async ({ browser }) => {
  const A = await device(browser);
  const email = 'g54' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED);
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);
  expect(await ids(B.p)).toEqual(['g1', 'g2', 'g3']);

  /* Η A είναι πλέον αναγνώστρια (η B πήρε τη σκυτάλη) — σβήνει η ΕΝΕΡΓΗ. */
  await delViaUi(B.p, 'ΒΗΤΑ');
  await runSync(B.p);
  await runSync(A.p);
  await A.p.waitForTimeout(1500);
  const after = await ids(A.p);
  console.log('Πρώτη συσκευή μετά:', after.join(' · '));
  expect(after).toEqual(['g1', 'g3']);
  await A.ctx.close(); await B.ctx.close();
});

test('55 · η αναίρεση σηκώνει και την ταφόπετρα — το τιμολόγιο ΜΕΝΕΙ μετά τον συγχρονισμό', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'g55' + Date.now() + '@test.gr');
  /* Εκκρεμή = χωρίς ποσό· εκεί ζει η μαζική διαγραφή με την αναίρεση. */
  await seed(p, SEED.map((x) => ({ ...x, total: null })));
  await runSync(p);

  await toMenu(p);
  await p.locator('[data-go="s-pend"]').click();
  await expect(p.locator('#s-pend')).toBeVisible({ timeout: 8000 });
  await p.locator('#s-pend .pend-cb, #s-pend input[type=checkbox]').first().check();
  p.once('dialog', (d) => d.accept());
  await p.locator('#s-pend button', { hasText: 'Διαγραφή (' }).click();
  await p.waitForTimeout(600);
  expect((await ids(p)).length).toBe(2);
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('km_gone') || '[]'))).toHaveLength(1);

  await p.locator('#s-pend button', { hasText: 'Αναίρεση' }).click();
  await p.waitForTimeout(600);
  expect((await ids(p)).length).toBe(3);
  /* 🔴 Χωρίς το goneDrop η ταφόπετρα έμενε: το τιμολόγιο επέστρεφε στην
     οθόνη και ο επόμενος συγχρονισμός το ξανάσβηνε — αναίρεση που δεν αναιρεί. */
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('km_gone') || '[]'))).toEqual([]);
  await runSync(p);
  await runSync(p);
  await p.waitForTimeout(1200);
  expect((await ids(p)).length).toBe(3);
  await ctx.close();
});

/* ── (4) Η ΕΠΙΣΤΡΟΦΗ ──────────────────────────────────────────────── */

test('56 · επιστροφή από τη φωτογραφία: γυρίζει στον ΙΔΙΟ προμηθευτή, όχι στη λίστα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'g56' + Date.now() + '@test.gr');
  await seed(p, SEED);
  await toMenu(p);
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await p.locator('#sup-body .row-t', { hasText: 'ΒΗΤΑ' }).click();
  await expect(p.locator('#sup-body h2')).toHaveText('ΒΗΤΑ');

  await p.locator('.inv').first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
  await p.locator('#s-shot [data-back]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  /* 🔴 Ο ΦΡΟΥΡΟΣ: πριν τη v43 εδώ έγραφε «Βρες προμηθευτή» — η λίστα. */
  await expect(p.locator('#sup-body h2')).toHaveText('ΒΗΤΑ');

  /* Και το δεύτερο σκαλί: από τον προμηθευτή πίσω στη λίστα. */
  await p.locator('#s-sup [data-back]').click();
  await expect(p.locator('#sup-body .row-t').first()).toBeVisible({ timeout: 8000 });
  await expect(p.locator('#s-sup')).toBeVisible();
  await ctx.close();
});

test('57 · ΠΟΛΛΟΙ ΜΑΖΙ: η επιστροφή κρατάει ΟΛΗ την επιλογή Α/Β/Γ, όχι έναν', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'g57' + Date.now() + '@test.gr');
  await seed(p, SEED);
  await toMenu(p);
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  const boxes = p.locator('#sup-body .sup-cb');
  await boxes.nth(0).check(); await boxes.nth(1).check(); await boxes.nth(2).check();
  await p.locator('#sup-body button', { hasText: 'Δες μαζί' }).click();
  await expect(p.locator('#sup-body h2')).toHaveText('3 προμηθευτές');

  await p.locator('.inv').first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
  await p.locator('#s-shot [data-back]').click();
  /* 🔴 Χωρίς το supView ως ΠΙΝΑΚΑ, εδώ θα γύριζε ένας προμηθευτής ή η λίστα. */
  await expect(p.locator('#sup-body h2')).toHaveText('3 προμηθευτές');
  await expect(p.locator('#sup-body .multi-who')).toContainText('ΑΛΦΑ');
  await ctx.close();
});

/* ── (2) Η ΜΠΑΡΑ ΑΝΑΖΗΤΗΣΗΣ ──────────────────────────────────────── */

test('58 · η μπάρα αναζήτησης μένει ορατή όσο κυλάει η λίστα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'g58' + Date.now() + '@test.gr');
  const many = [];
  for (let i = 0; i < 25; i++) { many.push({ id: 'm' + i, sup: 'Προμηθευτής ' + i, inv: D('2026-05-01'), ts: D('2026-09-01'), total: i }); }
  await seed(p, many);
  await p.setViewportSize({ width: 390, height: 700 });
  await toMenu(p);
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  const find = p.locator('#sup-body .find');
  await expect(find).toBeVisible();
  await p.locator('#sup-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
  await p.waitForTimeout(400);
  /* 🔴 Χωρίς position:sticky η μπάρα βγαίνει εκτός οθόνης και για να γράψεις
     πρέπει να ανέβεις ως την κορυφή. */
  await expect(find).toBeInViewport();
  const y = (await find.boundingBox()).y;
  const over = await p.evaluate((yy) => {
    const el = document.elementFromPoint(200, Math.max(2, yy - 6));
    return el ? (el.className || el.tagName) : null;
  }, y);
  console.log('πάνω από τη μπάρα:', over);
  /* 🔴 Η λωρίδα πάνω από το πεδίο ανήκει στη μπάρα, όχι στις γραμμές. */
  expect(String(over)).toContain('findbar');
  await ctx.close();
});


test('60 · v46 · η συσκευή ΑΝΑΓΝΩΣΗΣ δεν μένει με παλιό νούμερο εκκρεμών', async ({ browser }) => {
  const A = await device(browser);
  const email = 'g60' + Date.now() + '@test.gr';
  const words = await onboard(A.p, email);
  await seed(A.p, SEED.map((x) => ({ ...x, total: null })));   // τρία εκκρεμή
  await runSync(A.p);

  const B = await device(browser);
  await signIn(B.p, email, words);
  await runSync(B.p);
  await B.p.waitForTimeout(1500);
  /* Η Β πήρε τη σκυτάλη· η Α είναι πλέον ανάγνωση — αυτή είναι η
     περίπτωση του Stavros: υπολογιστής ενεργός, κινητό ανάγνωση. */
  const menu = async (p) => {
    await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); });
    await p.locator('#s-cam').evaluate((e) => { e.hidden = false; });
    await p.locator('#btn-menu').click();
    await expect(p.locator('#s-menu')).toBeVisible({ timeout: 8000 });
  };
  await menu(A.p);
  await expect(A.p.locator('#m-pend')).toHaveText('3', { timeout: 15000 });

  await delViaUi(B.p, 'ΒΗΤΑ');
  await runSync(B.p);

  /* Ο χρήστης ΔΕΝ αγγίζει την Α — μένει ανοιχτή στο μενού, όπως ένα κινητό
     αφημένο στο τραπέζι. Το νούμερο πρέπει να διορθωθεί μόνο του. */
  await A.p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  /* 🔴 Ως τη v45 το κατέβασμα γινόταν σωστά αλλά η ΟΘΟΝΗ έμενε στην παλιά
     εικόνα: ο υπολογιστής έδειχνε 2 και το κινητό 4 για τα ίδια δεδομένα. */
  await expect(A.p.locator('#m-pend')).toHaveText('2', { timeout: 30000 });
  console.log('μενού συσκευής ανάγνωσης:', await A.p.locator('#m-pend').textContent());
  await A.ctx.close(); await B.ctx.close();
});

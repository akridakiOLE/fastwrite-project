const { test, expect } = require('@playwright/test');
const APP = 'http://127.0.0.1:8788/kostometro/';

async function fresh(context) {
  const p = await context.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.evaluate(async () => {
    localStorage.clear();
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('shots')) d.createObjectStore('shots', { keyPath: 'id' }).createIndex('status','status'); };
      r.onsuccess = () => { const t = r.result.transaction('shots','readwrite'); t.objectStore('shots').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); };
      r.onerror = () => rej(r.error);
    });
  });
  await p.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return p;
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
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
  return w;
}
async function seedShots(p, n, pagesEach, tag) {
  return p.evaluate(async ({ n, pagesEach, tag }) => {
    const mk = (seed, kb) => new Blob([new Uint8Array(kb * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const ids = [];
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        const id = tag + i + '-' + Math.random().toString(36).slice(2, 8);
        ids.push(id);
        st.put({ id, ts: Date.now(), supplier: 'ΠΡΟΜ ' + tag + i, invDate: Date.now(),
                 blob: mk(i, 30), pages: Array.from({ length: pagesEach }, (_, k) => mk(i * 10 + k, 20)),
                 net: 100 + i, vat: 19, total: 119 + i });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    return ids;
  }, { n, pagesEach, tag });
}
async function settings(p) {
  // ΜΟΝΟ DOM: η εφαρμογή είναι κλειστή, καμία εσωτερική συνάρτηση δεν φαίνεται
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
}
async function runSync(p) {
  await settings(p);
  return p.evaluate(() => new Promise((res) => {
    document.getElementById('st-sync-now').click();
    const t = setInterval(() => { const b = document.getElementById('st-sync-now'); if (!b.disabled) { clearInterval(t); res(document.getElementById('st-sync').textContent); } }, 200);
  }));
}
async function localRows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots','readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => ({ id: x.id, sup: x.supplier, total: x.total, blob: x.blob ? x.blob.size : 0, pages: (x.pages||[]).filter(Boolean).length }))); };
  }));
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
      await expect(p.locator('#s-key')).toBeVisible({ timeout: 20000 });
      return;
    } catch (e) { await p.waitForTimeout(500); }
  }
  throw new Error('δεν έγινε η σύνδεση');
}

test('32 · ΔΕΥΤΕΡΗ ΣΥΣΚΕΥΗ: τα τιμολόγια εμφανίζονται, με στοιχεία ΚΑΙ φωτογραφίες', async ({ context }) => {
  const p1 = await fresh(context);
  const email = 'dl' + Date.now() + '@example.com';
  const words = await onboard(p1, email);
  await seedShots(p1, 3, 1, 'A');
  expect(await runSync(p1)).toContain('6/6 φωτογραφίες');
  const src = (await localRows(p1)).sort((a, b) => a.id.localeCompare(b.id));
  await p1.close();

  const p2 = await fresh(context);            // «άλλο κινητό»: άδεια βάση
  await signIn(p2, email, words);
  await expect.poll(async () => (await localRows(p2)).length, { timeout: 30000 }).toBe(3);
  // τα στοιχεία ήρθαν σωστά
  const got = (await localRows(p2)).sort((a, b) => a.id.localeCompare(b.id));
  expect(got.map((r) => r.id)).toEqual(src.map((r) => r.id));
  expect(got.map((r) => r.sup)).toEqual(src.map((r) => r.sup));
  expect(got.map((r) => r.total)).toEqual(src.map((r) => r.total));
  // και οι φωτογραφίες κατέβηκαν, ΙΔΙΟΥ μεγέθους
  await expect.poll(async () => (await localRows(p2)).every((r) => r.blob > 0 && r.pages === 1), { timeout: 40000 }).toBe(true);
  const got2 = (await localRows(p2)).sort((a, b) => a.id.localeCompare(b.id));
  expect(got2.map((r) => r.blob)).toEqual(src.map((r) => r.blob));
  await p2.close();
});

test('33 · 🔴 καθαρή συσκευή ΔΕΝ σβήνει τον φάκελο ανεβάζοντας άδεια στοιχεία', async ({ context }) => {
  const p1 = await fresh(context);
  const email = 'wipe' + Date.now() + '@example.com';
  const words = await onboard(p1, email);
  await seedShots(p1, 4, 0, 'W');
  await runSync(p1);
  await p1.close();

  const p2 = await fresh(context);
  await signIn(p2, email, words);

  /* ⚠ ΕΔΩ ΕΙΝΑΙ Η ΠΡΑΓΜΑΤΙΚΗ ΚΟΥΡΣΑ, και χωρίς αυτήν το τεστ δεν αποδεικνύει
     τίποτα: το ανέβασμα ξεκινάει 2,5″ μετά το άνοιγμα, ενώ το κατέβασμα
     μπορεί να αργήσει (μεγάλες φωτογραφίες, αργό δίκτυο). Αργοπορούμε ΜΟΝΟ
     το κατέβασμα των στοιχείων κατά 8″ και ανοίγουμε την εφαρμογή: αν ο
     φρουρός λείπει, ανεβαίνει «μηδέν τιμολόγια» πάνω στο αρχείο. */
  await p2.route('**/api/km/folder', async (route) => {
    if (route.request().method() === 'GET') { await new Promise((r) => setTimeout(r, 8000)); }
    await route.continue();
  });
  await p2.evaluate(async () => {
    localStorage.setItem('km_need_pull', '1');
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onsuccess = () => { const t = r.result.transaction('shots', 'readwrite'); t.objectStore('shots').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); };
    });
  });
  await p2.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p2.waitForTimeout(6000);            // το ανέβασμα των 2,5″ έχει ήδη περάσει
  await p2.unroute('**/api/km/folder');
  await p2.close();

  // Η ΑΠΟΔΕΙΞΗ: τρίτη καθαρή συσκευή πρέπει να βρει και τα 4 στον φάκελο.
  const p3 = await fresh(context);
  await signIn(p3, email, words);
  await expect.poll(async () => (await localRows(p3)).length, { timeout: 30000 }).toBe(4);
  await p3.close();
});

test('34 · το κατέβασμα ΠΟΤΕ δεν σβήνει και ΠΟΤΕ δεν πατάει τοπικό τιμολόγιο', async ({ context }) => {
  const p1 = await fresh(context);
  const email = 'mix' + Date.now() + '@example.com';
  const words = await onboard(p1, email);
  await seedShots(p1, 2, 0, 'S');
  await runSync(p1);
  await p1.close();

  const p2 = await fresh(context);
  await signIn(p2, email, words);
  await expect.poll(async () => (await localRows(p2)).length, { timeout: 30000 }).toBe(2);
  // αυτή η συσκευή έχει ΚΑΙ δικά της, που ο server δεν ξέρει
  const own = await seedShots(p2, 2, 0, 'L');
  const before = (await localRows(p2)).sort((a, b) => a.id.localeCompare(b.id));
  // το κατέβασμα ξαναρχίζει με το άνοιγμα της εφαρμογής, όπως στον χρήστη
  await p2.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // ⚠ Το άνοιγμα ΚΑΙ κατεβάζει ΚΑΙ ανεβάζει: αφήνουμε να ησυχάσουν και τα δύο
  // πριν μετρήσουμε, αλλιώς μετράμε στη μέση μιας εγγραφής.
  await expect.poll(async () => {
    const now = (await localRows(p2)).sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(now);
  }, { timeout: 25000, intervals: [1000, 1000, 1000, 2000] }).toBe(JSON.stringify(before));
  const after = (await localRows(p2)).sort((a, b) => a.id.localeCompare(b.id));
  expect(after).toEqual(before);                       // τίποτα δεν σβήστηκε, τίποτα δεν άλλαξε
  expect(after.filter((r) => own.indexOf(r.id) >= 0).length).toBe(2);
  await p2.close();
});

test('35 · χωρίς δίκτυο, η συσκευή που περιμένει κατέβασμα ΔΕΝ ανεβάζει τίποτα', async ({ context }) => {
  const p1 = await fresh(context);
  const email = 'net' + Date.now() + '@example.com';
  const words = await onboard(p1, email);
  await seedShots(p1, 3, 0, 'N');
  await runSync(p1);
  await p1.close();

  const p2 = await fresh(context);
  await signIn(p2, email, words);
  await p2.route('**/api/km/folder*', (r) => r.abort());   // το κατέβασμα αποτυγχάνει
  await p2.evaluate(() => localStorage.setItem('km_need_pull', '1'));
  const line = await runSync(p2);
  expect(line).toMatch(/κατέβασμα|σφάλμα|δίκτυο/);
  await p2.unroute('**/api/km/folder*');
  await p2.close();

  // ο φάκελος στον server ΔΕΝ πειράχτηκε: τρίτη συσκευή βρίσκει και τα 3
  const p3 = await fresh(context);
  await signIn(p3, email, words);
  await expect.poll(async () => (await localRows(p3)).length, { timeout: 30000 }).toBe(3);
  await p3.close();
});

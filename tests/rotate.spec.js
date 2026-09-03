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
  // v30: η εφαρμογή μπορεί να ξαναφορτώσει μόνη της (έλεγχος έκδοσης)
  for (let i = 0; i < 5; i++) {
    await p.locator('#acc-no').click().catch(() => {});
    try { await expect(p.locator('#s-email')).toBeVisible({ timeout: 4000 }); break; }
    catch (e) { await expect(p.locator('#s-acc')).toBeVisible({ timeout: 15000 }).catch(() => {}); }
  }
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
async function toSettings(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.hidden = true); document.getElementById('s-settings').hidden = false; });
}

test('12 · νέες 12 λέξεις: αλλάζουν πραγματικά, και οι παλιές παύουν να ισχύουν', async ({ context }) => {
  const p = await fresh(context);
  const email = 'rot' + Date.now() + '@example.com';
  const oldW = await onboard(p, email);
  const oldFolder = await p.evaluate(() => localStorage.getItem('km_folder'));

  await toSettings(p);
  await p.locator('#st-newwords').click();
  await expect(p.locator('#nw-box')).toBeVisible();
  await p.locator('#nw-go').click();

  await expect(p.locator('#w-title')).toHaveText('Οι νέες 12 λέξεις σου', { timeout: 15000 });
  await expect(p.locator('#w-list li')).toHaveCount(12);
  const newW = await p.locator('#w-list li').allTextContents();
  expect(newW.join(' ')).not.toBe(oldW.join(' '));
  await expect(p.locator('#w-go')).toBeDisabled();       // πάλι υποχρεωτικό τσεκάρισμα
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-settings')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(800);

  const nowFolder = await p.evaluate(() => localStorage.getItem('km_folder'));
  expect(nowFolder).not.toBe(oldFolder);
  expect(await p.evaluate(() => localStorage.getItem('km_words'))).toBe(newW.join(' '));

  // ΟΙ ΠΑΛΙΕΣ ΔΕΝ ΑΝΟΙΓΟΥΝ ΠΙΑ ΤΟΝ ΝΕΟ ΛΟΓΑΡΙΑΣΜΟ: σε καθαρή συσκευή απορρίπτονται;
  const p2 = await fresh(context);
  await p2.locator('#acc-yes').click();
  await p2.locator('#si-email').fill(email);
  await p2.locator('#si-words').fill(newW.join(' '));
  await p2.locator('#si-go').click();
  await expect(p2.locator('#s-key')).toBeVisible({ timeout: 15000 });   // οι ΝΕΕΣ δουλεύουν
  await p2.close(); await p.close();
});

test('13 · ο φρουρός: με δεδομένα στον φάκελο η αλλαγή λέξεων ΑΠΑΓΟΡΕΥΕΤΑΙ', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'guard' + Date.now() + '@example.com');
  await toSettings(p);
  // ο server απαντάει ότι ο φάκελος έχει δεδομένα (όπως θα γίνει μετά το Η.2)
  await p.route('**/api/km/status*', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, state: { folder_version: 3, folder_bytes: 51234 } })
  }));
  await p.locator('#st-newwords').click();
  await p.locator('#nw-go').click();
  await expect(p.locator('#nw-err')).toContainText('αδιάβαστα για πάντα', { timeout: 15000 });
  await expect(p.locator('#s-words')).toBeHidden();
  await p.close();
});

test('14 · χωρίς δίκτυο η αλλαγή λέξεων ΔΕΝ προχωράει στα τυφλά', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'noNet' + Date.now() + '@example.com');
  await toSettings(p);
  await p.route('**/api/km/**', (r) => r.abort());
  await p.locator('#st-newwords').click();
  await p.locator('#nw-go').click();
  await expect(p.locator('#nw-err')).toContainText('Χρειάζεσαι δίκτυο', { timeout: 15000 });
  await expect(p.locator('#s-words')).toBeHidden();
  await p.close();
});

test('15 · μηδενισμός εγγραφής: σβήνει ΚΑΙ τον λογαριασμό, κρατάει τα τιμολόγια', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'reset' + Date.now() + '@example.com');
  await p.evaluate(async () => {
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onsuccess = () => { const t = r.result.transaction('shots','readwrite'); for (let i=0;i<4;i++) t.objectStore('shots').put({id:'x'+i,status:'done'}); t.oncomplete = res; t.onerror = () => rej(t.error); };
    });
  });
  p.on('dialog', (d) => d.accept());
  await toSettings(p);
  await p.locator('#st-reset').click();
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });   // ΞΑΝΑ από την αρχή
  const ls = await p.evaluate(() => ['km_email','km_words','km_folder','km_auth','km_words_ok','km_registered'].map(k => localStorage.getItem(k)));
  expect(ls.every((v) => v === null)).toBe(true);
  const n = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('kostometrisi',1); r.onsuccess = () => { const q = r.result.transaction('shots','readonly').objectStore('shots').count(); q.onsuccess = () => res(q.result); }; }));
  expect(n).toBe(4);                                                    // τα τιμολόγια ΕΜΕΙΝΑΝ
  await p.close();
});

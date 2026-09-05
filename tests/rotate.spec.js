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

/* v39 · ΤΑ ΤΕΣΤ 12/13/14 ΕΙΝΑΙ ΠΑΡΩΧΗΜΕΝΑ, ΟΧΙ ΑΠΟΤΥΧΙΕΣ (κανόνας Α400 §Γ 30/8).
   Δοκίμαζαν το κουμπί «Νέες 12 λέξεις», που αφαιρέθηκε 5/9/2026 με απόφαση
   Stavros: μπλοκαριζόταν μόλις ο φάκελος είχε δεδομένα, άρα η δηλωμένη χρήση
   του ήταν πρακτικά ανέφικτη — η μόνη πράξη που πετύχαινε ήταν δεύτερος
   λογαριασμός. Στη θέση τους ΕΝΑΣ φρουρός: το κουμπί δεν ξαναμπαίνει σιωπηλά.
   Ο μηχανισμός (mode 'rotate', folderState) μένει στον κώδικα για την
   επανακρυπτογράφηση — τότε ξαναγράφονται και τα τεστ. */
test('12 · v39: το «Νέες 12 λέξεις» ΔΕΝ υπάρχει πια στις Ρυθμίσεις — και το «Οι 12 λέξεις μου» υπάρχει', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'nonw' + Date.now() + '@example.com');
  await toSettings(p);
  /* ΚΑΙ τι βρήκε, όχι μόνο «βρέθηκε» (κανόνας 4/9): τυπώνουμε τα κουμπιά. */
  const labels = await p.locator('#s-settings button').allTextContents();
  console.log('Κουμπιά Ρυθμίσεων:', labels.map((t) => t.trim()).filter(Boolean).join(' · '));
  expect(labels.some((t) => /Νέες 12 λέξεις/.test(t))).toBe(false);
  expect(labels.some((t) => /Οι 12 λέξεις μου/.test(t))).toBe(true);
  await expect(p.locator('#st-newwords')).toHaveCount(0);
  await expect(p.locator('#nw-box')).toHaveCount(0);
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

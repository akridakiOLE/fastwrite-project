/* v132 · KM-PGV — «Διαγραφή σελίδας» χωρίς φαντάσματα στον server (15/10/2026).
   Άκρη-σε-άκρη στον τοπικό server (wrangler dev, KM_REVIEW_CODE=482913 στο .dev.vars):
   λογαριασμός ελέγχου appreview+… → τιμολόγιο 3 σελίδων → συγχρονισμός →
   «Διαγραφή σελίδας 1» από την οθόνη του τιμολογίου → συγχρονισμός →
   ΚΑΘΑΡΗ τοπική βάση (σαν νέα εγκατάσταση) → κατέβασμα.
   Πρέπει να έρθουν ΜΟΝΟ οι σελίδες 2 και 3, με αυτή τη σειρά — ΠΟΤΕ η σβησμένη.
   Στον κώδικα της v131 το τεστ ΠΡΕΠΕΙ να κοκκινίζει (αναπαράγει το σφάλμα). */
const { test, expect } = require('@playwright/test');
const APP = 'http://127.0.0.1:8788/kostometro/';
test.describe.configure({ timeout: 180000 });

const REC = '1760000000000-tst132';
const SUP = 'ΣΕΛΙΔΕΣ ΑΕ';

async function onboard(p) {
  await p.goto(APP);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  await p.locator('#acc-no').click();
  await expect(p.locator('#s-email')).toBeVisible({ timeout: 8000 });
  await p.locator('#in-email').fill('appreview+p' + Date.now().toString(36) + '@fastwrite.tech');
  await p.locator('#go-email').click();
  await expect(p.locator('#s-code')).toBeVisible({ timeout: 15000 });
  await p.locator('#in-code').fill('482913');
  await p.locator('#go-code').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 25000 });
  await p.locator('#skip-key').click();
  await p.waitForFunction(() => !!localStorage.getItem('km_folder'), null, { timeout: 20000 });
}

/* Τρεις σελίδες με ΔΙΑΚΡΙΤΟ πρώτο byte: 11, 22, 33. */
async function seed3(p) {
  await p.evaluate(async ({ REC, SUP }) => {
    const mk = (b) => new Blob([new Uint8Array(20 * 1024).fill(b)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite');
      t.objectStore('shots').put({ id: REC, ts: Date.now(), supplier: SUP, invDate: Date.now(),
        blob: mk(11), pages: [mk(22), mk(33)], net: 10, vat: 1.9, total: 11.9 });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, { REC, SUP });
}

async function firstBytes(p) {
  return p.evaluate(async (REC) => {
    const db = await new Promise((res) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); });
    const x = await new Promise((res) => { const q = db.transaction('shots', 'readonly').objectStore('shots').get(REC); q.onsuccess = () => res(q.result); });
    if (!x) { return null; }
    const fb = async (b) => (b ? new Uint8Array(await b.arrayBuffer())[0] : 0);
    const out = [await fb(x.blob)];
    for (const b of (x.pages || [])) { out.push(await fb(b)); }
    return { bytes: out, pgv: x.pgv || 0, srvPages: x.srvPages || 0 };
  }, REC);
}

async function serverPhotos(p) {
  return p.evaluate(async () => {
    const h = { 'X-Km-Folder': localStorage.getItem('km_folder') || '',
      'X-Km-Auth': localStorage.getItem('km_lock_auth') || localStorage.getItem('km_auth') || '',
      'X-Km-Device': localStorage.getItem('km_install_id') || '' };
    const lk = localStorage.getItem('km_lock'); if (lk && localStorage.getItem('km_lock_auth')) { h['X-Km-Lock'] = lk; }
    const r = await fetch('/api/km/photos', { headers: h });
    const j = await r.json();
    return (j.photos || []).map((x) => x.id).sort();
  });
}

async function syncWait(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
  await p.locator('#st-sync-now').click();
  let last = null;
  for (let i = 0; i < 60; i++) {
    let now; try { now = await p.locator('#st-sync').textContent(); } catch (e) { now = null; }
    if (now && now === last && !/ανεβαίνει|κατεβάζει|εξέλιξη|ξεκινάει/.test(now)) { return now; }
    last = now; await p.waitForTimeout(500);
  }
  return last;
}

async function openInvoice(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-menu').hidden = false; });
  await p.locator('[data-go="s-sup"]').click();
  await expect(p.locator('#s-sup')).toBeVisible({ timeout: 8000 });
  await p.locator('#sup-body').getByText(SUP, { exact: false }).first().click();
  await expect(p.locator('.inv').first()).toBeVisible({ timeout: 8000 });
  await p.locator('.inv').first().click();
  await expect(p.locator('#s-shot')).toBeVisible({ timeout: 8000 });
}

test('v132 · σβησμένη σελίδα ΔΕΝ ξαναφαίνεται σε νέα εγκατάσταση · ο server κρατά μόνο τη νέα έκδοση', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  await onboard(p);
  await seed3(p);
  await syncWait(p);
  const before = await serverPhotos(p);
  expect(before).toEqual([REC, REC + '-p2', REC + '-p3'].sort());

  // «Διαγραφή σελίδας 1» από την οθόνη του τιμολογίου — όπως ο άνθρωπος
  await openInvoice(p);
  await p.locator('#shot-body button', { hasText: 'Διαγραφή σελίδας 1' }).click();
  await expect(p.locator('#shot-body .pg-label').first()).toHaveText(/από 2/, { timeout: 8000 });
  const local = await firstBytes(p);
  expect(local.bytes).toEqual([22, 33]);
  await syncWait(p);

  // ο server: ΜΟΝΟ οι σελίδες της νέας διάταξης (οι παλιές σβήστηκαν αφού ανέβηκαν οι νέες)
  const after = await serverPhotos(p);
  expect(after.length).toBe(2);
  expect(after.some((id) => id === REC || id === REC + '-p3')).toBe(false);

  // συσκευή με την ΠΑΛΙΑ διάταξη (3 σελίδες, χωρίς έκδοση): το κατέβασμα τη διορθώνει
  await p.evaluate(async ({ REC, SUP }) => {
    const mk = (b) => new Blob([new Uint8Array(20 * 1024).fill(b)], { type: 'image/jpeg' });
    const db = await new Promise((res) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); });
    await new Promise((res) => { const t = db.transaction('shots', 'readwrite');
      t.objectStore('shots').put({ id: REC, ts: Date.now(), supplier: SUP, invDate: Date.now(), blob: mk(11), pages: [mk(22), mk(33)],
        net: 10, vat: 1.9, total: 11.9, srvPages: 3 }); t.oncomplete = res; });
    localStorage.setItem('km_need_pull', 'v132-stale');
  }, { REC, SUP });
  await syncWait(p);
  await syncWait(p);
  let st = null;
  for (let i = 0; i < 30; i++) { st = await firstBytes(p); if (st && st.pgv && st.bytes.every((b) => b)) { break; } await p.waitForTimeout(500); }
  expect(st.pgv).toBeGreaterThan(1700000000000);
  expect(st.srvPages).toBe(2);
  expect(st.bytes).toEqual([22, 33]);
  expect((await serverPhotos(p)).length).toBe(2);   // το κατέβασμα δεν ξαναζωντάνεψε τις παλιές

  // νέα εγκατάσταση: άδεια τοπική βάση + κατέβασμα
  await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); });
    await new Promise((res) => { const t = db.transaction('shots', 'readwrite'); t.objectStore('shots').clear(); t.oncomplete = res; });
    localStorage.removeItem('km_photo_cache');
    localStorage.setItem('km_need_pull', 'v132-test');
  });
  await syncWait(p);
  await syncWait(p);
  let got = null;
  for (let i = 0; i < 30; i++) { got = await firstBytes(p); if (got && got.bytes.every((b) => b)) { break; } await p.waitForTimeout(500); }
  expect(got && got.srvPages).toBe(2);
  expect(got.bytes).toEqual([22, 33]);    // 🔴 ποτέ το 11 (η σβησμένη)
  await ctx.close();
});

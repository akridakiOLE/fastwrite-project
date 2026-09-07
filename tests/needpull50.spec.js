/* v50 · Η ΣΗΜΑΙΑ «ΕΚΚΡΕΜΕΙ ΚΑΤΕΒΑΣΜΑ» ΕΧΕΙ ΤΑΥΤΟΤΗΤΑ (εύρημα 7/9/2026)
   Μετρήθηκε στο v48 (6 γύροι, 2 άδειασαν τον φάκελο 567 → 56 bytes): η σημαία
   ήταν σκέτο '1'. Ένα κατέβασμα που είχε ξεκινήσει ΝΩΡΙΤΕΡΑ τελείωνε και τη
   σβήνει — ακόμα κι όταν η ανάγκη είχε σηκωθεί ΜΕΤΑ και δεν εξυπηρετήθηκε
   ποτέ. Ο φρουρός «ποτέ ανέβασμα πριν το κατέβασμα» (3/9) άνοιγε και ανέβαινε
   ΑΔΕΙΟΣ φάκελος πάνω στα τιμολόγια.
   Εδώ η επικάλυψη γίνεται ΝΤΕΤΕΡΜΙΝΙΣΤΙΚΗ: αργοπορούμε το κατέβασμα του
   φακέλου, ώστε να είναι σίγουρα «εν πτήσει» όταν σηκωθεί η νέα ανάγκη. */
const { test, expect } = require('@playwright/test');
const APP = 'http://127.0.0.1:8788/kostometro/';

test.describe.configure({ timeout: 150000 });

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
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
  return w;
}
async function signIn(p, email, words) {
  await p.locator('#acc-yes').click();
  await p.locator('#si-email').fill(email);
  await p.locator('#si-words').fill(words.join(' '));
  await p.locator('#si-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 25000 });
}
async function seedShots(p, n, tag) {
  return p.evaluate(async ({ n, tag }) => {
    const mk = (seed) => new Blob([new Uint8Array(20 * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        st.put({ id: tag + i + '-' + Math.random().toString(36).slice(2, 8), ts: Date.now(),
                 supplier: 'ΠΡΟΜ ' + tag + i, invDate: Date.now(), blob: mk(i), pages: [],
                 net: 100 + i, vat: 19, total: 119 + i });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }, { n, tag });
}
async function runSync(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-settings').hidden = false; });
  await p.evaluate(() => new Promise((res) => {
    document.getElementById('st-sync-now').click();
    const t = setInterval(() => { if (!document.getElementById('st-sync-now').disabled) { clearInterval(t); res(); } }, 200);
  }));
  await p.waitForTimeout(1500);
}
/* Πόσο ζυγίζει ο φάκελος στον server: 4 τιμολόγια ≈ 500+ bytes, άδειος ≈ 56. */
async function folderBytes(p) {
  return p.evaluate(() => fetch('/api/km/folder', { headers: {
    'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Lock': localStorage.getItem('km_lock') || '',
    'X-Km-Auth': localStorage.getItem('km_lock_auth') || localStorage.getItem('km_auth') || '',
    'X-Km-Device': localStorage.getItem('km_install_id')
  } }).then((r) => r.arrayBuffer()).then((b) => b.byteLength).catch(() => -1));
}

test('Ν1 · 🔴 ΑΝΑΓΚΗ ΠΟΥ ΣΗΚΩΘΗΚΕ ΟΣΟ ΚΑΤΕΒΑΖΑΜΕ ΔΕΝ ΣΒΗΝΕΤΑΙ ΑΠΟ ΕΚΕΙΝΟ ΤΟ ΚΑΤΕΒΑΣΜΑ', async ({ context }) => {
  const email = 'np' + Date.now() + '@example.com';
  const p1 = await fresh(context);
  const words = await onboard(p1, email);
  await seedShots(p1, 4, 'N');
  await runSync(p1);
  const full = await folderBytes(p1);
  expect(full).toBeGreaterThan(300);          // θετικό δείγμα ελέγχου: ο φάκελος ΕΧΕΙ δεδομένα
  await p1.close();

  const p2 = await fresh(context);
  /* Το κατέβασμα του φακέλου αργεί 7″ — άρα είναι ΣΙΓΟΥΡΑ εν πτήσει όταν
     σηκωθεί η νέα ανάγκη λίγο πιο κάτω. */
  await p2.route('**/api/km/folder', async (route) => {
    if (route.request().method() === 'GET') { await new Promise((r) => setTimeout(r, 7000)); }
    await route.continue();
  });
  const puts = [];
  p2.on('request', (r) => { if (/api\/km\/folder/.test(r.url()) && r.method() === 'PUT') { puts.push((r.postData() || '').length); } });
  await signIn(p2, email, words);             // εδώ ξεκινάει το αργό κατέβασμα

  /* Η ΝΕΑ ΑΝΑΓΚΗ, ΟΣΟ ΤΟ ΠΡΟΗΓΟΥΜΕΝΟ ΤΡΕΧΕΙ: η συσκευή δεν κρατάει πια την
     αλήθεια του φακέλου (όπως όταν ο browser σβήσει τον χώρο υπό πίεση, ή
     όταν αλλάξει ο λογαριασμός) — άρα ΔΕΝ επιτρέπεται να ανεβάσει. */
  await p2.evaluate(async () => {
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onsuccess = () => { const t = r.result.transaction('shots', 'readwrite'); t.objectStore('shots').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); };
    });
    localStorage.setItem('km_need_pull', '1');
  });

  /* Αφήνουμε το ΠΑΛΙΟ κατέβασμα να τελειώσει κανονικά. */
  await expect.poll(async () => p2.evaluate(() => document.getElementById('st-sync') ? 1 : 1), { timeout: 1000 }).toBe(1);
  await p2.waitForTimeout(12000);
  await p2.unroute('**/api/km/folder');

  /* 🔴 Ο ΦΡΟΥΡΟΣ: η σημαία ΠΡΕΠΕΙ να στέκει ακόμα. */
  expect(await p2.evaluate(() => localStorage.getItem('km_need_pull'))).not.toBeNull();
  /* Και τίποτα δεν ανέβηκε πάνω στον φάκελο. */
  expect(puts).toEqual([]);
  /* Και η απόδειξη στον ίδιο τον server: ο φάκελος δεν άδειασε. */
  expect(await folderBytes(p2)).toBe(full);
  await p2.close();
});

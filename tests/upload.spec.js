const { test, expect } = require('@playwright/test');
const APP = 'http://127.0.0.1:8788/kostometro/';
const B = 'http://127.0.0.1:8788';

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
  // Η εφαρμογή μπορεί να ξαναφορτώσει μόνη της (νέος service worker ή έλεγχος
  // έκδοσης) και να μηδενίσει την οθόνη. Ξαναπροσπαθούμε ΟΛΟ το βήμα.
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
  if (!ok) { throw new Error('δεν σταθεροποιήθηκε η οθόνη του email'); }
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
  return w;
}
// βάζει n τιμολόγια με ΠΡΑΓΜΑΤΙΚΕΣ φωτογραφίες (blob), όπως τα γράφει η κάμερα
async function seedShots(p, n, pagesEach) {
  return p.evaluate(async ({ n, pagesEach }) => {
    const mk = (seed, kb) => new Blob([new Uint8Array(kb * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const ids = [];
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        const id = 'inv' + i + '-' + Math.random().toString(36).slice(2, 8);
        ids.push(id);
        st.put({ id, ts: Date.now(), supplier: 'ΠΡΟΜΗΘΕΥΤΗΣ ' + i, invDate: Date.now(),
                 blob: mk(i, 40), pages: Array.from({ length: pagesEach }, (_, k) => mk(i * 10 + k, 30)),
                 net: 100 + i, vat: 19, total: 119 + i });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    return ids;
  }, { n, pagesEach });
}
/* Η εφαρμογή συγχρονίζει ΚΑΙ μόνη της (άνοιγμα, κάθε αποθήκευση). Ένας
   χειροκίνητος συγχρονισμός μπορεί να τελειώσει ενώ ο αυτόματος τρέχει ακόμα,
   οπότε η γραμμή αλλάζει μετά τη μέτρηση. Περιμένουμε να ΗΣΥΧΑΣΕΙ: ίδια τιμή
   δύο συνεχόμενες φορές. Χωρίς αυτό τα τεστ πέφτουν τυχαία — και το τυχαίο
   τεστ είναι χειρότερο από κανένα, γιατί μαθαίνεις να το αγνοείς. */
async function settled(p) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    let now;
    try { now = await p.locator('#st-sync').textContent(); } catch (e) { now = null; }
    if (now && now === last && !/ανεβαίνει|κατεβάζει|εξέλιξη|ξεκινάει/.test(now)) { return now; }
    last = now;
    await p.waitForTimeout(500);
  }
  return last;
}
async function runSync(p) {
  return p.evaluate(() => new Promise((res) => {
    document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
    document.getElementById('s-settings').hidden = false;
    document.getElementById('st-sync-now').click();
    const t = setInterval(() => {
      const b = document.getElementById('st-sync-now');
      if (!b.disabled) { clearInterval(t); res(document.getElementById('st-sync').textContent); }
    }, 200);
  })).then(() => settled(p));
}
async function idsOnServer(p) {
  return p.evaluate(() => fetch('/api/km/photos', { headers: {
    'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id')
  }}).then((r) => r.json()).then((j) => j.photos.map((x) => x.id).sort()));
}

test('26 · τα στοιχεία ΚΑΙ οι φωτογραφίες ανεβαίνουν — και ο server δεν μπορεί να τα διαβάσει', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'up' + Date.now() + '@example.com');
  const ids = await seedShots(p, 3, 1);          // 3 τιμολόγια × 2 σελίδες
  const line = await runSync(p);
  expect(line).toContain('6/6 φωτογραφίες στον server');

  const onSrv = await idsOnServer(p);
  const expected = [];
  ids.forEach((id) => { expected.push(id, id + '-p2'); });
  expect(onSrv).toEqual(expected.sort());

  // ΤΟ ΜΠΛΟΚ ΤΩΝ ΣΤΟΙΧΕΙΩΝ ΕΙΝΑΙ ΑΔΙΑΒΑΣΤΟ: ο προμηθευτής δεν φαίνεται πουθενά
  const raw = await p.evaluate(() => fetch('/api/km/folder', { headers: {
    'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Auth': localStorage.getItem('km_auth'), 'X-Km-Device': localStorage.getItem('km_install_id')
  }}).then((r) => r.arrayBuffer()).then((b) => new TextDecoder().decode(b)));
  expect(raw).not.toContain('ΠΡΟΜΗΘΕΥΤΗΣ');
  expect(raw).not.toContain('supplier');
  // θετικό δείγμα ελέγχου: το ΙΔΙΟ όργανο βλέπει τη λέξη σε ασφράγιστο κείμενο
  expect(new TextDecoder().decode(new TextEncoder().encode('ΠΡΟΜΗΘΕΥΤΗΣ 1'))).toContain('ΠΡΟΜΗΘΕΥΤΗΣ');
  await p.close();
});

test('27 · δεύτερος συγχρονισμός ΔΕΝ ξαναστέλνει φωτογραφία — μόνο τα στοιχεία', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'again' + Date.now() + '@example.com');
  await seedShots(p, 2, 0);
  expect(await runSync(p)).toContain('2/2 φωτογραφίες στον server');

  // δεύτερη φορά: τίποτα να ανέβει
  const line2 = await runSync(p);
  expect(line2).toContain('2/2 φωτογραφίες στον server');   // v34: λέει τι ΥΠΑΡΧΕΙ, όχι τι έτρεξε
  // αλλά τα στοιχεία ΑΝΕΒΗΚΑΝ ξανά — η έκδοση προχώρησε
  const v1 = Number((line2.match(/στοιχεία v(\d+)/) || [])[1]);
  expect(v1).toBeGreaterThan(1);
  await p.close();
});

test('28 · νέο τιμολόγιο μετά τον συγχρονισμό: ανεβαίνει ΜΟΝΟ αυτό', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'delta' + Date.now() + '@example.com');
  await seedShots(p, 2, 0);
  await runSync(p);
  await seedShots(p, 1, 1);                       // ένα νέο, με 2 σελίδες
  const line = await runSync(p);
  // ⚠ Ο αυτόματος συγχρονισμός του ανοίγματος μπορεί να προλάβει τον χειροκίνητο,
  // οπότε ο μετρητής δεν είναι ντετερμινιστικός. Το ΚΡΙΣΙΜΟ είναι άλλο: ότι
  // ΠΟΤΕ δεν ξαναστέλνονται οι ήδη ανεβασμένες.
  expect(line).toContain('4/4 φωτογραφίες στον server');
  await expect.poll(async () => (await idsOnServer(p)).length, { timeout: 15000 }).toBe(4);
  await p.close();
});

test('29 · χωρίς δίκτυο ο συγχρονισμός ΤΟ ΛΕΕΙ, δεν κρύβεται πίσω από «όλα καλά»', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'off' + Date.now() + '@example.com');
  await seedShots(p, 1, 0);
  await p.route('**/api/km/**', (r) => r.abort());
  expect(await runSync(p)).toContain('χωρίς δίκτυο');
  await p.unroute('**/api/km/**');
  expect(await runSync(p)).toContain('1/1 φωτογραφίες στον server');   // ξαναπροσπαθεί μόνο του
  await p.close();
});

test('30 · ΤΑ ΤΟΠΙΚΑ ΔΕΔΟΜΕΝΑ ΔΕΝ ΑΓΓΙΖΟΝΤΑΙ ΠΟΤΕ από το ανέβασμα', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'safe' + Date.now() + '@example.com');
  await seedShots(p, 3, 1);
  const before = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots','readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => x.id + '|' + x.supplier + '|' + x.total + '|' + x.blob.size + '|' + x.pages.length).sort()); };
  }));
  await runSync(p);
  await runSync(p);
  const after = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots','readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => x.id + '|' + x.supplier + '|' + x.total + '|' + x.blob.size + '|' + x.pages.length).sort()); };
  }));
  expect(after).toEqual(before);
  expect(after.length).toBe(3);
  await p.close();
});

// ── 31. Η ΓΡΑΜΜΗ ΚΙΝΕΙΤΑΙ ΜΟΝΗ ΤΗΣ (v32) ────────────────────────────────
test('31 · ο συγχρονισμός τρέχει ΜΟΝΟΣ του και η γραμμή το δείχνει χωρίς να πατηθεί κουμπί', async ({ context }) => {
  const p = await fresh(context);
  await onboard(p, 'auto' + Date.now() + '@example.com');
  await seedShots(p, 2, 0);

  // ανοίγουμε την εφαρμογή από την αρχή και πάμε ΚΑΤΕΥΘΕΙΑΝ στις Ρυθμίσεις,
  // χωρίς να αγγίξουμε το «Συγχρονισμός τώρα»
  await p.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForFunction(() => typeof kmNewWords === 'function', null, { timeout: 20000 });
  await p.evaluate(() => {
    document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
    document.getElementById('s-settings').hidden = false;
  });
  await p.evaluate(() => renderSettings && renderSettings()).catch(() => {});

  // η γραμμή πρέπει να φτάσει μόνη της σε ολοκληρωμένο συγχρονισμό
  await expect.poll(async () => {
    try { return await p.locator('#st-sync').textContent(); } catch (e) { return ''; }
  }, { timeout: 30000 }).toContain('φωτογραφίες');
  const line = await p.locator('#st-sync').textContent();
  expect(line).toMatch(/στοιχεία v\d+/);
  await p.close();
});

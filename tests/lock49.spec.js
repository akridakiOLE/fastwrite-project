/* v49 · Γ.2β — FREE = ΠΟΡΤΟΦΟΛΙ (κλειστό θέμα 6/9/2026)
   Μία συσκευή γράφει· η προηγούμενη βγαίνει ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ — ούτε
   ανάγνωση. Η επιστροφή γίνεται ΜΟΝΟ με τις 12 λέξεις (κενό κλοπής, 5/9).
   Ό,τι δεν πρόλαβε να ανεβάσει η παλιά φεύγει στο inbox και η ενεργή το
   ΠΡΟΣΘΕΤΕΙ — χωρίς αυτό, το κλείδωμα θα έθαβε δουλειά. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 180000 });

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
  for (let i = 0; i < 6; i++) {
    try {
      await expect(p.locator('#s-acc')).toBeVisible({ timeout: 8000 });
      await p.locator('#acc-no').click();
      await expect(p.locator('#s-email')).toBeVisible({ timeout: 4000 });
      await p.locator('#in-email').fill(email);
      break;
    } catch (e) { await p.waitForTimeout(500); }
  }
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(800);
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
async function seedShots(p, n, tag) {
  return p.evaluate(async ({ n, tag }) => {
    const mk = (seed) => new Blob([new Uint8Array(8 * 1024).map((_, i) => (i * 31 + seed) % 256)], { type: 'image/jpeg' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('kostometrisi', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const ids = [];
    await new Promise((res, rej) => {
      const t = db.transaction('shots', 'readwrite'), st = t.objectStore('shots');
      for (let i = 0; i < n; i++) {
        const id = tag + i + '-' + Math.random().toString(36).slice(2, 8);
        ids.push(id);
        st.put({ id, ts: Date.now(), supplier: 'ΠΡΟΜ ' + tag + i, invDate: Date.now(), blob: mk(i), pages: [], net: 100 + i, vat: 19, total: 119 + i });
      }
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    /* Ο μετρητής ανεβαίνει μέσω put() στην κανονική ροή· εδώ γράφουμε
       κατευθείαν στη βάση για ταχύτητα, οπότε τον δηλώνουμε ρητά. */
    localStorage.setItem('km_unsynced', String(n));
    return ids;
  }, { n, tag });
}
async function rows(p) {
  return p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots', 'readonly').objectStore('shots').getAll();
      q.onsuccess = () => res(q.result.map((x) => x.supplier).sort()); };
  }));
}
async function showRo(p) {
  await p.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.hidden = true); document.getElementById('s-cam').hidden = false; });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(p.locator('#ro')).toBeVisible({ timeout: 12000 });
}
const mail = (t) => t + Date.now() + Math.random().toString(36).slice(2) + '@example.com';

test('Λ1 · ΔΩΡΕΑΝ: η μη ενεργή συσκευή είναι ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ — καμία διαδρομή προς τα τιμολόγια', async ({ browser }) => {
  const e = mail('l1-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);              // η Β γίνεται ενεργή
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await showRo(A.p);

  await expect(A.p.locator('#ro-title')).toHaveText(/εκτός λειτουργίας/i);
  await expect(A.p.locator('#ro-menu')).toBeHidden();          // δεν υπάρχει «Δες τα τιμολόγια»
  await expect(A.p.locator('#ro-wbox')).toBeVisible();         // η επιστροφή θέλει τις 12 λέξεις

  /* 🔴 Ο ΦΡΑΓΜΟΣ: ακόμα κι αν πατηθεί το ☰ ή κληθεί το goto, καμία οθόνη
     δεδομένων δεν ανοίγει. «Εκτός λειτουργίας» που δείχνει τιμολόγια από
     πλάγια διαδρομή δεν είναι εκτός λειτουργίας. */
  /* ⚠ ΜΟΝΟ ΜΕΣΩ ΤΗΣ ΟΘΟΝΗΣ. Το goto() ζει μέσα στο closure του app.js και
     ΔΕΝ είναι global — κλήση του από το τεστ πετάει ReferenceError που ένα
     try/catch καταπίνει, και το τεστ μένει πράσινο χωρίς να δοκιμάσει
     τίποτα (μετρήθηκε 6/9). Πατάμε ό,τι πατάει ο άνθρωπος. */
  /* ⚠ dispatchEvent, ΟΧΙ click({force:true}): το force ρίχνει το κλικ στις
     ΣΥΝΤΕΤΑΓΜΕΝΕΣ, και εκεί από πάνω κάθεται η οθόνη κλειδώματος — το κουμπί
     δεν το πατούσε ποτέ κανείς και το τεστ έμενε πράσινο χωρίς να δοκιμάσει
     τίποτα (μετρήθηκε 6/9 με μετάλλαξη). Το dispatchEvent πάει το γεγονός
     στο ΙΔΙΟ το στοιχείο. */
  await A.p.locator('#btn-menu').dispatchEvent('click');
  await A.p.waitForTimeout(600);
  await expect(A.p.locator('#s-menu')).toBeHidden();
  await expect(A.p.locator('#s-pend')).toBeHidden();
  await expect(A.p.locator('#s-sup')).toBeHidden();
  await expect(A.p.locator('#ro')).toBeVisible();
  await A.ctx.close(); await B.ctx.close();
});

test('Λ2 · 🔴 Η ΔΟΥΛΕΙΑ ΔΕΝ ΘΑΒΕΤΑΙ: ό,τι δεν πρόλαβε η παλιά φεύγει στο inbox και η ενεργή το ΠΡΟΣΘΕΤΕΙ', async ({ browser }) => {
  const e = mail('l2-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  /* Δύο τιμολόγια στην Α που ΔΕΝ πρόλαβαν να ανέβουν. */
  await seedShots(A.p, 2, 'XAM');
  const B = await device(browser);
  await signIn(B.p, e, w);              // η Β παίρνει τη σκυτάλη — η Α κλειδώνει

  /* Η Α ανοίγει με δίκτυο: μαθαίνει ότι δεν είναι ενεργή και ξεφορτώνει. */
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_unsynced')),
    { timeout: 30000, intervals: [500] }).toBe('0');

  /* Η Β κατεβάζει: τα δύο τιμολόγια της Α πρέπει να είναι εκεί. */
  await expect.poll(async () => {
    await B.p.evaluate(() => { try { pullNow(); } catch (e) {} });
    const r = await rows(B.p);
    return r.filter((x) => x.indexOf('ΠΡΟΜ XAM') === 0).length;
  }, { timeout: 40000, intervals: [1500] }).toBe(2);

  /* Και το inbox άδειασε — διαβάστηκε, γράφτηκε, σβήστηκε. */
  const left = await B.p.evaluate(() => fetch('/api/km/inbox', { headers: {
    'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Lock': localStorage.getItem('km_lock'),
    'X-Km-Auth': localStorage.getItem('km_lock_auth'), 'X-Km-Device': localStorage.getItem('km_install_id')
  } }).then((r) => r.json()).then((j) => j.count));
  expect(left).toBe(0);
  await A.ctx.close(); await B.ctx.close();
});

test('Λ3 · η επιστροφή θέλει τις 12 ΣΩΣΤΕΣ λέξεις — λάθος λέξεις δεν ενεργοποιούν τίποτα', async ({ browser }) => {
  const e = mail('l3-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await showRo(A.p);

  /* Λάθος (αλλά έγκυρες) λέξεις: μήνυμα, και η Β παραμένει η ενεργή. */
  const other = await A.p.evaluate(() => kmNewWords());
  await A.p.locator('#ro-words').fill(other.join(' '));
  await A.p.locator('#ro-go').click();
  await expect(A.p.locator('#ro-err')).toBeVisible({ timeout: 15000 });
  expect(await A.p.evaluate(() => localStorage.getItem('km_active'))).toBe('0');

  /* Οι σωστές: περνάει. Ν=0 στην άλλη, άρα καμία ερώτηση. */
  await A.p.locator('#ro-words').fill(w.join(' '));
  await A.p.locator('#ro-go').click();
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_active')),
    { timeout: 40000, intervals: [500] }).toBe('1');
  await A.ctx.close(); await B.ctx.close();
});

test('Λ4 · Ν>0 στην άλλη συσκευή: ρωτάει ΠΡΙΝ πάρει τη σκυτάλη, και το «Άκυρο» δεν ενεργοποιεί', async ({ browser }) => {
  const e = mail('l4-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);              // Β ενεργή
  /* Η Β χρωστάει δύο, και το λέει στον server. */
  await seedShots(B.p, 2, 'BPEND');
  await B.p.evaluate(() => fetch('/api/km/status', { headers: {
    'X-Km-Folder': localStorage.getItem('km_folder'), 'X-Km-Lock': localStorage.getItem('km_lock'),
    'X-Km-Auth': localStorage.getItem('km_lock_auth'), 'X-Km-Device': localStorage.getItem('km_install_id'),
    'X-Km-Unsynced': '2'
  } }));

  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await showRo(A.p);
  await A.p.locator('#ro-words').fill(w.join(' '));

  /* 🔴 Ο ΦΡΟΥΡΟΣ: πρέπει να ΡΩΤΗΣΕΙ, και το «Άκυρο» να μην αλλάζει τίποτα. */
  let asked = null;
  A.p.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await A.p.locator('#ro-go').click();
  await expect.poll(async () => asked, { timeout: 30000, intervals: [400] }).not.toBeNull();
  expect(asked).toContain('2 τιμολόγια');
  await A.p.waitForTimeout(1500);
  expect(await A.p.evaluate(() => localStorage.getItem('km_active'))).toBe('0');   // ΔΕΝ πήρε τη σκυτάλη
  await A.ctx.close(); await B.ctx.close();
});

test('Λ5 · PRO: η ίδια συσκευή ΔΙΑΒΑΖΕΙ — ο κώδικας ανάγνωσης δεν σβήστηκε, κρύφτηκε', async ({ browser }) => {
  const e = mail('l5-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);
  /* 🔴 ΤΟ ΠΡΟΓΡΑΜΜΑ ΤΟ ΛΕΕΙ Ο SERVER, ΚΑΙ ΜΟΝΟ ΑΥΤΟΣ. Γράψιμο του km_plan
     στο localStorage ΔΕΝ δουλεύει — το refreshActive το σβήνει αμέσως,
     ακριβώς για να μη μπορεί κανείς να ξεκλειδώσει την ανάγνωση πειράζοντας
     τη συσκευή του. Άρα το τεστ πρέπει να πει ψέματα εκεί που λέει την
     αλήθεια η παραγωγή: στην απάντηση του server. */
  await A.p.route('**/api/km/status*', async (route) => {
    const res = await route.fetch();
    const j = await res.json().catch(() => null);
    if (j && j.state) { j.state.plan = 'pro'; }
    await route.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await expect.poll(async () => A.p.evaluate(() => localStorage.getItem('km_plan')),
    { timeout: 20000, intervals: [400] }).toBe('pro');
  await showRo(A.p);
  await expect(A.p.locator('#ro-title')).toHaveText(/σε άλλη συσκευή/i);
  await expect(A.p.locator('#ro-menu')).toBeVisible();          // ΕΧΕΙ διαδρομή προς τα τιμολόγια
  await A.p.locator('#ro-menu').click();
  await expect(A.p.locator('#s-menu')).toBeVisible({ timeout: 8000 });
  await A.ctx.close(); await B.ctx.close();
});

/* v51 · 7/9/2026, εισήγηση Stavros από πραγματικό κινητό: η οθόνη «εκτός
   λειτουργίας» ζητούσε τις 12 λέξεις ΧΩΡΙΣ να λέει πώς γράφονται. Η οδηγία
   υπήρχε ήδη — αλλά μόνο στην οθόνη σύνδεσης. Ίδια λέξη, ίδια θέση, και στις
   δύο. Ο μετρητής «0 από 12» λέει ΑΝ το πέτυχες· η γραμμή λέει ΠΩΣ. */
test('Λ6 · η οθόνη «εκτός λειτουργίας» λέει ΠΩΣ γράφονται οι 12 λέξεις — με κενό', async ({ browser }) => {
  const e = mail('l6-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await showRo(A.p);

  const box = A.p.locator('#ro-wbox');
  await expect(box).toBeVisible();
  await expect(box).toContainText('κενό');
  await expect(box).toContainText('με τη σειρά');
  /* Και είναι ΟΡΑΤΗ μαζί με το πεδίο, όχι κρυμμένη κάπου αλλού. */
  await expect(box.locator('p.note')).toBeVisible();
  await A.ctx.close(); await B.ctx.close();
});

/* 🔴 v51 · 7/9/2026 — ΤΟ ΚΛΕΙΔΩΜΕΝΟ ΚΙΝΗΤΟ ΔΕΝ ΔΕΙΧΝΕΙ ΤΙΣ 12 ΛΕΞΕΙΣ.
   Εύρημα Stavros: οι 12 λέξεις δεν είναι «τα δεδομένα αυτού του κινητού» —
   είναι το κλειδί ΟΛΟΚΛΗΡΟΥ του λογαριασμού, για πάντα. Συσκευή που ο
   ιδιοκτήτης έβγαλε εκτός λειτουργίας (κλοπή) δεν επιτρέπεται να τις δείχνει:
   θα έδινε στον κλέφτη μόνιμη πρόσβαση, ακόμα κι αφού ο ιδιοκτήτης πάρει πίσω
   τη σκυτάλη. Ο δρόμος του ιδιοκτήτη είναι το πορτοφόλι: ενεργοποιεί με τις
   12 λέξεις, ΚΑΙ ΜΕΤΑ έχει ρυθμίσεις. Αυτός ο φρουρός υπάρχει για να μη
   «διορθώσει» κανείς τη διαδρομή ανοίγοντας το μενού. */
test('Λ7 · κλειδωμένη συσκευή: καμία διαδρομή προς Ρυθμίσεις — άρα καμία προς τις 12 λέξεις', async ({ browser }) => {
  const e = mail('l7-');
  const A = await device(browser);
  const w = await onboard(A.p, e);
  const B = await device(browser);
  await signIn(B.p, e, w);
  await A.p.reload();
  await A.p.waitForFunction(() => typeof kmNewWords === 'function');
  await showRo(A.p);

  /* Ό,τι πατάει ο άνθρωπος: το ☰ της κεφαλίδας. */
  await A.p.locator('#btn-menu').dispatchEvent('click');
  await A.p.waitForTimeout(600);
  await expect(A.p.locator('#s-menu')).toBeHidden();
  await expect(A.p.locator('#s-settings')).toBeHidden();
  await expect(A.p.locator('#s-mywords')).toBeHidden();

  /* Και η ίδια η γραμμή «Ρυθμίσεις» δεν είναι προσιτή: ζει μέσα στο μενού
     που μόλις αποδείχθηκε ότι δεν ανοίγει. */
  await expect(A.p.locator('[data-go="s-settings"]')).toBeHidden();
  await expect(A.p.locator('#ro')).toBeVisible();
  await A.ctx.close(); await B.ctx.close();
});

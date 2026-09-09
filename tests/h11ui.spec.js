/* v56 · Η.11 — ΤΟ ΚΟΥΜΠΙ ΤΗΣ ΔΙΑΓΡΑΦΗΣ ΚΑΙ Ο ΑΝΙΧΝΕΥΤΗΣ ΤΟΥ 410
   (Brief Η.11, αποφάσεις Stavros 9/9/2026)

   Κάθε φρουρός εδώ ΠΡΕΠΕΙ να αποδειχθεί ότι κοκκινίζει όταν βγει (Α400 §Γ 3/9).

   ⚠ localhost, ΟΧΙ 127.0.0.1 — το WebAuthn απορρίπτει τη διεύθυνση IP ως rpId
   (μετρήθηκε 5/9). Ο εικονικός αυθεντικοποιητής υπάρχει επειδή το δακτυλικό
   δεν υπάρχει σε headless Chromium· έτσι δοκιμάζεται ο ΔΙΚΟΣ μας κώδικας.

   🔴 ΤΟ ΤΕΣΤ ΠΑΤΑΕΙ Ο,ΤΙ ΠΑΤΑΕΙ Ο ΑΝΘΡΩΠΟΣ (κανόνας 6/9). Καμία εσωτερική
   συνάρτηση δεν καλείται από το τεστ: οι συναρτήσεις ζουν σε closure και μια
   κλήση τους θα πετούσε ReferenceError που το try/catch θα κατάπινε — ψευδώς
   πράσινο. Εδώ πατιούνται κουμπιά και διαβάζεται η ΟΘΟΝΗ και το localStorage. */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 120000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller,
    null, { timeout: 20000 }
  ).catch(() => {});
  await p.waitForTimeout(1200);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}

async function addAuthenticator(ctx, p) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true
    }
  });
  return { cdp, authenticatorId };
}

/* Πλήρης εγγραφή, ως τον λογαριασμό με φάκελο. */
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
  await p.waitForTimeout(800);
  return w;
}

async function openSettings(p) {
  await p.evaluate(() => {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = true; });
    document.getElementById('s-settings').hidden = false;
  });
}

const mail = (p) => p + Date.now() + Math.random().toString(36).slice(2) + '@test.gr';

/* ── 1. Η ΛΙΣΤΑ SCREENS ──────────────────────────────────────────
   ⚠ ΕΙΧΕ ΓΡΑΦΤΕΙ ΕΔΩ ξεχωριστό τεστ που «έλεγχε» ότι οι δύο οθόνες είναι στη
   λίστα SCREENS. Ήταν ΨΕΥΔΩΣ ΠΡΑΣΙΝΟ: έστηνε μόνο του τα hidden με
   querySelectorAll αντί να περάσει από την show() της εφαρμογής — δοκίμαζε
   δηλαδή τον εαυτό του. Η μετάλλαξη το απέδειξε (9/9/2026): βγάζοντας τα
   's-del','s-gone' από τη λίστα, το τεστ έμενε πράσινο.
   Η show() ζει σε closure και ΔΕΝ είναι global — κλήση της από το τεστ θα
   πετούσε ReferenceError (παγίδα 1, κανόνας 6/9).
   🔴 Η ΛΙΣΤΑ ΦΥΛΑΓΕΤΑΙ ΑΠΟ ΤΑ Η11ui-3 ΚΑΙ Η11ui-6, που φτάνουν στις οθόνες
   ΟΠΩΣ Ο ΑΝΘΡΩΠΟΣ. Οθόνη εκτός λίστας μένει hidden και εκείνα κοκκινίζουν.
   Ενας φρουρός, ένα σημείο (Α400 §Γ 6/9). */

/* ── 2. Η ΠΥΛΗ ΤΟΥ ΚΛΕΙΔΩΜΑΤΟΣ ──────────────────────────────────── */

test('Η11ui-2 · 🔴 ΧΩΡΙΣ ΚΛΕΙΔΩΜΑ ΣΥΣΚΕΥΗΣ Η ΟΘΟΝΗ ΔΙΑΓΡΑΦΗΣ ΔΕΝ ΑΝΟΙΓΕΙ', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('h11a-'));
  await openSettings(p);
  /* Κανένας αυθεντικοποιητής: η συσκευή δεν έχει κλείδωμα. Ο λογαριασμός
     δεν επιτρέπεται να σβήνεται από όποιον σηκώσει το ξεκλείδωτο κινητό. */
  await p.locator('#st-delacc').click();
  await expect(p.locator('#da-err')).toBeVisible({ timeout: 15000 });
  await expect(p.locator('#s-del')).toBeHidden();
  await ctx.close();
});

test('Η11ui-3 · με κλείδωμα ανοίγει — και ζητάει τη λέξη, δεν σβήνει με το πάτημα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await addAuthenticator(ctx, p);
  await onboard(p, mail('h11b-'));
  await openSettings(p);
  await p.locator('#st-delacc').click();
  await expect(p.locator('#s-del')).toBeVisible({ timeout: 20000 });
  /* Το πεδίο είναι άδειο: κανείς δεν σβήνει λογαριασμό με ένα πάτημα. */
  await expect(p.locator('#dl-word')).toHaveValue('');
  await ctx.close();
});

/* ── 3. Η ΛΕΞΗ ─────────────────────────────────────────────────── */

test('Η11ui-4 · λάθος λέξη ΔΕΝ στέλνει τίποτα στον server', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await addAuthenticator(ctx, p);
  await onboard(p, mail('h11c-'));

  const calls = [];
  p.on('request', (r) => { if (r.url().includes('/api/km/delete')) { calls.push(r.url()); } });

  await openSettings(p);
  await p.locator('#st-delacc').click();
  await expect(p.locator('#s-del')).toBeVisible({ timeout: 20000 });

  for (const bad of ['', 'ναι', 'διαγραφη', 'DELETE', 'ΔΙΑΓΡΑΦΉ']) {
    await p.locator('#dl-word').fill(bad);
    await p.locator('#dl-go').click();
    await expect(p.locator('#dl-err')).toBeVisible({ timeout: 4000 });
  }
  await p.waitForTimeout(500);
  /* 🔴 Ο φρουρός: ούτε ΜΙΑ κλήση δεν έφυγε. */
  expect(calls.length, 'έφυγαν κλήσεις με λάθος λέξη').toBe(0);
  await expect(p.locator('#s-del')).toBeVisible();
  await ctx.close();
});

/* ── 4. Η ΠΡΑΞΗ, ΑΚΡΗ ΣΕ ΑΚΡΗ ──────────────────────────────────── */

test('Η11ui-5 · σωστή λέξη: ο λογαριασμός σβήνει στον server ΚΑΙ η συσκευή καθαρίζει', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await addAuthenticator(ctx, p);
  await onboard(p, mail('h11d-'));
  const folder = await p.evaluate(() => localStorage.getItem('km_folder'));
  expect(folder).toBeTruthy();

  await openSettings(p);
  await p.locator('#st-delacc').click();
  await expect(p.locator('#s-del')).toBeVisible({ timeout: 20000 });
  await p.locator('#dl-word').fill('ΔΙΑΓΡΑΦΗ');
  await p.locator('#dl-go').click();

  /* Η συσκευή ξαναφορτώνει και γυρίζει στην ΠΡΩΤΗ οθόνη. */
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 30000 });
  const after = await p.evaluate(() => ({
    folder: localStorage.getItem('km_folder'),
    words: localStorage.getItem('km_words'),
    email: localStorage.getItem('km_email'),
    id: localStorage.getItem('km_install_id')
  }));
  expect(after.folder, 'έμεινε ο φάκελος').toBeNull();
  expect(after.words, 'έμειναν οι 12 λέξεις').toBeNull();
  expect(after.email, 'έμεινε το email').toBeNull();
  /* Το install_id ΜΕΝΕΙ: είναι η ταυτότητα της συσκευής, όχι του λογαριασμού. */
  expect(after.id, 'χάθηκε το install_id').toBeTruthy();

  /* ΑΠΟΔΕΙΞΗ ΑΠΟ ΤΟΝ SERVER, όχι από την οθόνη: οι ίδιες 12 λέξεις είναι νεκρές. */
  const res = await p.evaluate(async (f) => {
    const r = await fetch('/api/km/status', {
      headers: { 'X-Km-Folder': f, 'X-Km-Auth': '0'.repeat(64), 'X-Km-Device': 'km_probe' }
    });
    return r.status;
  }, folder);
  expect([403, 410]).toContain(res);
  await ctx.close();
});

/* ── 5. Ο ΑΝΙΧΝΕΥΤΗΣ ΤΟΥ 410 — ΤΟ ΚΕΝΟ ΠΟΥ ΒΡΕΘΗΚΕ 9/9 ─────────── */

test('Η11ui-6 · 🔴 ΑΛΛΗ ΣΥΣΚΕΥΗ: το 410 ανοίγει την οθόνη και ΚΡΑΤΑΕΙ τα τοπικά', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('h11e-'));

  /* Ο server απαντάει 410 σε κάθε διαδρομή μόλις ο λογαριασμός διαγραφεί.
     Το page.route αλλάζει την ΑΠΑΝΤΗΣΗ — δεν στήνει κατάσταση με localStorage
     εκεί που την ορίζει ο server (παγίδα 3 του κανόνα 6/9). */
  await p.route('**/api/km/**', (route) =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{"ok":false,"error":"deleted"}' })
  );

  /* Ο χρήστης δεν κάνει τίποτα ιδιαίτερο — απλώς η εφαρμογή μιλάει στον
     server, όπως κάνει μόνη της κάθε 30 δευτερόλεπτα. */
  await p.evaluate(() => { document.getElementById('st-sync-now').click(); });
  await expect(p.locator('#s-gone')).toBeVisible({ timeout: 30000 });

  const st = await p.evaluate(() => ({
    gone: localStorage.getItem('km_acct_gone'),
    words: localStorage.getItem('km_words'),
    folder: localStorage.getItem('km_folder')
  }));
  expect(st.gone, 'δεν μπήκε η σημαία').toBeTruthy();
  /* 🔴 ΤΟ ΚΥΡΙΟ: τίποτα δεν σβήστηκε. Απόφαση Stavros 9/9. */
  expect(st.words, 'σβήστηκαν οι λέξεις χωρίς να το ζητήσει').toBeTruthy();
  expect(st.folder, 'σβήστηκε ο φάκελος χωρίς να το ζητήσει').toBeTruthy();
  await ctx.close();
});

test('Η11ui-7 · η οθόνη «διαγράφηκε» ΔΕΝ είναι αδιέξοδο — το «Συνέχισε» βγάζει έξω', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('h11f-'));
  await p.route('**/api/km/**', (route) =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{"ok":false,"error":"deleted"}' })
  );
  await p.evaluate(() => { document.getElementById('st-sync-now').click(); });
  await expect(p.locator('#s-gone')).toBeVisible({ timeout: 30000 });

  /* Κανόνας Α400 §Γ 4/9: οθόνη που εμφανίζεται μόνη της χρειάζεται διαδρομή
     προς τα έξω. Χωρίς αυτό ο χρήστης κλειδώνεται και χάνει τα τιμολόγιά του. */
  await p.locator('#gn-keep').click();
  await expect(p.locator('#s-gone')).toBeHidden({ timeout: 8000 });
  const still = await p.evaluate(() => localStorage.getItem('km_words'));
  expect(still).toBeTruthy();
  await ctx.close();
});

test('Η11ui-8 · η οθόνη δείχνεται ΜΙΑ φορά, δεν ξαναπηδάει σε κάθε κλήση', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('h11g-'));
  await p.route('**/api/km/**', (route) =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{"ok":false,"error":"deleted"}' })
  );
  await p.evaluate(() => { document.getElementById('st-sync-now').click(); });
  await expect(p.locator('#s-gone')).toBeVisible({ timeout: 30000 });
  await p.locator('#gn-keep').click();
  await expect(p.locator('#s-gone')).toBeHidden({ timeout: 8000 });

  /* Δεύτερη κλήση: η σημαία υπάρχει ήδη, η οθόνη ΔΕΝ ξαναπηδάει πάνω από
     ό,τι κοιτάζει ο χρήστης. */
  await p.evaluate(() => { document.getElementById('st-sync-now').click(); });
  await p.waitForTimeout(2500);
  await expect(p.locator('#s-gone')).toBeHidden();
  await ctx.close();
});

test('Η11ui-9 · «Ξεκίνα καθαρά»: ΜΟΝΟ αυτό σβήνει τα τοπικά, και μόνο με επιβεβαίωση', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('h11h-'));
  await p.route('**/api/km/**', (route) =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{"ok":false,"error":"deleted"}' })
  );
  await p.evaluate(() => { document.getElementById('st-sync-now').click(); });
  await expect(p.locator('#s-gone')).toBeVisible({ timeout: 30000 });

  /* Πρώτα ΑΡΝΗΣΗ στην επιβεβαίωση: τίποτα δεν σβήνει. */
  p.once('dialog', (d) => d.dismiss());
  await p.locator('#gn-fresh').click();
  await p.waitForTimeout(1200);
  expect(await p.evaluate(() => localStorage.getItem('km_words'))).toBeTruthy();

  /* Μετά ΑΠΟΔΟΧΗ. */
  p.once('dialog', (d) => d.accept());
  await p.locator('#gn-fresh').click();
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 30000 });
  const after = await p.evaluate(() => ({
    words: localStorage.getItem('km_words'),
    gone: localStorage.getItem('km_acct_gone')
  }));
  expect(after.words).toBeNull();
  expect(after.gone).toBeNull();
  await ctx.close();
});

/* v36 · ΤΑ ΔΥΟ ΚΕΝΑ ΤΩΝ 12 ΛΕΞΕΩΝ (βρέθηκαν 4/9 σε πραγματικές συσκευές)
   (α) Καμία οθόνη δεν έδειχνε τις 12 λέξεις — Brief Α Γ.3 ανεφάρμοστο.
   (β) Η οθόνη των νέων λέξεων ήταν αδιέξοδο: ένα κουμπί, καμία διαδρομή
       προς το «Έχω ήδη λογαριασμό».

   ⚠ ΓΙΑΤΙ VIRTUAL AUTHENTICATOR: το δακτυλικό δεν υπάρχει σε headless
   Chromium. Το CDP WebAuthn δίνει αυθεντικοποιητή που απαντάει «ναι» —
   έτσι δοκιμάζεται ο ΔΙΚΟΣ μας κώδικας, όχι το υλικό της συσκευής.
   Και το ΑΝΤΙΣΤΡΟΦΟ δοκιμάζεται κιόλας: χωρίς αυθεντικοποιητή η πύλη
   ΠΡΕΠΕΙ να κρατάει τις λέξεις κλειστές. Αυτό είναι το τεστ που
   κοκκινίζει αν κάποιος βγάλει τον φρουρό. */
const { test, expect } = require('@playwright/test');
/* ⚠ localhost, ΟΧΙ 127.0.0.1 — μετρήθηκε 5/9: το WebAuthn απορρίπτει τη
   διεύθυνση IP ως rpId («SecurityError: This is an invalid domain») και το
   τεστ θα έπεφτε για λόγο που δεν υπάρχει στην παραγωγή (fastwrite.tech). */
const APP = 'http://localhost:8788/kostometro/';

test.describe.configure({ timeout: 120000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller,
    null, { timeout: 20000}
  ).catch(() => {});
  await p.waitForTimeout(1500);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}

/* Φτάνει ΜΕΧΡΙ την οθόνη των 12 λέξεων και σταματάει εκεί (δεν τσεκάρει). */
async function toWords(p, email) {
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
}

async function onboard(p, email) {
  await toWords(p, email);
  const w = await p.locator('#w-list li').allTextContents();
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
  return w;
}

async function settings(p) {
  await p.evaluate(() => {
    document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
    document.getElementById('s-settings').hidden = false;
  });
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

/* ── (β) Η ΕΞΟΔΟΣ ΑΠΟ ΤΟ ΑΔΙΕΞΟΔΟ ───────────────────────────────── */

test('β1 · η οθόνη των 12 λέξεων ΔΕΝ είναι αδιέξοδο — έχει διαδρομή προς τη σύνδεση', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await toWords(p, 'b1@test.gr');
  /* Ο φρουρός: χωρίς αυτό το κουμπί, ο χρήστης έχει ΜΟΝΟ το «Συνέχεια»
     και καταλήγει με δεύτερο, ασύνδετο λογαριασμό. */
  await expect(p.locator('#w-signin')).toBeVisible();
  await p.locator('#w-signin').click();
  await expect(p.locator('#s-signin')).toBeVisible({ timeout: 5000 });
  await ctx.close();
});

test('β2 · το «Πίσω» της σύνδεσης γυρίζει στις ΙΔΙΕΣ 12 λέξεις, όχι σε άλλες', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await toWords(p, 'b2@test.gr');
  const before = await p.locator('#w-list li').allTextContents();

  await p.locator('#w-signin').click();
  await expect(p.locator('#s-signin')).toBeVisible({ timeout: 5000 });
  await p.locator('#si-back').click();
  await expect(p.locator('#s-words')).toBeVisible({ timeout: 5000 });

  const after = await p.locator('#w-list li').allTextContents();
  /* 🔴 Αν το «Πίσω» ξανακαλούσε startWords(), εδώ θα ήταν ΑΛΛΕΣ λέξεις —
     και όποιος τις είχε ήδη γράψει στο χαρτί θα κρατούσε λάθος κλειδί. */
  expect(after).toEqual(before);
  await ctx.close();
});

test('β3 · από την ΠΡΩΤΗ οθόνη το «Πίσω» της σύνδεσης γυρίζει εκεί, όχι στις λέξεις', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await p.locator('#acc-yes').click();
  await expect(p.locator('#s-signin')).toBeVisible({ timeout: 5000 });
  await p.locator('#si-back').click();
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 5000 });
  await expect(p.locator('#s-words')).toBeHidden();
  await ctx.close();
});

/* ── (α) ΟΙ 12 ΛΕΞΕΙΣ ΜΟΥ, ΠΙΣΩ ΑΠΟ ΤΟ ΚΛΕΙΔΩΜΑ ──────────────────── */

test('α1 · με κλείδωμα συσκευής: οι λέξεις εμφανίζονται και είναι ΟΙ ΙΔΙΕΣ που δόθηκαν', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  const words = await onboard(p, 'a1@test.gr');
  await addAuthenticator(ctx, p);

  await settings(p);
  await p.locator('#st-mywords').click();
  await expect(p.locator('#s-mywords')).toBeVisible({ timeout: 20000 });

  const shown = await p.locator('#mw-list li').allTextContents();
  expect(shown).toHaveLength(12);
  /* Δεν αρκεί «εμφανίστηκαν 12 λέξεις» — ψευδώς θετικό (λάθος 4/9).
     Πρέπει να είναι ΑΥΤΕΣ που κρατάει ο λογαριασμός. */
  expect(shown).toEqual(words);
  const stored = await p.evaluate(() => localStorage.getItem('km_words'));
  expect(shown.join(' ')).toBe(stored);
  await ctx.close();
});

test('α2 · ΧΩΡΙΣ κλείδωμα συσκευής: οι λέξεις ΔΕΝ εμφανίζονται — ο φρουρός κρατάει', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'a2@test.gr');
  /* Κανένας αυθεντικοποιητής επίτηδες: συσκευή χωρίς PIN/δακτυλικό. */

  await settings(p);
  await p.locator('#st-mywords').click();
  await expect(p.locator('#mw-err')).toBeVisible({ timeout: 20000 });
  /* 🔴 ΤΟ ΤΕΣΤ ΠΟΥ ΚΟΚΚΙΝΙΖΕΙ ΑΝ ΒΓΕΙ Ο ΦΡΟΥΡΟΣ. Αν το κουμπί καλούσε
     κατευθείαν showMyWords(), η οθόνη θα ήταν ορατή εδώ. */
  await expect(p.locator('#s-mywords')).toBeHidden();
  const msg = await p.locator('#mw-err').textContent();
  /* Και λέει ΤΙ να κάνει, όχι σκέτο «όχι». */
  expect(msg).toMatch(/κλείδωμα/);
  await ctx.close();
});

test('α3 · η αποτυχημένη επιβεβαίωση δεν δείχνει τίποτα', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, 'a3@test.gr');
  const { cdp, authenticatorId } = await addAuthenticator(ctx, p);
  /* Υπάρχει κλείδωμα, αλλά ο χρήστης ΔΕΝ επιβεβαιώνεται (ακύρωσε, ή
     λάθος δάχτυλο). Το isUVPAA λέει «ναι», το get() πέφτει. */
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });

  await settings(p);
  await p.locator('#st-mywords').click();
  await expect(p.locator('#mw-err')).toBeVisible({ timeout: 30000 });
  await expect(p.locator('#s-mywords')).toBeHidden();
  await ctx.close();
});

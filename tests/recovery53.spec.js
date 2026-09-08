/* v53 · 4β — ΤΟ ΚΡΥΠΤΟΓΡΑΦΙΚΟ ΣΤΡΩΜΑ ΤΟΥ BACKUP ΑΝΑΚΤΗΣΗΣ
   (κλειστό 6/9 · αποφάσεις Stavros 7/9)

   Το ίδιο μοτίβο με το Γ.1 της 6/9: η κρυπτογραφία επαληθεύεται ΧΩΡΙΣ UI,
   μέσα από τη σελίδα `/km-crypto-test.html` που τρέχει ο ίδιος ο browser —
   ώστε ο Stavros να μπορεί να την ανοίξει και μόνος του σε πραγματικό
   κινητό, με ένα κλικ, και να δει το ίδιο αποτέλεσμα.

   🔴 Ο έλεγχος 24 είναι ο πυρήνας ολόκληρης της υπόσχεσης: «με το δικό μας
   μισό ΜΟΝΟ δεν ανοίγουμε τίποτα». Αν πέσει αυτός, η δημόσια υπόσχεση που
   στάλθηκε σε πελάτη στις 7/9 είναι ψέμα. */
const { test, expect } = require('@playwright/test');
const PAGE = 'http://127.0.0.1:8788/km-crypto-test';

test.describe.configure({ timeout: 180000 });

async function runPage(p) {
  await p.goto(PAGE);
  await expect(p.locator('#go')).toBeVisible({ timeout: 15000 });
  await p.locator('#go').click();
  await expect.poll(async () => p.locator('#sum').textContent(),
    { timeout: 150000, intervals: [1000] }).toMatch(/ΟΛΑ ΠΕΡΑΣΑΝ|ΑΠΕΤΥΧΑΝ/);
  return p.locator('#sum').textContent();
}

test('Β1 · η σελίδα κρυπτογραφίας περνάει ΟΛΟΥΣ τους ελέγχους, μαζί με τους νέους της ανάκτησης', async ({ page }) => {
  const sum = await runPage(page);
  console.log('  >> ' + sum);
  expect(sum).toContain('ΟΛΑ ΠΕΡΑΣΑΝ');
  /* Θετικό δείγμα ελέγχου: αν οι νέοι έλεγχοι δεν έτρεξαν καθόλου, το
     «ΟΛΑ ΠΕΡΑΣΑΝ» δεν σημαίνει τίποτα για αυτό που χτίζουμε σήμερα. */
  const body = await page.locator('body').textContent();
  expect(body).toContain('22 κωδικός');
  expect(body).toContain('24 🔴');
  expect(body).toContain('25 με τα ΔΥΟ μισά');
  expect(body).toContain('26 δύο κλειδαριές');
});

/* Οι επόμενοι τρέχουν την ΙΔΙΑ κρυπτογραφία απευθείας, χωρίς τη σελίδα:
   ένας φρουρός ανά ιδιότητα, ώστε όταν κάτι κοκκινίσει να ξέρουμε ΤΙ. */
async function crypto1(p) {
  await p.goto(PAGE);
  await p.waitForFunction(() => typeof kmDeriveR2 === 'function', null, { timeout: 15000 });
}

test('Β2 · 🔴 ΤΟ ΔΙΚΟ ΜΑΣ ΜΙΣΟ ΜΟΝΟ ΤΟΥ ΔΕΝ ΑΝΟΙΓΕΙ ΤΙΠΟΤΑ — και του χρήστη μόνο του ούτε', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(async () => {
    const salt = kmRandomHex(16), PW = 'parathyro-84-Molyvi';
    const K = kmNewK(), R1 = kmNewR1();
    const r2 = await kmDeriveR2(PW, salt);
    const wrapped = await kmWrapK(await kmRecoveryKek(R1, r2), K);
    const tryOpen = async (r1x, r2x) => {
      try { return kmBytesToHex(await kmUnwrapK(await kmRecoveryKek(r1x, r2x), wrapped)); }
      catch (e) { return null; }
    };
    return {
      /* Το θετικό δείγμα ελέγχου: με τα δύο μαζί ΑΝΟΙΓΕΙ. Χωρίς αυτό, τρία
         «null» πιο κάτω θα σήμαιναν απλώς ότι τίποτα δεν δουλεύει. */
      both:   await tryOpen(R1, r2),
      real:   kmBytesToHex(K),
      onlyR1: await tryOpen(R1, await kmDeriveR2('entelos-allos-kodikos', salt)),
      onlyR2: await tryOpen(kmNewR1(), r2),
      wrongS: await tryOpen(R1, await kmDeriveR2(PW, kmRandomHex(16)))
    };
  });
  expect(r.both).toBe(r.real);      // δείγμα ελέγχου
  expect(r.onlyR1).toBeNull();      // εμείς μόνοι μας
  expect(r.onlyR2).toBeNull();      // ο χρήστης χωρίς εμάς
  expect(r.wrongS).toBeNull();      // σωστός κωδικός, λάθος λογαριασμός
});

test('Β3 · ο κωδικός δεν φεύγει ποτέ — δύο λογαριασμοί με ΙΔΙΟ κωδικό δεν μοιράζονται τίποτα', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(async () => {
    const PW = 'parathyro-84-Molyvi';
    const a = kmRandomHex(16), b = kmRandomHex(16);
    const ra = await kmDeriveR2(PW, a), rb = await kmDeriveR2(PW, b);
    const ra2 = await kmDeriveR2(PW, a);
    return { same: kmBytesToHex(ra) === kmBytesToHex(ra2), shared: kmBytesToHex(ra) === kmBytesToHex(rb), len: ra.length };
  });
  expect(r.len).toBe(32);
  expect(r.same).toBe(true);        // σταθερό για τον ίδιο λογαριασμό
  expect(r.shared).toBe(false);     // ποτέ κοινό ανάμεσα σε λογαριασμούς
});

test('Β4 · ο έλεγχος κωδικού κόβει το κοντό και το μονότονο (ελάχιστο 10, απόφαση Stavros 7/9)', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(() => ({
    kontos: kmPasswordCheck('abc123').ok,
    monotonos: kmPasswordCheck('aaaaaaaaaa').ok,
    oria: kmPasswordCheck('1234567890').ok,
    kalos: kmPasswordCheck('parathyro-84-Molyvi'),
    keno: kmPasswordCheck('').ok
  }));
  expect(r.kontos).toBe(false);
  expect(r.monotonos).toBe(false);
  expect(r.keno).toBe(false);
  expect(r.oria).toBe(true);        // ακριβώς 10, δεκτός
  expect(r.kalos.ok).toBe(true);
  expect(r.kalos.score).toBeGreaterThanOrEqual(3);
});

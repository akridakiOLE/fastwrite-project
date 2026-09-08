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

/* ══ v53β · Ο ΑΡΙΘΜΟΣ ΤΩΝ ΒΗΜΑΤΩΝ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΜΕ ΤΗΝ ΚΛΕΙΔΑΡΙΑ ══════
   Μετρήθηκε 7/9 στο κινητό του Stavros, στην παραγωγή: 600.000 βήματα σε
   146 ms — πολύ ταχύτερα από την πρόβλεψη. Ο αριθμός ανέβηκε σε 2.000.000.
   🔴 Και το κύριο: χωρίς αποθηκευμένες παραμέτρους, η σημερινή επιλογή θα
   ήταν ΜΟΝΟΔΡΟΜΟΣ — κάθε μελλοντική αύξηση θα έκανε τα ΠΑΛΙΑ backup να μην
   ανοίγουν ποτέ ξανά. Αυτοί οι φρουροί φυλάνε ακριβώς αυτό. */

test('Β5 · η προεπιλογή είναι 2.000.000 βήματα, και οι παράμετροι λένε πώς φτιάχτηκε', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(() => kmRecoveryParams());
  expect(r.kdf).toBe('pbkdf2-sha256');
  expect(r.iter).toBe(2000000);
  expect(r.v).toBe(1);
});

test('Β6 · 🔴 ΠΑΛΙΑ ΚΛΕΙΔΑΡΙΑ ΜΕ ΛΙΓΟΤΕΡΑ ΒΗΜΑΤΑ ΑΝΟΙΓΕΙ ΑΚΟΜΑ — η αύξηση δεν σπάει κανέναν', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(async () => {
    const salt = kmRandomHex(16), PW = 'parathyro-84-Molyvi';
    const K = kmNewK(), R1 = kmNewR1();
    /* Κλειδαριά φτιαγμένη ΧΘΕΣ, με τα παλιά 600.000 βήματα, και οι
       παράμετροί της γραμμένες δίπλα της — όπως θα τις είχε ο server. */
    const oldParams = JSON.stringify({ kdf: 'pbkdf2-sha256', iter: 600000, v: 1 });
    const r2old = await kmDeriveR2(PW, salt, 600000);
    const wrapped = await kmWrapK(await kmRecoveryKek(R1, r2old), K);

    /* ΣΗΜΕΡΑ, με προεπιλογή 2.000.000, την ανοίγουμε ΔΙΑΒΑΖΟΝΤΑΣ τις δικές
       της παραμέτρους. */
    const p = kmReadRecoveryParams(oldParams);
    const open = async (iter) => {
      try { return kmBytesToHex(await kmUnwrapK(await kmRecoveryKek(R1, await kmDeriveR2(PW, salt, iter)), wrapped)); }
      catch (e) { return null; }
    };
    return {
      real: kmBytesToHex(K),
      withParams: await open(p.iter),        // διαβάζοντας τις παραμέτρους → ΑΝΟΙΓΕΙ
      withDefault: await open(undefined),    // αγνοώντας τες → ΔΕΝ ανοίγει
      iter: p.iter
    };
  });
  expect(r.iter).toBe(600000);
  expect(r.withParams).toBe(r.real);     // 🔴 ο φρουρός
  expect(r.withDefault).toBeNull();      // και η απόδειξη ότι ΟΝΤΩΣ θα έσπαγε
});

test('Β7 · παράμετροι που δεν καταλαβαίνουμε ή είναι ύποπτα χαμηλές ΑΠΟΡΡΙΠΤΟΝΤΑΙ, δεν αγνοούνται σιωπηλά', async ({ page }) => {
  await crypto1(page);
  const r = await page.evaluate(() => {
    const t = (raw) => { try { return kmReadRecoveryParams(raw).iter; } catch (e) { return 'ΣΦΑΛΜΑ'; } };
    return {
      kalo:    t('{"kdf":"pbkdf2-sha256","iter":600000,"v":1}'),
      xamilo:  t('{"kdf":"pbkdf2-sha256","iter":1000,"v":1}'),
      agnosto: t('{"kdf":"md5","iter":600000,"v":1}'),
      skoupidi: t('οχι-json'),
      keno:    t(null)
    };
  });
  expect(r.kalo).toBe(600000);       // δείγμα ελέγχου: το σωστό περνάει
  expect(r.xamilo).toBe('ΣΦΑΛΜΑ');   // 1.000 βήματα = χαλασμένο ή πειραγμένο
  expect(r.agnosto).toBe('ΣΦΑΛΜΑ');
  expect(r.skoupidi).toBe('ΣΦΑΛΜΑ');
  expect(r.keno).toBe('ΣΦΑΛΜΑ');
});

/* 🔴 Β8 — Ο ΕΛΕΓΧΟΣ ΠΟΥ ΠΡΟΣΤΑΤΕΥΕΙ ΤΟ DEPLOY.
   Η στήλη `params` είναι ΝΕΑ (schema/km_v53.sql). Αν η μετάβαση δεν τρέξει,
   το INSERT της κλειδαριάς αποτυγχάνει — και μαζί του σπάει ΚΑΙ η αλλαγή
   12 λέξεων, που περνάει από το ίδιο endpoint. Δηλαδή μια ξεχασμένη
   μετάβαση δεν χαλάει «το καινούργιο»: χαλάει και το ΠΑΛΙΟ που δούλευε.
   Ίδια οικογένεια με το σπάσιμο της παραγωγής στις 6/9. */
test('Β8 · 🔴 οι παράμετροι ταξιδεύουν ΩΣ ΤΟΝ SERVER και γυρίζουν πίσω αυτούσιες', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8788/kostometro/');
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForTimeout(1200);
  const email = 'prm' + Date.now() + Math.random().toString(36).slice(2) + '@example.com';
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(800);

  const r = await p.evaluate(async () => {
    const head = () => ({
      'Content-Type': 'application/json',
      'X-Km-Folder': localStorage.getItem('km_folder'),
      'X-Km-Lock': localStorage.getItem('km_lock') || '',
      'X-Km-Auth': localStorage.getItem('km_lock_auth') || localStorage.getItem('km_auth') || '',
      'X-Km-Device': localStorage.getItem('km_install_id')
    });
    const K = kmHexToBytes(localStorage.getItem('km_k'));
    const R1 = kmNewR1();
    const salt = localStorage.getItem('km_folder');       // το salt βγαίνει από τον φάκελο
    const r2 = await kmDeriveR2('parathyro-84-Molyvi', salt);
    const L = await kmDeriveLock(await kmNewWords());     // ξεχωριστή κλειδαριά, kind=recovery
    const params = JSON.stringify(kmRecoveryParams());
    const put = await fetch('/api/km/lock', { method: 'POST', headers: head(), body: JSON.stringify({
      lock_id: L.lockId, auth_token: L.authToken,
      wrapped_k: await kmWrapK(await kmRecoveryKek(R1, r2), K),
      kind: 'recovery', params: params
    }) });
    const putJ = await put.json().catch(() => ({}));
    /* Και τώρα το διαβάζουμε πίσω, όπως θα το έκανε η συσκευή που ανακτά. */
    const back = await fetch('/api/km/unlock', { method: 'POST', headers: {
      'Content-Type': 'application/json',
      'X-Km-Lock': L.lockId, 'X-Km-Auth': L.authToken,
      'X-Km-Device': localStorage.getItem('km_install_id')
    } });
    const backJ = await back.json().catch(() => ({}));
    return { putStatus: put.status, putOk: !!putJ.ok, sent: params,
             backStatus: back.status, got: backJ.params, kind: backJ.kind };
  });

  expect(r.putStatus).toBe(200);
  expect(r.putOk).toBe(true);
  expect(r.backStatus).toBe(200);
  expect(r.kind).toBe('recovery');
  expect(r.got).toBe(r.sent);          // 🔴 αυτούσιες, χαρακτήρα προς χαρακτήρα
  await ctx.close();
});

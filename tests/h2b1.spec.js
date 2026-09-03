const { test, expect } = require('@playwright/test');
const B = 'http://127.0.0.1:8788';
const APP = B + '/kostometro/';

// ── βοηθητικά ────────────────────────────────────────────────────────────
// «καθαρή συσκευή»: σβήνει localStorage και ΑΔΕΙΑΖΕΙ τη βάση χωρίς να τη
// διαγράψει — το deleteDatabase μπλοκάρει όσο η εφαρμογή κρατάει σύνδεση.
async function fresh(context) {
  await context.clearCookies();
  const p = await context.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.evaluate(async () => {
    localStorage.clear();
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('shots')) d.createObjectStore('shots', { keyPath: 'id' }).createIndex('status', 'status');
      };
      r.onsuccess = () => { const t = r.result.transaction('shots', 'readwrite'); t.objectStore('shots').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); };
      r.onerror = () => rej(r.error);
    });
  });
  return p;
}
// κάθε διαδρομή ξεκινάει ΜΟΝΟ αφού το boot() έχει δείξει την πρώτη οθόνη
async function atStart(p) {
  await p.reload();
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 15000 });
}
// σπέρνει έναν "υπάρχοντα χρήστη": email + N τιμολόγια στο IndexedDB, ΧΩΡΙΣ λέξεις
async function seedOldUser(page, n) {
  await page.evaluate(async (n) => {
    localStorage.setItem('km_email', 'palios@example.com');
    localStorage.setItem('km_key_skipped', '1');
    localStorage.setItem('km_perm_seen', '1');
    await new Promise((res, rej) => {
      const r = indexedDB.open('kostometrisi', 1);
      r.onsuccess = () => {
        const db = r.result, t = db.transaction('shots', 'readwrite'), s = t.objectStore('shots');
        for (let i = 0; i < n; i++) s.put({ id: 'inv' + i, status: 'done', total: 100 + i, supplier: 'ΠΡΟΜ ' + i });
        t.oncomplete = res; t.onerror = () => rej(t.error);
      };
      r.onerror = () => rej(r.error);
    });
  }, n);
}
async function countInvoices(page) {
  return page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('kostometrisi', 1);
    r.onsuccess = () => { const q = r.result.transaction('shots','readonly').objectStore('shots').count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); };
    r.onerror = () => rej(r.error);
  }));
}
async function accountsFor(request, email) {
  // διαβάζει την πραγματική D1 μέσω του lookup route του ίδιου του worker
  const r = await request.get(B + '/api/km/lookup?email=' + encodeURIComponent(email));
  return (await r.json()).exists;
}
// περνάει την οθόνη των λέξεων και τις επιστρέφει
async function passWords(page) {
  await expect(page.locator('#s-words')).toBeVisible();
  await expect(page.locator('#w-list li')).toHaveCount(12, { timeout: 10000 });
  const words = await page.locator('#w-list li').allTextContents();
  await expect(page.locator('#w-go')).toBeDisabled();      // υποχρεωτικό τσεκάρισμα
  await page.locator('#w-ok').check();
  await expect(page.locator('#w-go')).toBeEnabled();
  await page.locator('#w-go').click();
  return words;
}

// ── 1. Ο ΕΝΤΕΛΩΣ ΝΕΟΣ ΧΡΗΣΤΗΣ (διαδρομή ΟΧΙ) ─────────────────────────────
test('1 · νέος χρήστης: πρώτη οθόνη -> email -> 12 λέξεις -> κάμερα, και γράφεται στο μητρώο', async ({ context, request }) => {
  const p = await fresh(context);
  await atStart(p);
  await p.locator('#acc-no').click();
  await expect(p.locator('#s-email')).toBeVisible();
  const email = 'neos' + Date.now() + '@example.com';
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  const words = await passWords(p);
  expect(words.length).toBe(12);
  await expect(p.locator('#s-key')).toBeVisible();          // συνεχίζει η παλιά ροή
  await p.waitForTimeout(700);
  expect(await accountsFor(request, email)).toBe(true);     // ΕΓΓΡΑΦΗΚΕ
  await p.close();
});

// ── 2. ΤΟ ΤΣΕΚΑΡΙΣΜΑ ΞΑΝΑΖΗΤΕΙΤΑΙ ΑΝ ΔΕΝ ΕΓΙΝΕ ──────────────────────────
test('2 · κλείνει στις λέξεις χωρίς τσεκάρισμα -> ξαναεμφανίζονται στο επόμενο άνοιγμα', async ({ context }) => {
  const p = await fresh(context);
  await atStart(p);
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill('atsek@example.com');
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 10000 });
  await p.reload();                                          // "έκλεισε την εφαρμογή"
  await expect(p.locator('#s-words')).toBeVisible();
  await expect(p.locator('#w-go')).toBeDisabled();
  await p.close();
});

// ── 3. Ο ΥΠΑΡΧΩΝ ΧΡΗΣΤΗΣ (η περίπτωση του Stavros) ──────────────────────
test('3 · υπάρχων χρήστης με 5 τιμολόγια: παίρνει κλειδί, χάνει ΜΗΔΕΝ', async ({ context, request }) => {
  const p = await fresh(context);
  await seedOldUser(p, 5);
  expect(await countInvoices(p)).toBe(5);
  await p.reload();
  await expect(p.locator('#s-words')).toBeVisible();
  await expect(p.locator('#w-title')).toHaveText('Το κλειδί του αρχείου σου');
  await expect(p.locator('#w-lede')).toContainText('δεν πειράχτηκαν');
  await passWords(p);
  await p.waitForTimeout(700);
  expect(await countInvoices(p)).toBe(5);                    // ΤΑ 5 ΕΙΝΑΙ ΕΚΕΙ
  expect(await accountsFor(request, 'palios@example.com')).toBe(true);
  await p.close();
});

// ── 4. ΛΑΘΟΣ ΛΕΞΕΙΣ ΔΕΝ ΦΤΙΑΧΝΟΥΝ ΣΙΩΠΗΛΑ ΝΕΟ ΛΟΓΑΡΙΑΣΜΟ ────────────────
test('4 · "έχω λογαριασμό" με έγκυρες αλλά άγνωστες λέξεις -> μήνυμα, ΚΑΙ κανένας νέος λογαριασμός', async ({ context, request }) => {
  const p = await fresh(context);
  await atStart(p);
  // έγκυρες αλλά αχρησιμοποίητες λέξεις. Με retry: ο service worker μπορεί να
  // ανανεώσει τη σελίδα στη μέση (αυτόματη ανανέωση έκδοσης, φέτα 3).
  let other = null;
  for (let i = 0; i < 5 && !other; i++) {
    try { other = await p.evaluate(() => kmNewWords().then((w) => w.join(' '))); }
    catch (e) { await p.waitForTimeout(400); await atStart(p); }
  }
  expect(other, 'δεν παρήχθησαν λέξεις ελέγχου').toBeTruthy();
  const email = 'fantasma' + Date.now() + '@example.com';
  await p.locator('#acc-yes').click();
  await p.locator('#si-email').fill(email);
  await p.locator('#si-words').fill(other);
  await p.locator('#si-go').click();
  await expect(p.locator('#si-err')).toContainText('Δεν βρέθηκε λογαριασμός', { timeout: 10000 });
  expect(await accountsFor(request, email)).toBe(false);      // ΤΟ ΚΡΙΣΙΜΟ
  await p.close();
});

// ── 5. ΛΑΘΟΣ ΣΕΙΡΑ / ΛΑΘΟΣ ΛΕΞΗ ΠΙΑΝΕΤΑΙ ΠΡΙΝ ΤΟ ΔΙΚΤΥΟ ─────────────────
test('5 · 11 λέξεις και ανύπαρκτη λέξη -> καθαρό μήνυμα, καμία κλήση', async ({ context }) => {
  const p = await fresh(context);
  await atStart(p);
  await p.locator('#acc-yes').click();
  await p.locator('#si-email').fill('a@b.gr');
  await p.locator('#si-words').fill('abandon abandon abandon');
  await p.locator('#si-go').click();
  await expect(p.locator('#si-err')).toContainText('12 λέξεις');
  await p.locator('#si-words').fill('zzzz abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon');
  await p.locator('#si-go').click();
  await expect(p.locator('#si-err')).toContainText('δεν είναι στη λίστα');
  await p.close();
});

// ── 6. ΣΩΣΤΕΣ ΛΕΞΕΙΣ ΣΕ ΔΕΥΤΕΡΗ ΣΥΣΚΕΥΗ -> ΜΠΑΙΝΕΙ ──────────────────────
test('6 · δεύτερη συσκευή με τις ΣΩΣΤΕΣ 12 λέξεις -> συνδέεται', async ({ context }) => {
  const p1 = await fresh(context);
  await atStart(p1);
  await p1.locator('#acc-no').click();
  const email = 'duo' + Date.now() + '@example.com';
  await p1.locator('#in-email').fill(email);
  await p1.locator('#go-email').click();
  const words = await passWords(p1);
  await p1.waitForTimeout(700);
  await p1.close();

  const p2 = await fresh(context);                 // "άλλη συσκευή": καθαρή αποθήκευση
  await atStart(p2);
  await p2.locator('#acc-yes').click();
  await p2.locator('#si-email').fill(email);
  await p2.locator('#si-words').fill(words.join(' '));
  await p2.locator('#si-go').click();
  await expect(p2.locator('#s-key')).toBeVisible({ timeout: 15000 });
  expect(await p2.evaluate(() => localStorage.getItem('km_words'))).toBe(words.join(' '));
  await p2.close();
});

// ── 7. ΟΙ ΛΕΞΕΙΣ ΔΕΝ ΦΕΥΓΟΥΝ ΠΟΤΕ ΑΠΟ ΤΗ ΣΥΣΚΕΥΗ (+ θετικό δείγμα) ──────
test('7 · καμία λέξη δεν εμφανίζεται σε αίτημα δικτύου — με θετικό δείγμα ελέγχου', async ({ context }) => {
  const p = await fresh(context);
  const seen = [];
  p.on('request', (r) => { seen.push(r.url() + ' ' + JSON.stringify(r.headers()) + ' ' + (r.postData() || '')); });
  await atStart(p);
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill('leak' + Date.now() + '@example.com');
  await p.locator('#go-email').click();
  const words = await passWords(p);
  await p.waitForTimeout(900);
  const blob = seen.join('\n');
  for (const w of words) {
    expect(blob.split(new RegExp('\\b' + w + '\\b')).length - 1, 'διέρρευσε η λέξη ' + w).toBe(0);
  }
  // ΘΕΤΙΚΟ ΔΕΙΓΜΑ: το ίδιο όργανο ΠΡΕΠΕΙ να πιάνει μια λέξη όταν όντως σταλεί
  await p.evaluate((w) => fetch('/api/km/lookup?email=' + w + '@x.gr'), words[0]);
  await p.waitForTimeout(400);
  const blob2 = seen.join('\n');
  expect(blob2.split(new RegExp('\\b' + words[0] + '\\b')).length - 1).toBeGreaterThan(0);
  await p.close();
});

// ── 8. ΧΩΡΙΣ ΔΙΚΤΥΟ Ο ΧΡΗΣΤΗΣ ΔΕΝ ΜΠΛΟΚΑΡΕΙ ────────────────────────────
test('8 · χωρίς δίκτυο: ο χρήστης περνάει, η εγγραφή μένει εκκρεμής και γίνεται μετά', async ({ context, request }) => {
  const p = await fresh(context);
  await atStart(p);
  const email = 'offline' + Date.now() + '@example.com';
  await p.route('**/api/km/**', (r) => r.abort());
  await p.locator('#acc-no').click();
  await p.locator('#in-email').fill(email);
  await p.locator('#go-email').click();
  await passWords(p);
  await expect(p.locator('#s-key')).toBeVisible();            // ΔΕΝ κόλλησε
  expect(await accountsFor(request, email)).toBe(false);
  expect(await p.evaluate(() => localStorage.getItem('km_registered'))).toBeNull();
  await p.unroute('**/api/km/**');                            // ξαναήρθε το δίκτυο
  await p.reload();
  await p.waitForTimeout(900);
  expect(await accountsFor(request, email)).toBe(true);       // η εκκρεμής εγγραφή έγινε
  await p.close();
});

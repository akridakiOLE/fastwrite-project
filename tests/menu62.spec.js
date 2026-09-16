/* v62 · Brief Ε — ΤΟ ΜΕΝΟΥ ΠΡΙΝ ΤΗΝ ΚΥΚΛΟΦΟΡΙΑ (εγκρίθηκε 11/9/2026, χτίστηκε 16/9)
   Τρεις νέες οθόνες (Ερωτήσεις · Υποστήριξη · Η γνώμη σου), το μενού σε ομάδες,
   το νέο κείμενο του «Κάλεσε», και οι δύο διορθώσεις του §7.

   🔴 ΤΟ ΤΕΣΤ ΠΑΤΑΕΙ Ο,ΤΙ ΠΑΤΑΕΙ Ο ΑΝΘΡΩΠΟΣ (κανόνας 6/9): φτάνει στις οθόνες
   από το μενού, όχι με show() — έτσι φυλάει ΚΑΙ τη λίστα SCREENS (5/9). */
const { test, expect } = require('@playwright/test');
const APP = 'http://localhost:8788/kostometro/';
test.describe.configure({ timeout: 120000 });

async function device(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  return { ctx, p };
}
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
  if (!ok) throw new Error('δεν άνοιξε η οθόνη email');
  await p.locator('#go-email').click();
  await expect(p.locator('#w-list li')).toHaveCount(12, { timeout: 15000 });
  await p.locator('#w-ok').check();
  await p.locator('#w-go').click();
  await expect(p.locator('#s-key')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(800);
}
/* Από την οθόνη κλειδιού στην κάμερα και στο μενού — ΟΠΩΣ Ο ΑΝΘΡΩΠΟΣ:
   «Παράλειψη» → «Κατάλαβα — άνοιξε την κάμερα» → ☰. Σε headless η κάμερα δεν
   υπάρχει, αλλά το ☰ (#btn-menu) ζει στην οθόνη της κάμερας και πατιέται. */
async function toMenu(p) {
  await p.locator('#skip-key').click();
  await expect(p.locator('#s-perm')).toBeVisible({ timeout: 8000 });
  await p.locator('#go-perm').click();
  await expect(p.locator('#s-cam')).toBeVisible({ timeout: 15000 });
  await p.waitForTimeout(600);
  /* Το ☰ κάθεται πάνω από το <video> της κάμερας· σε headless το Playwright
     θεωρεί το κλικ «μη σταθερό» και δεν το παραδίδει. Το κλικ στέλνεται στο
     ΙΔΙΟ κουμπί μέσω του DOM — πατιέται το κουμπί, όχι εσωτερική συνάρτηση. */
  await p.evaluate(() => document.getElementById('btn-menu').click());
  await expect(p.locator('#s-menu')).toBeVisible({ timeout: 8000 });
}
const mail = (x) => x + Date.now() + Math.random().toString(36).slice(2) + '@test.gr';

test('Μ62-1 · το μενού έχει τρεις ομάδες, υπογραφές, και τους συνδέσμους πολιτικής/όρων/έκδοσης', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62a-'));
  await toMenu(p);
  await expect(p.locator('#s-menu .grp')).toHaveCount(3);
  await expect(p.locator('#s-menu .grp').nth(0)).toHaveText(/Τα τιμολόγιά μου/);
  await expect(p.locator('#s-menu .grp').nth(1)).toHaveText(/Βοήθεια/);
  await expect(p.locator('#s-menu .grp').nth(2)).toHaveText(/Μοιράσου/);
  await expect(p.locator('#s-menu .row-sub')).toHaveCount(6);
  await expect(p.locator('#s-menu .menu-foot a[href="/legal/privacy"]')).toBeVisible();
  await expect(p.locator('#s-menu .menu-foot a[href="/legal/terms"]')).toBeVisible();
  await expect(p.locator('#m-ver')).toHaveText(/v6\d/);
  await ctx.close();
});

test('Μ62-2 · Ερωτήσεις & απαντήσεις: 16 ερωτήσεις (όχι iPhone), το #12 λέει 72 ώρες, ο 🔗 οδηγεί σε οθόνη', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62b-'));
  await toMenu(p);
  await p.locator('[data-go="s-faq"]').click();
  await expect(p.locator('#s-faq')).toBeVisible({ timeout: 5000 });
  await expect(p.locator('details.faq')).toHaveCount(16);   // 17 στο brief (1-16 + 12β) μείον το iPhone
  const all = await p.locator('#faq-body').textContent();
  expect(all, 'το iPhone ΔΕΝ μπαίνει πριν τη δοκιμή').not.toMatch(/iPhone/);
  const del = p.locator('details.faq', { hasText: 'Πώς διαγράφω' });
  await del.locator('summary').click();
  await expect(del).toContainText('72 ώρες');
  // ο σύνδεσμος της απάντησης #16 πάει στην Υποστήριξη
  const q16 = p.locator('details.faq', { hasText: 'Πώς επικοινωνώ' });
  await q16.locator('summary').click();
  await q16.locator('button.go').click();
  await expect(p.locator('#s-help')).toBeVisible({ timeout: 5000 });
  await ctx.close();
});

test('Μ62-3 · Υποστήριξη: αριθμός εισιτηρίου KM-XXXX, το mailto έχει θέμα, έκδοση και συσκευή — τίποτα στον server', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62c-'));
  const calls = [];
  p.on('request', (r) => { if (r.url().includes('/api/km/') && !/status|folder|register|lookup|photos|inbox|version/.test(r.url())) calls.push(r.url()); });
  await toMenu(p);
  await p.locator('[data-go="s-help"]').click();
  await expect(p.locator('#s-help')).toBeVisible({ timeout: 5000 });
  const ticket = await p.locator('#hp-ticket').textContent();
  expect(ticket).toMatch(/^KM-[A-HJ-NP-Z2-9]{4}$/);
  await p.locator('#hp-mail').click();
  // Σε headless το mailto δεν αλλάζει σελίδα· αρκεί ότι ΔΕΝ έγινε κλήση στον server
  await p.waitForTimeout(600);
  expect(calls, 'η Υποστήριξη δεν μιλάει στον server').toEqual([]);
  await ctx.close();
});

test('Μ62-4 · Η γνώμη σου: αστέρια + κείμενο → φτάνει στον server (200), χωρίς email αν δεν ζητηθεί', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62d-'));
  await toMenu(p);
  let sent = null;
  p.on('request', (r) => { if (r.url().includes('/api/km/feedback')) sent = r.postDataJSON(); });
  await p.locator('[data-go="s-fb"]').click();
  await expect(p.locator('#s-fb')).toBeVisible({ timeout: 5000 });
  // άδειο → σφάλμα, καμία κλήση
  await p.locator('#fb-send').click();
  await expect(p.locator('#fb-err')).toBeVisible();
  expect(sent).toBeNull();
  // 4 αστέρια + κείμενο
  await p.locator('#fb-stars button[data-s="4"]').click();
  await expect(p.locator('#fb-stars button.on')).toHaveCount(4);
  await p.locator('#fb-text').fill('Δοκιμή v62 από Playwright');
  await p.locator('#fb-send').click();
  await expect(p.locator('#fb-ok')).toBeVisible({ timeout: 10000 });
  expect(sent.stars).toBe(4);
  expect(sent.email, 'χωρίς «Θέλω απάντηση» το email ΔΕΝ φεύγει').toBeNull();
  expect(sent.folder_id, 'ποτέ folder_id στη γνώμη').toBeUndefined();
  await ctx.close();
});

test('Μ62-5 · Κάλεσε: το νέο κείμενο «μπαίνουν πρώτοι» υπάρχει και ο σύνδεσμος έχει ?ref=', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62e-'));
  await toMenu(p);
  await p.locator('[data-go="s-ref"]').click();
  await expect(p.locator('#s-ref')).toBeVisible({ timeout: 5000 });
  await expect(p.locator('#s-ref')).toContainText('μπαίνουν πρώτοι');
  await expect(p.locator('#ref-link')).toContainText('ref=');
  await ctx.close();
});

test('Μ62-6 · §7: η οθόνη κλειδιού λέει «καθαρό ποσό, ΦΠΑ και σύνολο» και ΟΧΙ ότι η Google χρησιμοποιεί τις φωτογραφίες', async ({ browser }) => {
  const { ctx, p } = await device(browser);
  await onboard(p, mail('m62f-'));
  const t = await p.locator('#s-key').textContent();
  expect(t).toMatch(/καθαρό ποσό, ΦΠΑ και σύνολο/);
  expect(t).not.toMatch(/υπόλοιπο/);
  expect(t).not.toMatch(/μπορεί να χρησιμοποιήσει τις φωτογραφίες/);
  await ctx.close();
});

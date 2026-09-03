const { test, expect } = require('@playwright/test');
const fs = require('fs');
const APP = 'http://127.0.0.1:8788/kostometro/';

test('36 · η οθόνη ΔΕΝ κλειδώνεται πια σε κάθετο — ακολουθεί τη συσκευή', () => {
  const m = JSON.parse(fs.readFileSync('site/kostometro/manifest.webmanifest', 'utf8'));
  expect(m.orientation, 'το manifest κλειδώνει ακόμα τον προσανατολισμό').toBeUndefined();
  expect(m.display).toBe('standalone');   // ό,τι άλλο μένει ως είχε
  expect(m.scope).toBe('/kostometro/');
});

test('37 · η οθόνη σύνδεσης λέει ΠΩΣ γράφονται οι λέξεις, και μετράει όσο γράφεις', async ({ context }) => {
  const p = await context.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof kmNewWords === 'function');
  await p.evaluate(() => localStorage.clear());
  await p.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await expect(p.locator('#s-acc')).toBeVisible({ timeout: 20000 });
  await p.locator('#acc-yes').click();
  await expect(p.locator('#s-signin')).toBeVisible();

  // η οδηγία υπάρχει και λέει τα τρία που ρώτησε ο Stavros
  const note = await p.locator('#s-signin .note').textContent();
  expect(note).toContain('και τις 12');
  expect(note).toContain('σειρά');
  expect(note).toContain('κενό');

  // ο μετρητής ακολουθεί το γράψιμο
  await expect(p.locator('#si-count')).toHaveText('0 από 12 λέξεις');
  await p.locator('#si-words').fill('abandon abandon abandon');
  await expect(p.locator('#si-count')).toHaveText('3 από 12 λέξεις');
  await p.locator('#si-words').fill('a b c d e f g h i j k l');
  await expect(p.locator('#si-count')).toHaveText('12 από 12 λέξεις ✓');
  // πολλαπλά κενά και κενό στο τέλος δεν μπερδεύουν τον μετρητή
  await p.locator('#si-words').fill('  a   b  c d e f g h i j k l   ');
  await expect(p.locator('#si-count')).toHaveText('12 από 12 λέξεις ✓');
  await p.close();
});

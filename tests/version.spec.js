const { test, expect } = require('@playwright/test');
const fs = require('fs');
const APP = 'http://127.0.0.1:8788/kostometro/';
const V = 'site/kostometro/version.json';
const JS = 'site/kostometro/app.js';
const SW = 'site/kostometro/sw.js';

// ── 16. Ο ΦΡΟΥΡΟΣ ΤΟΥ ΙΔΙΟΥ ΤΟΥ ΜΗΧΑΝΙΣΜΟΥ ──────────────────────────────
// Αν ξεχαστεί το version.json σε ένα deploy, ΟΛΟΙ οι χρήστες κολλάνε σε
// ατέρμονη «νέα έκδοση». Αυτό το τεστ σπάει το build πριν φύγει.
test('16 · version.json, APP_VER και CACHE δείχνουν ΤΗΝ ΙΔΙΑ έκδοση', () => {
  const v = JSON.parse(fs.readFileSync(V, 'utf8')).v;
  const app = (fs.readFileSync(JS, 'utf8').match(/APP_VER = '[^']*?(v\d+)'/) || [])[1];
  const sw = (fs.readFileSync(SW, 'utf8').match(/CACHE = 'km-(v\d+)'/) || [])[1];
  expect({ version_json: v, app_js: app, sw_js: sw }).toEqual({ version_json: v, app_js: v, sw_js: v });
});

// ── 17. ΤΟ ΡΟΛΟΪ ΔΕΝ ΠΕΡΝΑΕΙ ΑΠΟ ΤΟΝ WORKER ────────────────────────────
test('17 · το version.json λέει πάντα την αλήθεια του server, ακόμα κι όταν η μνήμη είναι παλιά', async ({ context }) => {
  const orig = fs.readFileSync(V, 'utf8');
  const p = await context.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });

  // ο server ανεβαίνει σε νέα έκδοση
  fs.writeFileSync(V, JSON.stringify({ v: 'v999' }));
  try {
    await expect.poll(async () => {
      try { return await p.evaluate(() => fetch('/kostometro/version.json?nc=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((j) => j.v)); }
      catch (e) { return 'ΜΕΤΡΑΕΙ…'; }
    }, { timeout: 25000 }).toBe('v999');
  } finally { fs.writeFileSync(V, orig); }
  await p.close();
});

// ── 18. ΠΑΛΙΑ ΜΝΗΜΗ + ΝΕΟΣ SERVER -> Η ΕΦΑΡΜΟΓΗ ΔΙΟΡΘΩΝΕΤΑΙ ΜΟΝΗ ΤΗΣ ────
test('18 · με παγωμένη μνήμη και νεότερο server, η εφαρμογή ζητάει ενημέρωση μόνη της', async ({ context }) => {
  const orig = fs.readFileSync(V, 'utf8');
  const p = await context.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
  fs.writeFileSync(V, JSON.stringify({ v: 'v999' }));
  try {
    // μία φόρτωση: η εφαρμογή πρέπει να ΚΑΤΑΛΑΒΕΙ ότι είναι παλιά
    const reloads = [];
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) reloads.push(1); });
    await p.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect.poll(async () => {
      try { return await p.evaluate(() => sessionStorage.getItem('km_upd')); }
      catch (e) { return null; }
    }, { timeout: 25000 }).not.toBeNull();
    // και ΔΕΝ μπαίνει σε ατέρμονο βρόχο
    await p.waitForTimeout(4000);
    const tries = await p.evaluate(() => Number(sessionStorage.getItem('km_upd') || 0)).catch(() => 0);
    expect(tries).toBeLessThanOrEqual(2);
  } finally { fs.writeFileSync(V, orig); }
  await p.close();
});

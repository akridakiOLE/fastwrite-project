const { test, expect } = require('@playwright/test');
const fs = require('fs');
const APP = 'http://127.0.0.1:8788/kostometro/';
const SW = 'site/kostometro/sw.js';
const JS = 'site/kostometro/app.js';

let swOrig, jsOrig;
test.beforeAll(() => { swOrig = fs.readFileSync(SW, 'utf8'); jsOrig = fs.readFileSync(JS, 'utf8'); });
test.afterEach(() => { fs.writeFileSync(SW, swOrig); fs.writeFileSync(JS, jsOrig); });

// «ανεβάζει νέα έκδοση στον server», όπως ακριβώς κάνει το CI
async function deploy(tag) {
  fs.writeFileSync(SW, swOrig.replace(/var CACHE = '[^']+';/, "var CACHE = 'km-" + tag + "';"));
  fs.writeFileSync(JS, jsOrig.replace(/var APP_VER = '[^']+';/, "var APP_VER = 'φέτα 3 · " + tag + "';"));
  // ο τοπικός server ξαναχτίζει τα assets — περιμένουμε να ξανασηκωθεί
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:8788/kostometro/app.js');
      if ((await r.text()).indexOf(tag) >= 0) return;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('ο τοπικός server δεν σέρβιρε ποτέ το ' + tag);
}
// τι έκδοση σερβίρει ΣΤΗ ΣΥΣΚΕΥΗ ο service worker αυτή τη στιγμή
// Η αυτόματη ανανέωση μπορεί να καταστρέψει το context στη μέση της μέτρησης.
// Αυτό ΔΕΝ είναι αποτυχία — ξαναμετράμε.
async function servedVersion(p) {
  try {
    return await p.evaluate(async () => {
      const t = await fetch('/kostometro/app.js').then((r) => r.text());
      return (t.match(/APP_VER = '([^']+)'/) || [])[1] || null;
    });
  } catch (e) { return 'ΜΕΤΡΑΕΙ…'; }
}
/* ΕΝΑ άνοιγμα, όπως το κάνει ο χρήστης. Η ίδια η εφαρμογή μπορεί να
   ξαναφορτώσει μόνη της (controllerchange) και να ακυρώσει την πλοήγηση —
   αυτό ΔΕΝ είναι σφάλμα, είναι ο μηχανισμός που δοκιμάζουμε. */
async function open1(p) {
  await p.goto(APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await ready(p).catch(() => {});
}
async function ready(p) {
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
}

test('9 · ΕΝΑ άνοιγμα μετά από deploy αρκεί (πριν χρειάζονταν 4+)', async ({ context }) => {
  const p = await context.newPage();

  // ── η συσκευή τρέχει την παλιά έκδοση, εγκατεστημένη ──
  await deploy('vOLD');
  await open1(p);
  await expect.poll(() => servedVersion(p), { timeout: 25000 }).toBe('φέτα 3 · vOLD');

  // ── ο Claude κάνει deploy ──
  await deploy('vNEW');

  // ── ο Stavros ανοίγει την εφαρμογή ΜΙΑ φορά ──
  await open1(p);
  await expect.poll(() => servedVersion(p), { timeout: 25000 }).toBe('φέτα 3 · vNEW');
  await p.close();
});

test('10 · PWA που ΞΥΠΝΑΕΙ από το παρασκήνιο (χωρίς πλοήγηση) ενημερώνεται', async ({ context }) => {
  const p = await context.newPage();
  await deploy('vOLD');
  await open1(p);
  await expect.poll(() => servedVersion(p), { timeout: 25000 }).toBe('φέτα 3 · vOLD');

  await deploy('vNEW');

  // καμία πλοήγηση: η εφαρμογή απλώς έρχεται μπροστά ξανά
  const other = await context.newPage();
  await other.goto('about:blank');
  await p.waitForTimeout(300);
  await p.bringToFront();
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect.poll(() => servedVersion(p), { timeout: 25000 }).toBe('φέτα 3 · vNEW');
  await other.close(); await p.close();
});

test('11 · ΧΩΡΙΣ ΔΙΚΤΥΟ η εφαρμογή ανοίγει κανονικά (και το km-crypto.js υπάρχει)', async ({ context }) => {
  const p = await context.newPage();
  await open1(p);
  await p.waitForFunction(() => typeof kmNewWords === 'function', null, { timeout: 20000 });

  await context.setOffline(true);
  await p.goto(APP).catch(() => {});
  // θετικό δείγμα ελέγχου: όντως είμαστε offline;
  expect(await p.evaluate(() => fetch('/api/km/lookup?email=a@b.gr').then(() => 'ONLINE').catch(() => 'OFFLINE'))).toBe('OFFLINE');
  // και παρόλα αυτά η εφαρμογή και το κρυπτογραφικό αρχείο φορτώθηκαν
  await p.waitForFunction(() => typeof kmNewWords === 'function', null, { timeout: 20000 });
  expect(await p.locator('#s-acc, #s-cam, #s-words, #s-email').count()).toBeGreaterThan(0);
  await context.setOffline(false);
  await p.close();
});

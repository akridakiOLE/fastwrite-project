const { test, expect, request: pwRequest } = require('@playwright/test');
const B = 'http://127.0.0.1:8788';
const crypto = require('crypto');

function hex(n) { return crypto.randomBytes(n).toString('hex'); }
// μια «συσκευή»: τα τρία headers ταυτότητας
function dev(folder, auth, device) {
  return { 'X-Km-Folder': folder, 'X-Km-Auth': auth, 'X-Km-Device': device };
}
async function newAccount(api) {
  const id = { folder: hex(32), auth: hex(32), device: 'dev' + hex(6) };
  const r = await api.post(B + '/api/km/register', {
    headers: Object.assign({ 'Content-Type': 'application/json' }, dev(id.folder, id.auth, id.device)),
    data: { email: 'ph' + Date.now() + Math.random().toString(36).slice(2) + '@example.com' }
  });
  expect(r.status()).toBe(200);
  return id;
}
const bin = (n, fill) => Buffer.alloc(n, fill);

test('19 · μία φωτογραφία ανεβαίνει, κατεβαίνει ΑΚΕΡΑΙΑ, και εμφανίζεται στη λίστα', async () => {
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  const photo = crypto.randomBytes(400 * 1024);          // ρεαλιστικό μέγεθος σελίδας

  const up = await api.put(B + '/api/km/photo?id=inv_001', { headers: dev(id.folder, id.auth, id.device), data: photo });
  expect(up.status()).toBe(200);
  expect((await up.json()).bytes).toBe(photo.length);

  const down = await api.get(B + '/api/km/photo?id=inv_001', { headers: dev(id.folder, id.auth, id.device) });
  expect(down.status()).toBe(200);
  const got = Buffer.from(await down.body());
  expect(crypto.createHash('sha256').update(got).digest('hex'))
    .toBe(crypto.createHash('sha256').update(photo).digest('hex'));   // byte-προς-byte

  const list = await (await api.get(B + '/api/km/photos', { headers: dev(id.folder, id.auth, id.device) })).json();
  expect(list.photos).toEqual([{ id: 'inv_001', bytes: photo.length }]);
  await api.dispose();
});

test('20 · η λίστα λέει τι λείπει — η συσκευή ανεβάζει ΜΟΝΟ αυτό', async () => {
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  for (const k of ['a1', 'a2', 'a3-2']) {
    expect((await api.put(B + '/api/km/photo?id=' + k, { headers: dev(id.folder, id.auth, id.device), data: bin(1024, 7) })).status()).toBe(200);
  }
  const list = await (await api.get(B + '/api/km/photos', { headers: dev(id.folder, id.auth, id.device) })).json();
  expect(list.count).toBe(3);
  expect(list.photos.map((p) => p.id).sort()).toEqual(['a1', 'a2', 'a3-2']);
  await api.dispose();
});

test('21 · ΚΑΝΕΝΑΣ δεν διαβάζει ξένες φωτογραφίες, και το λάθος auth απορρίπτεται', async () => {
  const api = await pwRequest.newContext();
  const a = await newAccount(api);
  const b = await newAccount(api);
  await api.put(B + '/api/km/photo?id=secret', { headers: dev(a.folder, a.auth, a.device), data: bin(2048, 3) });

  // ο λογαριασμός Β ζητάει το ίδιο id -> δεν υπάρχει στον ΔΙΚΟ ΤΟΥ φάκελο
  expect((await api.get(B + '/api/km/photo?id=secret', { headers: dev(b.folder, b.auth, b.device) })).status()).toBe(404);
  // λάθος auth στον φάκελο Α -> 403
  expect((await api.get(B + '/api/km/photo?id=secret', { headers: dev(a.folder, hex(32), a.device) })).status()).toBe(403);
  // θετικό δείγμα ελέγχου: με το ΣΩΣΤΟ auth υπάρχει
  expect((await api.get(B + '/api/km/photo?id=secret', { headers: dev(a.folder, a.auth, a.device) })).status()).toBe(200);
  await api.dispose();
});

test('22 · id με διαδρομή («../») ΔΕΝ γίνεται δεκτό — καμία σιωπηλή διόρθωση', async () => {
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  for (const bad of ['../../etc', 'a/b', 'με ελληνικά', '', 'x'.repeat(81)]) {
    const r = await api.put(B + '/api/km/photo?id=' + encodeURIComponent(bad), { headers: dev(id.folder, id.auth, id.device), data: bin(64, 1) });
    expect(r.status(), 'δέχτηκε το id: ' + JSON.stringify(bad)).toBe(400);
  }
  // θετικό δείγμα: ένα κανονικό id περνάει από το ΙΔΙΟ μονοπάτι
  expect((await api.put(B + '/api/km/photo?id=kalo-1', { headers: dev(id.folder, id.auth, id.device), data: bin(64, 1) })).status()).toBe(200);
  await api.dispose();
});

test('23 · Η.13: και η ΜΗ ενεργή συσκευή ανεβάζει φωτογραφίες (αμετάβλητες)· ΔΕΝ σβήνει', async () => {
  /* Ως τη v46: «μόνο η ενεργή γράφει» ίσχυε και για φωτογραφίες. Από την
     Η.13 (απόφαση Stavros 6/9, «inbox + προσθήκη») η συσκευή που βγήκε
     εκτός λειτουργίας στέλνει τις φωτογραφίες της κανονικά — μια φωτογραφία
     δεν αλλάζει ποτέ περιεχόμενο, άρα δεν υπάρχει σύγκρουση. Το τεστ
     ενημερώθηκε ΡΗΤΑ (Α400 §Γ: παρωχημένο, όχι αποτυχία). Η διαγραφή
     μένει μόνο για την ενεργή — αυτό φυλάει τώρα. */
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  await api.put(B + '/api/km/photo?id=p1', { headers: dev(id.folder, id.auth, id.device), data: bin(512, 9) });

  // δεύτερη συσκευή, ΙΔΙΕΣ 12 λέξεις, χωρίς να γίνει ενεργή
  const reader = dev(id.folder, id.auth, 'dev' + hex(6));
  expect((await api.get(B + '/api/km/photo?id=p1', { headers: reader })).status()).toBe(200);     // διαβάζει
  expect((await api.put(B + '/api/km/photo?id=p2', { headers: reader, data: bin(512, 9) })).status()).toBe(200); // ΚΑΙ ανεβάζει
  const d = await api.delete(B + '/api/km/photo?id=p1', { headers: reader });
  expect(d.status()).toBe(409);                                                                   // ΔΕΝ σβήνει
  expect((await d.json()).error).toBe('not_active_device');
  expect((await api.get(B + '/api/km/photo?id=p1', { headers: dev(id.folder, id.auth, id.device) })).status()).toBe(200); // η p1 ζει

  // μόλις γίνει ενεργή, σβήνει
  expect((await api.post(B + '/api/km/activate', { headers: reader })).status()).toBe(200);
  expect((await api.delete(B + '/api/km/photo?id=p1', { headers: reader })).status()).toBe(200);
  await api.dispose();
});

test('24 · φωτογραφία πάνω από το όριο απορρίπτεται με 413, όχι σιωπηλά', async () => {
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  const big = bin(13 * 1024 * 1024, 5);
  const r = await api.put(B + '/api/km/photo?id=huge', { headers: dev(id.folder, id.auth, id.device), data: big });
  expect(r.status()).toBe(413);
  expect((await api.get(B + '/api/km/photo?id=huge', { headers: dev(id.folder, id.auth, id.device) })).status()).toBe(404);
  await api.dispose();
});

test('25 · το folder.bin ΔΕΝ κρατάει πια φωτογραφίες: μένει μικρό, και οι δύο ζουν χωριστά', async () => {
  const api = await pwRequest.newContext();
  const id = await newAccount(api);
  const meta = Buffer.from(JSON.stringify({ shots: Array.from({ length: 200 }, (_, i) => ({ id: 'i' + i, total: 10 + i })) }));
  expect((await api.put(B + '/api/km/folder', { headers: dev(id.folder, id.auth, id.device), data: meta })).status()).toBe(200);
  await api.put(B + '/api/km/photo?id=i0', { headers: dev(id.folder, id.auth, id.device), data: bin(500 * 1024, 2) });

  const st = await (await api.get(B + '/api/km/status', { headers: dev(id.folder, id.auth, id.device) })).json();
  expect(st.state.folder_bytes).toBe(meta.length);          // τα στοιχεία 200 τιμολογίων...
  expect(st.state.folder_bytes).toBeLessThan(100 * 1024);   // ...χωράνε σε λιγότερο από 100 KB
  const list = await (await api.get(B + '/api/km/photos', { headers: dev(id.folder, id.auth, id.device) })).json();
  expect(list.count).toBe(1);
  await api.dispose();
});

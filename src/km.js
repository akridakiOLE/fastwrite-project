// Kostometro — μητρώο + σφραγισμένος φάκελος (Brief Α, Α350 §9.8 Η.1)
// ---------------------------------------------------------------------------
// Routes (όλα κάτω από /api/km/ — run_worker_first = ["/api/*"]):
//
//   GET  /api/km/lookup?email=      -> { exists: true|false }   (Γ.5: μόνο ναι/όχι)
//   POST /api/km/register           -> νέος λογαριασμός Ή είσοδος σε υπάρχοντα
//   GET  /api/km/status             -> έκδοση, μέγεθος, ενεργή συσκευή, συσκευές
//   GET  /api/km/folder             -> το κρυπτογραφημένο μπλοκ (όποια συσκευή έχει auth)
//   PUT  /api/km/folder             -> ανέβασμα μπλοκ (ΜΟΝΟ η ενεργή συσκευή)
//   POST /api/km/activate           -> «κάνε αυτή τη συσκευή ενεργή» (Η.3)
//
//   GET    /api/km/photos           -> ποιες φωτογραφίες υπάρχουν ήδη (ids + bytes)
//   GET    /api/km/photo?id=        -> μία κρυπτογραφημένη φωτογραφία
//   PUT    /api/km/photo?id=        -> ανέβασμα μιας φωτογραφίας (ΜΟΝΟ η ενεργή)
//   DELETE /api/km/photo?id=        -> σβήσιμο μιας φωτογραφίας (ΜΟΝΟ η ενεργή)
//
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΕΣ ΦΩΤΟΓΡΑΦΙΕΣ (απόφαση Stavros 3/9/2026, Δρόμος Β):
// Το αρχικό σχέδιο του Brief Α έβαζε ΤΑ ΠΑΝΤΑ σε ένα μπλοκ. Μετρήθηκε: η
// κάμερα δίνει 1920×1440 JPEG q0.85 ≈ 300-600 KB ανά σελίδα, άρα κάθε
// αποθήκευση θα ξανανέβαζε ολόκληρο το αρχείο — 20 MB στα 50 τιμολόγια, πάνω
// σε δεδομένα κινητής, την ώρα της παραλαβής — και στα ~100-150 τιμολόγια θα
// χτυπούσε το όριο των 50 MB και θα σταματούσε να δουλεύει. Τώρα: το
// folder.bin κρατάει ΜΟΝΟ τα στοιχεία (κιλομπάιτ, ανεβαίνει σε κάθε
// αποθήκευση) και κάθε φωτογραφία ανεβαίνει ΜΙΑ φορά, ποτέ ξανά.
//
// Ταυτότητα: η συσκευή στέλνει
//   X-Km-Folder:  folder_id  (64 hex, από τις 12 λέξεις)
//   X-Km-Auth:    auth_token (64 hex, από τις 12 λέξεις — ΔΙΑΦΟΡΕΤΙΚΟ από το κλειδί)
//   X-Km-Device:  install_id
// Ο server κρατάει ΜΟΝΟ sha256(auth_token). Ποτέ το κλειδί κρυπτογράφησης.
// Το email μόνο του δεν ανοίγει τίποτα (Γ.5).
//
// Ο φάκελος ζει στο R2 (binding FOLDERS): <folder_id>/folder.bin τα στοιχεία και
// <folder_id>/p/<id>.bin μία ανά φωτογραφία. Όλα κρυπτογραφημένα στη συσκευή.
// Ο server δεν ανοίγει τίποτα, δεν διαβάζει τίποτα.
//
// GDPR: δεν αποθηκεύεται IP. Χώρα από Cloudflare, user-agent.
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_FOLDER_BYTES = 50 * 1024 * 1024; // 50 MB ανά ανέβασμα (Workers: όριο 100 MB)
// Μία φωτογραφία 1920×1440 σε JPEG q0.85 είναι 300-600 KB. Τα 12 MB αφήνουν
// τεράστιο περιθώριο και ταυτόχρονα σταματούν το προφανές λάθος (ανέβασμα
// βίντεο ή μη συμπιεσμένης εικόνας) πριν γεμίσει ο κάδος.
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
// id φωτογραφίας = το id του τιμολογίου στη συσκευή, ή <id>-<n> για σελίδες.
// Αυστηρό μοτίβο: μπαίνει σε διαδρομή R2, δεν δέχεται «/» ούτε «..».
const PHOTO_ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function handleKm(request, env, ctx, path) {
  const method = request.method;

  if (path === "/api/km/lookup" && method === "GET") return lookup(request, env);
  if (path === "/api/km/register" && method === "POST") return register(request, env);
  if (path === "/api/km/status" && method === "GET") return status(request, env);
  if (path === "/api/km/folder" && method === "GET") return getFolder(request, env);
  if (path === "/api/km/folder" && method === "PUT") return putFolder(request, env);
  if (path === "/api/km/activate" && method === "POST") return activate(request, env);

  if (path === "/api/km/photos" && method === "GET") return listPhotos(request, env);
  if (path === "/api/km/photo") {
    if (method === "GET")    return getPhoto(request, env);
    if (method === "PUT")    return putPhoto(request, env);
    if (method === "DELETE") return delPhoto(request, env);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

// ── helpers ────────────────────────────────────────────────────────────────

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extra || {}),
  });
}

async function safeJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

function clean(v, max) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, max || 200);
}

function now() { return new Date().toISOString(); }

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normEmail(e) {
  const s = clean(e, 200);
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

// Διαβάζει τα τρία headers ταυτότητας. Επιστρέφει {folder, auth, device} ή null.
function ident(request) {
  const folder = (request.headers.get("X-Km-Folder") || "").toLowerCase();
  const auth = (request.headers.get("X-Km-Auth") || "").toLowerCase();
  const device = clean(request.headers.get("X-Km-Device"), 64);
  if (!HEX64.test(folder) || !HEX64.test(auth) || !device) return null;
  return { folder, auth, device };
}

// Φορτώνει τον λογαριασμό και ελέγχει το αποτύπωμα. Επιστρέφει {acc, id} ή Response σφάλματος.
async function authed(request, env) {
  const id = ident(request);
  if (!id) return { err: json({ ok: false, error: "bad_identity" }, 400) };
  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  if (!acc) return { err: json({ ok: false, error: "no_account" }, 404) };
  if (acc.deleted) return { err: json({ ok: false, error: "deleted" }, 410) };
  const h = await sha256hex(id.auth);
  if (h !== acc.auth_hash) return { err: json({ ok: false, error: "forbidden" }, 403) };
  return { acc, id };
}

// ⚠ Το folder_id ΞΑΝΑΓΡΑΦΕΤΑΙ στο ON CONFLICT: η ίδια εγκατάσταση μπορεί να
// αλλάξει λογαριασμό («ξεκινάω καθαρά», Γ.6). Χωρίς αυτό η συσκευή έμενε
// δεμένη στον παλιό φάκελο και δεν εμφανιζόταν στη λίστα του νέου.
// Βρέθηκε 2/9/2026 από τη σελίδα δοκιμής km-test (έλεγχος 14).
async function touchDevice(env, request, id, name) {
  const ua = clean(request.headers.get("user-agent"), 300);
  await env.DB.prepare(
    `INSERT INTO km_devices (install_id, folder_id, name, created, last_seen, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(install_id) DO UPDATE SET folder_id = excluded.folder_id,
       last_seen = excluded.last_seen,
       name = COALESCE(excluded.name, km_devices.name), user_agent = excluded.user_agent`
  ).bind(id.device, id.folder, clean(name, 80), now(), now(), ua).run();
}

function pub(acc) {
  return {
    folder_version: acc.folder_version,
    folder_bytes: acc.folder_bytes,
    last_sync: acc.last_sync,
    active_device_id: acc.active_device_id,
    active_since: acc.active_since,
    created: acc.created,
    plan: acc.plan || null,
  };
}

// ── routes ─────────────────────────────────────────────────────────────────

// Γ.5: «Βρήκαμε λογαριασμό με αυτό το email;» — ΜΟΝΟ ναι/όχι. Τίποτα άλλο.
async function lookup(request, env) {
  const email = normEmail(new URL(request.url).searchParams.get("email"));
  if (!email) return json({ ok: false, error: "bad_email" }, 400);
  const row = await env.DB.prepare("SELECT 1 AS x FROM km_accounts WHERE email = ? AND deleted IS NULL LIMIT 1").bind(email).first();
  return json({ ok: true, exists: !!row });
}

// Εγγραφή ΚΑΙ είσοδος: το ίδιο route.
//  - folder_id άγνωστο  -> νέος λογαριασμός, αυτή η συσκευή ενεργή.
//  - folder_id γνωστό + σωστό auth -> προστίθεται η συσκευή και ΓΙΝΕΤΑΙ ενεργή
//    (Η.3: όποια βάλει τις 12 λέξεις γίνεται η ενεργή).
//  - folder_id γνωστό + λάθος auth -> 403. Δεν αποκαλύπτεται τίποτα άλλο.
async function register(request, env) {
  const id = ident(request);
  if (!id) return json({ ok: false, error: "bad_identity" }, 400);
  const b = (await safeJson(request)) || {};
  const email = normEmail(b.email);
  if (!email) return json({ ok: false, error: "bad_email" }, 400);

  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  const h = await sha256hex(id.auth);
  const ts = now();

  if (!acc) {
    await env.DB.prepare(
      `INSERT INTO km_accounts (folder_id, auth_hash, email, created, country, source, ref, has_key,
                                active_device_id, active_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id.folder, h, email, ts,
      (request.cf && request.cf.country) || null,
      clean(b.source, 20) || "link",
      clean(b.ref, 40),
      b.has_key ? 1 : 0,
      id.device, ts
    ).run();
    await touchDevice(env, request, id, b.device_name);
    const fresh = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
    return json({ ok: true, account: "new", state: pub(fresh) });
  }

  if (acc.deleted) return json({ ok: false, error: "deleted" }, 410);
  if (h !== acc.auth_hash) return json({ ok: false, error: "forbidden" }, 403);

  // Υπάρχων λογαριασμός: αυτή η συσκευή γίνεται ενεργή. Το email ΔΕΝ αλλάζει από εδώ.
  await env.DB.prepare(
    "UPDATE km_accounts SET active_device_id = ?, active_since = ?, has_key = MAX(has_key, ?) WHERE folder_id = ?"
  ).bind(id.device, ts, b.has_key ? 1 : 0, id.folder).run();
  await touchDevice(env, request, id, b.device_name);
  const fresh = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  return json({ ok: true, account: "existing", state: pub(fresh) });
}

async function status(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  await touchDevice(env, request, a.id, null);
  const devs = await env.DB.prepare(
    "SELECT install_id, name, created, last_seen FROM km_devices WHERE folder_id = ? ORDER BY created"
  ).bind(a.id.folder).all();
  return json({ ok: true, state: pub(a.acc), this_device_active: a.acc.active_device_id === a.id.device, devices: devs.results || [] });
}

// Κατέβασμα: όποια συσκευή έχει σωστό auth (ενεργή ή αναγνώστρια).
async function getFolder(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const obj = await env.FOLDERS.get(a.id.folder + "/folder.bin");
  if (!obj) return json({ ok: false, error: "empty", state: pub(a.acc) }, 404);
  const h = new Headers();
  h.set("Content-Type", "application/octet-stream");
  h.set("Cache-Control", "no-store");
  h.set("X-Km-Version", String(a.acc.folder_version));
  h.set("X-Km-Active-Device", a.acc.active_device_id || "");
  h.set("X-Km-Active-Since", a.acc.active_since || "");
  h.set("X-Km-This-Device-Active", a.acc.active_device_id === a.id.device ? "1" : "0");
  return new Response(obj.body, { status: 200, headers: h });
}

// Ανέβασμα: ΜΟΝΟ η ενεργή συσκευή. Έλεγχος έκδοσης (If-Match) ώστε δύο ανεβάσματα
// να μην πατήσουν το ένα το άλλο. Το σώμα είναι το κρυπτογραφημένο μπλοκ — ο
// server το αποθηκεύει αυτούσιο.
async function putFolder(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const base = request.headers.get("X-Km-Base-Version");
  if (base !== null && base !== "" && Number(base) !== a.acc.folder_version) {
    return json({ ok: false, error: "version_mismatch", state: pub(a.acc) }, 409);
  }
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_FOLDER_BYTES) return json({ ok: false, error: "too_large", max: MAX_FOLDER_BYTES }, 413);

  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return json({ ok: false, error: "empty_body" }, 400);
  if (body.byteLength > MAX_FOLDER_BYTES) return json({ ok: false, error: "too_large", max: MAX_FOLDER_BYTES }, 413);

  await env.FOLDERS.put(a.id.folder + "/folder.bin", body, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  const ts = now();
  const v = (a.acc.folder_version || 0) + 1;
  await env.DB.prepare(
    "UPDATE km_accounts SET folder_version = ?, folder_bytes = ?, last_sync = ? WHERE folder_id = ?"
  ).bind(v, body.byteLength, ts, a.id.folder).run();
  await touchDevice(env, request, a.id, null);
  return json({ ok: true, folder_version: v, folder_bytes: body.byteLength, last_sync: ts });
}

// Η.3: «Κάνε αυτή τη συσκευή ενεργή». Η απόδειξη είναι το auth (= οι 12 λέξεις).
async function activate(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const ts = now();
  const prev = a.acc.active_device_id;
  await env.DB.prepare(
    "UPDATE km_accounts SET active_device_id = ?, active_since = ? WHERE folder_id = ?"
  ).bind(a.id.device, ts, a.id.folder).run();
  await touchDevice(env, request, a.id, null);
  return json({ ok: true, active_device_id: a.id.device, active_since: ts, previous_device_id: prev });
}

// ── φωτογραφίες (Δρόμος Β, απόφαση Stavros 3/9/2026) ───────────────────────

// Το id έρχεται από τη συσκευή και μπαίνει σε διαδρομή αποθήκευσης. Ό,τι δεν
// ταιριάζει ΑΚΡΙΒΩΣ στο μοτίβο απορρίπτεται — καμία «καθαριστική» μετατροπή,
// γιατί ένα id που άλλαξε σιωπηλά είναι φωτογραφία που δεν ξαναβρίσκεται ποτέ.
function photoKey(folder, id) {
  if (!PHOTO_ID.test(id || "")) return null;
  return folder + "/p/" + id + ".bin";
}

// Ποιες υπάρχουν ήδη — ώστε η συσκευή να ανεβάζει ΜΟΝΟ ό,τι λείπει.
async function listPhotos(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const prefix = a.id.folder + "/p/";
  const out = [];
  let cursor;
  do {
    const page = await env.FOLDERS.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) {
      out.push({ id: o.key.slice(prefix.length).replace(/\.bin$/, ""), bytes: o.size });
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  return json({ ok: true, photos: out, count: out.length });
}

async function getPhoto(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const id = new URL(request.url).searchParams.get("id");
  const key = photoKey(a.id.folder, id);
  if (!key) return json({ ok: false, error: "bad_id" }, 400);
  const obj = await env.FOLDERS.get(key);
  if (!obj) return json({ ok: false, error: "no_photo" }, 404);
  const h = new Headers();
  h.set("Content-Type", "application/octet-stream");
  h.set("Cache-Control", "no-store");
  return new Response(obj.body, { status: 200, headers: h });
}

// Ανέβασμα: ΜΟΝΟ η ενεργή συσκευή, όπως και το folder.bin.
// ⚠ Δεν υπάρχει If-Match εδώ, επίτηδες: μια φωτογραφία δεν αλλάζει ποτέ
// περιεχόμενο, άρα δεύτερο ανέβασμα του ίδιου id είναι επανάληψη μετά από
// χαμένο δίκτυο — όχι σύγκρουση δύο συσκευών.
async function putPhoto(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const id = new URL(request.url).searchParams.get("id");
  const key = photoKey(a.id.folder, id);
  if (!key) return json({ ok: false, error: "bad_id" }, 400);

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_PHOTO_BYTES) return json({ ok: false, error: "too_large", max: MAX_PHOTO_BYTES }, 413);
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return json({ ok: false, error: "empty_body" }, 400);
  if (body.byteLength > MAX_PHOTO_BYTES) return json({ ok: false, error: "too_large", max: MAX_PHOTO_BYTES }, 413);

  await env.FOLDERS.put(key, body, { httpMetadata: { contentType: "application/octet-stream" } });
  await env.DB.prepare("UPDATE km_accounts SET last_sync = ? WHERE folder_id = ?").bind(now(), a.id.folder).run();
  await touchDevice(env, request, a.id, null);
  return json({ ok: true, id: id, bytes: body.byteLength });
}

async function delPhoto(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const id = new URL(request.url).searchParams.get("id");
  const key = photoKey(a.id.folder, id);
  if (!key) return json({ ok: false, error: "bad_id" }, 400);
  await env.FOLDERS.delete(key);
  return json({ ok: true, id: id });
}

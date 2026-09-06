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
//   PUT    /api/km/photo?id=        -> ανέβασμα μιας φωτογραφίας (όποια έχει auth — Η.13)
//   DELETE /api/km/photo?id=        -> σβήσιμο μιας φωτογραφίας (ΜΟΝΟ η ενεργή)
//
//   POST   /api/km/unlock           -> Η.13: από την κλειδαριά στον φάκελο (βλ. κάτω)
//   POST   /api/km/lock             -> Η.13: νέα κλειδαριά / αλλαγή λέξεων
//   GET/PUT/DELETE /api/km/inbox    -> Η.13: τα ανέβαστα της συσκευής που βγήκε εκτός
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
// install_id της συσκευής: 'km_' + base36. Μπαίνει σε διαδρομή R2 (inbox) —
// ίδιος αυστηρός κανόνας με το id φωτογραφίας.
const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
// wrapped_k: IV(12) + AES-GCM(32 + 16) = 60 bytes = 120 hex.
const HEX120 = /^[0-9a-f]{120}$/;
const LOCK_KINDS = ["words", "recovery", "invite"];

// ── Η.13 · Η ΝΕΑ ΒΑΣΗ Κ (Brief Γ, Α350 §9.8 Η.13, 6/9/2026) ────────────────
// Ως τη v46 οι 12 λέξεις έδιναν folder_id + auth + ΚΑΙ το κλειδί δεδομένων.
// Από εδώ το κλειδί δεδομένων Κ είναι τυχαίο και ζει στον server ΚΛΕΙΔΩΜΕΝΟ
// σε «κλειδαριές» (km_locks). Οι λέξεις ανοίγουν μια κλειδαριά, όχι τα δεδομένα.
// Νέα routes:
//   POST /api/km/unlock   -> από lock_id + auth: folder_id, wrapped_k, και η
//                            κατάσταση της ενεργής συσκευής (Ν ανέβαστα, πότε
//                            φάνηκε) — ΠΡΙΝ αποφασίσει η νέα συσκευή αν θα
//                            γίνει ενεργή. ΔΕΝ ενεργοποιεί, ΔΕΝ καταγράφει.
//   POST /api/km/lock     -> νέα κλειδαριά (πρώτη φορά = μετανάστευση, ή
//                            αλλαγή λέξεων: replace = η παλιά). ΜΟΝΟ η ενεργή.
//   PUT  /api/km/inbox    -> τα ανέβαστα μιας συσκευής που ΕΠΑΨΕ να είναι
//                            ενεργή: <folder>/inbox/<install_id>.bin. Η ενεργή
//                            τα παίρνει (GET) και τα σβήνει (DELETE) αφού τα
//                            προσθέσει — μόνο προσθήκη, ποτέ πάτημα (v33).
// Ταυτότητα από v47: X-Km-Lock (ποια κλειδαριά) + X-Km-Auth (ο κωδικός της)
// + X-Km-Folder + X-Km-Device, και X-Km-Unsynced (πόσα δεν ανέβηκαν ακόμα).
// Χωρίς X-Km-Lock ισχύει η παλιά ταυτότητα (km_accounts.auth_hash) — τη
// χρειάζεται η v46 ως τη v47 και η ίδια η μετανάστευση.

export async function handleKm(request, env, ctx, path) {
  const method = request.method;

  if (path === "/api/km/lookup" && method === "GET") return lookup(request, env);
  if (path === "/api/km/register" && method === "POST") return register(request, env);
  if (path === "/api/km/status" && method === "GET") return status(request, env);
  if (path === "/api/km/folder" && method === "GET") return getFolder(request, env);
  if (path === "/api/km/folder" && method === "PUT") return putFolder(request, env);
  if (path === "/api/km/activate" && method === "POST") return activate(request, env);

  if (path === "/api/km/unlock" && method === "POST") return unlock(request, env);
  if (path === "/api/km/lock" && method === "POST") return addLock(request, env);
  if (path === "/api/km/inbox") {
    if (method === "GET")    return getInbox(request, env);
    if (method === "PUT")    return putInbox(request, env);
    if (method === "DELETE") return delInbox(request, env);
  }

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

// Διαβάζει τα headers ταυτότητας. Επιστρέφει {folder, auth, device, lock, unsynced} ή null.
// lock: null = παλιά ταυτότητα (v46) · 64 hex = κλειδαριά (v47+).
// unsynced: null = η συσκευή δεν το είπε · αριθμός = «τόσα δεν ανέβηκαν ακόμα».
function ident(request) {
  const folder = (request.headers.get("X-Km-Folder") || "").toLowerCase();
  const auth = (request.headers.get("X-Km-Auth") || "").toLowerCase();
  const device = clean(request.headers.get("X-Km-Device"), 64);
  const lockRaw = (request.headers.get("X-Km-Lock") || "").toLowerCase();
  if (!HEX64.test(folder) || !HEX64.test(auth) || !device) return null;
  if (lockRaw && !HEX64.test(lockRaw)) return null;
  return { folder, auth, device, lock: lockRaw || null, unsynced: unsyncedOf(request) };
}

function unsyncedOf(request) {
  const raw = request.headers.get("X-Km-Unsynced");
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 1000000) : null;
}

// Φορτώνει τον λογαριασμό και ελέγχει το αποτύπωμα. Επιστρέφει {acc, id, lock} ή Response σφάλματος.
// Με X-Km-Lock: ο κωδικός ανήκει στην κλειδαριά (km_locks). Χωρίς: στον λογαριασμό (v46).
async function authed(request, env) {
  const id = ident(request);
  if (!id) return { err: json({ ok: false, error: "bad_identity" }, 400) };
  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  if (!acc) return { err: json({ ok: false, error: "no_account" }, 404) };
  if (acc.deleted) return { err: json({ ok: false, error: "deleted" }, 410) };
  const h = await sha256hex(id.auth);
  let lock = null;
  if (id.lock) {
    lock = await env.DB.prepare("SELECT * FROM km_locks WHERE lock_id = ? AND folder_id = ?").bind(id.lock, id.folder).first();
    if (!lock || h !== lock.auth_hash) return { err: json({ ok: false, error: "forbidden" }, 403) };
  } else if (h !== acc.auth_hash) {
    return { err: json({ ok: false, error: "forbidden" }, 403) };
  }
  return { acc, id, lock };
}

// ⚠ Το folder_id ΞΑΝΑΓΡΑΦΕΤΑΙ στο ON CONFLICT: η ίδια εγκατάσταση μπορεί να
// αλλάξει λογαριασμό («ξεκινάω καθαρά», Γ.6). Χωρίς αυτό η συσκευή έμενε
// δεμένη στον παλιό φάκελο και δεν εμφανιζόταν στη λίστα του νέου.
// Βρέθηκε 2/9/2026 από τη σελίδα δοκιμής km-test (έλεγχος 14).
// Η.13: το ίδιο ξαναγράψιμο ΕΣΒΗΝΕ το ιστορικό «μία συσκευή, πολλοί
// λογαριασμοί» (εύρημα 5/9). Γι' αυτό γράφεται ΚΑΙ στο km_device_links με
// κλειδί (install_id, folder_id) — εκεί τίποτα δεν πατιέται. Και τα δύο
// κρατούν τα «Ν ανέβαστα» της συσκευής, όταν η συσκευή τα λέει.
async function touchDevice(env, request, id, name) {
  const ua = clean(request.headers.get("user-agent"), 300);
  const ts = now();
  const nm = clean(name, 80);
  const hasU = id.unsynced !== null && id.unsynced !== undefined;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO km_devices (install_id, folder_id, name, created, last_seen, user_agent, unsynced, unsynced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(install_id) DO UPDATE SET folder_id = excluded.folder_id,
         last_seen = excluded.last_seen,
         name = COALESCE(excluded.name, km_devices.name), user_agent = excluded.user_agent,
         unsynced = CASE WHEN excluded.unsynced_at IS NULL THEN km_devices.unsynced ELSE excluded.unsynced END,
         unsynced_at = COALESCE(excluded.unsynced_at, km_devices.unsynced_at)`
    ).bind(id.device, id.folder, nm, ts, ts, ua, hasU ? id.unsynced : 0, hasU ? ts : null),
    env.DB.prepare(
      `INSERT INTO km_device_links (install_id, folder_id, name, created, last_seen, user_agent, unsynced, unsynced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(install_id, folder_id) DO UPDATE SET
         last_seen = excluded.last_seen,
         name = COALESCE(excluded.name, km_device_links.name), user_agent = excluded.user_agent,
         unsynced = CASE WHEN excluded.unsynced_at IS NULL THEN km_device_links.unsynced ELSE excluded.unsynced END,
         unsynced_at = COALESCE(excluded.unsynced_at, km_device_links.unsynced_at)`
    ).bind(id.device, id.folder, nm, ts, ts, ua, hasU ? id.unsynced : 0, hasU ? ts : null),
  ]);
}

// Η κατάσταση της ενεργής συσκευής, όπως τη βλέπει ο server — αυτό ρωτάει η
// νέα συσκευή ΠΡΙΝ γίνει ενεργή (Free = πορτοφόλι). Ποτέ δεν ρωτάμε το παλιό
// κινητό: μπορεί να είναι σπασμένο ή κλεμμένο.
async function activeInfo(env, acc) {
  if (!acc.active_device_id) return null;
  const d = await env.DB.prepare(
    "SELECT install_id, name, last_seen, unsynced, unsynced_at FROM km_device_links WHERE install_id = ? AND folder_id = ?"
  ).bind(acc.active_device_id, acc.folder_id).first();
  return {
    device_id: acc.active_device_id,
    since: acc.active_since,
    name: d ? d.name : null,
    last_seen: d ? d.last_seen : null,
    unsynced: d ? (d.unsynced || 0) : 0,
    unsynced_at: d ? d.unsynced_at : null,
  };
}

async function lockSummary(env, folder) {
  const r = await env.DB.prepare(
    "SELECT lock_id, kind, created, label FROM km_locks WHERE folder_id = ? ORDER BY created"
  ).bind(folder).all();
  return (r.results || []).map((l) => ({ lock_id: l.lock_id, kind: l.kind, created: l.created, label: l.label || null }));
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
// Η.13: με X-Km-Lock το route φτιάχνει ΚΑΙ την πρώτη κλειδαριά. Το σώμα φέρνει
// wrapped_k (το Κ κλειδωμένο με τις λέξεις, 120 hex). Το folder_id είναι
// τυχαίο από τη συσκευή, το X-Km-Auth είναι ο κωδικός της κλειδαριάς.
// Για υπάρχοντα λογαριασμό με X-Km-Lock: η κλειδαριά πρέπει να ταιριάζει.
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
    const wrapped = (clean(b.wrapped_k, 130) || "").toLowerCase();
    if (id.lock && !HEX120.test(wrapped)) return json({ ok: false, error: "bad_wrapped_k" }, 400);
    if (id.lock) {
      const taken = await env.DB.prepare("SELECT folder_id FROM km_locks WHERE lock_id = ?").bind(id.lock).first();
      if (taken) return json({ ok: false, error: "lock_exists" }, 409);
    }
    const stmts = [
      env.DB.prepare(
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
      ),
    ];
    if (id.lock) {
      stmts.push(env.DB.prepare(
        `INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by, label)
         VALUES (?, ?, 'words', ?, ?, ?, ?, ?)`
      ).bind(id.lock, id.folder, h, wrapped, ts, id.device, clean(b.lock_label, 40)));
    }
    await env.DB.batch(stmts);
    await touchDevice(env, request, id, b.device_name);
    const fresh = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
    return json({ ok: true, account: "new", state: pub(fresh), has_lock: !!id.lock });
  }

  if (acc.deleted) return json({ ok: false, error: "deleted" }, 410);
  if (id.lock) {
    const lock = await env.DB.prepare("SELECT * FROM km_locks WHERE lock_id = ? AND folder_id = ?").bind(id.lock, id.folder).first();
    if (!lock || h !== lock.auth_hash) return json({ ok: false, error: "forbidden" }, 403);
  } else if (h !== acc.auth_hash) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // Υπάρχων λογαριασμός: αυτή η συσκευή γίνεται ενεργή. Το email ΔΕΝ αλλάζει από εδώ.
  const prev = await activeInfo(env, acc);
  await env.DB.prepare(
    "UPDATE km_accounts SET active_device_id = ?, active_since = ?, has_key = MAX(has_key, ?) WHERE folder_id = ?"
  ).bind(id.device, ts, b.has_key ? 1 : 0, id.folder).run();
  await touchDevice(env, request, id, b.device_name);
  const fresh = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  return json({ ok: true, account: "existing", state: pub(fresh), previous: prev });
}

// Η.13 · ΞΕΚΛΕΙΔΩΜΑ: από την κλειδαριά στον φάκελο. Headers: X-Km-Lock,
// X-Km-Auth, X-Km-Device. Επιστρέφει folder_id + wrapped_k (που ανοίγει ΜΟΝΟ
// στη συσκευή, με το kek από τις λέξεις) και την κατάσταση της ενεργής
// συσκευής. ΔΕΝ ενεργοποιεί και ΔΕΝ γράφει στο μητρώο — η συσκευή αποφασίζει
// μετά (Ν=0 προχωρά · Ν>0 και ζωντανή → «άνοιξέ την μία φορά» · Ν>0 και
// αγνοείται → προχωρά με προειδοποίηση).
async function unlock(request, env) {
  const lockId = (request.headers.get("X-Km-Lock") || "").toLowerCase();
  const auth = (request.headers.get("X-Km-Auth") || "").toLowerCase();
  const device = clean(request.headers.get("X-Km-Device"), 64);
  if (!HEX64.test(lockId) || !HEX64.test(auth) || !device) return json({ ok: false, error: "bad_identity" }, 400);
  const lock = await env.DB.prepare("SELECT * FROM km_locks WHERE lock_id = ?").bind(lockId).first();
  // Άγνωστη κλειδαριά και λάθος κωδικός δίνουν την ΙΔΙΑ απάντηση: δεν μαθαίνει
  // κανείς αν 12 λέξεις «υπάρχουν» δοκιμάζοντάς τες.
  if (!lock) return json({ ok: false, error: "forbidden" }, 403);
  const h = await sha256hex(auth);
  if (h !== lock.auth_hash) return json({ ok: false, error: "forbidden" }, 403);
  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(lock.folder_id).first();
  if (!acc) return json({ ok: false, error: "no_account" }, 404);
  if (acc.deleted) return json({ ok: false, error: "deleted" }, 410);
  const active = await activeInfo(env, acc);
  return json({
    ok: true,
    folder_id: acc.folder_id,
    kind: lock.kind,
    wrapped_k: lock.wrapped_k,
    state: pub(acc),
    this_device_active: acc.active_device_id === device,
    active: active,
  });
}

// Η.13 · ΝΕΑ ΚΛΕΙΔΑΡΙΑ. Σώμα: { lock_id, auth_token, wrapped_k, kind, replace?, label? }.
//  - Πρώτη κλειδαριά λογαριασμού που δεν έχει καμία = η ΜΕΤΑΝΑΣΤΕΥΣΗ (v46 → v47):
//    επιτρέπεται με την παλιά ταυτότητα (χωρίς X-Km-Lock).
//  - kind='words' με υπάρχουσα words-κλειδαριά: ΜΟΝΟ με replace = η παλιά, που
//    σβήνει στην ίδια πράξη. Έτσι ο φάκελος έχει πάντα ακριβώς μία words-κλειδαριά.
//  - ΜΟΝΟ η ενεργή συσκευή. Στο Free = πορτοφόλι δεν αλλάζει λέξεις κανείς άλλος.
// Ο server ΔΕΝ μπορεί να ελέγξει ότι το wrapped_k κλειδώνει το ίδιο Κ —
// αυτό το αποδεικνύει η συσκευή (και ο έλεγχος στο /km-crypto-test).
async function addLock(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const b = (await safeJson(request)) || {};
  const lockId = (clean(b.lock_id, 64) || "").toLowerCase();
  const auth = (clean(b.auth_token, 64) || "").toLowerCase();
  const wrapped = (clean(b.wrapped_k, 130) || "").toLowerCase();
  const kind = clean(b.kind, 16) || "words";
  const replace = b.replace ? String(b.replace).toLowerCase() : null;
  if (!HEX64.test(lockId) || !HEX64.test(auth)) return json({ ok: false, error: "bad_lock" }, 400);
  if (!HEX120.test(wrapped)) return json({ ok: false, error: "bad_wrapped_k" }, 400);
  if (LOCK_KINDS.indexOf(kind) < 0) return json({ ok: false, error: "bad_kind" }, 400);
  if (replace && !HEX64.test(replace)) return json({ ok: false, error: "bad_replace" }, 400);

  const taken = await env.DB.prepare("SELECT folder_id FROM km_locks WHERE lock_id = ?").bind(lockId).first();
  if (taken) return json({ ok: false, error: "lock_exists" }, 409);
  const existing = await env.DB.prepare("SELECT lock_id, kind FROM km_locks WHERE folder_id = ?").bind(a.id.folder).all();
  const rows = existing.results || [];
  if (replace && !rows.some((r) => r.lock_id === replace)) return json({ ok: false, error: "replace_not_found" }, 404);
  if (kind === "words" && !replace && rows.some((r) => r.kind === "words")) {
    return json({ ok: false, error: "words_lock_exists" }, 409);
  }

  const ts = now();
  const stmts = [];
  if (replace) stmts.push(env.DB.prepare("DELETE FROM km_locks WHERE lock_id = ? AND folder_id = ?").bind(replace, a.id.folder));
  stmts.push(env.DB.prepare(
    `INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(lockId, a.id.folder, kind, await sha256hex(auth), wrapped, ts, a.id.device, clean(b.label, 40)));
  await env.DB.batch(stmts);
  await touchDevice(env, request, a.id, null);
  return json({ ok: true, lock_id: lockId, kind: kind, replaced: replace, locks: await lockSummary(env, a.id.folder) });
}

async function status(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  await touchDevice(env, request, a.id, null);
  const devs = await env.DB.prepare(
    "SELECT install_id, name, created, last_seen, unsynced, unsynced_at FROM km_device_links WHERE folder_id = ? ORDER BY created"
  ).bind(a.id.folder).all();
  const locks = await lockSummary(env, a.id.folder);
  return json({
    ok: true,
    state: pub(a.acc),
    this_device_active: a.acc.active_device_id === a.id.device,
    devices: devs.results || [],
    active: await activeInfo(env, a.acc),
    // Η.13: has_lock=false σε υπάρχοντα λογαριασμό = «θέλει μετανάστευση».
    has_lock: locks.length > 0,
    locks: locks,
  });
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
// Η.13: επιστρέφει και τι ήξερε ο server για την προηγούμενη (Ν ανέβαστα,
// πότε φάνηκε) — ώστε η οθόνη να πει «η παλιά είχε 3 που δεν ανέβηκαν».
async function activate(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const ts = now();
  const prev = a.acc.active_device_id;
  const prevInfo = await activeInfo(env, a.acc);
  await env.DB.prepare(
    "UPDATE km_accounts SET active_device_id = ?, active_since = ? WHERE folder_id = ?"
  ).bind(a.id.device, ts, a.id.folder).run();
  await touchDevice(env, request, a.id, null);
  return json({ ok: true, active_device_id: a.id.device, active_since: ts, previous_device_id: prev, previous: prevInfo });
}

// ── Η.13 · INBOX — τα ανέβαστα της συσκευής που έπαψε να είναι ενεργή ───────
// Απόφαση Stavros 6/9: «inbox + προσθήκη». Η παλιά συσκευή ΔΕΝ γράφει το
// folder.bin (θα πατούσε ό,τι έγραψε η νέα)· αφήνει τα δικά της σε
// <folder>/inbox/<install_id>.bin, σφραγισμένα με το ίδιο Κ. Η ενεργή τα
// διαβάζει στο επόμενο κατέβασμα, τα ΠΡΟΣΘΕΤΕΙ (v33: ποτέ πάτημα, ποτέ
// διαγραφή) και σβήνει το αντικείμενο. Φωτογραφίες: κανονικά (αμετάβλητες).
function inboxKey(folder, device) {
  if (!DEVICE_ID.test(device || "")) return null;
  return folder + "/inbox/" + device + ".bin";
}

// PUT: όποια συσκευή έχει auth — ΚΑΙ η μη ενεργή. Αυτός είναι ο σκοπός του.
// Μετά το ανέβασμα τα «Ν ανέβαστα» της συσκευής μηδενίζουν στο μητρώο.
async function putInbox(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const key = inboxKey(a.id.folder, a.id.device);
  if (!key) return json({ ok: false, error: "bad_device_id" }, 400);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_FOLDER_BYTES) return json({ ok: false, error: "too_large", max: MAX_FOLDER_BYTES }, 413);
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return json({ ok: false, error: "empty_body" }, 400);
  if (body.byteLength > MAX_FOLDER_BYTES) return json({ ok: false, error: "too_large", max: MAX_FOLDER_BYTES }, 413);
  await env.FOLDERS.put(key, body, { httpMetadata: { contentType: "application/octet-stream" } });
  await touchDevice(env, request, Object.assign({}, a.id, { unsynced: 0 }), null);
  return json({ ok: true, device: a.id.device, bytes: body.byteLength });
}

// GET χωρίς id: λίστα. GET ?id=<install_id>: το μπλοκ. ΜΟΝΟ η ενεργή.
async function getInbox(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    const prefix = a.id.folder + "/inbox/";
    const page = await env.FOLDERS.list({ prefix, limit: 1000 });
    const items = page.objects.map((o) => ({
      device: o.key.slice(prefix.length).replace(/\.bin$/, ""),
      bytes: o.size,
      uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
    }));
    return json({ ok: true, inbox: items, count: items.length });
  }
  const key = inboxKey(a.id.folder, id);
  if (!key) return json({ ok: false, error: "bad_device_id" }, 400);
  const obj = await env.FOLDERS.get(key);
  if (!obj) return json({ ok: false, error: "no_inbox" }, 404);
  const h = new Headers();
  h.set("Content-Type", "application/octet-stream");
  h.set("Cache-Control", "no-store");
  return new Response(obj.body, { status: 200, headers: h });
}

async function delInbox(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const id = new URL(request.url).searchParams.get("id");
  const key = inboxKey(a.id.folder, id);
  if (!key) return json({ ok: false, error: "bad_device_id" }, 400);
  await env.FOLDERS.delete(key);
  return json({ ok: true, device: id });
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

// Ανέβασμα φωτογραφίας: ΟΠΟΙΑ συσκευή έχει auth — και η μη ενεργή (Η.13,
// 6/9: η συσκευή που βγήκε εκτός στέλνει τις φωτογραφίες της κανονικά, μαζί
// με το inbox). Είναι ασφαλές ακριβώς επειδή μια φωτογραφία δεν αλλάζει ποτέ
// περιεχόμενο: δεύτερο ανέβασμα του ίδιου id είναι επανάληψη, όχι σύγκρουση.
// Ως τη v46 ήταν «ΜΟΝΟ η ενεργή» — το τεστ 23 (tests/photos.spec.js) το
// δοκίμαζε και ενημερώθηκε ρητά (παρωχημένο, όχι αποτυχία). Η ΔΙΑΓΡΑΦΗ
// μένει μόνο για την ενεργή.
async function putPhoto(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
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

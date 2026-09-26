// KM-SERVER-V60-H11B  ← σημάδι έκδοσης· το ψάχνει το deploy_km_h11b.bat
// KM-SERVER-V84-VERIFY ← Brief ΣΤ (24/9/2026): ένα email = ένας λογαριασμός · κωδικός 6 ψηφίων
// Kostometro — μητρώο + σφραγισμένος φάκελος (Brief Α, Α350 §9.8 Η.1)
// ---------------------------------------------------------------------------
// Routes (όλα κάτω από /api/km/ — run_worker_first = ["/api/*"]):
//
//   GET  /api/km/lookup?email=      -> { exists: true|false }   (Γ.5: μόνο ναι/όχι)
//   POST /api/km/register           -> νέος λογαριασμός Ή είσοδος σε υπάρχοντα
//   POST /api/km/email/code         -> Brief ΣΤ: στέλνει κωδικό 6 ψηφίων (ή taken / pending_delete)
//   POST /api/km/email/verify       -> Brief ΣΤ: κωδικός → email_token (χωρίς αυτό, κανένας ΝΕΟΣ λογαριασμός)
//   GET  /api/km/ref/check?code=    -> Brief ΣΤ: υπάρχει ζωντανός λογαριασμός με αυτόν τον κωδικό;
//   GET  /api/km/manifest?ref=&src= -> Brief ΣΤ: manifest με start_url που ΚΡΑΤΑΕΙ ref/src (iPhone)
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
//   POST   /api/km/delete           -> Η.11β: ΑΙΤΗΜΑ διαγραφής, ωριμάζει σε 72 ώρες (ΜΟΝΟ η ενεργή)
//   POST   /api/km/delete/cancel    -> Η.11β: ΑΚΥΡΩΣΗ με τις 12 λέξεις (ΟΠΟΙΑΔΗΠΟΤΕ συσκευή)
//   POST   /api/km/admin/delete     -> Η.11: η ίδια πράξη από τον Stavros (αίτημα με email)
//   POST   /api/km/admin/purge      -> Η.11: καθαρισμός σκουπιδιών μητρώου (dry_run εξ ορισμού)
//   GET/POST /api/km/admin/due      -> Η.11β: ποιοι έληξαν (GET) · σβήσε τους (POST)
//   GET    /api/km/admin/pinakas    -> Brief Β: ο Πίνακας Ελέγχου (JSON για το /pinakas/)
//   POST   /api/km/admin/inspect    -> Η.11: ΤΟ ΟΡΓΑΝΟ ΜΕΤΡΗΣΗΣ — τι ζει πραγματικά (read-only)
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

// ── Η.11β · ΑΝΑΣΤΟΛΗ ΔΙΑΓΡΑΦΗΣ (15/9/2026, εντολή Stavros) ─────────────────
// 72 ώρες, σταθερά. Ο αριθμός ΓΡΑΦΕΤΑΙ στη βάση τη στιγμή του αιτήματος και
// δεν ξαναυπολογίζεται ποτέ — βλ. schema/km_h11b.sql για το γιατί.
const DELETE_GRACE_HOURS = 72;
// Πόσοι ληγμένοι σβήνονται ανά εκτέλεση του ωριαίου cron. Με 24 εκτελέσεις
// την ημέρα, 200 ανά εκτέλεση είναι 4.800/μέρα — πολύ πάνω από κάθε ρεαλιστικό
// ρυθμό, και ταυτόχρονα φράγμα αν κάτι πάει στραβά.
const DUE_BATCH = 200;

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
  if (path === "/api/km/email/code" && method === "POST") return emailCode(request, env);
  if (path === "/api/km/email/verify" && method === "POST") return emailVerify(request, env);
  if (path === "/api/km/ref/check" && method === "GET") return refCheck(request, env);
  if (path === "/api/km/manifest" && method === "GET") return manifestFor(request);
  if (path === "/api/km/status" && method === "GET") return status(request, env);
  if (path === "/api/km/folder" && method === "GET") return getFolder(request, env);
  if (path === "/api/km/folder" && method === "PUT") return putFolder(request, env);
  if (path === "/api/km/activate" && method === "POST") return activate(request, env);

  // ΣΥΣΤΑΣΕΙΣ (17/9/2026) — ο κωδικός ανήκει στον λογαριασμό. schema/km_ref.sql
  if (path === "/api/km/ref" && method === "GET") return refInfo(request, env);
  if (path === "/api/km/ref/hit" && method === "POST") return refHit(request, env);

  if (path === "/api/km/delete" && method === "POST") return requestDelete(request, env, ctx);
  if (path === "/api/km/delete/cancel" && method === "POST") return cancelDelete(request, env, ctx);
  if (path === "/api/km/admin/delete" && method === "POST") return adminDelete(request, env);
  if (path === "/api/km/admin/purge" && method === "POST") return adminPurge(request, env);
  if (path === "/api/km/admin/inspect" && method === "POST") return adminInspect(request, env);

  if (path === "/api/km/unlock" && method === "POST") return unlock(request, env);
  if (path === "/api/km/lock" && method === "POST") return addLock(request, env, ctx);
  if (path === "/api/km/inbox") {
    if (method === "GET")    return getInbox(request, env);
    if (method === "PUT")    return putInbox(request, env);
    if (method === "DELETE") return delInbox(request, env);
  }

  // «Η γνώμη σου» (Brief E §3). Δεν θέλει ταυτότητα λογαριασμού: η γνώμη
  // ΔΕΝ συνδέεται με φάκελο. Το admin/feedback θέλει KM_ADMIN_KEY.
  if (path === "/api/km/feedback" && method === "POST") return feedback(request, env);
  if (path === "/api/km/admin/feedback" && method === "GET") return adminFeedback(request, env);
  // Χρόνοι τήρησης (Πολιτική v2.0 §5). GET = ΜΟΝΟ δείχνει, POST = σβήνει.
  if (path === "/api/km/admin/mail" && method === "GET") return adminMail(request, env);
  // Brief Β (4/9/2026, (α)-(δ) του Stavros) — ο Πίνακας Ελέγχου. JSON μόνο· η
  // οθόνη ζει στο /pinakas/ (PWA, ΕΞΩ από το /kostometro/ — μάθημα 15/9).
  if (path === "/api/km/admin/pinakas" && method === "GET") return adminPinakas(request, env);
  // KM-LEADS (26/9/2026) — λίστα leads, αποστολή, σελίδα «μένω / φεύγω». schema/km_leads.sql
  if (path === "/api/km/admin/leads/import" && method === "POST") return adminLeadsImport(request, env);
  if (path === "/api/km/admin/leads/send" && method === "POST") return adminLeadsSend(request, env);
  if (path === "/api/km/lista" && (method === "GET" || method === "POST")) return leadsLista(request, env);
  // Η.11β: GET = ποιοι ΘΑ σβήνονταν τώρα · POST = σβήνει. Ιδιο μοτίβο με το
  // admin/cleanup, και για τον ίδιο λόγο: δεν εμπιστεύεσαι αυτόματη διαγραφή
  // που δεν μπορείς να δεις πρώτα. Το ?now= επιτρέπει στα τεστ να «γεράσουν»
  // τον χρόνο χωρίς να περιμένουν 72 ώρες.
  if (path === "/api/km/admin/due") {
    if (method === "GET") return adminDue(request, env, false);
    if (method === "POST") return adminDue(request, env, true);
  }
  if (path === "/api/km/admin/cleanup") {
    if (method === "GET")  return adminCleanup(request, env, false);
    if (method === "POST") return adminCleanup(request, env, true);
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
// Η.11β: opts.allowPending = true ΜΟΝΟ για την ακύρωση. Παντού αλλού, όσο
// εκκρεμεί διαγραφή, ο λογαριασμός είναι ΠΑΓΩΜΕΝΟΣ (423 Locked): καμία
// ανάγνωση, κανένα ανέβασμα, καμία ενεργοποίηση. Ο φραγμός ζει ΕΔΩ, σε ένα
// σημείο, γιατί από εδώ περνούν όλες οι διαδρομές που αγγίζουν δεδομένα —
// ένας έλεγχος ανά route θα ξεχνιόταν στο επόμενο route που θα γραφτεί.
async function authed(request, env, opts) {
  const id = ident(request);
  if (!id) return { err: json({ ok: false, error: "bad_identity" }, 400) };
  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(id.folder).first();
  if (!acc) return { err: json({ ok: false, error: "no_account" }, 404) };
  if (acc.deleted) return { err: json({ ok: false, error: "deleted" }, 410) };
  if (acc.delete_due_at && !(opts && opts.allowPending)) {
    return { err: json({ ok: false, error: "pending_delete", due_at: acc.delete_due_at }, 423) };
  }
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

/* ══ ΣΥΣΤΑΣΕΙΣ ═══════════════════════════════════════════════════════════
   🔴 Ο ΚΩΔΙΚΟΣ ΣΥΣΤΑΣΗΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ (17/9/2026).
   Το «γιατί» με μετρήσεις: schema/km_ref.sql. Σε μία γραμμή: ως χθες τον
   παρήγαγε η ΣΥΣΚΕΥΗ από localStorage, άρα κάθε αλλαγή κινητού έσβηνε τις
   συστάσεις ενός χρήστη που είχε ήδη καλέσει επιχειρήσεις.

   Αλφάβητο 30 χαρακτήρων χωρίς I, L, O, U, 0, 1 — ο κωδικός λέγεται και στο
   τηλέφωνο χωρίς να μπερδευτεί. 30^10 ≈ 5,9·10^14 συνδυασμοί: στο 1.000.000
   λογαριασμών η πιθανότητα έστω μίας σύγκρουσης είναι ~0,0008%. ΚΑΙ ο
   μοναδικός δείκτης την πιάνει ούτως ή άλλως — ΣΧΕΔΙΑΖΟΥΜΕ ΓΙΑ ΤΟ ΜΕΓΑΛΟ. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const REF_LEN = 10;

async function refCodeFor(folderId, attempt) {
  const h = await sha256hex(folderId + ":ref:" + (attempt || 0));
  let out = "";
  for (let i = 0; i < REF_LEN; i++) {
    out += REF_ALPHABET[parseInt(h.slice(i * 2, i * 2 + 2), 16) % REF_ALPHABET.length];
  }
  return out;
}

/* Ο κωδικός γράφεται ΜΙΑ φορά και δεν αλλάζει ποτέ.
   ⚠ Οι λογαριασμοί που φτιάχτηκαν ΠΡΙΝ τις 17/9 δεν έχουν κωδικό. Τον
   αποκτούν εδώ, την πρώτη φορά που ανοίγουν την οθόνη: καμία μετάβαση βάσης
   δεν μπορεί να τον υπολογίσει, γιατί το SQLite δεν έχει sha256.
   Το UPDATE ... WHERE ref_code IS NULL είναι ο φρουρός: δύο ταυτόχρονες
   κλήσεις από δύο συσκευές δεν μπορούν να δώσουν δύο διαφορετικούς κωδικούς. */
async function ensureRefCode(env, folderId, existing) {
  if (existing) return existing;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = await refCodeFor(folderId, attempt);
    const r = await env.DB.prepare(
      "UPDATE km_accounts SET ref_code = ? WHERE folder_id = ? AND ref_code IS NULL"
    ).bind(code, folderId).run().catch(() => null);
    if (r && r.meta && r.meta.changes) return code;
    const cur = await env.DB.prepare(
      "SELECT ref_code FROM km_accounts WHERE folder_id = ?").bind(folderId).first();
    if (cur && cur.ref_code) return cur.ref_code;
  }
  return null;
}

/* Ο κωδικός ταξιδεύει σε URL και μπορεί να πληκτρολογηθεί με πεζά.
   Μία μορφή παντού — αλλιώς ο ίδιος σύνδεσμος μετράει σε δύο κουβάδες. */
function normRef(v) { return (clean(v, 40) || "").toUpperCase() || null; }

/* GET /api/km/ref — ό,τι χρειάζεται η οθόνη «Κάλεσε», σε μία κλήση. */
async function refInfo(request, env) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  const code = await ensureRefCode(env, a.id.folder, a.acc.ref_code);
  if (!code) return json({ ok: false, error: "ref_code" }, 500);

  const n = async (sql) => {
    const r = await env.DB.prepare(sql).bind(code).first();
    return r ? Number(r.n) : 0;
  };
  const opened  = await n("SELECT COUNT(*) AS n FROM km_ref_hits WHERE ref_code = ?");
  const signups = await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ? AND deleted IS NULL");

  /* ΕΝΕΡΓΗ ΣΥΣΤΑΣΗ — κλείδωσε 17/9/2026 (έγκριση Stavros):
     επιχείρηση που κάλεσες εσύ ΚΑΙ πληρώνει συνδρομή PRO, για όσο πληρώνει.
     Απαιτεί ΚΑΙ ο συστήνων να έχει ενεργή δική του συνδρομή: δεν πληρώνουμε
     ποσοστό σε κάποιον που δεν είναι πελάτης μας.
     ⚠ Όσο δεν υπάρχει PRO, το νούμερο είναι σκόπιμα null και η οθόνη δείχνει
     «—». Το μηδέν θα διαβαζόταν «κανείς δεν μπήκε»· η αλήθεια είναι «όχι
     ακόμα», και είναι διαφορετικό πράγμα. */
  const live = proLive(env);
  const active = live
    ? await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ? AND deleted IS NULL AND plan IS NOT NULL")
    : null;

  /* Η ΛΙΣΤΑ ΤΩΝ ΕΓΓΡΑΦΩΝ.
     🔴 Ο ΦΡΟΥΡΟΣ ΕΙΝΑΙ ΤΟ CASE, ΚΑΙ ΖΕΙ ΣΤΟ SQL ΕΠΙΤΗΔΕΣ: το email φεύγει
     από τη βάση ΜΟΝΟ αν ο ίδιος ο συστημένος το επέτρεψε. Αν ζούσε στη
     JavaScript, μια λάθος γραμμή αργότερα θα το διέρρεε — εδώ δεν υπάρχει
     καν στο αποτέλεσμα για να διαρρεύσει.
     ⚠ Η ΩΡΑ ΦΕΥΓΕΙ ΣΕ ΟΛΕΣ ΤΙΣ ΓΡΑΜΜΕΣ — απόφαση Stavros 19/9/2026, ρητή,
     μετά από ένσταση Claude (καταγραμμένη στο Α320). Η ένσταση ήταν ότι σε
     ανώνυμη γραμμή η ακριβής ώρα στενεύει το ποιος είναι. Η απόφαση στέκει
     επειδή (α) το κουτάκι ΔΕΝ είναι προεπιλεγμένο — η συγκατάθεση είναι
     πραγματική επιλογή — και (β) η στιγμή της εγγραφής ΔΗΛΩΝΕΤΑΙ ΡΗΤΑ στο
     κείμενο της συγκατάθεσης, άρα κανείς δεν εκπλήσσεται.
     🔴 Ο ΦΡΟΥΡΟΣ ΠΟΥ ΜΕΝΕΙ ΚΑΙ ΔΕΝ ΣΥΖΗΤΙΕΤΑΙ ΕΙΝΑΙ ΤΟ EMAIL: δεν φεύγει
     ποτέ χωρίς ref_share = 1, και ο έλεγχος ζει στο SQL.
     🔴 ΣΕΛΙΔΟΠΟΙΗΣΗ (v69, 19/9/2026) — ΣΧΕΔΙΑΖΟΥΜΕ ΓΙΑ ΤΟ ΜΕΓΑΛΟ: με 300
     συστάσεις η οθόνη δεν κατεβάζει 300 γραμμές σε κινητό με 4G. Η εφαρμογή
     ζητάει όσες θέλει (`n`, ως 200) από όποια θέση (`off`), και το `signups`
     πιο πάνω είναι το ΑΛΗΘΙΝΟ σύνολο — όχι «όσες έστειλα».
     Ίδιο μοτίβο με τον Πίνακα Ελέγχου: «δείχνω N από M» + «Κι άλλες». */
  const url = new URL(request.url);
  const nRaw = parseInt(url.searchParams.get("n") || "10", 10);
  const oRaw = parseInt(url.searchParams.get("off") || "0", 10);
  const lim = Math.min(Math.max(Number.isFinite(nRaw) ? nRaw : 10, 1), 200);
  const off = Math.max(Number.isFinite(oRaw) ? oRaw : 0, 0);
  const rows = await env.DB.prepare(
    `SELECT created AS pote,
            CASE WHEN ref_share = 1 THEN email ELSE NULL END AS email
       FROM km_accounts
      WHERE ref = ? AND deleted IS NULL
      ORDER BY created DESC LIMIT ? OFFSET ?`
  ).bind(code, lim, off).all();

  return json({
    ok: true,
    code: code,
    opened: opened,
    signups: signups,
    list: (rows.results || []).map((r) => ({ when: r.pote, email: r.email || null })),
    /* Πόσες έδωσα και από πού — ώστε η εφαρμογή να ξέρει αν υπάρχουν κι άλλες
       ΧΩΡΙΣ δεύτερη κλήση. Το «έχει κι άλλες» βγαίνει από signups > off+list. */
    off: off,
    lim: lim,
    active: active,
    self_active: !!a.acc.plan,
    pro_live: live,
  });
}

/* POST /api/km/ref/hit — «άνοιξα τον σύνδεσμο κάποιου».
   ΧΩΡΙΣ ταυτοποίηση, και σωστά: ο επισκέπτης δεν έχει ακόμα λογαριασμό.
   Ό,τι γράφεται εδώ είναι ο κωδικός και ένα τυχαίο install_id — κανένα
   στοιχείο προσώπου, καμία IP. Ο κανόνας «βλέπει λογαριασμό, ΠΟΤΕ
   περιεχόμενο» (6/9/2026) ισχύει και εδώ. */
async function refHit(request, env) {
  const b = (await safeJson(request)) || {};
  const code = normRef(b.ref);
  const inst = clean(b.install_id, 64);
  if (!code || !inst) return json({ ok: false, error: "bad" }, 400);
  await env.DB.prepare(
    `INSERT INTO km_ref_hits (ref_code, install_id, first_seen, country)
     VALUES (?, ?, ?, ?) ON CONFLICT(ref_code, install_id) DO NOTHING`
  ).bind(code, inst, now(), (request.cf && request.cf.country) || null).run().catch(() => null);
  return json({ ok: true });
}

/* Η σημαία που γυρίζει την οθόνη από «ΤΙ ΕΡΧΕΤΑΙ» σε «ΤΙ ΚΑΝΕΙ ΤΟ PRO».
   Ρύθμιση του Worker, ΟΧΙ καρφωτό κείμενο: την ημέρα που βγαίνει το PRO
   αλλάζει μία μεταβλητή, δεν γίνεται deploy νέου κειμένου. */
function proLive(env) { return String((env && env.PRO_LIVE) || "") === "1"; }

function pub(acc) {
  return {
    folder_version: acc.folder_version,
    folder_bytes: acc.folder_bytes,
    last_sync: acc.last_sync,
    active_device_id: acc.active_device_id,
    active_since: acc.active_since,
    created: acc.created,
    plan: acc.plan || null,
    // Η.11β: η εφαρμογή χρειάζεται το πότε λήγει για να δείξει το υπόλοιπο.
    // NULL όταν δεν εκκρεμεί τίποτα — η οθόνη s-pending δεν ανοίγει καν.
    delete_due_at: acc.delete_due_at || null,
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

// ══ Brief ΣΤ (24/9/2026) — ΕΠΙΒΕΒΑΙΩΣΗ EMAIL · ΕΝΑ EMAIL = ΕΝΑΣ ΛΟΓΑΡΙΑΣΜΟΣ ══
const CODE_TTL_MS = 15 * 60 * 1000;          // ο κωδικός ζει 15′
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;   // το token 7 μέρες: η εγγραφή μπορεί να γίνει χωρίς δίκτυο αργότερα
const CODE_MAX_TRIES = 5;                    // λάθη ανά κωδικό
const CODE_PER_EMAIL_HOUR = 3;               // αποστολές ανά email/ώρα
const CODE_PER_IP_HOUR = 10;                 // αποστολές ανά IP/ώρα (μόνο hash, ποτέ η IP)

// «Είναι πιασμένο;» — null = ελεύθερο · 'taken' · 'pending_delete'.
// Ο λογαριασμός σε αίτημα διαγραφής ΚΡΑΤΑΕΙ το email ως τη λήξη των 72 ωρών.
async function emailBusy(env, email) {
  const row = await env.DB.prepare(
    "SELECT delete_due_at FROM km_accounts WHERE email = ? AND deleted IS NULL LIMIT 1"
  ).bind(email).first();
  if (!row) return null;
  return row.delete_due_at ? "pending_delete" : "taken";
}

function sixDigits() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

// Εκδίδει token επιβεβαιωμένου email. Επιστρέφει το ΚΑΘΑΡΟ token (φεύγει μία
// φορά προς τη συσκευή)· η βάση κρατάει μόνο το hash. Εξάγεται για τα τεστ.
export async function issueEmailToken(env, email) {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, "0")).join("");
  const t = Date.now();
  await env.DB.prepare(
    "INSERT INTO km_email_tokens (token_hash, email, created, expires, used) VALUES (?, ?, ?, ?, NULL)"
  ).bind(await sha256hex(raw), email, new Date(t).toISOString(), new Date(t + TOKEN_TTL_MS).toISOString()).run();
  return raw;
}

// Έγκυρο, αχρησιμοποίητο, ίδιο email, όχι ληγμένο → επιστρέφει το hash. Αλλιώς null.
async function tokenFor(env, raw, email) {
  const r = String(raw || "").toLowerCase();
  if (!HEX64.test(r)) return null;
  const h = await sha256hex(r);
  const row = await env.DB.prepare("SELECT * FROM km_email_tokens WHERE token_hash = ?").bind(h).first();
  if (!row || row.used || row.email !== email) return null;
  if (row.expires < now()) return null;
  return h;
}

async function emailCode(request, env) {
  const b = (await safeJson(request)) || {};
  const email = normEmail(b.email);
  if (!email) return json({ ok: false, error: "bad_email" }, 400);
  const busy = await emailBusy(env, email);
  if (busy) return json({ ok: false, error: busy }, 409);

  const t = Date.now();
  const hourAgo = new Date(t - 3600 * 1000).toISOString();
  // Καθάρισμα: τίποτα δεν ζει πάνω από 24 ώρες εδώ μέσα.
  await env.DB.prepare("DELETE FROM km_email_codes WHERE created < ?").bind(new Date(t - 24 * 3600 * 1000).toISOString()).run();

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipH = ip ? await sha256hex(ip + "|" + new Date(t).toISOString().slice(0, 10) + "|" + (env.KM_ADMIN_KEY || "km")) : null;
  const nEmail = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_email_codes WHERE email = ? AND created >= ?").bind(email, hourAgo).first();
  if (nEmail && nEmail.n >= CODE_PER_EMAIL_HOUR) return json({ ok: false, error: "too_many" }, 429);
  if (ipH) {
    const nIp = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_email_codes WHERE ip_h = ? AND created >= ?").bind(ipH, hourAgo).first();
    if (nIp && nIp.n >= CODE_PER_IP_HOUR) return json({ ok: false, error: "too_many" }, 429);
  }

  const code = sixDigits();
  await env.DB.prepare(
    "INSERT INTO km_email_codes (email, code_hash, created, expires, attempts, ip_h) VALUES (?, ?, ?, ?, 0, ?)"
  ).bind(email, await sha256hex(email + ":" + code), new Date(t).toISOString(), new Date(t + CODE_TTL_MS).toISOString(), ipH).run();
  // Εδώ ΠΕΡΙΜΕΝΟΥΜΕ την αποστολή: χωρίς email ο χρήστης δεν προχωρά, άρα
  // πρέπει να ξέρει ΤΩΡΑ ότι απέτυχε — όχι να κοιτάει άδειο inbox.
  const sent = await mailSend(env, "code", email, { code });
  if (!sent) return json({ ok: false, error: "mail_failed" }, 502);
  return json({ ok: true, sent: true, ttl_min: CODE_TTL_MS / 60000 });
}

async function emailVerify(request, env) {
  const b = (await safeJson(request)) || {};
  const email = normEmail(b.email);
  const code = String(b.code || "").replace(/\D/g, "");
  if (!email || code.length !== 6) return json({ ok: false, error: "bad_code" }, 400);
  const row = await env.DB.prepare(
    "SELECT * FROM km_email_codes WHERE email = ? ORDER BY id DESC LIMIT 1"
  ).bind(email).first();
  if (!row) return json({ ok: false, error: "no_code" }, 400);
  if (row.expires < now()) return json({ ok: false, error: "code_expired" }, 400);
  if (row.attempts >= CODE_MAX_TRIES) return json({ ok: false, error: "too_many" }, 429);
  if ((await sha256hex(email + ":" + code)) !== row.code_hash) {
    await env.DB.prepare("UPDATE km_email_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return json({ ok: false, error: "bad_code", left: Math.max(0, CODE_MAX_TRIES - row.attempts - 1) }, 400);
  }
  // Ξαναελέγχεται: στο μεταξύ κάποιος μπορεί να γράφτηκε με το ίδιο email.
  const busy = await emailBusy(env, email);
  if (busy) return json({ ok: false, error: busy }, 409);
  await env.DB.prepare("DELETE FROM km_email_codes WHERE email = ?").bind(email).run();
  return json({ ok: true, email_token: await issueEmailToken(env, email) });
}

// «Υπάρχει αυτός ο κωδικός πρόσκλησης;» — ΜΟΝΟ ναι/όχι, κανένα στοιχείο του κατόχου.
async function refCheck(request, env) {
  const code = normRef(new URL(request.url).searchParams.get("code"));
  if (!code || !/^[A-Z0-9]{4,40}$/.test(code)) return json({ ok: true, exists: false });
  const row = await env.DB.prepare(
    "SELECT 1 AS x FROM km_accounts WHERE ref_code = ? AND deleted IS NULL LIMIT 1"
  ).bind(code).first();
  return json({ ok: true, exists: !!row });
}

// KM-MANIFEST-REF — Το iPhone ανοίγει το εικονίδιο στο start_url του manifest,
// με ΞΕΧΩΡΙΣΤΗ μνήμη από το Safari. Μετρήθηκε 23/9: το «Add to Home Screen»
// έδειξε σκέτο /kostometro/ ενώ η σελίδα είχε ?ref= → η σύσταση χάθηκε.
// Εδώ το start_url ΚΟΥΒΑΛΑΕΙ ref/src. Το "id" μένει σταθερό, ώστε η εφαρμογή
// να είναι ΜΙΑ για το λειτουργικό, όποιος κι αν ήταν ο σύνδεσμος.
function manifestFor(request) {
  const q = new URL(request.url).searchParams;
  const ref = (q.get("ref") || "").toUpperCase();
  const src = q.get("src") || "";
  const parts = [];
  if (/^[A-Z0-9]{4,40}$/.test(ref)) parts.push("ref=" + ref);
  if (/^[A-Za-z0-9:_-]{1,40}$/.test(src)) parts.push("src=" + src);
  const body = {
    id: "/kostometro/",
    name: "Kostometro",
    short_name: "Kostometro",
    description: "Φωτογραφίζεις το τιμολόγιο στην παραλαβή. Κρατάς τι πλήρωσες, ανά προμηθευτή.",
    lang: "el", dir: "ltr",
    start_url: "/kostometro/" + (parts.length ? "?" + parts.join("&") : ""),
    scope: "/kostometro/",
    display: "standalone",
    background_color: "#0a0e14", theme_color: "#0a0e14",
    icons: [
      { src: "/kostometro/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/kostometro/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/kostometro/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" },
  });
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
    /* Brief ΣΤ · KM-ONE-EMAIL — ΝΕΟΣ λογαριασμός ΜΟΝΟ με επιβεβαιωμένο email
       και ΜΟΝΟ αν το email δεν έχει ήδη ζωντανό λογαριασμό. Ο υπάρχων
       λογαριασμός (κάτω) δεν αγγίζεται: η είσοδος με τις 12 λέξεις δουλεύει
       όπως πάντα. Μετρήθηκε 23–24/9: το ίδιο email έφτιαξε 3 λογαριασμούς. */
    const tok = await tokenFor(env, b.email_token, email);
    if (!tok) return json({ ok: false, error: "email_unverified" }, 403);
    const busy = await emailBusy(env, email);
    if (busy) return json({ ok: false, error: busy }, 409);
    const wrapped = (clean(b.wrapped_k, 130) || "").toLowerCase();
    if (id.lock && !HEX120.test(wrapped)) return json({ ok: false, error: "bad_wrapped_k" }, 400);
    if (id.lock) {
      const taken = await env.DB.prepare("SELECT folder_id FROM km_locks WHERE lock_id = ?").bind(id.lock).first();
      if (taken) return json({ ok: false, error: "lock_exists" }, 409);
    }
    const stmts = [
      env.DB.prepare(
        `INSERT INTO km_accounts (folder_id, auth_hash, email, created, country, source, ref, has_key,
                                  active_device_id, active_since, ref_code, ref_share)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id.folder, h, email, ts,
        (request.cf && request.cf.country) || null,
        clean(b.source, 20) || "direct",   // KM-SRC-DIRECT 25/9: όχι «link»
        normRef(b.ref),
        b.has_key ? 1 : 0,
        id.device, ts,
        // 17/9/2026: ο κωδικός γεννιέται ΜΑΖΙ με τον λογαριασμό. Δεν
        // περιμένει να ανοίξει ο χρήστης την οθόνη «Κάλεσε».
        await refCodeFor(id.folder, 0),
        /* 19/9/2026 — συγκατάθεση να φανεί το email στον συστήνοντα.
           Έχει νόημα ΜΟΝΟ όταν υπάρχει σύσταση: χωρίς ref δεν υπάρχει
           κανείς να το δει, και το 1 θα ήταν σκουπίδι στη βάση. */
        (normRef(b.ref) && b.ref_share) ? 1 : 0
      ),
    ];
    if (id.lock) {
      stmts.push(env.DB.prepare(
        `INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by, label)
         VALUES (?, ?, 'words', ?, ?, ?, ?, ?)`
      ).bind(id.lock, id.folder, h, wrapped, ts, id.device, clean(b.lock_label, 40)));
    }
    // Το token καίγεται ΜΑΖΙ με τη δημιουργία — ένα token, ένας λογαριασμός.
    stmts.push(env.DB.prepare("UPDATE km_email_tokens SET used = ? WHERE token_hash = ?").bind(ts, tok));
    try {
      await env.DB.batch(stmts);
    } catch (e) {
      // Ταυτόχρονη εγγραφή του ίδιου email: το μοναδικό index είναι ο τελικός φρουρός.
      if (/unique|constraint/i.test(String((e && e.message) || e))) return json({ ok: false, error: "taken" }, 409);
      throw e;
    }
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
    params: lock.params || null,        // v54 — πώς φτιάχτηκε ΑΥΤΗ η κλειδαριά

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
async function addLock(request, env, ctx) {
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
  // v52 · ΑΛΛΑΓΗ ΛΕΞΕΩΝ — ΚΛΕΙΝΕΙ ΚΑΙ Ο ΠΑΛΙΟΣ ΚΩΔΙΚΟΣ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ.
  // Το km_accounts.auth_hash είναι η ΕΝΑΛΛΑΚΤΙΚΗ ταυτότητα (v46, πριν τις
  // κλειδαριές): βγαίνει από τις λέξεις με το παλιό kmDerive. Χωρίς αυτό,
  // μετά την αλλαγή λέξεων οι ΠΑΛΙΕΣ λέξεις εξακολουθούσαν να ΓΡΑΦΟΥΝ στον
  // φάκελο — δεν διάβαζαν δεδομένα (το Κ είναι τυχαίο) αλλά έγραφαν, και το
  // «οι παλιές δεν ισχύουν πια» που λέει η οθόνη θα ήταν ψέμα.
  // Καταγεγραμμένο ανοιχτό από 6/9 (Α300 §1). Κλείνει ΜΟΝΟ μαζί με την
  // αντικατάσταση κλειδαριάς λέξεων, στην ΙΔΙΑ πράξη batch.
  const accountAuth = (clean(b.account_auth, 64) || "").toLowerCase();
  if (!HEX64.test(lockId) || !HEX64.test(auth)) return json({ ok: false, error: "bad_lock" }, 400);
  if (!HEX120.test(wrapped)) return json({ ok: false, error: "bad_wrapped_k" }, 400);
  if (LOCK_KINDS.indexOf(kind) < 0) return json({ ok: false, error: "bad_kind" }, 400);
  if (replace && !HEX64.test(replace)) return json({ ok: false, error: "bad_replace" }, 400);
  if (accountAuth && !HEX64.test(accountAuth)) return json({ ok: false, error: "bad_account_auth" }, 400);
  // v54 — ΟΙ ΠΑΡΑΜΕΤΡΟΙ ΤΗΣ ΚΛΕΙΔΑΡΙΑΣ. Μικρό κείμενο χωρίς μυστικά, που λέει
  // ΠΩΣ φτιάχτηκε (kdf, πόσα βήματα). Ο server ΔΕΝ το ερμηνεύει — το φυλάει
  // και το επιστρέφει, ώστε μια μελλοντική αύξηση βημάτων να μη σπάει τα
  // παλιά backup ανάκτησης. Ό,τι ξεπερνά τα 200 σημεία δεν είναι παράμετροι.
  const params = clean(b.params, 200) || null;
  if (params && !/^\{[\x20-\x7e]*\}$/.test(params)) return json({ ok: false, error: "bad_params" }, 400);
  if (accountAuth && !(kind === "words" && replace)) {
    return json({ ok: false, error: "account_auth_needs_words_replace" }, 400);
  }

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
    `INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by, label, params)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(lockId, a.id.folder, kind, await sha256hex(auth), wrapped, ts, a.id.device, clean(b.label, 40), params));
  if (accountAuth) {
    stmts.push(env.DB.prepare("UPDATE km_accounts SET auth_hash = ? WHERE folder_id = ?")
      .bind(await sha256hex(accountAuth), a.id.folder));
  }
  await env.DB.batch(stmts);
  await touchDevice(env, request, a.id, null);

  // Brief Ε §6 — δεύτερο γεγονός: ΑΛΛΑΓΗ ΤΩΝ 12 ΛΕΞΕΩΝ, «μόλις γραφτεί η νέα
  // κλειδαριά». Ειδοποιούμε ΜΟΝΟ όταν κλειδαριά λέξεων ΑΝΤΙΚΑΘΙΣΤΑ άλλη —
  // η πρώτη κλειδαριά ενός νέου λογαριασμού δεν είναι «αλλαγή» και δεν
  // στέλνει τίποτα. Η πράξη έχει ήδη γίνει· το email δεν την ακυρώνει.
  if (kind === "words" && replace) {
    fireMail(env, ctx, "words", a.acc && a.acc.email ? String(a.acc.email) : null);
  }

  return json({ ok: true, lock_id: lockId, kind: kind, replaced: replace,
                account_auth_closed: !!accountAuth,
                locks: await lockSummary(env, a.id.folder) });
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

// ── Η.11 · ΟΡΙΣΤΙΚΗ ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ (Brief Η.11, 9/9/2026) ────────────
// Απόφαση Stavros 9/9: ο χρήστης φεύγει ΟΡΙΣΤΙΚΑ. ΚΑΜΙΑ επαναφορά, ποτέ — και
// οι ίδιες 12 λέξεις είναι νεκρές για πάντα (το authed()/unlock()/register()
// απαντούν 410 σε φάκελο με deleted, από 2/9). Δεν κρατάμε δεδομένα ανθρώπου
// που δεν είναι πια πελάτης.
//
// ΤΙ ΔΕΝ ΣΒΗΝΕΙ Η ΠΡΑΞΗ ΑΥΤΗ: τα τιμολόγια στη ΣΥΣΚΕΥΗ του. Είναι δικά του.
// Η συσκευή τα σβήνει μόνη της αν ο ίδιος πατήσει «Ξεκίνα καθαρά» (απόφαση
// Stavros 9/9). Εμείς σβήνουμε ΤΑ ΔΙΚΑ ΜΑΣ αντίγραφα.
//
// Η ΣΕΙΡΑ ΕΙΝΑΙ ΤΟ ΖΗΤΟΥΜΕΝΟ — και είναι ο λόγος που η πράξη είναι ασφαλής
// ακόμα κι αν κοπεί στη μέση:
//   (α) πρώτα η σφραγίδα deleted  -> από εδώ και πέρα ΚΑΜΙΑ συσκευή δεν γράφει
//   (β) μετά το R2                -> ό,τι ζει κάτω από <folder>/, χωρίς λίστα
//   (γ) μετά η D1                 -> locks, device_links, devices
//   (δ) τέλος η ταφόπετρα         -> η γραμμή μένει ΧΩΡΙΣ πρόσωπο
// Αν σπάσει στο (β), ο λογαριασμός είναι ήδη νεκρός και η ίδια κλήση
// ξανατρέχει αθώα (idempotent) — δεν μένουν ορφανά μπλοκ που πληρώνονται για
// πάντα. Το αντίστροφο (R2 πρώτα) θα άφηνε ζωντανό λογαριασμό με άδειο φάκελο.
//
// ΓΙΑΤΙ Η ΓΡΑΜΜΗ ΜΕΝΕΙ (απόφαση Stavros 9/9: «είναι δικά μας στατιστικά»):
// μετά το (δ) η γραμμή δεν έχει email, ούτε κωδικό, ούτε μέγεθος — κρατάει
// created/country/source/ref/deleted. Κανείς δεν μπορεί να τη συνδέσει με
// άνθρωπο· είναι «ήρθε ένας από το Play στις 3/9, έφυγε στις 9/9». Χωρίς
// αυτήν ο Πίνακας Ελέγχου (Brief Β) δεν μαθαίνει ποτέ πόσοι έφυγαν, και ο
// κανόνας Α400 §Δ «η προέλευση δεν ανακτάται αναδρομικά» γίνεται κενό γράμμα.

// Ένα R2 delete παίρνει ως 1000 κλειδιά. Πάνω από αυτό σπάει σε παρτίδες.
const R2_DELETE_BATCH = 1000;

// Σβήνει ΟΛΟΚΛΗΡΟ τον χώρο R2 του φακέλου. ΔΕΝ κυνηγάει τις τρεις γνωστές
// κατηγορίες μία-μία: σαρώνει το prefix «<folder_id>/» και σβήνει ό,τι βρει.
// Το folder_id είναι 64 hex, άρα το prefix δεν αγγίζει ποτέ άλλον λογαριασμό.
// Ετσι ό,τι προστεθεί στο μέλλον (νέο είδος αντικειμένου) σβήνεται από μόνο
// του — μια λίστα που ξεχνά ένα prefix είναι ακριβώς το σφάλμα που πληρώνεται
// σιωπηλά για πάντα.
async function wipeR2(env, folderId) {
  const prefix = folderId + "/";
  const counts = { folder: 0, photos: 0, inbox: 0, other: 0 };
  let objects = 0, bytes = 0, cursor;
  do {
    const page = await env.FOLDERS.list({ prefix, cursor, limit: 1000 });
    const keys = [];
    for (const o of page.objects) {
      keys.push(o.key);
      objects += 1;
      bytes += o.size || 0;
      const rest = o.key.slice(prefix.length);
      if (rest === "folder.bin") counts.folder += 1;
      else if (rest.indexOf("p/") === 0) counts.photos += 1;
      else if (rest.indexOf("inbox/") === 0) counts.inbox += 1;
      else counts.other += 1;
    }
    for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
      await env.FOLDERS.delete(keys.slice(i, i + R2_DELETE_BATCH));
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  return { objects, bytes, counts };
}

// Η πράξη, ολόκληρη. Καλείται και από τον χρήστη (POST /api/km/delete) και από
// τον Stavros (admin). Επιστρέφει ΝΟΥΜΕΡΑ, όχι «ok» — κανόνας Α400 §Γ 4/9:
// κάθε αυτόματος έλεγχος που απαντάει «βρέθηκε» τυπώνει ΚΑΙ τι βρήκε.
async function wipeFolder(env, folderId) {
  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(folderId).first();
  if (!acc) return null;
  const ts = now();

  // (α) Η ΣΦΡΑΓΙΔΑ ΠΡΩΤΗ.
  // ⚠ Ο ΦΡΑΓΜΟΣ ΕΙΝΑΙ ΣΕ ΕΝΑ ΣΗΜΕΙΟ: το «AND deleted IS NULL» μέσα στο SQL.
  // Η πρώτη γραφή έλεγχε ΚΑΙ στη JavaScript, με τη μεταβλητή already — δύο
  // φρουροί για το ίδιο πράγμα, και η μετάλλαξη το απέδειξε: βγάζοντας το
  // SQL φίλτρο, το τεστ Η11-6 έμενε ΠΡΑΣΙΝΟ, γιατί το κάλυπτε ο δεύτερος.
  // ⚠ Το κείμενο του παλιού ελέγχου ΔΕΝ γράφεται εδώ αυτούσιο: το deploy .bat
  // ψάχνει ακριβώς αυτό ως «σημάδι που ΠΡΕΠΕΙ να λείπει», και ένα σχόλιο που
  // το περιέχει θα κοκκίνιζε το deploy για πάντα (μετρήθηκε 9/9).
  // Κανόνας Α400 §Γ (6/9): «αν δύο φρουροί φυλάνε το ίδιο, κανένας δεν
  // αποδεικνύεται». Εμεινε το SQL, που προστατεύει ΚΑΙ από δύο ταυτόχρονες
  // κλήσεις — η JavaScript δεν μπορεί.
  const already = !!acc.deleted;
  await env.DB.prepare("UPDATE km_accounts SET deleted = ? WHERE folder_id = ? AND deleted IS NULL")
    .bind(ts, folderId).run();

  // (β) R2
  const r2 = await wipeR2(env, folderId);

  // (γ) D1 — οι τρεις πίνακες που κρατούν πρόσωπο ή κλειδί.
  const locks = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_locks WHERE folder_id = ?").bind(folderId).first();
  const links = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_device_links WHERE folder_id = ?").bind(folderId).first();
  const devs  = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_devices WHERE folder_id = ?").bind(folderId).first();

  // (δ) Η ταφόπετρα. Το auth_hash γίνεται κενό: το sha256hex() βγάζει ΠΑΝΤΑ 64
  // hex, άρα κενή τιμή δεν μπορεί να ταιριάξει με τίποτα — ούτε κατά λάθος,
  // ούτε επίτηδες. Το email γίνεται κενό: το normEmail() απορρίπτει το κενό,
  // άρα ούτε το /lookup μπορεί να το ξαναβρεί.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM km_locks WHERE folder_id = ?").bind(folderId),
    env.DB.prepare("DELETE FROM km_device_links WHERE folder_id = ?").bind(folderId),
    env.DB.prepare("DELETE FROM km_devices WHERE folder_id = ?").bind(folderId),
    env.DB.prepare(
      `UPDATE km_accounts SET email = '', auth_hash = '', active_device_id = NULL,
              active_since = NULL, folder_bytes = 0, folder_version = 0, last_sync = NULL,
              has_key = 0, plan = NULL,
              delete_requested_at = NULL, delete_due_at = NULL
       WHERE folder_id = ?`
    ).bind(folderId),
  ]);

  return {
    folder_id: folderId,
    deleted_at: already ? acc.deleted : ts,
    was_already_deleted: already,
    r2: r2,
    rows: {
      locks: (locks && locks.n) || 0,
      device_links: (links && links.n) || 0,
      devices: (devs && devs.n) || 0,
      account: "tombstoned",
    },
    kept: { created: acc.created, country: acc.country, source: acc.source, ref: acc.ref },
  };
}

// ΠΟΡΤΑ Α — από την εφαρμογή. Σώμα: { confirm: "ΔΙΑΓΡΑΦΗ" }.
//
// 🔴 ΔΥΟ ΦΡΟΥΡΟΙ, ΚΑΙ Ο ΔΕΥΤΕΡΟΣ ΕΙΝΑΙ Ο ΟΥΣΙΑΣΤΙΚΟΣ:
//  1. auth — έχει τις 12 λέξεις (ή την κλειδαριά).
//  2. ΜΟΝΟ Η ΕΝΕΡΓΗ ΣΥΣΚΕΥΗ. Χωρίς αυτό, κλεμμένο κινητό που βγήκε εκτός
//     λειτουργίας θα μπορούσε να σβήσει ολόκληρο τον λογαριασμό του ιδιοκτήτη.
//     Στο UI το ίδιο το φράζει η λίστα LOCKED_OUT (app.js: το s-menu, άρα και
//     οι Ρυθμίσεις, δεν ανοίγουν σε συσκευή εκτός λειτουργίας — φρουρός Λ7,
//     8/9). ΑΛΛΑ ΤΟ UI ΔΕΝ ΕΙΝΑΙ ΦΡΑΓΜΟΣ: η κλήση φτάνει και με curl. Ο
//     φραγμός ζει ΕΔΩ. Ιδια οικογένεια με το «κλειδωμένη συσκευή δεν παραδίδει
//     τις 12 λέξεις» (Α320, 8/9) — μία απόφαση, δύο σημεία που την τηρούν.
const DELETE_CONFIRM = "ΔΙΑΓΡΑΦΗ";

// Η.11β — ΤΟ ΑΙΤΗΜΑ. ΔΕΝ ΣΒΗΝΕΙ ΤΙΠΟΤΑ.
// Γράφει δύο ημερομηνίες και παγώνει τον λογαριασμό. Η πράξη γίνεται 72 ώρες
// αργότερα, από το ωριαίο cron (kmDeleteDue).
//
// ⚠ Ο ΦΡΑΓΜΟΣ ΤΗΣ ΔΙΠΛΗΣ ΚΛΗΣΗΣ ΕΙΝΑΙ ΣΕ ΕΝΑ ΣΗΜΕΙΟ: το
// «AND delete_requested_at IS NULL» μέσα στο SQL. Ιδιος κανόνας με το
// wipeFolder (Α400 §Γ, 6/9): αν δύο φρουροί φυλάνε το ίδιο, κανένας δεν
// αποδεικνύεται. Χωρίς αυτό, δύο ταυτόχρονες κλήσεις θα μετακινούσαν τη λήξη
// προς τα εμπρός — ο κλέφτης θα πατούσε «διαγραφή» κάθε ώρα και το παράθυρο
// δεν θα έκλεινε ποτέ.
async function requestDelete(request, env, ctx) {
  const a = await authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id !== a.id.device) {
    return json({ ok: false, error: "not_active_device", state: pub(a.acc) }, 409);
  }
  const b = (await safeJson(request)) || {};
  // Η λέξη είναι το «είσαι σίγουρος» που δεν πατιέται κατά λάθος. Ο έλεγχος
  // ζει και στον server: μια οθόνη μπορεί να αλλάξει, η υποχρέωση όχι.
  if (clean(b.confirm, 40) !== DELETE_CONFIRM) {
    return json({ ok: false, error: "confirm_required", expected: DELETE_CONFIRM }, 400);
  }

  const ts = now();
  const due = new Date(Date.parse(ts) + DELETE_GRACE_HOURS * 3600 * 1000).toISOString();
  const r = await env.DB.prepare(
    `UPDATE km_accounts SET delete_requested_at = ?, delete_due_at = ?
     WHERE folder_id = ? AND delete_requested_at IS NULL AND deleted IS NULL`
  ).bind(ts, due, a.id.folder).run();
  const changed = (r && r.meta && r.meta.changes) || 0;
  if (!changed) {
    // Υπήρχε ήδη αίτημα. Η λήξη ΔΕΝ μετακινείται· επιστρέφεται η αρχική.
    const cur = await env.DB.prepare("SELECT delete_due_at FROM km_accounts WHERE folder_id = ?")
      .bind(a.id.folder).first();
    return json({ ok: true, already: true, due_at: (cur && cur.delete_due_at) || null });
  }

  // Το email ΔΕΝ σβήνεται εδώ — χρειάζεται σε 72 ώρες για την ειδοποίηση
  // ολοκλήρωσης. Δηλώνεται ρητά στην Πολιτική v2.0 §5.
  fireMail(env, ctx, "delete_requested", a.acc.email, { due: due });
  return json({
    ok: true,
    pending: { requested_at: ts, due_at: due, grace_hours: DELETE_GRACE_HOURS },
  });
}

// Η.11β — Η ΑΚΥΡΩΣΗ. Η ΜΟΝΗ ΔΙΑΔΡΟΜΗ ΠΟΥ ΔΕΧΕΤΑΙ ΠΑΓΩΜΕΝΟ ΛΟΓΑΡΙΑΣΜΟ.
//
// 🔴 ΔΕΝ ΑΠΑΙΤΕΙ ΕΝΕΡΓΗ ΣΥΣΚΕΥΗ. Αυτό σπάει επίτηδες τον κανόνα του 409 που
//    φυλάει το /delete, και είναι ΟΛΟΚΛΗΡΟ το νόημα του Η.11β: αν απαιτούσε
//    ενεργή συσκευή, θα μπορούσε να ακυρώσει ΜΟΝΟ το κλεμμένο κινητό — δηλαδή
//    μόνο ο κλέφτης. Ο άνθρωπος που έχασε τη συσκευή του δεν έχει άλλη πόρτα.
//
// ⚠ ΤΙ ΔΕΝ ΚΑΝΕΙ, ΚΑΙ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΓΡΑΜΜΕΝΟ: δεν διώχνει τον κλέφτη για
//    πάντα. Το κλεμμένο κινητό κρατάει το ίδιο auth — για τον server είναι
//    πανομοιότυπο με τον ιδιοκτήτη. Εδώ η συσκευή που ακύρωσε γίνεται η
//    ενεργή, άρα ο κλέφτης χάνει το δικαίωμα του /delete (409) — αλλά μπορεί
//    να ξανα-ενεργοποιηθεί. Η ΜΟΝΗ οριστική πράξη είναι η ΑΛΛΑΓΗ ΤΩΝ 12
//    ΛΕΞΕΩΝ (POST /api/km/lock με replace), που σκοτώνει την κλειδαριά του.
//    Γι' αυτό το email ακύρωσης το λέει ρητά και η οθόνη το σπρώχνει.
async function cancelDelete(request, env, ctx) {
  const a = await authed(request, env, { allowPending: true });
  if (a.err) return a.err;
  if (!a.acc.delete_due_at) {
    return json({ ok: false, error: "no_pending" }, 409);
  }
  const ts = now();
  const r = await env.DB.prepare(
    `UPDATE km_accounts SET delete_requested_at = NULL, delete_due_at = NULL,
            active_device_id = ?, active_since = ?
     WHERE folder_id = ? AND delete_due_at IS NOT NULL`
  ).bind(a.id.device, ts, a.id.folder).run();
  const changed = (r && r.meta && r.meta.changes) || 0;
  if (!changed) return json({ ok: false, error: "no_pending" }, 409);

  await touchDevice(env, request, a.id, clean((await safeJson(request) || {}).device_name, 80));
  fireMail(env, ctx, "delete_cancelled", a.acc.email);
  return json({
    ok: true,
    cancelled_at: ts,
    active_device_id: a.id.device,
    // Η εφαρμογή/σελίδα το διαβάζει και σπρώχνει αμέσως στην αλλαγή λέξεων.
    next: "change_words",
  });
}

// Η.11β — Η ΕΚΤΕΛΕΣΗ, ΑΠΟ ΤΟ ΩΡΙΑΙΟ CRON.
//
// 🔴 ΓΙΑΤΙ ΩΡΙΑΙΟ ΚΑΙ ΟΧΙ ΤΟ ΥΠΑΡΧΟΝ ΗΜΕΡΗΣΙΟ: το ημερήσιο τρέχει 03:00 UTC.
//    Αίτημα στις 04:00 θα ωρίμαζε σε 72 ώρες αλλά θα εκτελούνταν 23 ώρες
//    αργότερα — δηλαδή 95, όχι 72. Το email λέει ακριβή ώρα λήξης· ένα cron
//    που την προσπερνά κατά μία μέρα κάνει το κείμενο ψέμα.
export async function kmDeleteDue(env, nowIso) {
  const t = nowIso || now();
  const rows = (await env.DB.prepare(
    `SELECT folder_id, email FROM km_accounts
     WHERE delete_due_at IS NOT NULL AND delete_due_at <= ? AND deleted IS NULL
     LIMIT ?`
  ).bind(t, DUE_BATCH).all()).results || [];

  const done = [];
  for (const row of rows) {
    // Η ΔΙΕΥΘΥΝΣΗ ΔΙΑΒΑΖΕΤΑΙ ΠΡΙΝ ΤΟ ΣΒΗΣΙΜΟ — το wipeFolder αδειάζει το
    // email στο βήμα (δ). Ιδιος κανόνας με την πόρτα Α πριν το Η.11β.
    const to = row.email ? String(row.email) : null;
    const res = await wipeFolder(env, row.folder_id);
    // Ειδοποίηση, ΟΧΙ επιβεβαίωση: αν το email αποτύχει, η διαγραφή στέκει.
    await mailSend(env, "deleted", to);
    done.push({ folder_id: row.folder_id, wiped: !!res });
  }
  return { due: rows.length, wiped: done.length, batch_limit: DUE_BATCH, more: rows.length === DUE_BATCH };
}

// ── ΠΟΡΤΑ Β + ΚΑΘΑΡΙΣΜΟΣ ΜΗΤΡΩΟΥ — μόνο ο Stavros ─────────────────────────
// Ο GDPR δεν επιτρέπει «διαγραφή μόνο αν έχεις την εφαρμογή»: το αίτημα με
// email στο support ΠΡΕΠΕΙ να μπορεί να εκτελεστεί. Ιδιο μοτίβο με το
// /api/gnomi/apotelesmata: χωρίς μυστικό η διαδρομή ΔΕΝ ΥΠΑΡΧΕΙ (404, όχι
// 403 — δεν μαθαίνει κανείς ότι υπάρχει). Αν το μυστικό δεν έχει οριστεί
// καθόλου στο Cloudflare, κλειδώνει τα πάντα: ασφαλής προεπιλογή.
function adminOk(request, env) {
  const k = new URL(request.url).searchParams.get("k") || request.headers.get("X-Km-Admin") || "";
  return !!env.KM_ADMIN_KEY && k === env.KM_ADMIN_KEY;
}

async function adminDelete(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await safeJson(request)) || {};
  const folderId = (clean(b.folder_id, 64) || "").toLowerCase();
  if (!HEX64.test(folderId)) return json({ ok: false, error: "bad_folder_id" }, 400);
  const res = await wipeFolder(env, folderId);
  if (!res) return json({ ok: false, error: "no_account" }, 404);
  return json({ ok: true, deleted: res });
}

// ΚΑΘΑΡΙΣΜΟΣ ΜΗΤΡΩΟΥ (§3 βήμα 2) — ο ΙΔΙΟΣ μηχανισμός, καμία δεύτερη διαδρομή.
// Ετσι η wipeFolder δοκιμάζεται πάνω σε σκουπίδια ΠΡΙΝ αγγίξει ποτέ πραγματικό
// λογαριασμό.
//
// 🔴 Ο ΦΡΑΓΜΟΣ ΠΟΥ ΠΡΟΣΤΑΤΕΥΕΙ ΤΟΝ ΠΡΑΓΜΑΤΙΚΟ ΛΟΓΑΡΙΑΣΜΟ ΕΙΝΑΙ ΜΗΧΑΝΙΚΟΣ,
// ΟΧΙ «ΠΡΟΣΟΧΗ»: οι δύο άδειοι λογαριασμοί του Stavros έχουν ΤΟ ΙΔΙΟ email με
// τον ζωντανό του (akrisway@gmail.com — καταγεγραμμένο Α300 §1). Ενα φίλτρο
// email θα τους έσβηνε και τους τρεις. Γι' αυτό:
//   - λειτουργία email_like: σβήνει ΜΟΝΟ ό,τι είναι ΑΠΟΔΕΔΕΙΓΜΕΝΑ άδειο —
//     folder_bytes = 0 ΚΑΙ folder_version = 0 ΚΑΙ καμία κλειδαριά. Αυτός
//     είναι ο ορισμός του σκουπιδιού, και ο ζωντανός λογαριασμός δεν τον
//     πληροί ποτέ.
//   - λειτουργία folder_ids: ρητή λίστα, σβήνει ό,τι δοθεί (η Πόρτα Β χύμα).
// Και dry_run ΕΞ ΟΡΙΣΜΟΥ: πρώτα βλέπεις τι θα σβήσει, μετά το ζητάς.
const PURGE_MAX = 200;

async function adminPurge(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await safeJson(request)) || {};
  const dryRun = b.dry_run === false ? false : true;   // ⚠ default: ΔΕΝ σβήνει
  const ids = Array.isArray(b.folder_ids) ? b.folder_ids : null;
  const like = clean(b.email_like, 120);

  let targets = [];
  if (ids) {
    for (const raw of ids.slice(0, PURGE_MAX)) {
      const f = (clean(raw, 64) || "").toLowerCase();
      if (!HEX64.test(f)) return json({ ok: false, error: "bad_folder_id", value: raw }, 400);
      const row = await env.DB.prepare(
        "SELECT folder_id, email, created, source, folder_bytes, folder_version, deleted FROM km_accounts WHERE folder_id = ?"
      ).bind(f).first();
      if (row) targets.push(row);
    }
  } else if (like) {
    // Σκέτο «%» θα σάρωνε ΤΑ ΠΑΝΤΑ. Απαιτούνται 4 πραγματικοί χαρακτήρες.
    if (like.replace(/%/g, "").length < 4) return json({ ok: false, error: "email_like_too_broad" }, 400);
    const r = await env.DB.prepare(
      `SELECT a.folder_id, a.email, a.created, a.source, a.folder_bytes, a.folder_version, a.deleted
         FROM km_accounts a
        WHERE a.email LIKE ?
          AND a.folder_bytes = 0
          AND a.folder_version = 0
          AND NOT EXISTS (SELECT 1 FROM km_locks l WHERE l.folder_id = a.folder_id)
        ORDER BY a.created
        LIMIT ?`
    ).bind(like, PURGE_MAX).all();
    targets = r.results || [];
  } else {
    return json({ ok: false, error: "need_folder_ids_or_email_like" }, 400);
  }

  // Τι ζει πραγματικά στο R2 για καθέναν — το μέγεθος στη D1 μπορεί να λέει 0
  // ενώ το μπλοκ υπάρχει (ακριβώς η περίπτωση των δοκιμαστικών).
  const plan = [];
  for (const t of targets) {
    let objects = 0, bytes = 0, cursor;
    do {
      const page = await env.FOLDERS.list({ prefix: t.folder_id + "/", cursor, limit: 1000 });
      for (const o of page.objects) { objects += 1; bytes += o.size || 0; }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
    plan.push({
      folder_id: t.folder_id, email: t.email, created: t.created, source: t.source,
      db_bytes: t.folder_bytes, db_version: t.folder_version,
      already_deleted: !!t.deleted, r2_objects: objects, r2_bytes: bytes,
    });
  }

  if (dryRun) {
    return json({
      ok: true, dry_run: true, mode: ids ? "folder_ids" : "email_like",
      found: plan.length,
      r2_objects: plan.reduce((n, p) => n + p.r2_objects, 0),
      r2_bytes: plan.reduce((n, p) => n + p.r2_bytes, 0),
      plan: plan,
      note: "Τίποτα ΔΕΝ σβήστηκε. Ξανακάλεσε με dry_run:false για να εκτελεστεί.",
    });
  }

  const done = [];
  for (const p of plan) done.push(await wipeFolder(env, p.folder_id));
  return json({
    ok: true, dry_run: false, mode: ids ? "folder_ids" : "email_like",
    purged: done.length,
    r2_objects: done.reduce((n, d) => n + (d ? d.r2.objects : 0), 0),
    r2_bytes: done.reduce((n, d) => n + (d ? d.r2.bytes : 0), 0),
    deleted: done,
  });
}

// ΤΟ ΟΡΓΑΝΟ ΜΕΤΡΗΣΗΣ — read-only, δεν αλλάζει τίποτα.
// Κανόνας Α400 §Γ (14/8): «μην χτίζεις συλλογή δεδομένων χωρίς τρόπο
// ανάγνωσης». Χωρίς αυτό, ο μόνος τρόπος να δει κανείς ΑΝ η διαγραφή έκανε
// αυτό που λέει θα ήταν... η ίδια η απάντηση της διαγραφής. Δηλαδή δήλωση,
// όχι τεκμήριο (κανόνας 29/8). Εδώ μετριέται η ΒΑΣΗ και το R2, όχι η αναφορά.
async function adminInspect(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await safeJson(request)) || {};
  const folderId = (clean(b.folder_id, 64) || "").toLowerCase();
  if (!HEX64.test(folderId)) return json({ ok: false, error: "bad_folder_id" }, 400);

  const acc = await env.DB.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(folderId).first();
  const n = async (sql) => {
    const r = await env.DB.prepare(sql).bind(folderId).first();
    return (r && r.n) || 0;
  };
  const r2 = { folder: 0, photos: 0, inbox: 0, other: 0, objects: 0, bytes: 0 };
  let cursor;
  do {
    const page = await env.FOLDERS.list({ prefix: folderId + "/", cursor, limit: 1000 });
    for (const o of page.objects) {
      r2.objects += 1; r2.bytes += o.size || 0;
      const rest = o.key.slice(folderId.length + 1);
      if (rest === "folder.bin") r2.folder += 1;
      else if (rest.indexOf("p/") === 0) r2.photos += 1;
      else if (rest.indexOf("inbox/") === 0) r2.inbox += 1;
      else r2.other += 1;
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);

  return json({
    ok: true,
    exists: !!acc,
    account: acc ? {
      email: acc.email, email_empty: acc.email === "" || acc.email === null,
      auth_hash_empty: acc.auth_hash === "" || acc.auth_hash === null,
      deleted: acc.deleted || null,
      created: acc.created, country: acc.country, source: acc.source, ref: acc.ref,
      folder_version: acc.folder_version, folder_bytes: acc.folder_bytes,
      active_device_id: acc.active_device_id, plan: acc.plan || null, has_key: acc.has_key,
    } : null,
    rows: {
      locks: await n("SELECT COUNT(*) AS n FROM km_locks WHERE folder_id = ?"),
      device_links: await n("SELECT COUNT(*) AS n FROM km_device_links WHERE folder_id = ?"),
      devices: await n("SELECT COUNT(*) AS n FROM km_devices WHERE folder_id = ?"),
    },
    r2: r2,
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// «Η ΓΝΩΜΗ ΣΟΥ» — Brief Ε §3 (εγκρίθηκε 11/9/2026, γράφτηκε 14/9/2026)
//
// 🔴 ΤΟ install_id ΕΡΧΕΤΑΙ ΑΛΛΑ ΔΕΝ ΑΠΟΘΗΚΕΥΕΤΑΙ ΠΟΤΕ. Χρησιμεύει μόνο για
//    να βγει το sha256(install_id + ":" + ημερομηνία) του φρένου, που αλλάζει
//    κάθε μέρα και δεν συνδέει τη μια μέρα με την άλλη.
// 🔴 ΚΑΜΙΑ ΩΡΑ, ΚΑΜΙΑ ΗΜΕΡΑ στη γνώμη — μόνο ο μήνας. Δύο γνώμες του ίδιου
//    μήνα δεν μπορούν να μπουν σε σειρά.
// ═══════════════════════════════════════════════════════════════════════════

const FEEDBACK_MAX_PER_DAY = 5;

function dayMinus(dayStr, n) {
  const d = new Date(dayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function escHtml(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function feedback(request, env) {
  const b = (await safeJson(request)) || {};

  const install = clean(b.install_id, 64);
  if (!install) return json({ ok: false, error: "bad_install" }, 400);

  // Βαθμολογία: 1-5 ή τίποτα. Οτιδήποτε άλλο γίνεται τίποτα, δεν ρίχνει την κλήση.
  let stars = parseInt(b.stars, 10);
  if (!(stars >= 1 && stars <= 5)) stars = null;

  const text = (clean(b.text, 2000) || "").trim();
  if (stars === null && !text) return json({ ok: false, error: "empty" }, 400);

  // Email ΜΟΝΟ αν τσεκάρισε «Θέλω απάντηση». Αλλιώς δεν το κοιτάμε καν.
  const wantsReply = b.reply === true || b.reply === 1 || b.reply === "1";
  const email = wantsReply ? normEmail(b.email) : null;
  if (wantsReply && !email) return json({ ok: false, error: "bad_email" }, 400);

  const day = now().slice(0, 10);
  const dh = await sha256hex(install + ":" + day);

  // Ο πίνακας του φρένου καθαρίζεται μόνος του: τίποτα παλαιότερο από 2 μέρες.
  await env.DB.prepare("DELETE FROM km_feedback_rate WHERE day < ?").bind(dayMinus(day, 2)).run();

  const seen = await env.DB.prepare("SELECT n FROM km_feedback_rate WHERE day_hash = ?").bind(dh).first();
  if (seen && seen.n >= FEEDBACK_MAX_PER_DAY) return json({ ok: false, error: "too_many" }, 429);

  await env.DB.prepare(
    "INSERT INTO km_feedback (stars, text, ver, month, country, email) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    stars,
    text || null,
    clean(b.ver, 20),
    day.slice(0, 7),
    (request.cf && request.cf.country) || null,
    email
  ).run();

  await env.DB.prepare(
    "INSERT INTO km_feedback_rate (day_hash, day, n) VALUES (?, ?, 1) " +
    "ON CONFLICT(day_hash) DO UPDATE SET n = n + 1"
  ).bind(dh, day).run();

  return json({ ok: true });
}

// ΑΝΑΓΝΩΣΗ — κανόνας 14/8/2026: δεν μαζεύουμε δεδομένα που δεν μπορούμε να
// διαβάσουμε. Ιδιο μοτίβο με το /api/gnomi/apotelesmata: χωρίς το μυστικό η
// διαδρομή ΔΕΝ ΥΠΑΡΧΕΙ (404, όχι 403).
async function adminFeedback(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });

  const rows = (await env.DB.prepare(
    "SELECT id, stars, text, ver, month, country, email FROM km_feedback ORDER BY id DESC LIMIT 500"
  ).all()).results || [];

  const total = rows.length;
  const rated = rows.filter((r) => r.stars !== null && r.stars !== undefined);
  const avg = rated.length ? (rated.reduce((a, r) => a + r.stars, 0) / rated.length).toFixed(2) : "—";
  const waiting = rows.filter((r) => r.email).length;

  const body = rows.map((r) => (
    "<tr><td>" + r.id +
    "</td><td>" + (r.stars ? "★".repeat(r.stars) : "—") +
    "</td><td>" + escHtml(r.month) +
    "</td><td>" + escHtml(r.country || "—") +
    "</td><td>" + escHtml(r.ver || "—") +
    "</td><td>" + escHtml(r.email || "") +
    "</td><td>" + escHtml(r.text || "") + "</td></tr>"
  )).join("");

  const html =
    "<!doctype html><html lang=\"el\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>Η γνώμη σου — Kostometro</title><style>" +
    "body{background:#0f1115;color:#e6e6e6;font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px}" +
    "h1{font-size:20px;margin:0 0 4px}p.sum{color:#9aa;margin:0 0 20px}" +
    "table{border-collapse:collapse;width:100%;max-width:1100px}" +
    "th,td{border-bottom:1px solid #262a33;padding:8px 10px;text-align:left;vertical-align:top}" +
    "th{color:#9aa;font-weight:600;white-space:nowrap}td:last-child{white-space:pre-wrap}" +
    "</style></head><body><h1>Η γνώμη σου</h1><p class=\"sum\">" +
    total + " μηνύματα · μέση βαθμολογία " + avg + " · " + waiting + " περιμένουν απάντηση</p>" +
    "<table><tr><th>#</th><th>Βαθμός</th><th>Μήνας</th><th>Χώρα</th><th>Έκδοση</th><th>Email</th><th>Κείμενο</th></tr>" +
    body + "</table></body></html>";

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// ΧΡΟΝΟΙ ΤΗΡΗΣΗΣ — αυτόματη διαγραφή (Πολιτική Απορρήτου v2.0 §5)
// Γράφτηκε 14/9/2026. Εγκεκριμένοι χρόνοι, αυτούσιοι από την πολιτική:
//
//   • Γραμμή στατιστικών μετά τη διαγραφή (η ταφόπετρα) ... 36 μήνες
//   • «Η γνώμη σου» ................................... 24 μήνες
//   • Απαντήσεις ερωτηματολογίου /gnomi ............... 24 μήνες
//   • Συμβάντα χωνιού /gnomi .......................... 24 μήνες (ίδιο ρολόι)
//
// ⚠ ΔΕΝ καλύπτονται εδώ, ΕΠΙΤΗΔΕΣ:
//   • Τηλεμετρία και σχόλια FastWrite Desktop (12 μήνες) — ΔΕΝ ζουν σε αυτή
//     τη βάση. Ζουν στον server Hetzner και θέλουν δική τους δουλειά.
//   • Στοιχεία φόρμας Facebook (12 μήνες) — ζουν στο Meta, όχι εδώ.
//   • Email υποστήριξης (24 μήνες) — ζουν στο Gmail, όχι σε κώδικα.
//
// 🔴 ΤΟ ΟΡΙΟ ΑΝΑ ΕΚΤΕΛΕΣΗ ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΤΙΚΟ. Στο δωρεάν πλάνο η
//    προγραμματισμένη εκτέλεση έχει 10 ms CPU. Με όριο, μια μεγάλη ουρά
//    καθαρίζεται σε πολλές μέρες αντί να κόβεται στη μέση.
// ═══════════════════════════════════════════════════════════════════════════

const RETENTION = {
  tombstone_months: 36,
  feedback_months: 24,
  gnomi_months: 24,
};
const CLEANUP_BATCH = 500;

function monthsAgo(n, from) {
  const d = from ? new Date(from) : new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString();
}

// Τι ΘΑ σβηνόταν τώρα — μέτρηση, χωρίς καμία διαγραφή.
async function cleanupCounts(env, nowIso) {
  const tomb  = monthsAgo(RETENTION.tombstone_months, nowIso);
  const fb    = monthsAgo(RETENTION.feedback_months, nowIso).slice(0, 7);
  const gn    = monthsAgo(RETENTION.gnomi_months, nowIso);
  const one = async (sql, arg) => ((await env.DB.prepare(sql).bind(arg).first()) || {}).n || 0;
  return {
    cutoffs: { tombstone: tomb, feedback_month: fb, gnomi: gn },
    tombstones: await one("SELECT COUNT(*) AS n FROM km_accounts WHERE deleted IS NOT NULL AND deleted < ?", tomb),
    feedback:   await one("SELECT COUNT(*) AS n FROM km_feedback WHERE month < ?", fb),
    gnomi_responses: await one("SELECT COUNT(*) AS n FROM gnomi_responses WHERE ts < ?", gn),
    gnomi_events:    await one("SELECT COUNT(*) AS n FROM gnomi_events WHERE ts < ?", gn),
  };
}

// Η ΔΙΑΓΡΑΦΗ. Κάθε πίνακας χωριστά, με όριο γραμμών.
// Το "rowid IN (SELECT ... LIMIT ?)" χρησιμοποιείται επειδή το DELETE ... LIMIT
// ΔΕΝ υπάρχει σε κάθε build της sqlite — αυτό δουλεύει παντού.
export async function kmCleanup(env, nowIso) {
  const tomb = monthsAgo(RETENTION.tombstone_months, nowIso);
  const fb   = monthsAgo(RETENTION.feedback_months, nowIso).slice(0, 7);
  const gn   = monthsAgo(RETENTION.gnomi_months, nowIso);

  const wipe = async (table, where, arg) => {
    const r = await env.DB.prepare(
      "DELETE FROM " + table + " WHERE rowid IN (SELECT rowid FROM " + table +
      " WHERE " + where + " LIMIT ?)"
    ).bind(arg, CLEANUP_BATCH).run();
    return (r && r.meta && r.meta.changes) || 0;
  };

  const done = {
    tombstones:      await wipe("km_accounts", "deleted IS NOT NULL AND deleted < ?", tomb),
    feedback:        await wipe("km_feedback", "month < ?", fb),
    gnomi_responses: await wipe("gnomi_responses", "ts < ?", gn),
    gnomi_events:    await wipe("gnomi_events", "ts < ?", gn),
  };
  done.batch_limit = CLEANUP_BATCH;
  done.more = Object.keys(done).some((k) => k !== "batch_limit" && done[k] === CLEANUP_BATCH);
  return done;
}

// GET  = δείχνει τι θα σβηνόταν, ΔΕΝ σβήνει. POST = σβήνει.
// Ο λόγος που υπάρχει το GET: δεν εμπιστεύεσαι αυτόματη διαγραφή που δεν
// μπορείς να δεις πρώτα.
async function adminCleanup(request, env, doIt) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const nowIso = new URL(request.url).searchParams.get("now") || undefined;
  if (!doIt) return json({ ok: true, mode: "dry-run", would_delete: await cleanupCounts(env, nowIso) });
  const before = await cleanupCounts(env, nowIso);
  const deleted = await kmCleanup(env, nowIso);
  return json({ ok: true, mode: "deleted", before: before, deleted: deleted });
}


async function adminDue(request, env, doIt) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const t = new URL(request.url).searchParams.get("now") || now();
  if (!doIt) {
    const rows = (await env.DB.prepare(
      `SELECT folder_id, delete_requested_at, delete_due_at FROM km_accounts
       WHERE delete_due_at IS NOT NULL AND deleted IS NULL ORDER BY delete_due_at LIMIT 300`
    ).all()).results || [];
    return json({
      ok: true, mode: "dry-run", now: t,
      // Καμία διεύθυνση email εδώ — ο κανόνας της 14/9 ισχύει και στις σελίδες
      // διαχείρισης, όχι μόνο στο αρχείο καταγραφής.
      pending: rows.map((r) => ({
        folder_id: r.folder_id, requested_at: r.delete_requested_at,
        due_at: r.delete_due_at, overdue: r.delete_due_at <= t,
      })),
    });
  }
  return json({ ok: true, mode: "deleted", now: t, result: await kmDeleteDue(env, t) });
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — Brief Β (Stavros, 4/9/2026: «νιώθω τα μάτια μου κλειστά»)
//
// Τι δείχνει, με τα δικά του λόγια:
//   (α) ποιος έκανε εγγραφή (email) και ΑΠΟ ΠΟΥ (source)
//   (β) πρόγραμμα επιβράβευσης         → περιμένει την παράλληλη συνεδρία (16/9)
//   (γ) συστάσεις — ποιος σύστησε ποιον (ref)
//   (δ) αργότερα, συνδρομές ενεργές/αδρανείς (plan — σήμερα όλα NULL = δωρεάν)
//
// 🔴 Η ΑΡΧΗ (6/9/2026): ΒΛΕΠΕΙ ΛΟΓΑΡΙΑΣΜΟ, ΠΟΤΕ ΠΕΡΙΕΧΟΜΕΝΟ. «Τίποτα από τα
//    δεδομένα τους, τα πάντα για τη μεταξύ μας συνεργασία.» Εδώ διαβάζονται
//    ΜΟΝΟ: email, πηγή, σύσταση, ημερομηνίες, χώρα, μέγεθος φακέλου (bytes,
//    όχι τι είναι μέσα), συσκευές. Ο φάκελος είναι κρυπτογραφημένος και δεν
//    ανοίγει — ούτε εδώ, ούτε πουθενά.
//
// Χωρίς KM_ADMIN_KEY η διαδρομή ΔΕΝ ΥΠΑΡΧΕΙ (404) — ίδιο μοτίβο με τις άλλες.
// JSON, όχι HTML: η οθόνη είναι PWA στο /pinakas/ ώστε ο Stavros να τη βλέπει
// από το κινητό, όπως το Kostometro (αίτημα 16/9/2026).
// ═══════════════════════════════════════════════════════════════════════════

/* KM-PK-CALDAY — 25/9/2026 (απόφαση Stavros): τα κουτιά του Πίνακα μετράνε
   ΗΜΕΡΟΛΟΓΙΑΚΕΣ μέρες ΩΡΑ ΚΥΠΡΟΥ. «Σήμερα» = από τα μεσάνυχτα Κύπρου, όχι
   «24 ώρες πίσω» — αυτό έδειχνε «1 σήμερα» για λογαριασμό της χθεσινής
   νύχτας. «7 ημέρες» = σήμερα + 6 προηγούμενες. Η θερινή/χειμερινή ώρα
   (UTC+3/UTC+2) λύνεται από το Intl, όχι από καρφωμένη διαφορά. */
const CY_TZ = "Asia/Nicosia";
const CY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: CY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
function cyDate(iso) { return CY_FMT.format(new Date(iso)); }
function cyShift(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function cyMidnightUtc(ymd) {
  const base = new Date(ymd + "T00:00:00Z").getTime();
  for (let off = -14; off <= 14; off++) {
    const t = base - off * 3600e3;
    if (cyDate(t) === ymd && cyDate(t - 1) !== ymd) return new Date(t).toISOString();
  }
  return new Date(base).toISOString();
}

function daysAgo(n, from) {
  const d = from ? new Date(from) : new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

// ── ΦΙΛΤΡΑ ΤΟΥ ΠΙΝΑΚΑ (16/9/2026) ────────────────────────────────────────
// 🔴 ΚΑΝΟΝΑΣ (Stavros, 16/9): ΣΧΕΔΙΑΖΟΥΜΕ ΓΙΑ ΤΟ ΜΕΓΑΛΟ. Το φιλτράρισμα και
//    η σελιδοποίηση γίνονται ΕΔΩ, στη βάση — ποτέ στην οθόνη. Φίλτρο πάνω σε
//    100 κατεβασμένες γραμμές από 1.240 δείχνει λάθος αριθμό με σιγουριά.
// 🔴 Ο πίνακας γυρίζει ΠΑΝΤΑ accounts_total: πόσοι ΤΑΙΡΙΑΖΟΥΝ στο φίλτρο,
//    όχι πόσοι στάλθηκαν. Χωρίς αυτό η λίστα κόβει σιωπηλά.
function pkNum(v, dflt, lo, hi) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function pkFilters(p) {
  const g = (k, max) => (p.get(k) || "").trim().slice(0, max || 60);
  const from = g("from", 10), to = g("to", 10), q = g("q", 80);
  const src = g("src"), ref = g("ref"), cty = g("cty", 8), st = g("st", 10);
  const w = ["a.deleted IS NULL"], args = [];
  if (from) { w.push("a.created >= ?"); args.push(from + "T00:00:00.000Z"); }
  if (to)   { w.push("a.created <= ?"); args.push(to + "T23:59:59.999Z"); }
  if (q)    { w.push("a.email LIKE ?"); args.push("%" + q + "%"); }
  if (src)  { w.push("a.source = ?"); args.push(src); }
  if (ref)  { w.push("a.ref = ?"); args.push(ref); }
  if (cty)  { w.push("a.country = ?"); args.push(cty); }
  if (st === "data")    w.push("a.folder_version > 0");
  else if (st === "pending") w.push("a.delete_due_at IS NOT NULL");
  else if (st === "paid")    w.push("a.plan IS NOT NULL");
  else if (st === "key")     w.push("a.has_key = 1");
  else if (st === "quiet")   w.push("a.last_sync IS NULL");
  return { where: " WHERE " + w.join(" AND "), args, echo: { from, to, q, src, ref, cty, st } };
}

async function adminPinakas(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const only = (params.get("only") || "").slice(0, 4);
  const nowIso = params.get("now") || now();
  const today = cyDate(nowIso);
  const d1 = cyMidnightUtc(today), d7 = cyMidnightUtc(cyShift(today, -6)), d30 = cyMidnightUtc(cyShift(today, -29));
  const one = async (sql, ...args) => ((await env.DB.prepare(sql).bind(...args).first()) || {});
  const all = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];

  // ── Γρήγορες έξοδοι: «δείξε μου κι άλλους» ───────────────────────────
  // Το κουμπί «κι άλλους» ΔΕΝ ξαναϋπολογίζει σύνολα και ΔΕΝ ξαναρωτάει τον
  // Hetzner. Στα 1000+ μέλη αυτή η διαφορά είναι μισό δευτερόλεπτο ανά πάτημα.
  if (only === "km") {
    const pg = await kmAccounts(all, one, params);
    /* Δ3 · ο σελιδοδείκτης αντικατέστησε το off. Το accounts_total είναι
       null σε «κι άλλους»: η οθόνη κρατάει αυτό που ήδη μέτρησε. */
    return json({ ok: true, at: nowIso, accounts: pg.rows, accounts_total: pg.total,
                  next: pg.next, n: pg.n, filters: pg.filters });
  }
  if (only === "fw") {
    return json({ ok: true, at: nowIso, fastwrite: await fetchFastWrite(env, params, true) });
  }

  // ── Σύνολα ────────────────────────────────────────────────────────────
  const tot = await one(
    `SELECT COUNT(*) AS all_rows,
            SUM(CASE WHEN deleted IS NULL THEN 1 ELSE 0 END) AS live,
            SUM(CASE WHEN deleted IS NOT NULL THEN 1 ELSE 0 END) AS tombstones,
            SUM(CASE WHEN deleted IS NULL AND delete_due_at IS NOT NULL THEN 1 ELSE 0 END) AS pending_delete,
            SUM(CASE WHEN deleted IS NULL AND created >= ? THEN 1 ELSE 0 END) AS new_1d,
            SUM(CASE WHEN deleted IS NULL AND created >= ? THEN 1 ELSE 0 END) AS new_7d,
            SUM(CASE WHEN deleted IS NULL AND created >= ? THEN 1 ELSE 0 END) AS new_30d,
            SUM(CASE WHEN deleted IS NULL AND last_sync >= ? THEN 1 ELSE 0 END) AS active_7d,
            SUM(CASE WHEN deleted IS NULL AND last_sync >= ? THEN 1 ELSE 0 END) AS active_30d,
            SUM(CASE WHEN deleted IS NULL AND folder_version > 0 THEN 1 ELSE 0 END) AS with_data,
            SUM(CASE WHEN deleted IS NULL THEN folder_bytes ELSE 0 END) AS bytes,
            SUM(CASE WHEN deleted IS NULL AND has_key = 1 THEN 1 ELSE 0 END) AS with_gemini_key,
            SUM(CASE WHEN deleted IS NULL AND plan IS NOT NULL THEN 1 ELSE 0 END) AS paid
     FROM km_accounts`, d1, d7, d30, d7, d30);

  // ── (α) ΑΠΟ ΠΟΥ ───────────────────────────────────────────────────────
  const bySource = await all(
    `SELECT COALESCE(source, '(άγνωστη)') AS source, COUNT(*) AS n
     FROM km_accounts WHERE deleted IS NULL GROUP BY source ORDER BY n DESC`);

  // ── (γ) ΠΟΙΟΣ ΣΥΣΤΗΣΕ ΠΟΙΟΝ ───────────────────────────────────────────
  const byRef = await all(
    `SELECT ref, COUNT(*) AS n FROM km_accounts
     WHERE deleted IS NULL AND ref IS NOT NULL AND ref <> '' GROUP BY ref ORDER BY n DESC LIMIT 50`);

  // ── ανά ημέρα, 30 ημέρες ──────────────────────────────────────────────
  /* KM-PK-CALDAY — ανά ΩΡΑ από τη βάση (το πολύ 720 γραμμές, όσοι κι αν
     γραφτούν), ανά ΜΕΡΑ ΚΥΠΡΟΥ εδώ. Η Κύπρος έχει ακέραιη διαφορά ωρών, άρα η
     ώρα UTC πέφτει ολόκληρη σε μία μέρα Κύπρου. Μετράει ΟΛΕΣ τις εγγραφές και
     χωριστά όσες διαγράφηκαν μετά (gone) — τα δύο σύνολα λένε την ίδια αλήθεια. */
  const perHour = await all(
    `SELECT substr(created, 1, 13) AS h, COUNT(*) AS n,
            SUM(CASE WHEN deleted IS NOT NULL THEN 1 ELSE 0 END) AS gone
     FROM km_accounts WHERE created >= ? GROUP BY h`, d30);
  const perDay = [], dayIdx = {};
  for (let i = 29; i >= 0; i--) { const day = cyShift(today, -i); dayIdx[day] = perDay.length; perDay.push({ day, n: 0, gone: 0 }); }
  for (const r of perHour) {
    const k = dayIdx[cyDate(r.h + ":00:00Z")];
    if (k === undefined) continue;
    perDay[k].n += Number(r.n) || 0; perDay[k].gone += Number(r.gone) || 0;
  }

  // ── χώρες ─────────────────────────────────────────────────────────────
  const byCountry = await all(
    `SELECT COALESCE(country, '?') AS country, COUNT(*) AS n
     FROM km_accounts WHERE deleted IS NULL GROUP BY country ORDER BY n DESC LIMIT 20`);

  // ── συσκευές ──────────────────────────────────────────────────────────
  const dev = await one(
    `SELECT COUNT(*) AS links,
            COUNT(DISTINCT install_id) AS distinct_devices,
            SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) AS seen_7d,
            SUM(CASE WHEN unsynced > 0 THEN 1 ELSE 0 END) AS with_unsynced
     FROM km_device_links`, d7);

  // ── εκκρεμείς διαγραφές (Η.11β) — μόνο ημερομηνίες, ΟΧΙ email ─────────
  const pending = await all(
    `SELECT substr(folder_id, 1, 8) AS folder, delete_requested_at, delete_due_at
     FROM km_accounts WHERE deleted IS NULL AND delete_due_at IS NOT NULL ORDER BY delete_due_at`);

  // ── email + γνώμες ────────────────────────────────────────────────────
  const mail = await one(
    `SELECT COUNT(*) AS sent, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed
     FROM km_mail_log WHERE at >= ?`, d30);
  const fb = await one(
    `SELECT COUNT(*) AS n, AVG(stars) AS avg_stars,
            SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) AS want_reply
     FROM km_feedback`);

  // ── (α) Η ΛΙΣΤΑ — ποιος, από πού, πότε, τελευταία δραστηριότητα ───────
  // Το email ΕΙΝΑΙ δεδομένο συνεργασίας (Brief Β (α)): ο Stavros πρέπει να
  // βλέπει ποιος γράφτηκε. Οι ταφόπετρες έχουν κενό email και δεν μπαίνουν.
  const list = await kmAccounts(all, one, params);

  // ── FastWrite Desktop (Hetzner) — ο Worker ρωτά ο ίδιος τον server ──────
  // Το κλειδί ΔΕΝ φεύγει ποτέ προς τον browser σε νέο σημείο: ο Worker το
  // στέλνει server-to-server στο /api/admin/pinakas του Flask (main_api.py).
  // Αν ο Hetzner δεν απαντήσει, ο πίνακας ΔΕΝ πέφτει — γυρίζει error string.
  const fastwrite = await fetchFastWrite(env, params);

  return json({
    ok: true,
    at: nowIso,
    today: today,
    fastwrite,
    totals: {
      live: tot.live || 0, tombstones: tot.tombstones || 0, pending_delete: tot.pending_delete || 0,
      new_1d: tot.new_1d || 0, new_7d: tot.new_7d || 0, new_30d: tot.new_30d || 0,
      active_7d: tot.active_7d || 0, active_30d: tot.active_30d || 0,
      with_data: tot.with_data || 0, bytes: tot.bytes || 0,
      with_gemini_key: tot.with_gemini_key || 0, paid: tot.paid || 0,
    },
    by_source: bySource, by_ref: byRef, per_day: perDay, by_country: byCountry,
    devices: { links: dev.links || 0, distinct: dev.distinct_devices || 0, seen_7d: dev.seen_7d || 0, with_unsynced: dev.with_unsynced || 0 },
    pending_deletions: pending,
    mail_30d: { sent: mail.sent || 0, ok: mail.ok || 0, failed: mail.failed || 0 },
    feedback: { n: fb.n || 0, avg_stars: fb.avg_stars ? Number(fb.avg_stars).toFixed(2) : null, want_reply: fb.want_reply || 0 },
    accounts: list.rows,
    accounts_total: list.total,
    next: list.next, n: list.n, filters: list.filters,
    options: {
      sources: bySource.map((r) => r.source),
      refs: byRef.map((r) => r.ref),
      countries: byCountry.map((r) => r.country),
    },
    // (β) και (δ): θέσεις κρατημένες, τίποτα ακόμα — λέγεται ρητά, όχι σιωπηλά
    rewards: { status: "pending_parallel_session", note: "Πρόγραμμα επιβράβευσης — παράλληλη συνεδρία σε εξέλιξη (16/9)" },
    subscriptions: { status: "later", paid: tot.paid || 0 },
  });
}

/* ══ Η ΛΙΣΤΑ ΛΟΓΑΡΙΑΣΜΩΝ — ΣΕΛΙΔΟΠΟΙΗΣΗ ΚΑΤΑ ΚΛΕΙΔΙ (Δ3, 19/9/2026) ══════
   ΓΙΑΤΙ ΕΦΥΓΕ ΤΟ OFFSET: το «LIMIT 100 OFFSET 20000» δεν πηδάει — ΣΑΡΩΝΕΙ
   20.100 γραμμές και πετάει τις 20.000. Η 200ή σελίδα κοστίζει 200 φορές
   όσο η πρώτη. ΣΧΕΔΙΑΖΟΥΜΕ ΓΙΑ ΤΟ ΜΕΓΑΛΟ (Α400 §Δ): με τη διανομή στους
   73 leads και μετά, ο πίνακας δεν επιτρέπεται να γονατίζει στο βάθος.

   🔴 ΤΟ ΔΕΥΤΕΡΟ ΣΚΕΛΟΣ ΕΙΝΑΙ ΥΠΟΧΡΕΩΤΙΚΟ. Με σκέτο `created`, δύο εγγραφές
   του ίδιου χιλιοστού στο σύνορο σελίδας είτε χάνονται είτε διπλασιάζονται.
   ⚠ ΚΑΙ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΕΙΝΑΙ ΤΟ folder_id: παράγεται από τις 12 λέξεις του
   χρήστη, ο πίνακας το κόβει επίτηδες σε 8 χαρακτήρες, και υπάρχει τεστ που
   απαγορεύει το πλήρες στο JSON. Σελιδοδείκτης με folder_id θα το έστελνε
   στον browser σε κάθε «Κι άλλους».
   ✅ Άρα: `rowid`. Διαρρέει μόνο σειρά εισαγωγής. Και το SQLite βάζει ΗΔΗ
   το rowid ως τελικό σκέλος κάθε εγγραφής δείκτη — ο υπάρχων
   idx_km_accounts_live_created (deleted, created) δίνει ακριβώς τη σειρά
   (deleted, created, rowid). ΚΑΝΕΝΑΣ νέος δείκτης, καμία μετάβαση.

   ΤΟ ΤΙΜΗΜΑ, ΔΕΚΤΟ: δεν υπάρχει «πήγαινε στη σελίδα 7» — μόνο μπροστά.
   Ο πίνακας έτσι δούλευε ήδη («Κι άλλους»), άρα δεν χάνεται τίποτα.
   ΤΟ ΣΥΝΟΛΟ μετριέται ΜΙΑ φορά ανά αλλαγή φίλτρου: το COUNT(*) είναι το
   ακριβό μέρος και δεν αλλάζει όσο κυλάμε. Χωρίς σελιδοδείκτη = νέο φίλτρο
   = ξαναμετράμε· με σελιδοδείκτη γυρίζει total: null και η οθόνη κρατάει
   αυτό που ήδη ξέρει. */
async function kmAccounts(all, one, params) {
  const f = pkFilters(params);
  const n = pkNum(params.get("n"), 100, 1, 500);
  const ac = String(params.get("ac") || "").slice(0, 30);   // created του τελευταίου
  const ar = pkNum(params.get("ar"), 0, 0, 1e15);           // rowid του τελευταίου
  const more = !!ac;

  const w = f.where ? f.where + " AND " : " WHERE ";
  const seek = more ? `${w}(a.created < ? OR (a.created = ? AND a.rowid < ?))` : f.where;
  const seekArgs = more ? [...f.args, ac, ac, ar] : [...f.args];

  /* Το σύνολο ΜΟΝΟ στην πρώτη σελίδα — βλ. σχόλιο πιο πάνω. */
  const t = more ? null : await one(`SELECT COUNT(*) AS n FROM km_accounts a${f.where}`, ...f.args);

  const rows = await all(
    `SELECT a.rowid AS rid, a.email, a.created, a.country, a.source, a.ref, a.last_sync,
            a.folder_version, a.folder_bytes, a.has_key, a.plan,
            a.delete_due_at, substr(a.folder_id, 1, 8) AS folder,
            (SELECT COUNT(*) FROM km_device_links l WHERE l.folder_id = a.folder_id) AS devices
     FROM km_accounts a${seek} ORDER BY a.created DESC, a.rowid DESC LIMIT ?`,
    ...seekArgs, n);

  /* Ο σελιδοδείκτης της ΤΕΛΕΥΤΑΙΑΣ γραμμής. null όταν δεν υπάρχει συνέχεια:
     η οθόνη κρύβει το «Κι άλλους» χωρίς δεύτερη κλήση για να το μάθει. */
  const last = rows.length ? rows[rows.length - 1] : null;
  const next = (last && rows.length === n) ? { c: last.created, r: last.rid } : null;

  /* 🔴 Το rowid ΔΕΝ φεύγει μέσα στις γραμμές — μόνο μία φορά, στο next.
     Δεν είναι μυστικό, αλλά δεν έχει καμία δουλειά σε κάθε γραμμή. */
  for (const r of rows) { delete r.rid; }

  return { rows, total: t ? t.n : null, n, next, filters: f.echo };
}

// 🔴 ΜΑΘΗΜΑ 16/9 (πέμπτο, το ακριβότερο): είχα καρφώσει το
//    api.fastwrite.tech επειδή έτσι έλεγε μια παλιά σημείωση. ΔΕΝ ΥΠΑΡΧΕΙ —
//    μετρήθηκε: /health εκεί δίνει 404, ενώ στο fastwrite.duckdns.org δίνει
//    {"status":"healthy"}. Στον κώδικα το api.fastwrite.tech υπάρχει μόνο ως
//    προεπιλογή του DEMO_SERVER_URL, δηλαδή σαν πρόθεση, όχι σαν υποδομή.
//    Τώρα η διεύθυνση είναι ΡΥΘΜΙΣΗ, όχι σταθερά: όταν στηθεί το δικό μας
//    domain, αλλάζει η μεταβλητή FW_ORIGIN στο Cloudflare — κανένα deploy.
const FW_ORIGIN_DEFAULT = "https://fastwrite.duckdns.org";
const FW_PINAKAS_PATH = "/api/admin/pinakas";
const FW_TIMEOUT_MS = 4000;

function fwOrigin(env) {
  const o = String((env && env.FW_ORIGIN) || FW_ORIGIN_DEFAULT).trim();
  return o.replace(/\/+$/, "");
}

// Τα φίλτρα του FastWrite ταξιδεύουν με πρόθεμα f (ffrom, fto, fq, fplan,
// fst, foff, fn) ώστε να μην μπλέκονται με του Kostometro στην ίδια κλήση.
function fwQuery(params, only) {
  const out = new URLSearchParams();
  const map = { ffrom: "from", fto: "to", fq: "q", fplan: "plan", fst: "st", foff: "off", fn: "n" };
  for (const k in map) {
    const v = (params && params.get(k)) || "";
    if (v) out.set(map[k], String(v).slice(0, 80));
  }
  if (only) out.set("only", "accounts");
  const s = out.toString();
  return s ? "?" + s : "";
}

async function fetchFastWrite(env, params, onlyAccounts) {
  const key = env.KM_ADMIN_KEY || "";
  if (!key) return { ok: false, error: "no_key" };
  try {
    const r = await fetch(fwOrigin(env) + FW_PINAKAS_PATH + fwQuery(params, onlyAccounts), {
      headers: { "X-Km-Admin": key, "Accept": "application/json" },
      signal: AbortSignal.timeout(FW_TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, error: "http_" + r.status };
    const data = await r.json();
    if (!data || data.ok !== true) return { ok: false, error: "bad_body" };
    return data;
  } catch (e) {
    return { ok: false, error: String((e && e.name) || e).slice(0, 60) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ΕΙΔΟΠΟΙΗΣΕΙΣ ΜΕ EMAIL — Brief Ε §6 (εγκρίθηκε 11/9/2026, γράφτηκε 14/9/2026)
//
// Δύο γεγονότα, κανένα άλλο: διαγραφή λογαριασμού · αλλαγή των 12 λέξεων.
//
// 🔴 Ο ΚΑΝΟΝΑΣ ΠΟΥ ΔΙΕΠΕΙ ΤΑ ΠΑΝΤΑ ΕΔΩ: «ΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΕΠΙΒΕΒΑΙΩΣΗ».
//    Η πράξη γίνεται ούτως ή άλλως. Ενα email που δεν έφυγε ΔΕΝ επιτρέπεται
//    να κρατήσει όμηρη τη διαγραφή ενός λογαριασμού. Γι' αυτό τίποτα εδώ δεν
//    πετάει ποτέ σφάλμα προς τα έξω.
//
// 🔴 ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΠΕΡΙΕΧΕΙ ΠΟΤΕ λέξεις, κλειδιά ή συνδέσμους ενέργειας.
//    Μόνο πληροφορία και η διεύθυνση υποστήριξης (Brief Ε §6, κλειστό 8/9).
//
// ⚠ ΑΠΟΣΤΟΛΕΑΣ: `noreply@notify.fastwrite.tech`, ΟΧΙ το apex. Απόφαση 14/9,
//    διόρθωση του Brief Ε §6: το Email Sending προσθέτει MX/SPF/DKIM/DMARC,
//    και στο apex θα συγκρούονταν με το Google Workspace του support@.
//    Στον υποτομέα δεν αγγίζει τίποτα.
//
// ⚠ ΤΟ Reply-To ΔΕΝ ΜΠΑΙΝΕΙ ΑΚΟΜΑ. Το τεκμηριωμένο παράδειγμα της Cloudflare
//    δέχεται { to, from, subject, html, text } και ΔΕΝ αναφέρει πεδίο
//    απάντησης. Δεν στέλνω άγνωστο πεδίο σε πρώτη αποστολή. Η διεύθυνση
//    υποστήριξης υπάρχει ΜΕΣΑ στο κείμενο, οπότε ο χρήστης δεν μένει χωρίς
//    δρόμο. Κλείνει μόλις επαληθευτεί η πρώτη πραγματική αποστολή.
// ═══════════════════════════════════════════════════════════════════════════

const MAIL_FROM = "FastWrite <noreply@notify.fastwrite.tech>";
const MAIL_SUPPORT = "support@fastwrite.tech";
// Η.11β: η σελίδα ακύρωσης. ΔΕΝ είναι σύνδεσμος ενέργειας — δεν κουβαλάει
// 🔴 ΕΞΩ από το /kostometro/ ΕΠΙΤΗΔΕΣ (15/9/2026): μέσα εκεί την έκλεβε ο
// service worker της εφαρμογής και σέρβιρε την εφαρμογή στη θέση της.
// κλειδί, δεν αναγνωρίζει τον χρήστη. Ζητάει τις 12 λέξεις, που ο κλέφτης
// δεν έχει. Γι\u0027 αυτό επιτρέπεται να υπάρχει μέσα στο email.
const CANCEL_PAGE = "fastwrite.tech/akyrosi";

// Η.11β: δέχεται ISO για μελλοντική ώρα (η λήξη των 72 ωρών). Χωρίς όρισμα
// = τώρα, όπως πριν.
function mailWhen(iso) {
  const d = iso ? new Date(iso) : new Date();
  try {
    return new Intl.DateTimeFormat("el-GR", {
      timeZone: "Asia/Nicosia", dateStyle: "short", timeStyle: "short",
    }).format(d);
  } catch (e) {
    // Αν το Intl δεν έχει ζώνες, καλύτερα ώρα UTC παρά λάθος ώρα Κύπρου.
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

function mailBody(kind, extra) {
  const when = mailWhen();
  const x = extra || {};

  // Η.11β — ΖΗΤΗΘΗΚΕ. Το μόνο email με ΠΡΑΞΗ μέσα του, και η πράξη ΔΕΝ είναι
  // σύνδεσμος: είναι διεύθυνση σελίδας + οι 12 λέξεις. Ο λόγος, γραμμένος
  // ώστε να μην «απλοποιηθεί» ποτέ σε κουμπί: ο σύνδεσμος ζει ΜΕΣΑ στο email,
  // και το email ζει μέσα στο ίδιο κινητό που κρατάει ο κλέφτης. Οι 12 λέξεις
  // είναι το μόνο πράγμα που ο κλέφτης δεν έχει.
  if (kind === "delete_requested") {
    const due = mailWhen(x.due);
    return {
      subject: "Ζητήθηκε διαγραφή του λογαριασμού σου στο Kostometro · Kostometro account deletion requested",
      el: "Ζητήθηκε η διαγραφή του λογαριασμού σου στο Kostometro στις " + when + "." +
          " Ο λογαριασμός είναι ήδη παγωμένος και θα διαγραφεί οριστικά στις " + due + " (ώρα Κύπρου)." +
          " ΑΝ ΔΕΝ ΗΣΟΥΝ ΕΣΥ, κάποιος έχει πρόσβαση στο κινητό σου. Μπορείς να το σταματήσεις:" +
          " άνοιξε τη σελίδα " + CANCEL_PAGE + " από οποιαδήποτε συσκευή και βάλε τις 12 λέξεις σου." +
          " Χρειάζεσαι βοήθεια; " + MAIL_SUPPORT,
      en: "Deletion of your Kostometro account was requested on " + when + "." +
          " The account is already frozen and will be permanently deleted on " + due + " (Cyprus time)." +
          " IF THIS WAS NOT YOU, someone has access to your phone. You can stop it:" +
          " open " + CANCEL_PAGE + " on any device and enter your 12 words." +
          " Need help? " + MAIL_SUPPORT,
    };
  }

  // Η.11β — ΑΚΥΡΩΘΗΚΕ. Λέει ρητά την επόμενη πράξη, γιατί η ακύρωση από μόνη
  // της ΔΕΝ διώχνει τον κλέφτη: κρατάει το ίδιο auth στο κλεμμένο κινητό.
  if (kind === "delete_cancelled") {
    return {
      subject: "Η διαγραφή του λογαριασμού σου ακυρώθηκε · Account deletion cancelled",
      el: "Η διαγραφή του λογαριασμού σου στο Kostometro ακυρώθηκε στις " + when + " με τις 12 λέξεις σου." +
          " Ο λογαριασμός λειτουργεί κανονικά και ενεργή είναι μόνο η συσκευή από την οποία έγινε η ακύρωση." +
          " ΑΝ Η ΠΡΟΗΓΟΥΜΕΝΗ ΣΥΣΚΕΥΗ ΣΟΥ ΕΧΕΙ ΧΑΘΕΙ Ή ΚΛΑΠΕΙ, άλλαξε ΤΩΡΑ τις 12 λέξεις σου" +
          " από τις Ρυθμίσεις — μέχρι τότε εκείνη η συσκευή μπορεί να ξαναπροσπαθήσει." +
          " Χρειάζεσαι βοήθεια; " + MAIL_SUPPORT,
      en: "Deletion of your Kostometro account was cancelled on " + when + " using your 12 words." +
          " The account works normally and only the device that cancelled is active." +
          " IF YOUR PREVIOUS DEVICE IS LOST OR STOLEN, change your 12 words NOW in Settings —" +
          " until then that device can try again." +
          " Need help? " + MAIL_SUPPORT,
    };
  }

  // Brief ΣΤ · ο κωδικός επιβεβαίωσης. Κανένας σύνδεσμος: μόνο τα 6 ψηφία.
  if (kind === "code") {
    return {
      subject: "Ο κωδικός σου για το Kostometro: " + x.code + " · Your Kostometro code",
      el: "Ο κωδικός σου για το Kostometro είναι: " + x.code + "." +
          " Γράψ' τον στην εφαρμογή μέσα σε 15 λεπτά." +
          " Αν δεν ζήτησες εσύ εγγραφή, αγνόησε αυτό το μήνυμα — δεν γίνεται τίποτα χωρίς τον κωδικό.",
      en: "Your Kostometro code is: " + x.code + "." +
          " Enter it in the app within 15 minutes." +
          " If you did not try to sign up, ignore this message — nothing happens without the code.",
    };
  }

  if (kind === "deleted") {
    return {
      subject: "Ο λογαριασμός σου στο Kostometro διαγράφηκε · Your Kostometro account was deleted",
      el: "Ο λογαριασμός σου στο Kostometro διαγράφηκε οριστικά στις " + when + "." +
          " Τα δεδομένα στον server σβήστηκαν και δεν ανακτώνται. Οι 12 λέξεις σου δεν ξαναδουλεύουν." +
          " Αν δεν το ζήτησες εσύ και δεν πρόλαβες να το σταματήσεις, γράψε στο " + MAIL_SUPPORT + ".",
      en: "Your Kostometro account was permanently deleted on " + when + " (Cyprus time)." +
          " The data on the server is erased and cannot be recovered. Your 12 words no longer work." +
          " If you did not request this and could not stop it in time, write to " + MAIL_SUPPORT + ".",
    };
  }

  return {
    subject: "Οι 12 λέξεις σου άλλαξαν · Your 12 words were changed",
    el: "Οι 12 λέξεις του λογαριασμού σου άλλαξαν στις " + when + "." +
        " Αν δεν ήσουν εσύ, γράψε αμέσως στο " + MAIL_SUPPORT + ".",
    en: "The 12 words of your account were changed on " + when + " (Cyprus time)." +
        " If this was not you, write to " + MAIL_SUPPORT + " immediately.",
  };
}

// Η ΜΟΝΗ συνάρτηση που μιλάει με τη Cloudflare. Δεν πετάει ποτέ.
export async function mailSend(env, kind, to, extra) {
  const t = now();
  const log = async (ok, err, msgId) => {
    try {
      await env.DB.prepare(
        "INSERT INTO km_mail_log (kind, ok, err, msg_id, at) VALUES (?, ?, ?, ?, ?)"
      ).bind(kind, ok ? 1 : 0, err || null, msgId || null, t).run();
    } catch (e) { /* ούτε η καταγραφή επιτρέπεται να ρίξει την πράξη */ }
    return !!ok;   // Brief ΣΤ: ο κωδικός email χρειάζεται να ξέρει αν έφυγε
  };

  const dest = normEmail(to);
  if (!dest) return log(false, "no_address");
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") return log(false, "no_binding");

  const b = mailBody(kind, extra);
  try {
    const r = await env.EMAIL.send({
      to: dest,
      from: MAIL_FROM,
      subject: b.subject,
      text: b.el + "\n\n---\n\n" + b.en,
      html: "<p>" + escHtml(b.el) + "</p><hr><p>" + escHtml(b.en) + "</p>",
    });
    return log(true, null, r && r.messageId ? String(r.messageId) : null);
  } catch (e) {
    return log(false, String((e && e.message) || e).slice(0, 300));
  }
}

// Στην παραγωγή δεν καθυστερεί την απάντηση· στα τεστ τρέχει συγχρονισμένα.
function fireMail(env, ctx, kind, to, extra) {
  const p = mailSend(env, kind, to, extra);
  if (ctx && typeof ctx.waitUntil === "function") { ctx.waitUntil(p); return null; }
  return p;
}

// ΑΝΑΓΝΩΣΗ — κανόνας 14/8: δεν μαζεύουμε ό,τι δεν μπορούμε να διαβάσουμε.
async function adminMail(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const rows = (await env.DB.prepare(
    "SELECT id, kind, ok, err, msg_id, at FROM km_mail_log ORDER BY id DESC LIMIT 300"
  ).all()).results || [];
  const bad = rows.filter((r) => !r.ok).length;
  const body = rows.map((r) => (
    "<tr><td>" + r.id + "</td><td>" + escHtml(r.at) + "</td><td>" + escHtml(r.kind) +
    "</td><td>" + (r.ok ? "✅" : "🔴") + "</td><td>" + escHtml(r.err || "") +
    "</td><td>" + escHtml(r.msg_id || "") + "</td></tr>"
  )).join("");
  const html =
    "<!doctype html><html lang=\"el\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>Ειδοποιήσεις — Kostometro</title><style>" +
    "body{background:#0f1115;color:#e6e6e6;font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px}" +
    "h1{font-size:20px;margin:0 0 4px}p.sum{color:#9aa;margin:0 0 20px}" +
    "table{border-collapse:collapse;width:100%;max-width:1000px}" +
    "th,td{border-bottom:1px solid #262a33;padding:8px 10px;text-align:left}" +
    "th{color:#9aa;font-weight:600;white-space:nowrap}" +
    "</style></head><body><h1>Ειδοποιήσεις</h1><p class=\"sum\">" +
    rows.length + " αποστολές · <strong>" + bad + " απέτυχαν</strong> · " +
    "καμία διεύθυνση παραλήπτη δεν αποθηκεύεται</p>" +
    "<table><tr><th>#</th><th>Πότε</th><th>Τι</th><th>Ok</th><th>Σφάλμα</th><th>messageId</th></tr>" +
    body + "</table></body></html>";
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// KM-LEADS · ΛΙΣΤΑ LEADS ΚΑΙ ΑΠΟΣΤΟΛΗ (26/9/2026) — η πρώτη διανομή στους leads
//
// Σχήμα: schema/km_leads.sql. Τρεις διαδρομές:
//   POST /api/km/admin/leads/import  -> εισαγωγή από το CSV της Meta (admin)
//   POST /api/km/admin/leads/send    -> αποστολή εκστρατείας (admin, dry_run εξ ορισμού)
//   GET|POST /api/km/lista?t=<token> -> η σελίδα «μένω / φεύγω» του συνδέσμου στο email
//
// 🔴 ΤΡΙΑ ΠΟΥ ΔΕΝ ΣΠΑΝΕ:
//  (1) Ο διαγραμμένος ΔΕΝ ξαναμπαίνει ποτέ: η εισαγωγή δεν αγγίζει unsub_at.
//  (2) Κανείς δεν παίρνει δύο φορές την ίδια εκστρατεία (km_lead_sends, PK email+campaign).
//  (3) Το GET της σελίδας ΔΕΝ διαγράφει. Τα φίλτρα ασφαλείας των email ανοίγουν
//      τους συνδέσμους αυτόματα — αν το GET διέγραφε, θα έσβηνε όλη η λίστα μόνη της.
//      Η διαγραφή γίνεται ΜΟΝΟ με το κουμπί (POST).
// ═══════════════════════════════════════════════════════════════════════════
const LEAD_FROM = "Kostometro <noreply@notify.fastwrite.tech>";
const LEAD_SITE = "https://fastwrite.tech";
const LEAD_IMPORT_MAX = 2000;
const LEAD_SEND_MAX = 40;          // ανά κλήση: μένουμε μακριά από το όριο υποαιτημάτων του Worker

function leadToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((x) => x.toString(16).padStart(2, "0")).join("");
}
// Από το «Γιώργος Παπαδόπουλος» κρατάμε «Γιώργος». Σκουπίδια → κανένα όνομα.
function leadFirstName(n) {
  const s = String(n || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}][\p{L}'’.-]{0,39}$/u.test(s) ? s : "";
}

async function adminLeadsImport(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await safeJson(request)) || {};
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, LEAD_IMPORT_MAX) : [];
  const source = (clean(b.source, 30) || "fb-form").replace(/[^a-z0-9:_-]/gi, "") || "fb-form";
  const t = now();
  let inserted = 0, known = 0;
  const invalid = [];
  for (const r of rows) {
    const email = normEmail(r && r.email);
    if (!email) { invalid.push(clean(r && r.email, 80)); continue; }
    const c = clean(r.consent_at, 40);
    const consent = c && !isNaN(Date.parse(c)) ? new Date(c).toISOString() : t;
    const name = clean(r.name, 80);
    const res = await env.DB.prepare(
      `INSERT INTO km_leads (email, name, source, consent_at, imported_at, token)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`
    ).bind(email, name, source, consent, t, leadToken()).run();
    if (res && res.meta && res.meta.changes) inserted++; else known++;
  }
  return json({ ok: true, received: rows.length, inserted, known, invalid });
}

// Το κείμενο εγκρίθηκε από τον Stavros 26/9/2026 (Α250). Κάθε αλλαγή = νέα εκστρατεία.
function leadMail(campaign, lead) {
  if (campaign !== "dianomi-1") return null;
  const fn = leadFirstName(lead.name);
  const hi = fn ? "Γεια σου " + fn + "," : "Γεια σου,";
  const app = LEAD_SITE + "/kostometro/?src=leads";
  const key = LEAD_SITE + "/kostometro/kleidi/";
  const out = LEAD_SITE + "/api/km/lista?t=" + lead.token;
  const pol = LEAD_SITE + "/legal/privacy.html";
  const H = (s) => '<h2 style="font-size:17px;margin:26px 0 8px;color:#0a0e14">' + s + "</h2>";
  const P = (s) => '<p style="margin:0 0 12px">' + s + "</p>";
  const L = (items) => '<ul style="margin:0 0 12px;padding-left:20px">' + items.map((i) => '<li style="margin:0 0 6px">' + i + "</li>").join("") + "</ul>";
  const A = (u, t) => '<a href="' + u + '" style="color:#00996b;font-weight:600">' + t + "</a>";
  const html = '<!doctype html><html lang="el"><body style="margin:0;padding:0;background:#f4f5f7">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1f29">' +
    P(escHtml(hi)) +
    P("Άφησες το email σου στο Facebook για να είσαι από τους πρώτους. Κρατάμε την υπόσχεση, και θέλουμε να ξέρεις ακριβώς πού βρίσκεσαι.") +
    P("<b>Αυτό που σου δίνουμε σήμερα είναι το πρώτο βήμα, όχι το τελικό προϊόν.</b> Σήμερα βλέπεις πόσο πλήρωσες συνολικά σε κάθε προμηθευτή. Το τελικό θα σου δείχνει <b>πόσο πληρώνεις για κάθε κωδικό ξεχωριστά</b>, και θα σου το λέει <b>τη στιγμή της παραλαβής, πριν υπογράψεις το δελτίο</b>, όχι σε αναφορά την επόμενη μέρα. Όσοι χρησιμοποιούν το πρώτο βήμα τώρα, το σχεδιάζουν μαζί μας και <b>θα το πάρουν πρώτοι</b>.") +
    H("Το πρώτο βήμα: Kostometro") +
    P("Δωρεάν, για το κινητό. Φωτογραφίζεις το τιμολόγιο τη στιγμή που παραλαμβάνεις, και κρατάς τι πλήρωσες σε κάθε προμηθευτή, με πλήρες ιστορικό καταγραφής.") +
    '<p style="margin:18px 0"><a href="' + app + '" style="display:inline-block;background:#00E5A0;color:#0a0e14;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Άνοιξε το Kostometro</a></p>' +
    P("Δουλεύει σε Android (Chrome) και σε iPhone (Safari). Η σελίδα σού δείχνει πώς να το βάλεις στην αρχική οθόνη.") +
    P("<b>Το κλειδί Google Gemini.</b> Για να διαβάζονται τα ποσά αυτόματα χρειάζεται ένα προσωπικό κλειδί Google Gemini. Είναι ο δικός σου λογαριασμός στην Google για την τεχνολογία που διαβάζει τη φωτογραφία. Το κλειδί είναι δικό σου: εμείς δεν βλέπουμε ούτε τις φωτογραφίες ούτε τη χρέωση. Συστήνουμε το <b>πληρωμένο</b> κλειδί, γιατί το δωρεάν συχνά αργεί ή αρνείται τις ώρες αιχμής. Το κόστος είναι μικρό, ενδεικτικά <b>~0,50 € για 100 τιμολόγια</b>. " + A(key, "Οδηγός με εικόνες") + ".") +
    P("Χωρίς κλειδί, η εφαρμογή δουλεύει μόνο χειροκίνητα: τα ποσά τα γράφεις εσύ, με περιορισμένη εμπειρία. Για το πλήρες αποτέλεσμα, βάλε το κλειδί.") +
    H("Τι έρχεται: Kostometro PRO") +
    L([
      "<b>Κάθε κωδικός χωριστά, από το κινητό.</b> Φωτογραφίζεις το τιμολόγιο παραλαβής και το PRO το διαβάζει γραμμή-γραμμή: ποιο προϊόν, πόσα τεμάχια, τι τιμή.",
      "<b>Η προηγούμενη τιμή, πάνω στην παραλαβή.</b> Κάθε κωδικός εμφανίζεται μαζί με το τι πλήρωσες την τελευταία φορά στον ίδιο προμηθευτή. Την αύξηση τη βλέπεις ενώ ο προμηθευτής είναι ακόμα μπροστά σου.",
      "<b>Ο μέσος όρος σου ανά κωδικό:</b> η πραγματική σου μέση τιμή αγοράς για κάθε προϊόν, όχι μία μεμονωμένη τιμή.",
      "<b>Έως 6 συσκευές στο ίδιο σημείο:</b> ο ιδιοκτήτης, ο υπεύθυνος και έως τέσσερις υπάλληλοι.",
    ]) +
    P("<b>Ποιος βλέπει τι.</b> Ο <b>ιδιοκτήτης</b> βλέπει τα πάντα, και από το δικό του κινητό, χωρίς να βρίσκεται στο κατάστημα. Ο <b>υπεύθυνος</b> βλέπει σύνολα και μέσους όρους, και το πλήρες ιστορικό μόνο αν το επιτρέψει ο ιδιοκτήτης. Ο <b>υπάλληλος</b> βλέπει μόνο την τελευταία τιμή του κωδικού. Η πρόσβαση δίνεται και παίρνεται πίσω, και ο ιδιοκτήτης δεν αποκλείεται ποτέ από τη δική του επιχείρηση.") +
    H("Και το FastWrite, δωρεάν με τη συνδρομή σου") +
    P("Το FastWrite είναι δικό μας πρόγραμμα για υπολογιστή (Windows). Σου παραχωρείται δωρεάν με το PRO, και εσύ αποφασίζεις σε ποιον το δίνεις: στον λογιστή σου ή στο δικό σου λογιστήριο.") +
    L([
      "<b>Κάθε τιμολόγιο που σαρώνεις στην παραλαβή φτάνει εκεί αμέσως, καταχωρημένο.</b> Κανείς δεν το πληκτρολογεί ξανά, και κανείς δεν κουβαλάει φάκελο στο τέλος του μήνα.",
      "<b>Κόστος αγορών ανά σημείο πώλησης</b> και συγκεντρωτικά, αν έχεις περισσότερα από ένα καταστήματα.",
      "<b>Σύνδεση με λογιστικά προγράμματα:</b> η σύνδεση με Xero υπάρχει ήδη και ακολουθεί το QuickBooks.",
      "<b>Τα δεδομένα μένουν δικά σου.</b> Ο λογιστής τα διαβάζει αλλά δεν τα αλλάζει. Αν βρει λάθος, σου στέλνει πρόταση διόρθωσης και την εγκρίνεις εσύ με ένα πάτημα. Μπαίνει με πρόσκληση και του την παίρνεις πίσω όποτε θέλεις.",
    ]) +
    H("Η επιβράβευση: οι προσκλήσεις σου μετράνε από σήμερα") +
    P("Κάθε επιχείρηση που θα καλέσεις και θα πάρει το PRO <b>σού επιστρέφει το 20% της συνδρομής σου</b>, για όσο ανανεώνει τη δική της. <b>Με 5 ενεργές συστάσεις η συνδρομή σου επιστρέφεται ολόκληρη</b>, και πάνω από 5 παίρνεις τη διαφορά.") +
    P("Μόλις γραφτείς, θα βρεις τον δικό σου σύνδεσμο στο μενού <b>«Κάλεσε»</b>. Όποιος γραφτεί μέσα από αυτόν μετράει για σένα από την ίδια στιγμή, και η σύσταση <b>δεν λήγει</b>. Όλοι οι όροι βρίσκονται μέσα στην εφαρμογή.") +
    H("Η γνώμη σου χτίζει το επόμενο βήμα") +
    P("Αν θέλεις να κάνεις δικές σου εισηγήσεις, σχόλια ή βελτιώσεις που θεωρείς ότι θα βοηθήσουν σε μια καλύτερη εμπειρία, θα χαρούμε να ακούσουμε την άποψή σου από το μενού <b>«Η γνώμη σου»</b> ή στο " + A("mailto:support@fastwrite.tech", "support@fastwrite.tech") + ". Διαβάζουμε κάθε μήνυμα.") +
    P("Η ομάδα του Kostometro") +
    '<hr style="border:0;border-top:1px solid #e3e5ea;margin:26px 0 14px">' +
    '<p style="margin:0 0 8px;font-size:12px;color:#6b7385">Οι δυνατότητες του PRO και του FastWrite που περιγράφονται αφορούν την έκδοση που σχεδιάζεται.</p>' +
    '<p style="margin:0;font-size:12px;color:#6b7385">Λαμβάνεις αυτό το μήνυμα γιατί άφησες το email σου στη φόρμα μας στο Facebook, για να μαθαίνεις πρώτος τα βήματα μέχρι το τελικό προϊόν. Αν, τώρα που ξέρεις τι έρχεται, δεν θέλεις να μείνεις συνδεδεμένος μέχρι το τελικό: <a href="' + out + '" style="color:#6b7385;font-weight:700">Διαγραφή από τη λίστα</a> (ένα πάτημα). · <a href="' + pol + '" style="color:#6b7385">Πολιτική απορρήτου</a></p>' +
    "</div></body></html>";
  const text = [
    hi, "",
    "Άφησες το email σου στο Facebook για να είσαι από τους πρώτους. Κρατάμε την υπόσχεση, και θέλουμε να ξέρεις ακριβώς πού βρίσκεσαι.", "",
    "ΑΥΤΟ ΠΟΥ ΣΟΥ ΔΙΝΟΥΜΕ ΣΗΜΕΡΑ ΕΙΝΑΙ ΤΟ ΠΡΩΤΟ ΒΗΜΑ, ΟΧΙ ΤΟ ΤΕΛΙΚΟ ΠΡΟΪΟΝ. Σήμερα βλέπεις πόσο πλήρωσες συνολικά σε κάθε προμηθευτή. Το τελικό θα σου δείχνει πόσο πληρώνεις για κάθε κωδικό ξεχωριστά, και θα σου το λέει τη στιγμή της παραλαβής, πριν υπογράψεις το δελτίο. Όσοι χρησιμοποιούν το πρώτο βήμα τώρα, το σχεδιάζουν μαζί μας και θα το πάρουν πρώτοι.", "",
    "Άνοιξε το Kostometro: " + app, "",
    "Το κλειδί Google Gemini (οδηγός με εικόνες): " + key, "",
    "Όλες οι δυνατότητες του PRO και του FastWrite, η επιβράβευση και η γνώμη σου: μέσα στην εφαρμογή, μενού «Τι έρχεται».", "",
    "Η ομάδα του Kostometro", "",
    "---",
    "Λαμβάνεις αυτό το μήνυμα γιατί άφησες το email σου στη φόρμα μας στο Facebook. Διαγραφή από τη λίστα: " + out,
    "Πολιτική απορρήτου: " + pol,
  ].join("\n");
  return { subject: "Το πρώτο βήμα είναι έτοιμο — και είσαι μέσα από την αρχή", html, text };
}

async function adminLeadsSend(request, env) {
  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await safeJson(request)) || {};
  const campaign = clean(b.campaign, 40) || "";
  if (!leadMail(campaign, { token: "x", name: "" })) return json({ ok: false, error: "unknown_campaign" }, 400);
  const dryRun = b.dry_run === false ? false : true;   // ⚠ default: ΔΕΝ στέλνει
  const limit = Math.max(1, Math.min(LEAD_SEND_MAX, Number(b.limit) || 10));
  const only = b.only_email ? normEmail(b.only_email) : null;
  if (b.only_email && !only) return json({ ok: false, error: "bad_only_email" }, 400);
  const args = [campaign];
  let sql = `SELECT l.email, l.name, l.token FROM km_leads l
             WHERE l.unsub_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM km_lead_sends s WHERE s.email = l.email AND s.campaign = ? AND s.ok = 1)`;
  if (only) { sql += " AND l.email = ?"; args.push(only); }
  const pending = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (${sql})`).bind(...args).first() || {}).n || 0;
  sql += " ORDER BY l.consent_at, l.email LIMIT ?"; args.push(limit);
  const batch = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  if (dryRun) {
    return json({ ok: true, dry_run: true, campaign, pending, would_send: batch.map((r) => r.email),
                  note: "Τίποτα ΔΕΝ στάλθηκε. Ξανακάλεσε με dry_run:false." });
  }
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") return json({ ok: false, error: "no_binding" }, 500);
  let sent = 0; const failed = [];
  for (const r of batch) {
    const m = leadMail(campaign, r);
    let ok = false, err = null, id = null;
    try {
      const x = await env.EMAIL.send({ to: r.email, from: LEAD_FROM, subject: m.subject, text: m.text, html: m.html });
      ok = true; id = x && x.messageId ? String(x.messageId) : null;
    } catch (e) { err = String((e && e.message) || e).slice(0, 300); }
    await env.DB.prepare(
      `INSERT INTO km_lead_sends (email, campaign, at, ok, err, msg_id) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email, campaign) DO UPDATE SET at = excluded.at, ok = excluded.ok, err = excluded.err, msg_id = excluded.msg_id`
    ).bind(r.email, campaign, now(), ok ? 1 : 0, err, id).run();
    if (ok) sent++; else failed.push({ email: r.email, err });
  }
  return json({ ok: true, dry_run: false, campaign, sent, failed, remaining: Math.max(0, pending - sent) });
}

function leadPage(title, body) {
  const html = '<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + escHtml(title) + '</title><style>' +
    'body{margin:0;background:#0a0e14;color:#e6e8ec;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55}' +
    '.w{max-width:480px;margin:0 auto;padding:40px 20px}h1{font-size:22px;margin:0 0 14px}p{color:#a8b0bd;margin:0 0 14px}' +
    'button,a.b{display:block;width:100%;box-sizing:border-box;text-align:center;font-size:16px;font-weight:700;padding:14px;border-radius:12px;margin:10px 0;cursor:pointer;text-decoration:none}' +
    '.stay{background:#00E5A0;color:#0a0e14;border:0}.leave{background:transparent;color:#e6e8ec;border:1px solid #2a3140}' +
    '</style></head><body><div class="w">' + body + '</div></body></html>';
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

async function leadsLista(request, env) {
  const url = new URL(request.url);
  const tok = (url.searchParams.get("t") || "").toLowerCase();
  const lead = /^[0-9a-f]{32}$/.test(tok)
    ? await env.DB.prepare("SELECT email, unsub_at, stay_at FROM km_leads WHERE token = ?").bind(tok).first()
    : null;
  if (!lead) {
    return leadPage("Kostometro", "<h1>Ο σύνδεσμος δεν ισχύει</h1><p>Αν θέλεις να βγεις από τη λίστα, γράψε μας στο support@fastwrite.tech και θα το κάνουμε εμείς.</p>");
  }
  const self = "/api/km/lista?t=" + tok;
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const choice = form ? String(form.get("c") || "") : "";
    if (choice === "leave") {
      await env.DB.prepare("UPDATE km_leads SET unsub_at = COALESCE(unsub_at, ?) WHERE token = ?").bind(now(), tok).run();
      return leadPage("Kostometro", "<h1>Βγήκες από τη λίστα</h1><p>Δεν θα λάβεις άλλο μήνυμα από εμάς. Αν αλλάξεις γνώμη, το Kostometro θα είναι πάντα στο fastwrite.tech/kostometro.</p>");
    }
    if (choice === "stay") {
      await env.DB.prepare("UPDATE km_leads SET stay_at = ?, unsub_at = NULL WHERE token = ?").bind(now(), tok).run();
      return leadPage("Kostometro", "<h1>Μένεις στη λίστα</h1><p>Ευχαριστούμε. Θα είσαι από τους πρώτους που θα μάθουν για κάθε βήμα μέχρι το τελικό προϊόν.</p>" +
        '<a class="b stay" href="/kostometro/?src=leads">Άνοιξε το Kostometro</a>');
    }
  }
  if (lead.unsub_at) {
    return leadPage("Kostometro", "<h1>Είσαι ήδη εκτός λίστας</h1><p>Δεν θα λάβεις άλλο μήνυμα από εμάς.</p>" +
      '<form method="post" action="' + self + '"><button class="leave" name="c" value="stay">Θέλω να ξαναμπώ στη λίστα</button></form>');
  }
  return leadPage("Kostometro", "<h1>Μένεις ή φεύγεις;</h1>" +
    "<p>Τώρα που ξέρεις τι έρχεται — το Kostometro PRO, με την τιμή κάθε κωδικού πάνω στην παραλαβή, και το FastWrite για τον λογιστή σου — θέλεις να μείνεις στη λίστα και να μαθαίνεις πρώτος κάθε βήμα μέχρι το τελικό προϊόν;</p>" +
    '<form method="post" action="' + self + '"><button class="stay" name="c" value="stay">Μένω στη λίστα</button>' +
    '<button class="leave" name="c" value="leave">Διαγραφή από τη λίστα</button></form>');
}

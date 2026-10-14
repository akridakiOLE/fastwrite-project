// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-F4 · Kostometro PRO — Φάση 4: FastWrite «ΓΡΑΜΜΑΤΟΚΙΒΩΤΙΟ» (ο λογιστής) — 14/10/2026
//
// Σχεδιασμός: Α350 §9.8 Ε · §9.9.3–9.9.5 · Α320 9/10 · Brief PRO ↔ FastWrite 12/10 (Φ4).
//   · Ο ΛΟΓΙΣΤΗΣ ΔΙΑΒΑΖΕΙ, ΔΕΝ ΓΡΑΦΕΙ ΣΤΟΝ ΦΑΚΕΛΟ. Παίρνει κλειδί ΜΟΝΟ ανάγνωσης (A) — ίδιο σχήμα
//     με το H του manager: το A φτάνει κλειδωμένο προς το δημόσιο κλειδί του υπολογιστή του.
//     ΠΟΤΕ το Κ, ΠΟΤΕ οι 12 λέξεις → δεν ξανασφραγίζει μόνος του («πάντα δύο», §9.9.5).
//   · ΓΡΑΜΜΑΤΟΚΙΒΩΤΙΟ: η συσκευή του Boss (ο μόνος συγγραφέας) στέλνει κάθε τιμολόγιο ως
//     σφραγισμένο γράμμα με αύξοντα αριθμό. Νεότερη έκδοση του ίδιου τιμολογίου ΑΝΤΙΚΑΘΙΣΤΑ την
//     παλιά. Το FastWrite ζητά «ό,τι μετά το Ν», σε σελίδες — ίδια ταχύτητα σε 10 και σε 100.000.
//   · ΔΙΟΡΘΩΣΗ ΛΟΓΙΣΤΗ (Α320 9/10): ισχύει αμέσως στο FastWrite· φεύγει σφραγισμένη ΠΡΟΣ τον Boss
//     (όπως γράφει ο υπάλληλος) και η συσκευή του Boss την περνά στον φάκελο χωρίς πάτημα.
//     Ο server δεν την ανοίγει· κρατά μόνο την κατάσταση (pending → applied → undone).
//   · Ο λογιστής ΔΕΝ μετράει στα 5 μέλη της ομάδας· έως ACCT_MAX υπολογιστές ανά επιχείρηση.
//
// Boss (ταυτότητα λογαριασμού, ΜΟΝΟ PRO· οι εγγραφές ΜΟΝΟ από την ενεργή συσκευή):
//   GET  /api/km/pro/acct                         — λογιστές, εκκρεμείς διορθώσεις, κεφαλή γραμματοκιβωτίου
//   POST /api/km/pro/acct/invite   { name }       → { acct_id, code, invite_exp }
//   POST /api/km/pro/acct/key      { acct_id, wrap_a, a_ver }
//   POST /api/km/pro/acct/revoke   { acct_id }
//   PUT  /api/km/pro/acct/mail?rid=&kind=         (σώμα: σφραγισμένο γράμμα) · X-Km-A-Ver
//   PUT  /api/km/pro/acct/photo?id=               (σώμα: σφραγισμένη φωτογραφία)
//   DELETE /api/km/pro/acct/photo?id=
//   GET  /api/km/pro/acct/photos                  — ποιες υπάρχουν ήδη (για να μη ξαναστέλνονται)
//   GET  /api/km/pro/acct/fixes                   — διορθώσεις που περιμένουν τη συσκευή του Boss (μόνο ενεργών λογιστών)
//   POST /api/km/pro/acct/fixdone  { id, status: applied|undone|rejected }
//   GET  /api/km/pro/acct/fps?after=               — τι έχει ήδη το γραμματοκιβώτιο (νέα συσκευή Boss: να μη ξαναστείλει τα πάντα)
// Λογιστής (X-Km-Acct + X-Km-Acct-Auth):
//   POST /api/km/pro/a/join        { code, acct_auth, pub, device, office }
//   GET  /api/km/pro/a/me
//   GET  /api/km/pro/a/mail?after=&limit=         — γράμματα μετά το «after», σε σελίδες
//   GET  /api/km/pro/a/photo?id=
//   POST /api/km/pro/a/fix         { id, meta }   (meta: σφραγισμένη προς τον Boss)
//   GET  /api/km/pro/a/fixes                      — η κατάσταση των δικών του
//   POST /api/km/pro/a/leave                      — ο λογιστής αποσυνδέεται μόνος του
// ═══════════════════════════════════════════════════════════════════════════

export const ACCT_MAX = 3;                         // υπολογιστές λογιστηρίου ανά επιχείρηση
export const ACCT_INVITE_TTL_MS = 48 * 3600 * 1000;
export const MAIL_PAGE_MAX = 200;                  // γράμματα ανά σελίδα (το πολύ)
export const MAIL_PAGE_DEFAULT = 50;
export const MAIL_PAGE_BYTES = 4 * 1024 * 1024;    // και το πολύ τόσα bytes ανά σελίδα
const MAIL_MAX_BYTES = 1024 * 1024;                // ένα γράμμα (κεφαλίδα + γραμμές, χωρίς φωτογραφίες)
const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
const FIX_META_MAX = 200 * 1024;
const FIX_PENDING_MAX = 500;
const WRAP_MAX = 100000;                           // κλειδιά A όλων των εκδόσεων (~1.300 ανακλήσεις), κλειδωμένα
const RID = /^[A-Za-z0-9_-]{1,80}$/;
const KINDS = { inv: 1, del: 1, book: 1, item: 1 };   // item = ένας κωδικός του βιβλίου (rid «i_…»)

const hex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const isHex = (s, n) => typeof s === "string" && new RegExp("^[0-9a-f]{" + n + "}$").test(s);
const isB64 = (s, max) => typeof s === "string" && s.length > 16 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
const isPub = (s) => typeof s === "string" && /^B[A-Za-z0-9+/]{86}=$/.test(s);
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

export function acctView(a) {
  return {
    acct_id: a.acct_id, name: a.name, status: a.status, office: a.office || null, device: a.device || null,
    has_key: !!a.wrap_a, a_ver: a.a_ver || null, pub: a.pub || null, last_pull: a.last_pull || null,
    invite_exp: a.status === "invited" ? a.invite_exp : null, created_at: a.created_at, updated_at: a.updated_at,
  };
}

async function log(env, folder, actor, kind, acctId, detail) {
  try {
    await env.DB.prepare("INSERT INTO km_team_log (folder_id, at, actor, kind, member_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(folder, new Date().toISOString(), actor, kind, acctId || null, detail ? JSON.stringify(detail).slice(0, 500) : null).run();
  } catch (e) { /* το ίχνος δεν ρίχνει ποτέ την πράξη */ }
}
const acctRow = (env, id) => env.DB.prepare("SELECT * FROM km_acct WHERE acct_id = ?").bind(id).first();
const acctsOf = (env, folder) => env.DB.prepare("SELECT * FROM km_acct WHERE folder_id = ? ORDER BY created_at").bind(folder).all().then((r) => r.results || []);
const mailKey = (folder, obj) => folder + "/acct/m/" + obj + ".bin";   // obj = τυχαίο όνομα, γράφεται ΠΡΙΝ από τη γραμμή της βάσης
const photoKey = (folder, id) => folder + "/acct/ph/" + id + ".bin";

// ── ΤΑΥΤΟΤΗΤΕΣ ─────────────────────────────────────────────────────────────
async function boss(request, env, h, pro, write) {
  const a = await h.authed(request, env);
  if (a.err) return { err: a.err };
  if (!pro.proActive(env, await pro.proRow(env, a.id.folder), h.now())) return { err: h.json({ ok: false, error: "not_pro" }, 403) };
  if (write && a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return { err: h.json({ ok: false, error: "not_active" }, 409) };
  return { folder: a.id.folder };
}
async function acct(request, env, h, pro) {
  const id = request.headers.get("X-Km-Acct") || "", auth = request.headers.get("X-Km-Acct-Auth") || "";
  if (!isHex(id, 32) || !isHex(auth, 64)) return { err: h.json({ ok: false, error: "bad_identity" }, 400) };
  const a = await acctRow(env, id);
  // ανακλημένος: 410 ΠΡΙΝ από τον έλεγχο κωδικού (που έχει σβηστεί) — το FastWrite κόβει τη σύνδεση
  if (a && a.status === "revoked") return { err: h.json({ ok: false, error: "revoked" }, 410) };
  if (!a || !a.auth_hash || a.auth_hash !== await h.sha256hex(auth)) return { err: h.json({ ok: false, error: "forbidden" }, 403) };
  const proOn = pro.proActive(env, await pro.proRow(env, a.folder_id), h.now());
  return { a, folder: a.folder_id, proOn, actor: "a:" + a.acct_id };
}
const readErr = (h, w) => (!w.proOn ? h.json({ ok: false, error: "not_pro" }, 403) : w.a.status !== "active" || !w.a.wrap_a ? h.json({ ok: false, error: "not_active" }, 423) : null);

// ── Boss ───────────────────────────────────────────────────────────────────
async function list(request, env, h, pro) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const all = await acctsOf(env, w.folder);
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_acct_fix WHERE folder_id = ? AND status = 'pending'").bind(w.folder).first();
  const head = await env.DB.prepare("SELECT MAX(id) AS id, COUNT(*) AS n FROM km_acct_mail WHERE folder_id = ?").bind(w.folder).first();
  return h.json({ ok: true, accts: all.filter((a) => a.status !== "revoked").map(acctView), max: ACCT_MAX,
                  fixes: pend ? pend.n : 0, mail: { head: (head && head.id) || 0, n: (head && head.n) || 0 } });
}
async function invite(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const name = h.clean(b && b.name, 60);
  if (!name) return h.json({ ok: false, error: "bad_input" }, 400);
  const live = (await acctsOf(env, w.folder)).filter((a) => a.status !== "revoked");
  if (live.length >= ACCT_MAX) return h.json({ ok: false, error: "acct_full", max: ACCT_MAX }, 409);
  const t = h.now(), id = hex(16), code = hex(16), exp = new Date(Date.now() + ACCT_INVITE_TTL_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO km_acct (acct_id, folder_id, name, status, invite_hash, invite_exp, created_at, updated_at)
     VALUES (?, ?, ?, 'invited', ?, ?, ?, ?)`
  ).bind(id, w.folder, name, await h.sha256hex(code), exp, t, t).run();
  await log(env, w.folder, "boss", "acct_invite", id, { name });
  return h.json({ ok: true, acct_id: id, code, invite_exp: exp });
}
async function key(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const a = b && isHex(b.acct_id, 32) ? await acctRow(env, b.acct_id) : null;
  if (!a || a.folder_id !== w.folder || a.status === "revoked" || !a.pub) return h.json({ ok: false, error: "no_acct" }, 404);
  if (!isB64(b.wrap_a, WRAP_MAX) || !Number.isInteger(b.a_ver) || b.a_ver < 1) return h.json({ ok: false, error: "bad_input" }, 400);
  const first = a.status === "joined";
  await env.DB.prepare("UPDATE km_acct SET wrap_a = ?, a_ver = ?, status = 'active', updated_at = ? WHERE acct_id = ?")
    .bind(b.wrap_a, b.a_ver, h.now(), a.acct_id).run();
  if (first) await log(env, w.folder, "boss", "acct_activate", a.acct_id, null);
  return h.json({ ok: true });
}
async function revoke(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const a = b && isHex(b.acct_id, 32) ? await acctRow(env, b.acct_id) : null;
  if (!a || a.folder_id !== w.folder || a.status === "revoked") return h.json({ ok: false, error: "no_acct" }, 404);
  // Ό,τι έχει ήδη κατεβάσει μένει στο λογιστήριο (είναι τα βιβλία του πελάτη του) — η ΠΡΟΣΒΑΣΗ κόβεται,
  // και η συσκευή του Boss αλλάζει το A: ό,τι δημοσιευτεί μετά, το παλιό δεν το ανοίγει.
  await env.DB.prepare("UPDATE km_acct SET status = 'revoked', auth_hash = NULL, wrap_a = NULL, invite_hash = NULL, updated_at = ? WHERE acct_id = ?")
    .bind(h.now(), a.acct_id).run();
  // ό,τι διόρθωση περίμενε από αυτόν ΔΕΝ περνά πια αυτόματα
  await env.DB.prepare("UPDATE km_acct_fix SET status = 'rejected', meta = '', decided_at = ? WHERE acct_id = ? AND status = 'pending'").bind(h.now(), a.acct_id).run();
  await log(env, w.folder, "boss", "acct_revoke", a.acct_id, { name: a.name });
  return h.json({ ok: true });
}
async function putMail(request, env, h, pro, url) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const rid = url.searchParams.get("rid") || "", kind = url.searchParams.get("kind") || "";
  const av = Number(request.headers.get("X-Km-A-Ver"));
  if (!RID.test(rid) || !KINDS[kind] || (kind === "book") !== (rid === "_book") || (kind === "item") !== rid.startsWith("i_")) return h.json({ ok: false, error: "bad_input" }, 400);
  if (!Number.isInteger(av) || av < 1) return h.json({ ok: false, error: "bad_ver" }, 400);
  const body = await request.arrayBuffer();
  if (body.byteLength < 29 || body.byteLength > MAIL_MAX_BYTES) return h.json({ ok: false, error: "bad_size" }, 400);
  const t = h.now(), fpRaw = request.headers.get("X-Km-Fp") || "", fp = /^[0-9a-f]{16}$/.test(fpRaw) ? fpRaw : null;
  // 🔴 ΠΡΩΤΑ το αντικείμενο, ΜΕΤΑ η γραμμή: αλλιώς το FastWrite που τραβά ανάμεσα θα έβρισκε γραμμή χωρίς γράμμα,
  // θα την προσπερνούσε και ο δείκτης του θα περνούσε από πάνω της για πάντα (εύρημα αναθεώρησης 14/10).
  const obj = hex(16);
  await env.FOLDERS.put(mailKey(w.folder, obj), body, { httpMetadata: { contentType: "application/octet-stream" } });
  const r = await env.DB.prepare("INSERT INTO km_acct_mail (folder_id, rid, kind, a_ver, bytes, at, obj, fp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(w.folder, rid, kind, av, body.byteLength, t, obj, fp).run();
  const id = r && r.meta && r.meta.last_row_id;
  if (!id) { try { await env.FOLDERS.delete(mailKey(w.folder, obj)); } catch (e) {} return h.json({ ok: false, error: "db" }, 500); }
  // 🔴 ΜΙΑ ΕΚΔΟΣΗ ΑΝΑ ΤΙΜΟΛΟΓΙΟ: η νεότερη αντικαθιστά τις παλιές. Ό,τι έχει ήδη κατεβάσει το FastWrite
  // δεν επηρεάζεται (ο αριθμός του προχωράει μόνο μπροστά)· όποιος δεν το είχε κατεβάσει παίρνει μόνο το νεότερο.
  const old = await env.DB.prepare("SELECT id, obj FROM km_acct_mail WHERE folder_id = ? AND rid = ? AND id < ?").bind(w.folder, rid, id).all();
  for (const o of old.results || []) {
    try { await env.FOLDERS.delete(mailKey(w.folder, o.obj)); } catch (e) {}
    await env.DB.prepare("DELETE FROM km_acct_mail WHERE id = ?").bind(o.id).run();
  }
  return h.json({ ok: true, seq: id });
}
// Νέα συσκευή Boss: τι έχει ήδη το γραμματοκιβώτιο (rid + δακτυλικό), σε σελίδες — ώστε να ΜΗΝ ξαναστείλει τα πάντα.
async function listFps(request, env, h, pro, url) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const after = Math.max(0, Number(url.searchParams.get("after") || 0) | 0);
  const rows = (await env.DB.prepare("SELECT id, rid, kind, fp FROM km_acct_mail WHERE folder_id = ? AND id > ? ORDER BY id LIMIT 1001").bind(w.folder, after).all()).results || [];
  const page = rows.slice(0, 1000);
  return h.json({ ok: true, items: page.map((x) => ({ rid: x.rid, kind: x.kind, fp: x.fp })), next: page.length ? page[page.length - 1].id : after, more: rows.length > 1000 });
}
async function putPhoto(request, env, h, pro, url) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const id = url.searchParams.get("id") || "";
  if (!RID.test(id)) return h.json({ ok: false, error: "bad_id" }, 400);
  const body = await request.arrayBuffer();
  if (body.byteLength < 29 || body.byteLength > PHOTO_MAX_BYTES) return h.json({ ok: false, error: "bad_size" }, 400);
  await env.FOLDERS.put(photoKey(w.folder, id), body, { httpMetadata: { contentType: "application/octet-stream" } });
  return h.json({ ok: true, id, bytes: body.byteLength });
}
async function delPhoto(request, env, h, pro, url) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const id = url.searchParams.get("id") || "";
  if (!RID.test(id)) return h.json({ ok: false, error: "bad_id" }, 400);
  await env.FOLDERS.delete(photoKey(w.folder, id));
  return h.json({ ok: true });
}
async function listPhotos(request, env, h, pro) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const prefix = w.folder + "/acct/ph/", out = [];
  let cursor;
  do {
    const page = await env.FOLDERS.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) out.push(o.key.slice(prefix.length).replace(/\.bin$/, ""));
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  return h.json({ ok: true, photos: out });
}
async function fixesList(request, env, h, pro) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const r = await env.DB.prepare(
    `SELECT f.id, f.acct_id, f.created_at, f.meta, a.name FROM km_acct_fix f LEFT JOIN km_acct a ON a.acct_id = f.acct_id
     WHERE f.folder_id = ? AND f.status = 'pending' AND a.status = 'active' ORDER BY f.created_at LIMIT 100`).bind(w.folder).all();
  return h.json({ ok: true, fixes: r.results || [] });
}
async function fixDone(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const st = b && { applied: 1, undone: 1, rejected: 1 }[b.status] ? b.status : null;
  const f = b && isHex(b.id, 32) ? await env.DB.prepare("SELECT * FROM km_acct_fix WHERE id = ?").bind(b.id).first() : null;
  if (!st || !f || f.folder_id !== w.folder) return h.json({ ok: false, error: "no_fix" }, 404);
  if (f.status === st) return h.json({ ok: true, same: true });
  // pending → applied → undone (η αναίρεση γίνεται ΜΟΝΟ σε ό,τι εφαρμόστηκε)
  if (st === "undone" && f.status !== "applied") return h.json({ ok: false, error: "not_applied" }, 409);
  // «rejected» = δεν άνοιξε / δεν ταιριάζει (ψεύτικη ή χαλασμένη) — ΜΟΝΟ από «pending»· δεν μπλοκάρει πια την ουρά
  if (st === "rejected" && f.status !== "pending") return h.json({ ok: false, error: "not_pending" }, 409);
  // «applied» = πέρασε στον φάκελο (σφραγισμένη πλέον με το Κ): το σφραγισμένο αντίγραφο στον server σβήνεται.
  await env.DB.prepare("UPDATE km_acct_fix SET status = ?, decided_at = ?, meta = '' WHERE id = ?").bind(st, h.now(), f.id).run();
  await log(env, w.folder, "boss", st === "applied" ? "fix_applied" : st === "undone" ? "fix_undone" : "fix_rejected", f.acct_id, { id: f.id });
  return h.json({ ok: true });
}

// ── Λογιστής ───────────────────────────────────────────────────────────────
async function join(request, env, h) {
  const b = await h.safeJson(request);
  if (!b || !isHex(b.code, 32) || !isHex(b.acct_auth, 64) || !isPub(b.pub)) return h.json({ ok: false, error: "bad_input" }, 400);
  const a = await env.DB.prepare("SELECT * FROM km_acct WHERE invite_hash = ?").bind(await h.sha256hex(b.code)).first();
  if (!a || a.status !== "invited") return h.json({ ok: false, error: "bad_invite" }, 404);
  if (a.invite_exp < h.now()) return h.json({ ok: false, error: "invite_expired" }, 410);
  const team = await env.DB.prepare("SELECT boss_pub FROM km_team WHERE folder_id = ?").bind(a.folder_id).first();
  if (!team || !team.boss_pub) return h.json({ ok: false, error: "no_team" }, 409);
  // Μία χρήση: η πρόσκληση σβήνει ΤΗ ΣΤΙΓΜΗ που χρησιμοποιείται.
  const r = await env.DB.prepare(
    "UPDATE km_acct SET status = 'joined', invite_hash = NULL, auth_hash = ?, pub = ?, device = ?, office = ?, updated_at = ? WHERE acct_id = ? AND status = 'invited'"
  ).bind(await h.sha256hex(b.acct_auth), b.pub, h.clean(b.device, 80), h.clean(b.office, 80), h.now(), a.acct_id).run();
  if (!r || !r.meta || r.meta.changes !== 1) return h.json({ ok: false, error: "bad_invite" }, 409);
  await log(env, a.folder_id, "a:" + a.acct_id, "acct_join", a.acct_id, { office: h.clean(b.office, 80) });
  return h.json({ ok: true, acct_id: a.acct_id, name: a.name, boss_pub: team.boss_pub });
}
async function me(request, env, h, pro) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  const team = await env.DB.prepare("SELECT boss_pub FROM km_team WHERE folder_id = ?").bind(w.folder).first();
  const head = await env.DB.prepare("SELECT MAX(id) AS id FROM km_acct_mail WHERE folder_id = ?").bind(w.folder).first();
  return h.json({ ok: true, pro: w.proOn, me: Object.assign(acctView(w.a), { wrap_a: w.a.wrap_a || null }),
                  boss_pub: team ? team.boss_pub : null, head: (head && head.id) || 0 });
}
async function mail(request, env, h, pro, url) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  const e = readErr(h, w); if (e) return e;
  const after = Number(url.searchParams.get("after") || 0);
  let limit = Number(url.searchParams.get("limit") || MAIL_PAGE_DEFAULT);
  if (!Number.isInteger(after) || after < 0) return h.json({ ok: false, error: "bad_after" }, 400);
  if (!Number.isInteger(limit) || limit < 1) limit = MAIL_PAGE_DEFAULT;
  limit = Math.min(limit, MAIL_PAGE_MAX);
  // ΣΕΛΙΔΟΠΟΙΗΣΗ ΜΕ ΔΕΙΚΤΗ (folder_id, id): «μετά το Ν», όχι OFFSET — ίδιο κόστος σε κάθε σελίδα.
  const rows = (await env.DB.prepare("SELECT id, rid, kind, a_ver, bytes, at, obj FROM km_acct_mail WHERE folder_id = ? AND id > ? ORDER BY id LIMIT ?")
    .bind(w.folder, after, limit + 1).all()).results || [];
  const out = [];
  let bytes = 0, next = after, more = rows.length > limit;
  for (const r of rows.slice(0, limit)) {
    if (out.length && bytes + r.bytes > MAIL_PAGE_BYTES) { more = true; break; }
    const obj = await env.FOLDERS.get(mailKey(w.folder, r.obj));
    next = r.id;
    if (!obj) continue;   // σβήστηκε: αντικαταστάθηκε από ΝΕΟΤΕΡΗ έκδοση (μεγαλύτερος αριθμός — έρχεται μετά). Το αντικείμενο γράφεται ΠΡΙΝ τη γραμμή.
    const u8 = new Uint8Array(await new Response(obj.body).arrayBuffer());
    bytes += u8.length;
    out.push({ seq: r.id, rid: r.rid, kind: r.kind, a_ver: r.a_ver, at: r.at, body: b64(u8) });
  }
  try { await env.DB.prepare("UPDATE km_acct SET last_pull = ? WHERE acct_id = ?").bind(h.now(), w.a.acct_id).run(); } catch (x) {}
  return h.json({ ok: true, entries: out, next, more });
}
async function photoGet(request, env, h, pro, url) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  const e = readErr(h, w); if (e) return e;
  const id = url.searchParams.get("id") || "";
  if (!RID.test(id)) return h.json({ ok: false, error: "bad_id" }, 400);
  const obj = await env.FOLDERS.get(photoKey(w.folder, id));
  if (!obj) return h.json({ ok: false, error: "no_photo" }, 404);
  return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}
async function fixNew(request, env, h, pro) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  const e = readErr(h, w); if (e) return e;
  const b = await h.safeJson(request);
  if (!b || !isHex(b.id, 32) || !isB64(b.meta, FIX_META_MAX)) return h.json({ ok: false, error: "bad_input" }, 400);
  const old = await env.DB.prepare("SELECT acct_id FROM km_acct_fix WHERE id = ?").bind(b.id).first();
  if (old) return old.acct_id === w.a.acct_id ? h.json({ ok: true, same: true }) : h.json({ ok: false, error: "id_taken" }, 409);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_acct_fix WHERE folder_id = ? AND status = 'pending'").bind(w.folder).first();
  if (n && n.n >= FIX_PENDING_MAX) return h.json({ ok: false, error: "inbox_full" }, 429);
  await env.DB.prepare("INSERT INTO km_acct_fix (id, folder_id, acct_id, created_at, status, meta) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(b.id, w.folder, w.a.acct_id, h.now(), b.meta).run();
  await log(env, w.folder, w.actor, "fix", w.a.acct_id, { id: b.id });
  return h.json({ ok: true });
}
// Ο λογιστής αποσυνδέεται ΜΟΝΟΣ του (FastWrite → «Αποσύνδεση»): η θέση ελευθερώνεται, ο Boss το βλέπει στο ίχνος.
async function leave(request, env, h, pro) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  await env.DB.prepare("UPDATE km_acct SET status = 'revoked', auth_hash = NULL, wrap_a = NULL, updated_at = ? WHERE acct_id = ?").bind(h.now(), w.a.acct_id).run();
  await env.DB.prepare("UPDATE km_acct_fix SET status = 'rejected', meta = '', decided_at = ? WHERE acct_id = ? AND status = 'pending'").bind(h.now(), w.a.acct_id).run();
  await log(env, w.folder, w.actor, "acct_leave", w.a.acct_id, null);
  return h.json({ ok: true });
}
async function fixMine(request, env, h, pro) {
  const w = await acct(request, env, h, pro); if (w.err) return w.err;
  const r = await env.DB.prepare("SELECT id, created_at, status, decided_at FROM km_acct_fix WHERE acct_id = ? ORDER BY created_at DESC LIMIT 200").bind(w.a.acct_id).all();
  return h.json({ ok: true, fixes: r.results || [] });
}

// ── routes ─────────────────────────────────────────────────────────────────
export async function handleAcct(request, env, path, h, pro) {
  const method = request.method, url = new URL(request.url);
  if (path === "/api/km/pro/acct" && method === "GET") return list(request, env, h, pro);
  if (path === "/api/km/pro/acct/invite" && method === "POST") return invite(request, env, h, pro);
  if (path === "/api/km/pro/acct/key" && method === "POST") return key(request, env, h, pro);
  if (path === "/api/km/pro/acct/revoke" && method === "POST") return revoke(request, env, h, pro);
  if (path === "/api/km/pro/acct/mail" && method === "PUT") return putMail(request, env, h, pro, url);
  if (path === "/api/km/pro/acct/photo" && method === "PUT") return putPhoto(request, env, h, pro, url);
  if (path === "/api/km/pro/acct/photo" && method === "DELETE") return delPhoto(request, env, h, pro, url);
  if (path === "/api/km/pro/acct/photos" && method === "GET") return listPhotos(request, env, h, pro);
  if (path === "/api/km/pro/acct/fixes" && method === "GET") return fixesList(request, env, h, pro);
  if (path === "/api/km/pro/acct/fixdone" && method === "POST") return fixDone(request, env, h, pro);
  if (path === "/api/km/pro/a/join" && method === "POST") return join(request, env, h);
  if (path === "/api/km/pro/a/me" && method === "GET") return me(request, env, h, pro);
  if (path === "/api/km/pro/a/mail" && method === "GET") return mail(request, env, h, pro, url);
  if (path === "/api/km/pro/a/photo" && method === "GET") return photoGet(request, env, h, pro, url);
  if (path === "/api/km/pro/a/fix" && method === "POST") return fixNew(request, env, h, pro);
  if (path === "/api/km/pro/a/fixes" && method === "GET") return fixMine(request, env, h, pro);
  if (path === "/api/km/pro/a/leave" && method === "POST") return leave(request, env, h, pro);
  if (path === "/api/km/pro/acct/fps" && method === "GET") return listFps(request, env, h, pro, url);
  return null;
}

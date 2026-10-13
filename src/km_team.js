// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-F3 · Kostometro PRO — Φάση 3: Η ΟΜΑΔΑ (Boss / admin / user) — 13/10/2026
//
// Σχεδιασμός: Α350 §9.9 (4/9) · Α320 6/9 · Brief PRO ↔ FastWrite 12/10 (Φ3).
//   · Ο ΦΑΚΕΛΟΣ ΕΧΕΙ ΕΝΑΝ ΣΥΓΓΡΑΦΕΑ: τη συσκευή του Boss. Υπάλληλος και manager ΔΕΝ έχουν
//     ποτέ το Κ ούτε τις 12 λέξεις. Γράφουν ΠΡΟΤΑΣΕΙΣ κρυπτογραφημένες προς το δημόσιο
//     κλειδί του Boss (ασύμμετρα κλειδιά, §9.9.3) — «γράφει χωρίς να διαβάζει».
//   · ΔΕΛΤΙΟ ΤΙΜΩΝ: η συσκευή του Boss δημοσιεύει τις τελευταίες τιμές σφραγισμένες με
//     κλειδί S· το S φτάνει σε κάθε μέλος κλειδωμένο με το δημόσιο κλειδί του. Ο server
//     δεν βλέπει ποτέ ούτε το S ούτε τιμές ούτε τιμολόγια.
//   · ΔΙΑΚΟΠΤΕΣ ανά μέλος: σε βάρδια ΝΑΙ/ΟΧΙ + προαιρετική λήξη (4/9: «πρώτη έκδοση») ·
//     για τον manager: «ιστορικό» και «διαχείριση ομάδας» — τα γυρίζει ΜΟΝΟ ο Boss (6/9: ανακλητά).
//   · ΕΩΣ 5 ΜΕΛΗ ανά σημείο (6/9: admin + 4 users).
//   · ΙΧΝΟΣ: κάθε πράξη της ομάδας γράφεται (ποιος, πότε, τι) — km_team_log.
//
// Boss (ταυτότητα λογαριασμού, ΜΟΝΟ η ενεργή συσκευή, ΜΟΝΟ PRO):
//   POST /api/km/pro/team/setup        { boss_pub }            — μία φορά ανά φάκελο
//   GET  /api/km/pro/team                                       — μέλη, ίχνος, εκκρεμείς προτάσεις
//   POST /api/km/pro/team/invite       { role, name, until? }  → { member_id, code }
//   POST /api/km/pro/team/member       { member_id, on_duty?, until?, hist?, manage?, name? }
//   POST /api/km/pro/team/key          { member_id, wrap_s, s_ver }
//   POST /api/km/pro/team/revoke       { member_id }
//   PUT  /api/km/pro/team/slip         (σώμα: σφραγισμένο δελτίο) · X-Km-Slip-Ver
//   GET  /api/km/pro/team/proposals                             — όσες περιμένουν
//   GET  /api/km/pro/team/page?id=&n=                           — σελίδα πρότασης (σφραγισμένη)
//   POST /api/km/pro/team/decide       { id, decision: taken|approved|rejected }
// Μέλος (X-Km-Member + X-Km-Member-Auth):
//   POST /api/km/pro/m/join            { code, member_auth, pub, device }
//   GET  /api/km/pro/m/me
//   GET  /api/km/pro/m/slip
//   POST /api/km/pro/m/read            { pages }   (Κώστας AI — χρέωση στον φάκελο)
//   POST /api/km/pro/m/proposal        { id, meta, pages }
//   PUT  /api/km/pro/m/page?id=&n=     (σώμα: σφραγισμένη σελίδα)
//   GET  /api/km/pro/m/proposals                                — η κατάσταση των δικών του
//   POST /api/km/pro/m/team/invite | /m/team/member | /m/team/key  — ΜΟΝΟ manager με «διαχείριση»
// ═══════════════════════════════════════════════════════════════════════════

export const TEAM_MAX = 5;                       // μέλη ανά σημείο (6/9/2026)
export const INVITE_TTL_MS = 48 * 3600 * 1000;   // η πρόσκληση ζει 48 ώρες
const PAGE_MAX_BYTES = 4 * 1024 * 1024;
const META_MAX = 200 * 1024;
const SLIP_MAX_BYTES = 8 * 1024 * 1024;
const PAGES_MAX = 6;
const PENDING_MAX = 300;                         // εκκρεμείς προτάσεις ανά φάκελο
const ROLES = { user: 1, admin: 1 };

const hex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const isHex = (s, n) => typeof s === "string" && new RegExp("^[0-9a-f]{" + n + "}$").test(s);
const isB64 = (s, max) => typeof s === "string" && s.length > 16 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
// δημόσιο κλειδί P-256 «raw» (65 bytes = 0x04 + X + Y) σε base64 — τίποτα άλλο δεν γίνεται δεκτό
export const isPub = (s) => typeof s === "string" && /^B[A-Za-z0-9+/]{86}=$/.test(s);
const isoOrNull = (v) => (v === null || v === undefined || v === "" ? null : (typeof v === "string" && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined));

// ── ΒΑΡΔΙΑ: ενεργό + διακόπτης + λήξη ─────────────────────────────────────
export function onDuty(m, nowIso) {
  if (!m || m.status !== "active") return false;
  if (!m.on_duty) return false;
  return !m.until || m.until > nowIso;
}
export function memberView(m, nowIso) {
  return {
    member_id: m.member_id, role: m.role, name: m.name, status: m.status,
    on_duty: !!m.on_duty, until: m.until || null, hist: !!m.hist, manage: !!m.manage,
    duty_ok: onDuty(m, nowIso), has_key: !!m.wrap_s, pub: m.pub || null, s_ver: m.s_ver || null,
    has_h: !!m.wrap_h, h_ver: m.h_ver || null,
    invite_exp: m.status === "invited" ? m.invite_exp : null, created_at: m.created_at, updated_at: m.updated_at,
  };
}

async function log(env, folder, actor, kind, memberId, detail) {
  try {
    await env.DB.prepare("INSERT INTO km_team_log (folder_id, at, actor, kind, member_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(folder, new Date().toISOString(), actor, kind, memberId || null, detail ? JSON.stringify(detail).slice(0, 500) : null).run();
  } catch (e) { /* το ίχνος δεν ρίχνει ποτέ την πράξη */ }
}
const members = (env, folder) => env.DB.prepare("SELECT * FROM km_members WHERE folder_id = ? ORDER BY created_at").bind(folder).all().then((r) => r.results || []);
const memberRow = (env, id) => env.DB.prepare("SELECT * FROM km_members WHERE member_id = ?").bind(id).first();

// ── ΤΑΥΤΟΤΗΤΕΣ ─────────────────────────────────────────────────────────────
// Boss: ο λογαριασμός, η ΕΝΕΡΓΗ συσκευή, PRO.
async function boss(request, env, h, pro, write) {
  const a = await h.authed(request, env);
  if (a.err) return { err: a.err };
  if (!pro.proActive(env, await pro.proRow(env, a.id.folder), h.now())) return { err: h.json({ ok: false, error: "not_pro" }, 403) };
  if (write && a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return { err: h.json({ ok: false, error: "not_active" }, 409) };
  return { folder: a.id.folder, actor: "boss" };
}
// Μέλος: X-Km-Member + X-Km-Member-Auth (ο server κρατά μόνο sha256).
async function member(request, env, h, pro) {
  const id = request.headers.get("X-Km-Member") || "", auth = request.headers.get("X-Km-Member-Auth") || "";
  if (!isHex(id, 32) || !isHex(auth, 64)) return { err: h.json({ ok: false, error: "bad_identity" }, 400) };
  const m = await memberRow(env, id);
  // ανακλημένος: 410 ΠΡΙΝ από τον έλεγχο κωδικού (που έχει σβηστεί) — η συσκευή του πρέπει να καθαρίσει
  if (m && m.status === "revoked") return { err: h.json({ ok: false, error: "revoked" }, 410) };
  if (!m || !m.auth_hash || m.auth_hash !== await h.sha256hex(auth)) return { err: h.json({ ok: false, error: "forbidden" }, 403) };
  const proOn = pro.proActive(env, await pro.proRow(env, m.folder_id), h.now());
  return { m, folder: m.folder_id, proOn, actor: "m:" + m.member_id };
}

// ── ΠΡΑΞΕΙΣ ΟΜΑΔΑΣ (κοινές για Boss και manager με «διαχείριση») ──────────
async function doInvite(env, h, who, b) {
  const role = b && ROLES[b.role] ? b.role : null;
  const name = h.clean(b && b.name, 40);
  if (!role || !name) return h.json({ ok: false, error: "bad_input" }, 400);
  if (who.actor !== "boss" && role !== "user") return h.json({ ok: false, error: "boss_only" }, 403);   // ο manager προσκαλεί ΜΟΝΟ υπαλλήλους
  const until = isoOrNull(b.until);
  if (until === undefined) return h.json({ ok: false, error: "bad_until" }, 400);
  const live = (await members(env, who.folder)).filter((m) => m.status !== "revoked");
  if (live.length >= TEAM_MAX) return h.json({ ok: false, error: "team_full", max: TEAM_MAX }, 409);
  if (role === "admin" && live.some((m) => m.role === "admin")) return h.json({ ok: false, error: "admin_exists" }, 409);
  const t = h.now(), id = hex(16), code = hex(16);
  await env.DB.prepare(
    `INSERT INTO km_members (member_id, folder_id, role, name, status, on_duty, until, hist, manage, invite_hash, invite_exp, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'invited', 1, ?, 0, 0, ?, ?, ?, ?)`
  ).bind(id, who.folder, role, name, until, await h.sha256hex(code), new Date(Date.now() + INVITE_TTL_MS).toISOString(), t, t).run();
  await log(env, who.folder, who.actor, "invite", id, { role, name });
  return h.json({ ok: true, member_id: id, code, invite_exp: new Date(Date.now() + INVITE_TTL_MS).toISOString() });
}
async function doMember(env, h, who, b) {
  const m = b && isHex(b.member_id, 32) ? await memberRow(env, b.member_id) : null;
  if (!m || m.folder_id !== who.folder || m.status === "revoked") return h.json({ ok: false, error: "no_member" }, 404);
  if (who.actor !== "boss") {   // manager: μόνο βάρδια/λήξη υπαλλήλων — ποτέ ιστορικό/διαχείριση, ποτέ τον εαυτό του ή άλλον manager
    if (m.role !== "user" || b.hist !== undefined || b.manage !== undefined || b.name !== undefined) return h.json({ ok: false, error: "boss_only" }, 403);
  }
  const set = [], val = [], changed = {};
  if (b.on_duty !== undefined) { set.push("on_duty = ?"); val.push(b.on_duty ? 1 : 0); changed.on_duty = !!b.on_duty; }
  if (b.until !== undefined) { const u = isoOrNull(b.until); if (u === undefined) return h.json({ ok: false, error: "bad_until" }, 400); set.push("until = ?"); val.push(u); changed.until = u; }
  if (b.hist !== undefined) {
    if (m.role !== "admin") return h.json({ ok: false, error: "admin_only" }, 400);
    set.push("hist = ?"); val.push(b.hist ? 1 : 0); changed.hist = !!b.hist;
    if (!b.hist) { set.push("wrap_h = NULL", "h_ver = NULL"); }   // ΟΧΙ = το κλειδί του ιστορικού φεύγει ΤΩΡΑ (ο Boss αλλάζει και το H)
  }
  if (b.manage !== undefined) { if (m.role !== "admin") return h.json({ ok: false, error: "admin_only" }, 400); set.push("manage = ?"); val.push(b.manage ? 1 : 0); changed.manage = !!b.manage; }
  if (b.name !== undefined) { const n = h.clean(b.name, 40); if (!n) return h.json({ ok: false, error: "bad_input" }, 400); set.push("name = ?"); val.push(n); changed.name = n; }
  if (!set.length) return h.json({ ok: false, error: "nothing" }, 400);
  set.push("updated_at = ?"); val.push(h.now());
  await env.DB.prepare("UPDATE km_members SET " + set.join(", ") + " WHERE member_id = ?").bind(...val, m.member_id).run();
  await log(env, who.folder, who.actor, "member", m.member_id, changed);
  return h.json({ ok: true, member: memberView(await memberRow(env, m.member_id), h.now()) });
}
async function doKey(env, h, who, b) {
  const m = b && isHex(b.member_id, 32) ? await memberRow(env, b.member_id) : null;
  if (!m || m.folder_id !== who.folder || m.status === "revoked" || !m.pub) return h.json({ ok: false, error: "no_member" }, 404);
  if (!isB64(b.wrap_s, 400) || !Number.isInteger(b.s_ver) || b.s_ver < 1) return h.json({ ok: false, error: "bad_input" }, 400);
  if (who.actor !== "boss" && m.role !== "user") return h.json({ ok: false, error: "boss_only" }, 403);
  const first = m.status === "joined";
  await env.DB.prepare("UPDATE km_members SET wrap_s = ?, s_ver = ?, status = 'active', updated_at = ? WHERE member_id = ?")
    .bind(b.wrap_s, b.s_ver, h.now(), m.member_id).run();
  // ιστορικό: ΜΟΝΟ ο Boss, ΜΟΝΟ manager με τον διακόπτη ανοιχτό
  if (b.wrap_h !== undefined) {
    if (who.actor !== "boss" || m.role !== "admin" || !m.hist) return h.json({ ok: false, error: "no_hist" }, 403);
    if (!isB64(b.wrap_h, 400) || !Number.isInteger(b.h_ver) || b.h_ver < 1) return h.json({ ok: false, error: "bad_input" }, 400);
    await env.DB.prepare("UPDATE km_members SET wrap_h = ?, h_ver = ? WHERE member_id = ?").bind(b.wrap_h, b.h_ver, m.member_id).run();
  }
  if (first) await log(env, who.folder, who.actor, "activate", m.member_id, null);
  return h.json({ ok: true });
}

// ── Boss ───────────────────────────────────────────────────────────────────
async function setup(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  if (!b || !isPub(b.boss_pub)) return h.json({ ok: false, error: "bad_pub" }, 400);
  const cur = await env.DB.prepare("SELECT * FROM km_team WHERE folder_id = ?").bind(w.folder).first();
  // 🔴 το κλειδί του Boss ΔΕΝ αλλάζει σιωπηλά: όσες προτάσεις είναι σφραγισμένες προς το παλιό θα χάνονταν
  if (cur && cur.boss_pub !== b.boss_pub) return h.json({ ok: false, error: "boss_pub_exists", boss_pub: cur.boss_pub }, 409);
  if (!cur) {
    await env.DB.prepare("INSERT INTO km_team (folder_id, boss_pub, slip_ver, updated_at) VALUES (?, ?, 0, ?)").bind(w.folder, b.boss_pub, h.now()).run();
    await log(env, w.folder, "boss", "setup", null, null);
  }
  return h.json({ ok: true });
}
async function teamGet(request, env, h, pro) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const t = h.now();
  const team = await env.DB.prepare("SELECT * FROM km_team WHERE folder_id = ?").bind(w.folder).first();
  const everyone = await members(env, w.folder), names = {};
  everyone.forEach((m) => { names[m.member_id] = m.name; });   // και των ανακλημένων: το ίχνος μένει ευανάγνωστο
  const ms = everyone.filter((m) => m.status !== "revoked").map((m) => memberView(m, t));
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_proposals WHERE folder_id = ? AND status = 'pending'").bind(w.folder).first();
  const lg = await env.DB.prepare("SELECT at, actor, kind, member_id, detail FROM km_team_log WHERE folder_id = ? ORDER BY id DESC LIMIT 60").bind(w.folder).all();
  return h.json({ ok: true, team: team ? { boss_pub: team.boss_pub, slip_ver: team.slip_ver, hist_ver: team.hist_ver } : null, members: ms, names,
                  pending: pend ? pend.n : 0, max: TEAM_MAX, log: lg.results || [] });
}
async function revoke(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const m = b && isHex(b.member_id, 32) ? await memberRow(env, b.member_id) : null;
  if (!m || m.folder_id !== w.folder || m.status === "revoked") return h.json({ ok: false, error: "no_member" }, 404);
  // Ό,τι έστειλε και περιμένει ΜΕΝΕΙ (η δουλειά του ανήκει στην επιχείρηση) — μόνο η πρόσβαση κόβεται.
  await env.DB.prepare("UPDATE km_members SET status = 'revoked', auth_hash = NULL, wrap_s = NULL, wrap_h = NULL, h_ver = NULL, invite_hash = NULL, manage = 0, hist = 0, updated_at = ? WHERE member_id = ?")
    .bind(h.now(), m.member_id).run();
  await log(env, w.folder, "boss", "revoke", m.member_id, { name: m.name, role: m.role });
  return h.json({ ok: true });
}
async function putSlip(request, env, h, pro, who, kind) {
  const ver = Number(request.headers.get("X-Km-Slip-Ver"));
  if (!Number.isInteger(ver) || ver < 1) return h.json({ ok: false, error: "bad_ver" }, 400);
  const body = await request.arrayBuffer();
  if (body.byteLength < 29 || body.byteLength > SLIP_MAX_BYTES) return h.json({ ok: false, error: "bad_size" }, 400);
  await env.FOLDERS.put(who.folder + "/team/" + kind + ".bin", body, { httpMetadata: { contentType: "application/octet-stream" } });
  if (kind === "slip") await env.DB.prepare("UPDATE km_team SET slip_ver = ?, updated_at = ? WHERE folder_id = ?").bind(ver, h.now(), who.folder).run();
  else await env.DB.prepare("UPDATE km_team SET hist_ver = ?, updated_at = ? WHERE folder_id = ?").bind(ver, h.now(), who.folder).run();
  return h.json({ ok: true, slip_ver: ver });
}
async function proposalsList(request, env, h, pro) {
  const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
  const r = await env.DB.prepare(
    `SELECT p.id, p.member_id, p.created_at, p.meta, p.pages, m.name, m.role FROM km_proposals p LEFT JOIN km_members m ON m.member_id = p.member_id
     WHERE p.folder_id = ? AND p.status = 'pending' ORDER BY p.created_at LIMIT 100`).bind(w.folder).all();
  return h.json({ ok: true, proposals: r.results || [] });
}
async function pageGet(request, env, h, pro, folder, prop, n) {
  const obj = await env.FOLDERS.get(folder + "/team/p/" + prop + "/" + n + ".bin");
  if (!obj) return h.json({ ok: false, error: "no_page" }, 404);
  return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}
async function decide(request, env, h, pro) {
  const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
  const b = await h.safeJson(request);
  const d = b && { taken: 1, approved: 1, rejected: 1 }[b.decision] ? b.decision : null;
  const p = b && isHex(b.id, 32) ? await env.DB.prepare("SELECT * FROM km_proposals WHERE id = ?").bind(b.id).first() : null;
  if (!d || !p || p.folder_id !== w.folder) return h.json({ ok: false, error: "no_proposal" }, 404);
  if (p.status === d) return h.json({ ok: true, same: true });
  if (d === "taken" && p.status !== "pending") return h.json({ ok: false, error: "not_pending" }, 409);
  // «taken» = πέρασε στα Εκκρεμή του Boss (σφραγισμένη πλέον με το Κ): οι σελίδες στον server σβήνονται εδώ.
  await env.DB.prepare("UPDATE km_proposals SET status = ?, decided_at = ?, meta = CASE WHEN ? = 'pending' THEN meta ELSE '' END WHERE id = ?")
    .bind(d, h.now(), d, p.id).run();
  for (let n = 0; n < p.pages; n++) { try { await env.FOLDERS.delete(w.folder + "/team/p/" + p.id + "/" + n + ".bin"); } catch (e) {} }
  if (d !== "taken") await log(env, w.folder, "boss", d === "approved" ? "approve" : "reject", p.member_id, { id: p.id });
  return h.json({ ok: true });
}

// ── Μέλος ──────────────────────────────────────────────────────────────────
async function join(request, env, h) {
  const b = await h.safeJson(request);
  if (!b || !isHex(b.code, 32) || !isHex(b.member_auth, 64) || !isPub(b.pub)) return h.json({ ok: false, error: "bad_input" }, 400);
  const m = await env.DB.prepare("SELECT * FROM km_members WHERE invite_hash = ?").bind(await h.sha256hex(b.code)).first();
  if (!m || m.status !== "invited") return h.json({ ok: false, error: "bad_invite" }, 404);
  if (m.invite_exp < h.now()) return h.json({ ok: false, error: "invite_expired" }, 410);
  const team = await env.DB.prepare("SELECT boss_pub FROM km_team WHERE folder_id = ?").bind(m.folder_id).first();
  // Μία χρήση: η πρόσκληση σβήνει ΤΗ ΣΤΙΓΜΗ που χρησιμοποιείται.
  const r = await env.DB.prepare(
    "UPDATE km_members SET status = 'joined', invite_hash = NULL, auth_hash = ?, pub = ?, device = ?, updated_at = ? WHERE member_id = ? AND status = 'invited'"
  ).bind(await h.sha256hex(b.member_auth), b.pub, h.clean(b.device, 80), h.now(), m.member_id).run();
  if (!r || !r.meta || r.meta.changes !== 1) return h.json({ ok: false, error: "bad_invite" }, 409);
  await log(env, m.folder_id, "m:" + m.member_id, "join", m.member_id, { device: h.clean(b.device, 80) });
  return h.json({ ok: true, member_id: m.member_id, role: m.role, name: m.name, boss_pub: team ? team.boss_pub : null });
}
async function me(request, env, h, pro) {
  const w = await member(request, env, h, pro); if (w.err) return w.err;
  const team = await env.DB.prepare("SELECT boss_pub, slip_ver, hist_ver FROM km_team WHERE folder_id = ?").bind(w.folder).first();
  return h.json({ ok: true, pro: w.proOn, hist_ver: team && w.m.hist ? team.hist_ver : 0, me: Object.assign(memberView(w.m, h.now()), { wrap_s: w.m.wrap_s || null, wrap_h: w.m.hist ? (w.m.wrap_h || null) : null }),
                  boss_pub: team ? team.boss_pub : null, slip_ver: team ? team.slip_ver : 0 });
}
const dutyErr = (h, w) => (!w.proOn ? h.json({ ok: false, error: "not_pro" }, 403) : !onDuty(w.m, h.now()) ? h.json({ ok: false, error: "off_duty" }, 423) : null);
async function slipGet(request, env, h, pro, kind) {
  const w = await member(request, env, h, pro); if (w.err) return w.err;
  const e = dutyErr(h, w); if (e) return e;
  // ιστορικό: ΜΟΝΟ manager με τον διακόπτη ανοιχτό — ο server το ελέγχει, όχι μόνο η οθόνη
  if (kind === "hist" && (w.m.role !== "admin" || !w.m.hist)) return h.json({ ok: false, error: "no_hist" }, 403);
  const obj = await env.FOLDERS.get(w.folder + "/team/" + kind + ".bin");
  if (!obj) return h.json({ ok: false, error: "no_slip" }, 404);
  return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}
async function propNew(request, env, h, pro) {
  const w = await member(request, env, h, pro); if (w.err) return w.err;
  const e = dutyErr(h, w); if (e) return e;
  const b = await h.safeJson(request);
  if (!b || !isHex(b.id, 32) || !isB64(b.meta, META_MAX) || !Number.isInteger(b.pages) || b.pages < 0 || b.pages > PAGES_MAX) return h.json({ ok: false, error: "bad_input" }, 400);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_proposals WHERE folder_id = ? AND status = 'pending'").bind(w.folder).first();
  if (n && n.n >= PENDING_MAX) return h.json({ ok: false, error: "inbox_full" }, 429);
  const old = await env.DB.prepare("SELECT member_id, status FROM km_proposals WHERE id = ?").bind(b.id).first();
  if (old) return old.member_id === w.m.member_id ? h.json({ ok: true, same: true }) : h.json({ ok: false, error: "id_taken" }, 409);
  // 🔴 ΕΚΚΡΕΜΗΣ ΜΕΧΡΙ ΝΑ ΑΝΕΒΟΥΝ ΟΙ ΣΕΛΙΔΕΣ: ο Boss δεν βλέπει μισή πρόταση (status 'upload' → 'pending' με την τελευταία σελίδα)
  await env.DB.prepare("INSERT INTO km_proposals (id, folder_id, member_id, created_at, status, meta, pages) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(b.id, w.folder, w.m.member_id, h.now(), b.pages ? "upload" : "pending", b.meta, b.pages).run();
  if (!b.pages) await log(env, w.folder, w.actor, "propose", w.m.member_id, { id: b.id });
  return h.json({ ok: true });
}
async function propPage(request, env, h, pro, url) {
  const w = await member(request, env, h, pro); if (w.err) return w.err;
  const e = dutyErr(h, w); if (e) return e;
  const id = url.searchParams.get("id") || "", n = Number(url.searchParams.get("n"));
  const p = isHex(id, 32) ? await env.DB.prepare("SELECT * FROM km_proposals WHERE id = ?").bind(id).first() : null;
  if (!p || p.member_id !== w.m.member_id || p.status !== "upload" || !Number.isInteger(n) || n < 0 || n >= p.pages) return h.json({ ok: false, error: "no_proposal" }, 404);
  const body = await request.arrayBuffer();
  if (body.byteLength < 29 || body.byteLength > PAGE_MAX_BYTES) return h.json({ ok: false, error: "bad_size" }, 400);
  await env.FOLDERS.put(w.folder + "/team/p/" + id + "/" + n + ".bin", body, { httpMetadata: { contentType: "application/octet-stream" } });
  // όταν ανέβει και η τελευταία σελίδα (με τη σειρά 0..N-1), η πρόταση γίνεται ορατή στον Boss
  if (n === p.pages - 1) {
    let all = true;
    for (let i = 0; i < p.pages - 1; i++) { if (!(await env.FOLDERS.head(w.folder + "/team/p/" + id + "/" + i + ".bin"))) { all = false; break; } }
    if (all) {
      await env.DB.prepare("UPDATE km_proposals SET status = 'pending' WHERE id = ? AND status = 'upload'").bind(id).run();
      await log(env, w.folder, w.actor, "propose", w.m.member_id, { id });
    }
  }
  return h.json({ ok: true });
}
async function propMine(request, env, h, pro) {
  const w = await member(request, env, h, pro); if (w.err) return w.err;
  // 🔴 ΧΩΡΙΣ ΙΣΤΟΡΙΚΟ (4/9): ο υπάλληλος βλέπει ΜΟΝΟ την κατάσταση — ποτέ ξανά τα δεδομένα που έστειλε
  const r = await env.DB.prepare("SELECT id, created_at, status, decided_at FROM km_proposals WHERE member_id = ? ORDER BY created_at DESC LIMIT 30").bind(w.m.member_id).all();
  return h.json({ ok: true, proposals: r.results || [] });
}

// ── routes ─────────────────────────────────────────────────────────────────
export async function handleTeam(request, env, path, h, pro) {
  const method = request.method, url = new URL(request.url);
  if (path === "/api/km/pro/team/setup" && method === "POST") return setup(request, env, h, pro);
  if (path === "/api/km/pro/team" && method === "GET") return teamGet(request, env, h, pro);
  if (path === "/api/km/pro/team/revoke" && method === "POST") return revoke(request, env, h, pro);
  if (path === "/api/km/pro/team/proposals" && method === "GET") return proposalsList(request, env, h, pro);
  if (path === "/api/km/pro/team/decide" && method === "POST") return decide(request, env, h, pro);
  if (path === "/api/km/pro/team/page" && method === "GET") {
    const w = await boss(request, env, h, pro, false); if (w.err) return w.err;
    const id = url.searchParams.get("id") || "", n = Number(url.searchParams.get("n"));
    const p = isHex(id, 32) ? await env.DB.prepare("SELECT folder_id, pages FROM km_proposals WHERE id = ?").bind(id).first() : null;
    if (!p || p.folder_id !== w.folder || !Number.isInteger(n) || n < 0 || n >= p.pages) return h.json({ ok: false, error: "no_page" }, 404);
    return pageGet(request, env, h, pro, w.folder, id, n);
  }
  if ((path === "/api/km/pro/team/slip" || path === "/api/km/pro/team/hist") && method === "PUT") {
    const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
    return putSlip(request, env, h, pro, w, path.endsWith("/hist") ? "hist" : "slip");
  }
  { const m = /^\/api\/km\/pro\/team\/(invite|member|key)$/.exec(path);
    if (m && method === "POST") {
      const w = await boss(request, env, h, pro, true); if (w.err) return w.err;
      const b = await h.safeJson(request);
      return m[1] === "invite" ? doInvite(env, h, w, b) : m[1] === "member" ? doMember(env, h, w, b) : doKey(env, h, w, b);
    } }
  // μέλος
  if (path === "/api/km/pro/m/join" && method === "POST") return join(request, env, h);
  if (path === "/api/km/pro/m/me" && method === "GET") return me(request, env, h, pro);
  if (path === "/api/km/pro/m/slip" && method === "GET") return slipGet(request, env, h, pro, "slip");
  if (path === "/api/km/pro/m/hist" && method === "GET") return slipGet(request, env, h, pro, "hist");
  if (path === "/api/km/pro/m/proposal" && method === "POST") return propNew(request, env, h, pro);
  if (path === "/api/km/pro/m/page" && method === "PUT") return propPage(request, env, h, pro, url);
  if (path === "/api/km/pro/m/proposals" && method === "GET") return propMine(request, env, h, pro);
  if (path === "/api/km/pro/m/read" && method === "POST") {
    const w = await member(request, env, h, pro); if (w.err) return w.err;
    const e = dutyErr(h, w); if (e) return e;
    return pro.readFor(request, env, h, w.folder);
  }
  if (path === "/api/km/pro/m/team" && method === "GET") {   // manager με «διαχείριση»: ΜΟΝΟ οι υπάλληλοι
    const w = await member(request, env, h, pro); if (w.err) return w.err;
    if (w.m.role !== "admin" || !w.m.manage || w.m.status !== "active" || !w.proOn) return h.json({ ok: false, error: "boss_only" }, 403);
    const t = h.now(), live = (await members(env, w.folder)).filter((m) => m.status !== "revoked");
    return h.json({ ok: true, members: live.filter((m) => m.role === "user").map((m) => memberView(m, t)), max: TEAM_MAX, used: live.length });
  }
  { const m = /^\/api\/km\/pro\/m\/team\/(invite|member|key)$/.exec(path);
    if (m && method === "POST") {
      const w = await member(request, env, h, pro); if (w.err) return w.err;
      // ΜΟΝΟ manager με «διαχείριση» που ΔΕΝ έχει ανακληθεί (6/9: η παραχώρηση είναι ανακλητή ανά πάσα στιγμή)
      if (w.m.role !== "admin" || !w.m.manage || w.m.status !== "active" || !w.proOn) return h.json({ ok: false, error: "boss_only" }, 403);
      const b = await h.safeJson(request);
      return m[1] === "invite" ? doInvite(env, h, w, b) : m[1] === "member" ? doMember(env, h, w, b) : doKey(env, h, w, b);
    } }
  return null;
}

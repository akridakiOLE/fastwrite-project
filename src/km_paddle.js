// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-F5 · ΣΥΝΔΡΟΜΗ PRO ΑΠΟ ΤΟΝ ΠΑΡΟΧΟ ΠΛΗΡΩΜΩΝ (Paddle Billing, merchant of record) — 15/10/2026
//
// Αποφάσεις: Α320 13/10 (PRO αγοράζεται στο fastwrite.tech μέσω Paddle, όχι στην εφαρμογή) ·
//            Α603 12/10 (αναβάθμιση Free → PRO απευθείας στο μενού · νέος πελάτης απευθείας PRO).
// ⚠ ΧΩΡΙΣ λογαριασμό Paddle ακόμα (ανοίγει από τον Stavros, Νοέμβριος): ο κώδικας δοκιμάζεται με
//   ΨΕΥΤΙΚΑ, σωστά υπογεγραμμένα γεγονότα (tests/pro_f5.test.mjs · tools/pro/paddle_mock.mjs).
//
// Τεκμηρίωση Paddle Billing (developer.paddle.com, διαβάστηκε 15/10/2026):
//   · /webhooks/about/signature-verification — header «Paddle-Signature: ts=…;h1=…»,
//     HMAC-SHA256( secret , ts + ":" + ΑΚΑΤΕΡΓΑΣΤΟ σώμα ), hex. Στην αλλαγή μυστικού έρχονται >1 h1.
//     Προεπιλεγμένη ανοχή χρόνου 5″ (προστασία από επανάληψη).
//   · /webhooks/about/respond-to-webhooks — 200 μέσα σε 5″ · επαναλήψεις (live: 60 σε 3 ημέρες) ·
//     ΚΑΜΙΑ εγγύηση σειράς → κρατάμε occurred_at και δεν γυρνάμε πίσω σε παλιότερο γεγονός.
//   · /webhooks/about/how-webhooks-work — «τουλάχιστον μία φορά» → μοναδικότητα στο event_id (evt_…).
//   · /build/subscriptions/provision-access-webhooks — πρόσβαση σε trialing / active / past_due ·
//     paused / canceled → χωρίς πρόσβαση.
//   · /build/transactions/custom-data — το customData του Checkout αντιγράφεται στη συνδρομή.
//   · /webhooks/customers/customer-created — το email ζει στο customer.* (η συνδρομή έχει customer_id).
//
// ΠΩΣ ΒΡΙΣΚΕΤΑΙ Ο ΛΟΓΑΡΙΑΣΜΟΣ (δεν υπάρχει κουμπί αγοράς μέσα στην εφαρμογή — Apple 3.1.3γ):
//   1. custom_data.km_email (το email λογαριασμού Kostometro που γράφει ο αγοραστής στη σελίδα PRO)
//   2. αλλιώς το email πελάτη της Paddle (customer.created / customer.updated)
//   → km_accounts.email (ένα email = ένας λογαριασμός, Brief ΣΤ). Αν δεν υπάρχει ακόμα λογαριασμός,
//   η συνδρομή μένει «σε αναμονή» (folder_id NULL) και δένεται στην εγγραφή / στο πρώτο pro/status.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ: δεν αποθηκεύει το σώμα του γεγονότος, ποτέ κάρτα, ποτέ ποσά.
// ═══════════════════════════════════════════════════════════════════════════

export const PADDLE_TOLERANCE_S = 5;                 // τεκμηρίωση Paddle, προεπιλογή
export const PADDLE_MAX_BODY = 256 * 1024;
const ACCESS = { active: 1, trialing: 1, past_due: 1 };          // πρόσβαση (Paddle: provision-access-webhooks)
const PAID = { active: 1, past_due: 1 };                         // «πλήρωσε» → km_accounts.plan (συστάσεις §9.11.2)
const KNOWN = { active: 1, trialing: 1, past_due: 1, paused: 1, canceled: 1 };
// ⏳ ΧΡΟΝΟΣ ΑΣΦΑΛΕΙΑΣ πάνω από το τέλος της περιόδου: αν χαθεί το γεγονός ανανέωσης/ακύρωσης, η
// πρόσβαση ΛΗΓΕΙ μόνη της αντί να μείνει ανοιχτή για πάντα. past_due: η Paddle ξαναχρεώνει
// (Retain) και στο τέλος ακυρώνει — κρατάμε πρόσβαση όπως συνιστά, έως 30 ημέρες.
const GRACE_MS = { active: 3 * 864e5, trialing: 3 * 864e5, past_due: 30 * 864e5 };

const hexOf = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function normMail(e) {
  if (typeof e !== "string") return null;
  const t = e.trim().toLowerCase().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}
const sid = (v, pre) => (typeof v === "string" && v.length <= 80 && v.startsWith(pre) && /^[A-Za-z0-9_]+$/.test(v) ? v : null);
const iso = (v) => (typeof v === "string" && !isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

// ── ΥΠΟΓΡΑΦΗ ───────────────────────────────────────────────────────────────
export async function paddleSign(secret, ts, raw) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hexOf(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + ":" + raw)));
}
// → null (σωστή) ή κωδικός σφάλματος
export async function paddleVerify(secret, header, raw, nowMs) {
  if (!secret) return "no_secret";
  const parts = {}; const h1 = [];
  for (const p of String(header || "").split(";")) {
    const i = p.indexOf("="); if (i < 1) continue;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    if (k === "h1") h1.push(v); else parts[k] = v;
  }
  if (!/^\d{9,11}$/.test(parts.ts || "") || !h1.length) return "bad_header";
  if (Math.abs(nowMs / 1000 - Number(parts.ts)) > PADDLE_TOLERANCE_S) return "stale";
  const want = await paddleSign(secret, parts.ts, raw);
  return h1.some((x) => safeEq(x.toLowerCase(), want)) ? null : "bad_signature";
}

// ── ΔΙΚΑΙΩΜΑ: ξαναϋπολογίζεται από ΟΛΕΣ τις συνδρομές του φακέλου (2ο σημείο = 2η συνδρομή) ──
export async function proRecompute(env, folder, nowIso) {
  if (!folder) return null;
  const subs = (await env.DB.prepare("SELECT * FROM km_pro_sub WHERE folder_id = ?").bind(folder).all()).results || [];
  let until = null, paid = false, any = false;
  for (const s of subs) {
    if (!ACCESS[s.status]) continue;
    const end = s.period_end ? Date.parse(s.period_end) + (GRACE_MS[s.status] || 0) : null;
    const u = end ? new Date(end).toISOString() : null;
    if (u && u <= nowIso) continue;
    any = true; if (PAID[s.status]) paid = true;
    if (!u) until = "∞"; else if (until !== "∞" && (!until || u > until)) until = u;
  }
  const row = await env.DB.prepare("SELECT * FROM km_pro WHERE folder_id = ?").bind(folder).first();
  // καμία συνδρομή: δεν αγγίζουμε ό,τι δεν έγραψε ο πάροχος (π.χ. δοκιμή admin)· ό,τι έγραψε ο πάροχος → λήγει
  if (!subs.length && !(row && row.source === "mor")) return row ? row.status : null;
  if (row && row.source === "admin" && row.status === "test" && !any) return row.status;   // δοκιμή admin δεν σβήνεται από ληγμένη συνδρομή
  const status = any ? "active" : "cancelled";
  const u = any ? (until === "∞" ? null : until) : nowIso;
  await env.DB.prepare(
    `INSERT INTO km_pro (folder_id, plan, status, started_at, until, source, updated_at) VALUES (?, 'pro', ?, ?, ?, 'mor', ?)
     ON CONFLICT(folder_id) DO UPDATE SET status = excluded.status, until = excluded.until, source = 'mor', updated_at = excluded.updated_at`
  ).bind(folder, status, nowIso, u, nowIso).run();
  // «πλήρωσε και παραμένει ενεργός» = κριτήριο σύστασης (§9.11.2) — μόνο active / past_due, ΟΧΙ δοκιμή
  await env.DB.prepare("UPDATE km_accounts SET plan = ? WHERE folder_id = ?").bind(paid ? "pro" : null, folder).run();
  return status;
}

// Καθημερινά (cron): φάκελοι του παρόχου που η πρόσβασή τους έληξε χωρίς γεγονός → ξαναϋπολογισμός.
export async function proExpire(env, nowIso) {
  const rows = (await env.DB.prepare("SELECT folder_id FROM km_pro WHERE source = 'mor' AND status = 'active' AND until IS NOT NULL AND until <= ? LIMIT 500").bind(nowIso).all()).results || [];
  for (const r of rows) await proRecompute(env, r.folder_id, nowIso);
  return rows.length;
}

async function folderOfEmail(env, email) {
  if (!email) return null;
  const r = await env.DB.prepare("SELECT folder_id FROM km_accounts WHERE email = ? AND deleted IS NULL AND delete_due_at IS NULL LIMIT 1").bind(email).first();
  return r ? r.folder_id : null;
}

// Νέος λογαριασμός / pro/status: δένει συνδρομές «σε αναμονή» με το ίδιο email (νέος πελάτης απευθείας PRO).
export async function proClaim(env, folder, email, nowIso) {
  const e = normMail(email);
  if (!folder || !e) return 0;
  const r = await env.DB.prepare("UPDATE km_pro_sub SET folder_id = ?, updated_at = ? WHERE folder_id IS NULL AND email = ?").bind(folder, nowIso, e).run();
  const n = (r && r.meta && r.meta.changes) || 0;
  if (n) await proRecompute(env, folder, nowIso);
  return n;
}

// ── ΓΕΓΟΝΟΤΑ ───────────────────────────────────────────────────────────────
async function onCustomer(env, d, occ, t) {
  const cid = sid(d.id, "ctm_"), email = normMail(d.email);
  if (!cid) return "bad_customer";
  const cur = await env.DB.prepare("SELECT occurred_at FROM km_pro_customer WHERE customer_id = ?").bind(cid).first();
  if (cur && cur.occurred_at > occ) return "older";
  await env.DB.prepare(
    `INSERT INTO km_pro_customer (customer_id, email, occurred_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(customer_id) DO UPDATE SET email = excluded.email, occurred_at = excluded.occurred_at, updated_at = excluded.updated_at`
  ).bind(cid, email, occ, t).run();
  // συνδρομές που περίμεναν το email αυτού του πελάτη (χωρίς km_email): δένονται τώρα
  const wait = (await env.DB.prepare("SELECT sub_id FROM km_pro_sub WHERE customer_id = ? AND folder_id IS NULL AND email IS NULL").bind(cid).all()).results || [];
  if (wait.length && email) {
    await env.DB.prepare("UPDATE km_pro_sub SET email = ?, updated_at = ? WHERE customer_id = ? AND folder_id IS NULL AND email IS NULL").bind(email, t, cid).run();
    const f = await folderOfEmail(env, email);
    if (f) await proClaim(env, f, email, t);
  }
  return "ok";
}

async function onSubscription(env, d, occ, t) {
  const subId = sid(d.id, "sub_");
  if (!subId) return { out: "bad_subscription" };
  const status = KNOWN[d.status] ? d.status : null;
  if (!status) return { out: "unknown_status", subId };
  const cid = sid(d.customer_id, "ctm_");
  const cd = d.custom_data && typeof d.custom_data === "object" && !Array.isArray(d.custom_data) ? d.custom_data : {};
  const cur = await env.DB.prepare("SELECT * FROM km_pro_sub WHERE sub_id = ?").bind(subId).first();
  if (cur && cur.occurred_at > occ) return { out: "older", subId };        // παλιότερο γεγονός ήρθε αργά — αγνοείται
  let email = normMail(cd.km_email);
  if (!email && cid) { const c = await env.DB.prepare("SELECT email FROM km_pro_customer WHERE customer_id = ?").bind(cid).first(); email = c ? normMail(c.email) : null; }
  if (!email && cur) email = cur.email;
  // ο φάκελος: ό,τι ήταν ήδη δεμένο ΜΕΝΕΙ (δεν «μετακομίζει» συνδρομή επειδή άλλαξε email στην Paddle)
  const folder = (cur && cur.folder_id) || (await folderOfEmail(env, email));
  const pe = d.current_billing_period && typeof d.current_billing_period === "object" ? iso(d.current_billing_period.ends_at) : null;
  const sc = d.scheduled_change && typeof d.scheduled_change === "object" ? d.scheduled_change : null;
  const pr = Array.isArray(d.items) && d.items[0] && d.items[0].price ? sid(d.items[0].price.id, "pri_") : null;
  await env.DB.prepare(
    `INSERT INTO km_pro_sub (sub_id, provider, customer_id, email, folder_id, status, period_end, sched_action, sched_at, price_id, occurred_at, created_at, updated_at)
     VALUES (?, 'paddle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sub_id) DO UPDATE SET customer_id = COALESCE(excluded.customer_id, km_pro_sub.customer_id), email = excluded.email,
       folder_id = excluded.folder_id, status = excluded.status, period_end = excluded.period_end, sched_action = excluded.sched_action,
       sched_at = excluded.sched_at, price_id = COALESCE(excluded.price_id, km_pro_sub.price_id), occurred_at = excluded.occurred_at, updated_at = excluded.updated_at`
  ).bind(subId, cid, email, folder, status, pe, sc && typeof sc.action === "string" ? sc.action.slice(0, 20) : null,
         sc ? iso(sc.effective_at) : null, pr, occ, t, t).run();
  if (folder) await proRecompute(env, folder, t);
  return { out: folder ? "applied" : "pending", subId, folder };
}

// POST /api/km/pro/paddle/webhook
export async function paddleWebhook(request, env, h) {
  const t = h.now();
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > PADDLE_MAX_BODY) return h.json({ ok: false, error: "too_big" }, 413);
  const raw = await request.text();
  if (raw.length > PADDLE_MAX_BODY) return h.json({ ok: false, error: "too_big" }, 413);
  const secret = env.PADDLE_WEBHOOK_SECRET;
  // 🔴 Χωρίς μυστικό ΔΕΝ απαντάμε 200: η Paddle ξαναστέλνει (3 ημέρες) και το σφάλμα φαίνεται στα logs.
  if (!secret) { console.error("paddle: PADDLE_WEBHOOK_SECRET λείπει — γεγονός ΔΕΝ εφαρμόστηκε"); return h.json({ ok: false, error: "not_configured" }, 503); }
  const bad = await paddleVerify(secret, request.headers.get("Paddle-Signature"), raw, Date.now());
  if (bad) { console.error("paddle: απόρριψη · " + bad); return h.json({ ok: false, error: bad }, 401); }
  let ev; try { ev = JSON.parse(raw); } catch (e) { return h.json({ ok: false, error: "bad_json" }, 400); }
  const evId = ev && sid(ev.event_id, "evt_"), type = ev && typeof ev.event_type === "string" ? ev.event_type.slice(0, 60) : null;
  const occ = iso(ev && ev.occurred_at), d = ev && ev.data && typeof ev.data === "object" ? ev.data : null;
  if (!evId || !type || !occ || !d) return h.json({ ok: false, error: "bad_event" }, 400);
  // μία φορά ανά event_id: γράφεται ΠΡΩΤΑ — δεύτερη παράδοση = 200 χωρίς δουλειά
  const ins = await env.DB.prepare("INSERT INTO km_pro_events (event_id, event_type, occurred_at, received_at, outcome) VALUES (?, ?, ?, ?, 'working') ON CONFLICT(event_id) DO NOTHING")
    .bind(evId, type, occ, t).run();
  if (!ins.meta || !ins.meta.changes) {
    const prev = await env.DB.prepare("SELECT outcome FROM km_pro_events WHERE event_id = ?").bind(evId).first();
    if (prev && prev.outcome !== "working" && prev.outcome !== "error") return h.json({ ok: true, duplicate: true });
  }
  let res;
  try {
    if (type === "customer.created" || type === "customer.updated" || type === "customer.imported") res = { out: await onCustomer(env, d, occ, t) };
    else if (type.startsWith("subscription.")) res = await onSubscription(env, d, occ, t);
    else res = { out: "ignored" };
  } catch (e) {
    await env.DB.prepare("UPDATE km_pro_events SET outcome = 'error' WHERE event_id = ?").bind(evId).run();
    console.error("paddle: " + type + " · " + (e && e.message));
    return h.json({ ok: false, error: "internal" }, 500);   // η Paddle ξαναστέλνει
  }
  await env.DB.prepare("UPDATE km_pro_events SET outcome = ?, sub_id = ? WHERE event_id = ?").bind(res.out, res.subId || null, evId).run();
  return h.json({ ok: true, outcome: res.out });
}

// POST /api/km/admin/pro/link  { sub_id, folder_id }  — υποστήριξη: ο αγοραστής έγραψε άλλο email
export async function paddleAdminLink(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await h.safeJson(request)) || {};
  const subId = sid(b.sub_id, "sub_"), folder = typeof b.folder_id === "string" ? b.folder_id.toLowerCase() : "";
  if (!subId || !/^[0-9a-f]{64}$/.test(folder)) return h.json({ ok: false, error: "bad_input" }, 400);
  const acc = await env.DB.prepare("SELECT folder_id FROM km_accounts WHERE folder_id = ? AND deleted IS NULL").bind(folder).first();
  if (!acc) return h.json({ ok: false, error: "no_account" }, 404);
  const cur = await env.DB.prepare("SELECT folder_id FROM km_pro_sub WHERE sub_id = ?").bind(subId).first();
  if (!cur) return h.json({ ok: false, error: "no_sub" }, 404);
  const t = h.now();
  await env.DB.prepare("UPDATE km_pro_sub SET folder_id = ?, updated_at = ? WHERE sub_id = ?").bind(folder, t, subId).run();
  if (cur.folder_id && cur.folder_id !== folder) await proRecompute(env, cur.folder_id, t);
  return h.json({ ok: true, status: await proRecompute(env, folder, t) });
}

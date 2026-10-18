// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-V201 · ΠΡΟΠΛΗΡΩΜΕΝΟ ΥΠΟΛΟΙΠΟ ΣΕ ΧΡΗΜΑΤΑ — Π1 του Brief «Τρία σκαλιά» (εγκρίθηκε 18/10/2026)
//
//   GET  /api/km/bal                 -> υπόλοιπο σε € + πόσα τιμολόγια PRO.mini / PRO + κινήσεις του μήνα
//   POST /api/km/admin/bal/credit    -> (KM_ADMIN_KEY) { folder_id | email, eur, note } — πίστωση από τον Stavros
//   POST /api/km/admin/bal/review    -> (KM_ADMIN_KEY) { lot_id, net_eur } — αγορά «υπό έλεγχο» γίνεται υπόλοιπο
//   GET  /api/km/admin/bal?folder_id -> (KM_ADMIN_KEY) όλες οι αγορές ενός λογαριασμού
//   (Π2 · αγορές καταστημάτων: src/km_iap.js · Π3 · Paddle: src/km_paddle.js)
//
// Αποφάσεις (Stavros):
//   15/10 · τιμή ανάγνωσης = κόστος Anthropic + 15 %, χωρίς κέρδος, χωρίς ζημιά · ό,τι αγοράστηκε κρατά την τιμή του
//   18/10 · το υπόλοιπο PRO.mini περνά στο PRO ΣΕ ΧΡΗΜΑΤΑ με την τιμή του PRO · ανάγνωση ΚΑΙ Κώστας στη δοκιμή
//           χρεώνονται από το υπόλοιπο · μηδέν κόστος για εμάς
// Τεχνικές αποφάσεις (Claude):
//   · ΧΡΗΜΑΤΑ, όχι «αριθμός τιμολογίων»: αλλιώς δεν γίνεται ούτε η μεταφορά PRO.mini → PRO ούτε η χρέωση του Κώστα.
//   · ΚΑΘΕ ΑΓΟΡΑ = ένα lot με ΚΛΕΙΔΩΜΕΝΕΣ τιμές (rate_mini, rate_pro, fx, markup). Η ανάγνωση ξοδεύει πρώτα το
//     παλιότερο lot με τη δική του τιμή· αν ένα lot τελειώνει στη μέση, το υπόλοιπο της ανάγνωσης πάει στο επόμενο
//     με την τιμή του επομένου. Νέα τιμή (ρύθμιση) ισχύει ΜΟΝΟ σε νέες αγορές.
//   · ΣΤΟ ΥΠΟΛΟΙΠΟ ΜΠΑΙΝΕΙ Ο,ΤΙ ΕΙΣΠΡΑΤΤΟΥΜΕ: χωρίς ΦΠΑ της χώρας, χωρίς προμήθεια καταστήματος/Paddle — έτσι το
//     «χωρίς κέρδος, χωρίς ζημιά» ισχύει σε κάθε χώρα (Brief §3: «τα τιμολόγια υπολογίζονται ανά χώρα»).
//   · ΑΤΟΜΙΚΗ ΧΡΕΩΣΗ: km_bal.ver αλλάζει σε κάθε κίνηση· η χρέωση γράφει μόνο αν το ver είναι αυτό που διάβασε,
//     μέσα σε μία δοσοληψία (D1 batch). Δύο συσκευές / δύο υπάλληλοι ταυτόχρονα δεν ξοδεύουν τα ίδια χρήματα.
//   · ΚΡΑΤΗΣΗ ΠΡΙΝ, ΕΠΙΣΤΡΟΦΗ ΜΕΤΑ: η ανάγνωση κρατά τα χρήματα πριν καλέσει τον πάροχο· αποτυχία ή «δεν βρέθηκαν
//     ποσά/γραμμές» = επιστροφή στα ΙΔΙΑ lots (Brief §3: αποτυχημένη ανάγνωση δεν χρεώνεται).
// Ποσά: ΜΙΚΡΟ-ΕΥΡΩ (ακέραιοι). Ποτέ φωτογραφία, ποτέ κείμενο συνομιλίας σε αυτούς τους πίνακες.
// ═══════════════════════════════════════════════════════════════════════════

export const MICRO = 1e6;
const MAX_RETRY = 6;

// ΦΠΑ ανά χώρα (κανονικός συντελεστής) — taxenlight.com «EU VAT Table 2026», ενημέρωση 19/06/2026, διαβάστηκε 18/10/2026.
// Αλλαγή συντελεστή: ρύθμιση KM_VAT_JSON (π.χ. {"RO":21}) χωρίς νέα έκδοση. Χώρα εκτός πίνακα → αγορά «υπό έλεγχο».
export const VAT = { AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5, FR: 20, DE: 19, GR: 24, HU: 27,
  IE: 23, IT: 22, LV: 21, LT: 21, LU: 17, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25 };
// Η Apple δίνει τη χώρα ως ISO alpha-3 (storefront)
export const A3 = { AUT: "AT", BEL: "BE", BGR: "BG", HRV: "HR", CYP: "CY", CZE: "CZ", DNK: "DK", EST: "EE", FIN: "FI", FRA: "FR",
  DEU: "DE", GRC: "GR", HUN: "HU", IRL: "IE", ITA: "IT", LVA: "LV", LTU: "LT", LUX: "LU", MLT: "MT", NLD: "NL", POL: "PL",
  PRT: "PT", ROU: "RO", SVK: "SK", SVN: "SI", ESP: "ES", SWE: "SE" };
export function vatOf(env, cc) {
  let o = VAT;
  try { if (env && env.KM_VAT_JSON) o = Object.assign({}, VAT, JSON.parse(env.KM_VAT_JSON)); } catch (e) { /* χαλασμένη ρύθμιση → ο πίνακας */ }
  const v = cc && Object.prototype.hasOwnProperty.call(o, cc) ? Number(o[cc]) : NaN;
  return Number.isFinite(v) && v >= 0 && v < 100 ? v : null;
}

const pnum = (v) => { if (v === undefined || v === null || v === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
// ΤΙΜΕΣ = ΡΥΘΜΙΣΗ, ποτέ σταθερά στον κώδικα (ίδιος κανόνας με τη Φ5). Λείπει έστω μία → καμία αγορά δεν
// τιμολογείται (503 not_configured: το κατάστημα / η Paddle ξαναπροσπαθεί, τα χρήματα δεν χάνονται).
//   KM_COST_MINI_USD · KM_COST_PRO_USD = μετρημένο κόστος ανά ανάγνωση (15/10: 0.00243 · 0.0121)
//   KM_FX_USD_EUR = ισοτιμία · KM_MARKUP_PCT = 15 (απόφαση 15/10)
export function balConfig(env) {
  const fx = pnum(env && env.KM_FX_USD_EUR), cm = pnum(env && env.KM_COST_MINI_USD), cp = pnum(env && env.KM_COST_PRO_USD);
  const mk = env && String(env.KM_MARKUP_PCT) === "0" ? 0 : pnum(env && env.KM_MARKUP_PCT);
  if (!fx || mk === null || !cm || !cp) return null;
  const conv = fx * (1 + mk / 100);
  return { fx, markup: mk, rate_mini: Math.max(1, Math.round(cm * conv * MICRO)), rate_pro: Math.max(1, Math.round(cp * conv * MICRO)) };
}

export function tok() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const nowIso = () => new Date().toISOString();

// Ταυτότητα λογαριασμού προς τα καταστήματα (Apple appAccountToken = UUID · Google obfuscatedAccountId):
// ΔΕΝ είναι το folder_id (δεν το δίνουμε σε τρίτους) — hash του folder_id (ήδη μυστικό, 64 hex από τις 12 λέξεις).
// ⚠ ΣΤΑΘΕΡΟ ΓΙΑ ΠΑΝΤΑ (αναθεώρηση V201 #6): ΚΑΝΕΝΑ αλάτι που αλλάζει (π.χ. KM_ADMIN_KEY) — αλλιώς κάθε αγορά που δεν
// έκλεισε θα έβγαινε «ξένη» μετά από αλλαγή κλειδιού.
const IAP_PEPPER = "km-iap-v201";
export async function iapToken(env, folder) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(IAP_PEPPER + ":" + folder));
  const h = [...new Uint8Array(buf)].slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
  const v = h.slice(0, 12) + "4" + h.slice(13, 16) + ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 32);
  return v.slice(0, 8) + "-" + v.slice(8, 12) + "-" + v.slice(12, 16) + "-" + v.slice(16, 20) + "-" + v.slice(20, 32);
}

// Δοκιμή PRO: μία ανά email. Hash με μυστικό αλάτι — δεν χρειάζεται να ξέρουμε το email για να το αναγνωρίσουμε.
export async function trialHash(env, email) {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!e) return null;
  // σταθερό αλάτι (KM_TRIAL_SALT, αλλιώς σταθερό του κώδικα) — ΠΟΤΕ το KM_ADMIN_KEY: αλλαγή κλειδιού θα μηδένιζε το «μία ανά email»
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("km-trial:" + e + ":" + ((env && env.KM_TRIAL_SALT) || "km-trial-v201")));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function lotsOf(env, folder) {
  // refunded μένουν μέσα: το αρνητικό τους υπόλοιπο είναι χρέος που μετράει στο σύνολο
  return (await env.DB.prepare(
    "SELECT lot_id, left_micro, rate_mini, rate_pro, fx_usd_eur, markup_pct FROM km_bal_lot WHERE folder_id = ? AND status IN ('ok','refunded') ORDER BY created_at, lot_id"
  ).bind(folder).all()).results || [];
}

// Τι θα πάρει μία πράξη από ποια lots. need = { kind: 'mini'|'pro', reads } | { kind: 'agent', usd_micro }
// per(lot) = μικρο-€ ανά μονάδα (ανά ανάγνωση · ανά μικρο-$ για τον Κώστα).
export function balPlan(lots, need) {
  const per = need.kind === "agent" ? (l) => l.fx_usd_eur * (1 + l.markup_pct / 100)
    : need.kind === "mini" ? (l) => l.rate_mini : (l) => l.rate_pro;
  const total = lots.reduce((s, l) => s + l.left_micro, 0);
  let rem = need.kind === "agent" ? need.usd_micro : (need.reads || 1);
  const parts = []; let sum = 0;
  for (const l of lots) {
    if (rem <= 1e-9) break;
    if (l.left_micro <= 0) continue;
    const want = Math.ceil(rem * per(l) - 1e-9);
    if (l.left_micro >= want) { parts.push({ lot_id: l.lot_id, micro: want }); sum += want; rem = 0; }
    else { parts.push({ lot_id: l.lot_id, micro: l.left_micro }); sum += l.left_micro; rem -= l.left_micro / per(l); }
  }
  return { parts, sum, rem: rem > 1e-9 ? rem : 0, total, last: lots.length ? lots[lots.length - 1] : null, per };
}

// ΧΡΕΩΣΗ (ατομική). opts.allowNegative: ΜΟΝΟ για τη διαφορά κόστους του Κώστα μετά την κλήση (το κόστος έγινε ήδη).
export async function balDebit(env, folder, need, kind, opts) {
  opts = opts || {};
  for (let i = 0; i < MAX_RETRY; i++) {
    const row = await env.DB.prepare("SELECT left_micro, ver FROM km_bal WHERE folder_id = ?").bind(folder).first();
    if (!row) return { ok: false, error: "no_balance", left_micro: 0 };
    const p = balPlan(await lotsOf(env, folder), need);
    const parts = p.parts.slice(); let sum = p.sum;
    const short = p.rem > 0 || p.total - sum < 0;
    if (short && !opts.allowNegative) return { ok: false, error: "no_balance", left_micro: row.left_micro };
    if (p.rem > 0) {
      if (!p.last) return { ok: false, error: "no_lots", left_micro: row.left_micro };
      const x = Math.ceil(p.rem * p.per(p.last));
      const same = parts.find((q) => q.lot_id === p.last.lot_id);
      if (same) same.micro += x; else parts.push({ lot_id: p.last.lot_id, micro: x });
      sum += x;
    }
    if (sum <= 0) return { ok: true, op_id: null, micro: 0, left_micro: row.left_micro };
    const nv = tok(), op = tok(), t = nowIso();
    const guard = "(SELECT ver FROM km_bal WHERE folder_id = ?) = ?";
    const st = [env.DB.prepare("UPDATE km_bal SET left_micro = left_micro - ?, ver = ?, updated_at = ? WHERE folder_id = ? AND ver = ?").bind(sum, nv, t, folder, row.ver)];
    if (opts.hold) st.push(env.DB.prepare(`INSERT INTO km_bal_hold (op_id, folder_id, at) SELECT ?, ?, ? WHERE ${guard}`).bind(op, folder, t, folder, nv));
    for (const x of parts) {
      st.push(env.DB.prepare(`UPDATE km_bal_lot SET left_micro = left_micro - ? WHERE lot_id = ? AND ${guard}`).bind(x.micro, x.lot_id, folder, nv));
      st.push(env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard}`)
        .bind(op, folder, x.lot_id, kind, -x.micro, t, folder, nv));
    }
    const res = await env.DB.batch(st);
    if (res && res[0] && res[0].meta && res[0].meta.changes) return { ok: true, op_id: op, micro: sum, left_micro: row.left_micro - sum };
    // άλλη κίνηση πρόλαβε (ver άλλαξε) → ξαναδιαβάζουμε
  }
  return { ok: false, error: "busy" };
}

// ΕΠΙΣΤΡΟΦΗ μιας κράτησης στα ΙΔΙΑ lots — μία φορά (δεύτερη κλήση = τίποτα).
export async function balRelease(env, folder, opId) {
  if (!opId) return false;
  const rows = (await env.DB.prepare("SELECT lot_id, micro FROM km_bal_tx WHERE op_id = ? AND folder_id = ?").bind(opId, folder).all()).results || [];
  if (!rows.length) return false;
  const rel = "rel-" + opId, nv = tok(), t = nowIso();
  const sum = rows.reduce((s, r) => s - r.micro, 0);
  const guard = "(SELECT ver FROM km_bal WHERE folder_id = ?) = ?";
  const st = [env.DB.prepare("UPDATE km_bal SET left_micro = left_micro + ?, ver = ?, updated_at = ? WHERE folder_id = ? AND NOT EXISTS (SELECT 1 FROM km_bal_tx WHERE op_id = ?)")
    .bind(sum, nv, t, folder, rel)];
  for (const r of rows) {
    st.push(env.DB.prepare(`UPDATE km_bal_lot SET left_micro = left_micro + ? WHERE lot_id = ? AND ${guard}`).bind(-r.micro, r.lot_id, folder, nv));
    st.push(env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, 'release', ?, ? WHERE ${guard}`)
      .bind(rel, folder, r.lot_id, -r.micro, t, folder, nv));
  }
  st.push(env.DB.prepare("DELETE FROM km_bal_hold WHERE op_id = ?").bind(opId));
  const res = await env.DB.batch(st);
  return !!(res && res[0] && res[0].meta && res[0].meta.changes);
}
// Η πράξη ΟΛΟΚΛΗΡΩΘΗΚΕ (η κράτηση γίνεται χρέωση) — σβήνει από τις κρατήσεις σε εξέλιξη.
export async function balSettle(env, opId) {
  if (!opId) return;
  try { await env.DB.prepare("DELETE FROM km_bal_hold WHERE op_id = ?").bind(opId).run(); } catch (e) { console.error("bal settle:", e && e.message); }
}
// Ωριαίο: κρατήσεις που έμειναν ανοιχτές πάνω από 15′ (κομμένο Worker, σφάλμα βάσης) → ΕΠΙΣΤΡΟΦΗ.
export async function balHoldSweep(env, nowIso) {
  const lim = new Date(Date.parse(nowIso || new Date().toISOString()) - 15 * 60000).toISOString();
  const rows = (await env.DB.prepare("SELECT op_id, folder_id FROM km_bal_hold WHERE at < ? LIMIT 500").bind(lim).all()).results || [];
  let n = 0;
  for (const r of rows) { if (await balRelease(env, r.folder_id, r.op_id)) n++; else await env.DB.prepare("DELETE FROM km_bal_hold WHERE op_id = ?").bind(r.op_id).run(); }
  return { released: n, seen: rows.length };
}

// ΠΙΣΤΩΣΗ μιας αγοράς. ext_id ΜΟΝΑΔΙΚΟ: η ίδια αγορά δεύτερη φορά (επανάληψη webhook / δεύτερο πάτημα) = τίποτα.
// lot: { folder_id|null, email, customer, source, ext_id, env, product, country, currency, gross_minor, tax_minor, fee_pct,
//        net_micro, status ('ok'|'review'), note, cfg (balConfig) }
export async function balCredit(env, lot) {
  const cfg = lot.cfg; const id = tok(), t = nowIso();
  const net = lot.status === "ok" ? Math.max(0, Math.round(lot.net_micro || 0)) : 0;
  const st = [env.DB.prepare(
    `INSERT INTO km_bal_lot (lot_id, folder_id, email, customer, source, ext_id, env, product, country, currency, gross_minor, tax_minor, fee_pct,
       net_micro, net0_micro, left_micro, rate_mini, rate_pro, fx_usd_eur, markup_pct, status, note, tok, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(ext_id) DO NOTHING`
  ).bind(id, lot.folder_id || null, lot.email || null, lot.customer || null, lot.source, lot.ext_id, lot.env || "prod", lot.product || null, lot.country || null,
         lot.currency || null, lot.gross_minor == null ? null : lot.gross_minor, lot.tax_minor == null ? null : lot.tax_minor,
         lot.fee_pct == null ? null : lot.fee_pct, net, net, net, cfg.rate_mini, cfg.rate_pro, cfg.fx, cfg.markup, lot.status, lot.note || null, t)];
  if (lot.folder_id) {
    const mine = "(SELECT lot_id FROM km_bal_lot WHERE ext_id = ?) = ?";
    st.push(env.DB.prepare(
      `INSERT INTO km_bal (folder_id, left_micro, ver, updated_at) SELECT ?, ?, ?, ? WHERE ${mine}
       ON CONFLICT(folder_id) DO UPDATE SET left_micro = km_bal.left_micro + excluded.left_micro, ver = excluded.ver, updated_at = excluded.updated_at`
    ).bind(lot.folder_id, net, tok(), t, lot.ext_id, id));
    if (net) st.push(env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, 'buy', ?, ? WHERE ${mine}`)
      .bind("buy-" + id, lot.folder_id, id, net, t, lot.ext_id, id));
  }
  await env.DB.batch(st);
  const cur = await env.DB.prepare("SELECT lot_id, folder_id, status, net_micro FROM km_bal_lot WHERE ext_id = ?").bind(lot.ext_id).first();
  return { ok: !!cur, dup: !!cur && cur.lot_id !== id, lot_id: cur ? cur.lot_id : null, folder_id: cur ? cur.folder_id : null,
           status: cur ? cur.status : null, net_micro: cur ? cur.net_micro : 0 };
}

// Αγορές στο web «σε αναμονή» (πληρώθηκαν πριν υπάρξει λογαριασμός με αυτό το email) → δένονται εδώ.
export async function balClaim(env, folder, email) {
  if (!folder || !email) return 0;
  const rows = (await env.DB.prepare("SELECT lot_id FROM km_bal_lot WHERE folder_id IS NULL AND email = ? AND status IN ('ok','review','refunded') LIMIT 50").bind(email).all()).results || [];
  let n = 0;
  for (const r of rows) {
    const tk = tok(), t = nowIso(), mine = "(SELECT tok FROM km_bal_lot WHERE lot_id = ?) = ?";
    const res = await env.DB.batch([
      env.DB.prepare("UPDATE km_bal_lot SET folder_id = ?, tok = ? WHERE lot_id = ? AND folder_id IS NULL").bind(folder, tk, r.lot_id),
      env.DB.prepare(`INSERT INTO km_bal (folder_id, left_micro, ver, updated_at) SELECT ?, (SELECT left_micro FROM km_bal_lot WHERE lot_id = ?), ?, ? WHERE ${mine}
        ON CONFLICT(folder_id) DO UPDATE SET left_micro = km_bal.left_micro + excluded.left_micro, ver = excluded.ver, updated_at = excluded.updated_at`)
        .bind(folder, r.lot_id, tok(), t, r.lot_id, tk),
      env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, 'buy', (SELECT left_micro FROM km_bal_lot WHERE lot_id = ?), ? WHERE ${mine} AND (SELECT left_micro FROM km_bal_lot WHERE lot_id = ?) != 0`)
        .bind("buy-" + r.lot_id, folder, r.lot_id, r.lot_id, t, r.lot_id, tk, r.lot_id),
    ]);
    if (res && res[0] && res[0].meta && res[0].meta.changes) n++;
  }
  return n;
}

// ΕΠΙΣΤΡΟΦΗ ΧΡΗΜΑΤΩΝ από κατάστημα / Paddle: αφαιρείται ό,τι πιστώθηκε (frac του καθαρού). refId = μοναδικό ανά
// επιστροφή (Apple/Google: το ext_id · Paddle: το adjustment) — η ίδια επιστροφή δεύτερη φορά = τίποτα.
// Αν τα χρήματα ξοδεύτηκαν ήδη, το lot γίνεται αρνητικό (χρέος): οι αναγνώσεις σταματούν ως την επόμενη αγορά.
export async function balRefund(env, extId, frac, refId) {
  const lot = await env.DB.prepare("SELECT * FROM km_bal_lot WHERE ext_id = ?").bind(extId).first();
  if (!lot) return { ok: false, error: "no_lot" };
  if (lot.status === "refunded") return { ok: true, already: true };
  const f = Number.isFinite(frac) && frac > 0 && frac < 0.999 ? frac : 1;
  // μερική επιστροφή: ποσοστό του ΑΡΧΙΚΟΥ καθαρού (αναθεώρηση #8), ποτέ πάνω από ό,τι απομένει
  const base = lot.net0_micro == null ? lot.net_micro : lot.net0_micro;
  const amt = f === 1 ? lot.net_micro : Math.min(lot.net_micro, Math.round(base * f)), full = f === 1 || amt >= lot.net_micro;
  const tk = tok(), nv = tok(), t = nowIso(), k = "refund:" + (refId || extId);
  const kv = "(SELECT v FROM km_iap_kv WHERE k = ?) = ?", mine = "(SELECT tok FROM km_bal_lot WHERE lot_id = ?) = ?";
  const st = [
    env.DB.prepare("INSERT INTO km_iap_kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO NOTHING").bind(k, tk, t),
    env.DB.prepare(`UPDATE km_bal_lot SET left_micro = left_micro - ?, net_micro = net_micro - ?, status = ?, refunded_at = ?, tok = ?
                    WHERE lot_id = ? AND status != 'refunded' AND ${kv}`)
      .bind(amt, amt, full ? "refunded" : lot.status, full ? t : lot.refunded_at, tk, lot.lot_id, k, tk),
  ];
  if (lot.folder_id && amt) {
    st.push(env.DB.prepare(`UPDATE km_bal SET left_micro = left_micro - ?, ver = ?, updated_at = ? WHERE folder_id = ? AND ${mine}`).bind(amt, nv, t, lot.folder_id, lot.lot_id, tk));
    st.push(env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, 'refund', ?, ? WHERE ${mine}`)
      .bind(k, lot.folder_id, lot.lot_id, -amt, t, lot.lot_id, tk));
  }
  const res = await env.DB.batch(st);
  return { ok: true, applied: !!(res && res[1] && res[1].meta && res[1].meta.changes), micro: amt, folder_id: lot.folder_id };
}

// Πόσα τιμολόγια «χωράνε» στο υπόλοιπο — με τις ΚΛΕΙΔΩΜΕΝΕΣ τιμές κάθε lot (το χρέος τα μειώνει αναλογικά).
export async function balSummary(env, folder) {
  const lots = await lotsOf(env, folder);
  const total = lots.reduce((s, l) => s + l.left_micro, 0);
  const pos = lots.filter((l) => l.left_micro > 0), posSum = pos.reduce((s, l) => s + l.left_micro, 0);
  const k = total <= 0 || !posSum ? 0 : Math.min(1, total / posSum);
  const est = (f) => Math.floor(pos.reduce((s, l) => s + l.left_micro / f(l), 0) * k + 1e-9);
  let review = 0;
  try { const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM km_bal_lot WHERE folder_id = ? AND status = 'review'").bind(folder).first(); review = r ? Number(r.n) || 0 : 0; } catch (e) {}
  return { left_micro: total, left_eur: Math.round(total / 1e4) / 100, reads_mini: est((l) => l.rate_mini), reads_pro: est((l) => l.rate_pro),
           can_mini: total > 0 && pos.length > 0, review };
}

// Οι κινήσεις του μήνα ανά είδος + οι τελευταίες 20 πράξεις — η «τηλεμετρία» που βλέπει ο πελάτης.
export async function balActivity(env, folder, monthStartIso) {
  const m = (await env.DB.prepare(
    "SELECT kind, COUNT(DISTINCT op_id) AS n, SUM(micro) AS micro FROM km_bal_tx WHERE folder_id = ? AND at >= ? GROUP BY kind"
  ).bind(folder, monthStartIso).all()).results || [];
  const last = (await env.DB.prepare(
    "SELECT op_id, kind, SUM(micro) AS micro, MIN(at) AS at FROM km_bal_tx WHERE folder_id = ? GROUP BY op_id, kind ORDER BY MAX(id) DESC LIMIT 20"
  ).bind(folder).all()).results || [];
  return { month: m.map((r) => ({ kind: r.kind, n: Number(r.n) || 0, eur: Math.round((Number(r.micro) || 0) / 1e4) / 100 })),
           last: last.map((r) => ({ kind: r.kind, eur: Math.round((Number(r.micro) || 0) / 1e4) / 100, at: r.at })) };
}

// Διαγραφή λογαριασμού: κινήσεις και υπόλοιπο φεύγουν· οι ΑΓΟΡΕΣ μένουν ανώνυμες (φορολογικά αρχεία, ίδιο με
// την κατάθεση της συνδρομής Paddle — Α10) — χωρίς φάκελο, χωρίς email, με μηδέν υπόλοιπο.
export async function balWipe(env, folder) {
  for (const q of ["DELETE FROM km_bal_tx WHERE folder_id = ?", "DELETE FROM km_bal WHERE folder_id = ?",
                   "UPDATE km_bal_lot SET folder_id = NULL, email = NULL, left_micro = 0, status = CASE WHEN status = 'refunded' THEN status ELSE 'closed' END WHERE folder_id = ?"]) {
    try { await env.DB.prepare(q).bind(folder).run(); } catch (e) { /* πίνακας που δεν υπάρχει ακόμα (παραγωγή) δεν ρίχνει τη διαγραφή */ }
  }
}

// Ανάγνωση ΠΟΛΛΩΝ σελίδων (αναθεώρηση V201 #1): η κλειδωμένη τιμή είναι για ΕΝΑ τιμολόγιο (μέτρηση 15/10, μία σελίδα).
// Πάνω από μία σελίδα: κράτηση για τόσες αναγνώσεις όσες οι σελίδες ΠΡΙΝ την κλήση · μετά χρεώνεται 1 ανάγνωση στην κλειδωμένη
// τιμή + ό,τι ξεπέρασε το πραγματικό κόστος το μετρημένο κόστος μιας ανάγνωσης (με fx/περιθώριο του lot) — χωρίς ζημιά.
// Μία σελίδα: η κράτηση ΕΙΝΑΙ η χρέωση (σταθερή τιμή, όπως λέει το Brief).
export async function balReadSettle(env, folder, hold, kind, pages, actualUsdMicro, oneCostUsd) {
  if (pages <= 1) { await balSettle(env, hold.op_id); return hold.micro; }
  await balRelease(env, folder, hold.op_id);
  const a = await balDebit(env, folder, { kind, reads: 1 }, kind, { allowNegative: true });
  const extra = Math.round(actualUsdMicro - (oneCostUsd || 0) * 1e6);
  const b = extra > 0 ? await balDebit(env, folder, { kind: "agent", usd_micro: extra }, kind, { allowNegative: true }) : { micro: 0 };
  return (a && a.ok ? a.micro : 0) + (b && b.ok ? b.micro : 0);
}

// ── routes ─────────────────────────────────────────────────────────────────
const HEX64 = /^[0-9a-f]{64}$/;
export async function handleBal(request, env, path, h) {
  const method = request.method;
  if (path === "/api/km/bal" && method === "GET") return balGet(request, env, h);
  if ((path === "/api/km/bal/store" || path === "/api/km/bal/apple/notify") && method === "POST") {
    const m = await import("./km_iap.js");
    return path === "/api/km/bal/store" ? m.iapStore(request, env, h) : m.appleNotify(request, env, h);
  }
  if (path === "/api/km/admin/bal" && method === "GET") return balAdminGet(request, env, h);
  if (path === "/api/km/admin/bal/credit" && method === "POST") return balAdminCredit(request, env, h);
  if (path === "/api/km/admin/bal/review" && method === "POST") return balAdminReview(request, env, h);
  return h.json({ ok: false, error: "not_found" }, 404);
}

export async function balView(env, folder, email) {
  if (email) { try { await balClaim(env, folder, email); } catch (e) { console.error("bal claim:", e && e.message); } }
  const cfg = balConfig(env);
  const s = await balSummary(env, folder);
  return Object.assign(s, { rates_now: cfg ? { mini: cfg.rate_mini / 1e6, pro: cfg.rate_pro / 1e6, markup_pct: cfg.markup } : null });
}

async function balGet(request, env, h) {
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  const t = h.now();
  const v = await balView(env, a.id.folder, a.acc.email);
  const act = await balActivity(env, a.id.folder, t.slice(0, 7) + "-01T00:00:00.000Z");
  const { iapProducts } = await import("./km_iap.js");
  return h.json(Object.assign({ ok: true }, v, { activity: act, iap: { token: await iapToken(env, a.id.folder), products: iapProducts(env) } }));
}

async function folderByEmail(env, email) {
  const r = await env.DB.prepare("SELECT folder_id FROM km_accounts WHERE email = ? AND deleted IS NULL LIMIT 1").bind(email).first();
  return r ? r.folder_id : null;
}

async function balAdminGet(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const folder = String(new URL(request.url).searchParams.get("folder_id") || "").toLowerCase();
  if (!HEX64.test(folder)) return h.json({ ok: false, error: "bad_folder_id" }, 400);
  const lots = (await env.DB.prepare("SELECT lot_id, source, ext_id, env, product, country, currency, gross_minor, tax_minor, fee_pct, net_micro, left_micro, rate_mini, rate_pro, status, note, created_at, refunded_at FROM km_bal_lot WHERE folder_id = ? ORDER BY created_at").bind(folder).all()).results || [];
  return h.json({ ok: true, summary: await balSummary(env, folder), lots });
}

// Πίστωση από τον Stavros (δοκιμές staging, αποζημίωση υποστήριξης). Τιμές = οι σημερινές (ρύθμιση).
async function balAdminCredit(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await h.safeJson(request)) || {};
  const cfg = balConfig(env);
  if (!cfg) return h.json({ ok: false, error: "not_configured" }, 503);
  const eur = Number(b.eur);
  if (!Number.isFinite(eur) || eur <= 0 || eur > 500) return h.json({ ok: false, error: "bad_eur" }, 400);
  let folder = typeof b.folder_id === "string" ? b.folder_id.toLowerCase() : null;
  if (!folder && typeof b.email === "string") folder = await folderByEmail(env, b.email.trim().toLowerCase());
  if (!folder || !HEX64.test(folder)) return h.json({ ok: false, error: "no_account" }, 404);
  const acc = await env.DB.prepare("SELECT folder_id FROM km_accounts WHERE folder_id = ? AND deleted IS NULL").bind(folder).first();
  if (!acc) return h.json({ ok: false, error: "no_account" }, 404);
  const r = await balCredit(env, { folder_id: folder, source: "admin", ext_id: "admin:" + tok(), env: "prod", product: "admin",
    net_micro: Math.round(eur * MICRO), status: "ok", note: h.clean(b.note, 120), cfg });
  return h.json({ ok: r.ok, lot_id: r.lot_id, summary: await balSummary(env, folder) });
}

// Αγορά «υπό έλεγχο» (π.χ. νόμισμα εκτός ευρώ, χώρα χωρίς ΦΠΑ στον πίνακα): ο Stavros ορίζει το καθαρό → υπόλοιπο.
async function balAdminReview(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await h.safeJson(request)) || {};
  const id = typeof b.lot_id === "string" && /^[0-9a-f]{32}$/.test(b.lot_id) ? b.lot_id : null;
  const eur = Number(b.net_eur);
  if (!id || !Number.isFinite(eur) || eur < 0 || eur > 500) return h.json({ ok: false, error: "bad_input" }, 400);
  const lot = await env.DB.prepare("SELECT * FROM km_bal_lot WHERE lot_id = ?").bind(id).first();
  if (!lot || lot.status !== "review") return h.json({ ok: false, error: "not_review" }, 409);
  const net = Math.round(eur * MICRO), tk = tok(), t = h.now(), mine = "(SELECT tok FROM km_bal_lot WHERE lot_id = ?) = ?";
  const st = [env.DB.prepare("UPDATE km_bal_lot SET status = 'ok', net_micro = ?, net0_micro = ?, left_micro = ?, tok = ?, note = COALESCE(note, '') || ' · έλεγχος admin' WHERE lot_id = ? AND status = 'review'").bind(net, net, net, tk, id)];
  if (lot.folder_id && net) {
    st.push(env.DB.prepare(`INSERT INTO km_bal (folder_id, left_micro, ver, updated_at) SELECT ?, ?, ?, ? WHERE ${mine}
      ON CONFLICT(folder_id) DO UPDATE SET left_micro = km_bal.left_micro + excluded.left_micro, ver = excluded.ver, updated_at = excluded.updated_at`).bind(lot.folder_id, net, tok(), t, id, tk));
    st.push(env.DB.prepare(`INSERT INTO km_bal_tx (op_id, folder_id, lot_id, kind, micro, at) SELECT ?, ?, ?, 'buy', ?, ? WHERE ${mine}`).bind("buy-" + id, lot.folder_id, id, net, t, id, tk));
  }
  const res = await env.DB.batch(st);
  return h.json({ ok: !!(res && res[0] && res[0].meta && res[0].meta.changes) });
}

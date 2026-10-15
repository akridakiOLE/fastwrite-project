// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-F1 · Kostometro PRO — Φάση 1: ΑΝΑΓΝΩΣΗ ΑΝΑ ΓΡΑΜΜΗ (Brief PRO ↔ FastWrite 12/10/2026)
//
//   GET  /api/km/pro/status          -> { pro, plan, until, month: {calls, usd} }
//   POST /api/km/pro/read            -> { pages:[b64 jpeg] } → κεφαλίδα + γραμμές + έλεγχοι
//   POST /api/km/admin/pro/grant     -> (KM_ADMIN_KEY) { folder_id, status } — ΜΟΝΟ για δοκιμές
//   POST /api/km/admin/pro/read-test -> (KM_ADMIN_KEY) { pages, model? } — μέτρηση χωρίς λογαριασμό
//   POST /api/km/admin/pro/limit     -> (KM_ADMIN_KEY) { folder_id, reads_limit|null, usd_limit|null } — όριο ΑΝΑ λογαριασμό
//   POST /api/km/pro/paddle/webhook  -> γεγονότα του παρόχου πληρωμών (src/km_paddle.js, F5)
//   POST /api/km/admin/pro/link      -> (KM_ADMIN_KEY) { sub_id, folder_id } — συνδρομή σε άλλο email (υποστήριξη)
//
// Αρχές:
//   · Η φωτογραφία περνά από τον server ΧΩΡΙΣ αποθήκευση (Πολιτική §Α9, ίδιο με το δώρο 20).
//   · Ο server ΠΡΟΤΕΙΝΕΙ (συσκευασία, τιμή μονάδας) — δεν αποφασίζει. Ο Boss επιβεβαιώνει.
//   · Κάθε γραμμή φέρει σημάδι ελέγχου: ποσότητα × τιμή ≈ αξία. Το σύνολο: Σ γραμμών ≈ καθαρό.
//     Ό,τι δεν κλείνει → χειροκίνητη έγκριση (Α350 §9.8 Ε: «λάθος ανάγνωσης δεν γίνεται
//     σιωπηλά η προηγούμενη τιμή»).
//   · Κόστος: μετριέται ανά λογαριασμό ανά μήνα (km_pro_usage) · ταβάνι PRO_MONTHLY_USD.
// ═══════════════════════════════════════════════════════════════════════════

export const PRO_MODEL_DEFAULT = "claude-sonnet-5-5";
const PRO_PRICES = {                                   // micro-$ ανά token
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
};
// KM-PRO-F5 · ΤΑ ΟΡΙΑ ΤΟΥ ΜΗΝΑ ΕΙΝΑΙ ΡΥΘΜΙΣΗ, ΠΟΤΕ ΣΤΑΘΕΡΑ ΣΤΟΝ ΚΩΔΙΚΑ (Stavros 15/10: «το ΤΙ όριο δεν είναι
// απόφαση του Claude»). PRO_MONTHLY_READS = αναγνώσεις ανά λογαριασμό/μήνα · PRO_MONTHLY_USD = ταβάνι κόστους.
// Ανά λογαριασμό υπερισχύει το km_pro_limits. Λείπει ρύθμιση → η ανάγνωση PRO ΔΕΝ γίνεται (503 limit_unset,
// με μήνυμα στον χρήστη και στα logs) — ποτέ ανάγνωση χωρίς όριο, ποτέ σιωπηλή αποτυχία.
const PRO_RATE_PER_MIN = 10;
const PRO_MAX_PAGES = 6;
const PRO_MAX_B64 = 10 * 1024 * 1024;
const PRO_MAX_LINES = 200;

export function proPrice(model) { return PRO_PRICES[model] || PRO_PRICES[PRO_MODEL_DEFAULT]; }

export const PRO_PROMPT =
  "Τιμολόγιο ή δελτίο αποστολής προμηθευτή (ελληνικά ή αγγλικά). Διάβασε την ΚΕΦΑΛΙΔΑ και ΚΑΘΕ ΓΡΑΜΜΗ ΠΡΟΪΟΝΤΟΣ.\n" +
  "Απάντησε ΜΟΝΟ με JSON, χωρίς κείμενο γύρω:\n" +
  '{"supplier":{"name":…,"vat_no":…},"number":…,"date":"YYYY-MM-DD","net":…,"vat":…,"total":…,' +
  '"lines":[{"code":…,"desc":…,"unit":…,"qty":…,"unit_price":…,"disc_pct":…,"line_net":…,"vat_pct":…}]}\n' +
  "Κανόνες:\n" +
  "• supplier = ο ΕΚΔΟΤΗΣ (πάνω μέρος), ΟΧΙ ο πελάτης. vat_no = ο Αρ. ΦΠΑ / ΑΦΜ του εκδότη, όπως γράφεται.\n" +
  "• code = ο κωδικός του προμηθευτή για τη γραμμή, ΑΚΡΙΒΩΣ όπως γράφεται (ή null). desc = η περιγραφή ΑΚΡΙΒΩΣ όπως γράφεται, μαζί με ό,τι λέει για συσκευασία/μέγεθος (π.χ. «330ml 1x24», «6x1LT», «ΣΑΚΙ 25KG»).\n" +
  "• unit = η μονάδα της στήλης Μον. όπως γράφεται (κιλ., τεμ., ΚΙΒ, λτ, ...), ή null.\n" +
  "• qty, unit_price, disc_pct (έκπτωση %), line_net (αξία γραμμής ΠΡΟ ΦΠΑ), vat_pct: αριθμοί ή null.\n" +
  "• Κάθε γραμμή του χαρτιού = ένα στοιχείο, με τη σειρά. ΟΧΙ γραμμές συνόλων, μεταφορικών κειμένων ή σημειώσεων.\n" +
  "• Πολλές φωτογραφίες = σελίδες του ΙΔΙΟΥ τιμολογίου, με τη σειρά: ΟΛΕΣ οι γραμμές μαζί, ΕΝΑ σύνολο (της τελευταίας σελίδας).\n" +
  "ΑΡΙΘΜΟΙ: το χαρτί μπορεί να γράφει 1.234,56 ή 1,234.56 — κατάλαβε ποιο σύστημα έχει και δώσε ΠΑΝΤΑ 1234.56 (τελεία δεκαδικών, χωρίς χιλιάδες).\n" +
  "Ό,τι δεν διαβάζεται ΚΑΘΑΡΑ: null. ΠΟΤΕ μην μαντεύεις και ΠΟΤΕ μην υπολογίζεις τιμή που δεν γράφεται.";

// ── καθάρισμα ──────────────────────────────────────────────────────────────
export function proParse(txt) {
  const s = String(txt || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === "object" && !Array.isArray(o) ? o : null; }
  catch (e) { return null; }
}
const num = (v, d) => (typeof v === "number" && isFinite(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : null);
const str = (v, n) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ── ΣΥΣΚΕΥΑΣΙΑ → πρόταση μονάδας σύγκρισης ─────────────────────────────────
// «330ml 1x24» → 24 τεμ × 0,33 λτ · «6x1LT» → 6 λτ · «ΣΑΚΙ 25KG» → 25 κιλ · «12ΤΕΜ» → 12 τεμ.
// ΠΡΟΤΑΣΗ μόνο: ο Boss την επιβεβαιώνει μία φορά ανά κωδικό προμηθευτή (απόφαση 11/10).
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(ml|mlt|cl|lt|ltr|l|λτ|λιτ|kg|κιλ|kgr|gr|g|γρ)(?![a-zα-ω])/i;
const MULT_RE = /(\d+)\s*[x×χ]\s*(\d+(?:[.,]\d+)?)?/i;
const BOXN_RE = /(?:κιβ|κιβώτ|kib|box|ctn|συσκ|πακ|pack)[^\d]{0,4}(\d+)/i;     // «(κιβ. 24)» · «ΚΙΒ 12»
const COUNT_RE = /(\d+)\s*(τεμ|tem|pcs|τμχ|τεμάχια|φιαλ|τκ)(?![a-zα-ω])/i;
const PIECE_U = /^(τεμ|tem|pcs|τμχ|φιαλ|φιάλ|μπουκ|btl|bot|κουτ|can|τκ|τεν)/;
const BOX_U = /^(κιβ|kib|box|ctn|κασ|πακ|pack|συσκ)/;
function sizeOf(m) {
  const v = parseFloat(m[1].replace(",", ".")), u = m[2].toLowerCase();
  if (/^(ml|mlt)$/.test(u)) return { size: v / 1000, base: "L" };
  if (u === "cl") return { size: v / 100, base: "L" };
  if (/^(lt|ltr|l|λτ|λιτ)$/.test(u)) return { size: v, base: "L" };
  if (/^(kg|κιλ|kgr)$/.test(u)) return { size: v, base: "kg" };
  if (/^(gr|g|γρ)$/.test(u)) return { size: v / 1000, base: "kg" };
  return null;
}
export function proPack(desc, unit) {
  const d = String(desc || "");
  const u = String(unit || "").toLowerCase().replace(/^\s+/, "");
  // μονάδα χρέωσης κιλό / λίτρο = ήδη μονάδα σύγκρισης
  if (/^(κιλ|kg|kgr)/.test(u)) return { per: 1, base: "kg", sure: true, why: "unit" };
  if (/^(λτ|lt|λιτ|ltr)/.test(u)) return { per: 1, base: "L", sure: true, why: "unit" };
  const sm = SIZE_RE.exec(d);
  const size = sm ? sizeOf(sm) : null;
  let count = null;
  const mm = MULT_RE.exec(d), bm = BOXN_RE.exec(d), cm = COUNT_RE.exec(d);
  if (mm) {
    const a = parseInt(mm[1], 10), b = mm[2] ? parseFloat(mm[2].replace(",", ".")) : null;
    count = (a === 1 && b && b >= 2) ? b : a;        // «1x24» → 24 · «6x1LT» → 6 · «24x330ml» → 24
  } else if (bm) count = parseInt(bm[1], 10);
  else if (cm) count = parseInt(cm[1], 10);
  const isBox = BOX_U.test(u), isPiece = PIECE_U.test(u);
  if (isBox) {
    // κιβώτιο: χρειάζεται ΚΑΙ πόσα ΚΑΙ (αν υπάρχει) μέγεθος — αλλιώς ρωτάμε (απόφαση 12/10)
    if (count && size) return { per: Math.round(size.size * count * 1000) / 1000, base: size.base, sure: true, why: "desc" };
    if (count) return { per: count, base: "pc", sure: true, why: "desc" };
    return null;
  }
  if (isPiece) {
    if (size && count && mm) return { per: Math.round(size.size * count * 1000) / 1000, base: size.base, sure: true, why: "desc" };
    if (size) return { per: size.size, base: size.base, sure: true, why: "desc" };
    return { per: 1, base: "pc", sure: true, why: "unit" };
  }
  // άγνωστη / κενή μονάδα: πρόταση, ΟΧΙ σίγουρη
  if (size && count) return { per: Math.round(size.size * count * 1000) / 1000, base: size.base, sure: false, why: "desc" };
  if (size) return { per: size.size, base: size.base, sure: false, why: "desc" };
  if (count) return { per: count, base: "pc", sure: false, why: "desc" };
  return null;
}

// ── κανονικοποίηση + έλεγχοι ───────────────────────────────────────────────
export function proNormalize(o) {
  o = o || {};
  const sup = o.supplier && typeof o.supplier === "object" ? o.supplier : {};
  const out = {
    supplier: { name: str(sup.name, 120), vat_no: str(sup.vat_no, 40) },
    number: str(o.number, 60), date: date(o.date),
    net: num(o.net, 2), vat: num(o.vat, 2), total: num(o.total, 2),
    lines: [],
  };
  const L = Array.isArray(o.lines) ? o.lines.slice(0, PRO_MAX_LINES) : [];
  for (const x of L) {
    if (!x || typeof x !== "object") continue;
    const ln = {
      code: str(x.code, 40), desc: str(x.desc, 200), unit: str(x.unit, 20),
      qty: num(x.qty, 3), unit_price: num(x.unit_price, 4), disc_pct: num(x.disc_pct, 2),
      line_net: num(x.line_net, 2), vat_pct: num(x.vat_pct, 2),
    };
    if (!ln.desc && !ln.code) continue;
    // έλεγχος γραμμής: ποσότητα × τιμή × (1 − έκπτωση) ≈ αξία (ανοχή 2 λεπτά ή 0,5%)
    if (ln.qty !== null && ln.unit_price !== null && ln.line_net !== null) {
      const calc = ln.qty * ln.unit_price * (1 - (ln.disc_pct || 0) / 100);
      ln.ok = Math.abs(calc - ln.line_net) <= Math.max(0.02, Math.abs(ln.line_net) * 0.005);
    } else ln.ok = false;
    ln.pack = proPack(ln.desc, ln.unit);
    // τιμή ανά μονάδα σύγκρισης (€/kg, €/L, €/τεμ) — ΜΟΝΟ όταν η συσκευασία είναι σίγουρη
    if (ln.pack && ln.pack.sure && ln.pack.per > 0 && ln.unit_price !== null) {
      ln.base_price = Math.round((ln.unit_price * (1 - (ln.disc_pct || 0) / 100) / ln.pack.per) * 10000) / 10000;
    } else ln.base_price = null;
    out.lines.push(ln);
  }
  // έλεγχος συνόλου: Σ αξιών γραμμών ≈ καθαρό
  const sum = out.lines.reduce((s, l) => s + (l.line_net || 0), 0);
  const allOk = out.lines.length > 0 && out.lines.every((l) => l.ok);
  const netOk = out.net !== null && Math.abs(sum - out.net) <= Math.max(0.05, out.net * 0.005);
  const totOk = out.net !== null && out.vat !== null && out.total !== null && Math.abs(out.net + out.vat - out.total) <= 0.05;
  out.check = { lines_sum: Math.round(sum * 100) / 100, lines_ok: allOk, net_ok: netOk, total_ok: totOk,
                // «auto» = όλα κλείνουν → μπορεί να εγκριθεί αυτόματα · αλλιώς χειροκίνητα
                approve: allOk && netOk && totOk ? "auto" : "manual" };
  return out;
}

// ── PRO; ────────────────────────────────────────────────────────────────────
export async function proRow(env, folder) {
  return env.DB.prepare("SELECT * FROM km_pro WHERE folder_id = ?").bind(folder).first();
}
export function proActive(env, row, nowIso) {
  if (String((env && env.PRO_LIVE) || "") !== "1") return false;
  if (!row || (row.status !== "active" && row.status !== "test")) return false;
  return !row.until || row.until > nowIso;
}

// ── KM-PRO-F5 · ΟΡΙΑ ΜΗΝΑ ───────────────────────────────────────────────────
const posNum = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
export function proLimits(env, over) {
  const r = (over && posNum(over.reads_limit)) || posNum(env && env.PRO_MONTHLY_READS);
  const u = (over && posNum(over.usd_limit)) || posNum(env && env.PRO_MONTHLY_USD);
  return { reads: r ? Math.floor(r) : null, usd: u };          // null = ΔΕΝ ΡΥΘΜΙΣΤΗΚΕ
}
async function limitsRow(env, folder) {
  try { return await env.DB.prepare("SELECT reads_limit, usd_limit FROM km_pro_limits WHERE folder_id = ?").bind(folder).first(); }
  catch (e) { return null; }
}
// 1η του επόμενου μήνα (UTC) — εκεί μηδενίζει ο μετρητής
export function proRenews(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
}
async function quotaUsed(env, folder, month) {
  const q = await env.DB.prepare("SELECT reads FROM km_pro_quota WHERE folder_id = ? AND month = ?").bind(folder, month).first();
  return q ? q.reads : 0;
}
// ΑΤΟΜΙΚΗ κράτηση μίας θέσης: true = πήρε θέση · false = το όριο γέμισε (δύο ταυτόχρονες δεν το περνούν)
async function quotaTake(env, folder, month, limit, t) {
  // ⚠ ΔΕΝ πιάνει σφάλμα εδώ: πίνακας που λείπει = εξαίρεση → ο καλών απαντά 503 limit_unset (ορατό, όχι βρόχος 500)
  const r = await env.DB.prepare(
    `INSERT INTO km_pro_quota (folder_id, month, reads, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(folder_id, month) DO UPDATE SET reads = km_pro_quota.reads + 1, updated_at = excluded.updated_at
     WHERE km_pro_quota.reads < ?`
  ).bind(folder, month, t, limit).run();
  return !!(r && r.meta && r.meta.changes);
}
// η ανάγνωση απέτυχε / δεν έβγαλε γραμμές → η θέση ΕΠΙΣΤΡΕΦΕΙ (μετράνε μόνο οι πετυχημένες)
async function quotaGive(env, folder, month) {
  try { await env.DB.prepare("UPDATE km_pro_quota SET reads = MAX(reads - 1, 0) WHERE folder_id = ? AND month = ?").bind(folder, month).run(); }
  catch (e) { console.error("pro quota give:", e && e.message); }
}
function limitHit(h, used, limit, month, reason) {
  return h.json({ ok: false, error: "read_limit", reason, used, limit, renews: proRenews(month) }, 429);
}

async function proUsage(env, folder, month, f) {
  try {
    await env.DB.prepare(
      `INSERT INTO km_pro_usage (folder_id, month, calls, ok, fail, lines, in_tok, out_tok, usd_micro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(folder_id, month) DO UPDATE SET calls = calls + excluded.calls, ok = ok + excluded.ok, fail = fail + excluded.fail,
         lines = lines + excluded.lines, in_tok = in_tok + excluded.in_tok, out_tok = out_tok + excluded.out_tok, usd_micro = usd_micro + excluded.usd_micro`
    ).bind(folder, month, f.calls || 0, f.ok || 0, f.fail || 0, f.lines || 0, f.in || 0, f.out || 0, f.micro || 0).run();
  } catch (e) { /* η μέτρηση δεν ρίχνει ποτέ την ανάγνωση */ }
}

function pagesOk(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > PRO_MAX_PAGES) return "bad_pages";
  let size = 0;
  for (const p of pages) {
    if (typeof p !== "string" || !/^[A-Za-z0-9+/=]+$/.test(p.slice(0, 200))) return "bad_pages";
    size += p.length;
  }
  return size > PRO_MAX_B64 ? "too_big" : null;
}

async function proExtract(env, h, pages, model) {
  const content = pages.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } }))
    .concat([{ type: "text", text: PRO_PROMPT }]);
  const t0 = Date.now();
  const j = await h.agentCall(env, { model, max_tokens: 4096, messages: [{ role: "user", content }] });
  const u = j.usage || {};
  const p = proPrice(model);
  const micro = Math.round((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out);
  const txt = (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("");
  return { data: proNormalize(proParse(txt) || {}), usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, micro, ms: Date.now() - t0 } };
}

// ── routes ─────────────────────────────────────────────────────────────────
export async function handlePro(request, env, path, h) {
  const method = request.method;
  if (path === "/api/km/pro/status" && method === "GET") return proStatus(request, env, h);
  if (path === "/api/km/pro/read" && method === "POST") return proRead(request, env, h);
  if (path === "/api/km/admin/pro/grant" && method === "POST") return proGrant(request, env, h);
  if (path === "/api/km/admin/pro/read-test" && method === "POST") return proReadTest(request, env, h);
  if (path === "/api/km/admin/pro/limit" && method === "POST") return proLimitSet(request, env, h);
  // KM-PRO-F5 · σελίδα αγοράς (site/pro/): ΜΟΝΟ δημόσια στοιχεία (client token + price id είναι δημόσια κατά την Paddle)
  if (path === "/api/km/pro/checkout-config" && method === "GET") {
    const tok = typeof env.PADDLE_CLIENT_TOKEN === "string" ? env.PADDLE_CLIENT_TOKEN : "", price = typeof env.PADDLE_PRICE_ID === "string" ? env.PADDLE_PRICE_ID : "";
    const ready = String(env.PRO_LIVE || "") === "1" && /^(test|live)_[A-Za-z0-9]+$/.test(tok) && /^pri_[A-Za-z0-9]+$/.test(price);
    return h.json(ready ? { ok: true, ready: true, env: tok.startsWith("test_") ? "sandbox" : "live", token: tok, price } : { ok: true, ready: false });
  }
  // KM-PRO-F5 · ο πάροχος πληρωμών (Paddle) — χωρίς ταυτότητα λογαριασμού, με ΥΠΟΓΡΑΦΗ
  if (path === "/api/km/pro/paddle/webhook" && method === "POST") { const { paddleWebhook } = await import("./km_paddle.js"); return paddleWebhook(request, env, h); }
  if (path === "/api/km/admin/pro/link" && method === "POST") { const { paddleAdminLink } = await import("./km_paddle.js"); return paddleAdminLink(request, env, h); }
  // KM-PRO-F3 · η ομάδα (Boss / admin / user) — src/km_team.js
  if (path === "/api/km/pro/team" || path.startsWith("/api/km/pro/team/") || path.startsWith("/api/km/pro/m/")) {
    const { handleTeam } = await import("./km_team.js");
    const r = await handleTeam(request, env, path, h, { proRow, proActive, readFor: proReadFor });
    if (r) return r;
  }
  // KM-PRO-F4 · ο λογιστής (FastWrite «γραμματοκιβώτιο») — src/km_acct.js
  if (path === "/api/km/pro/acct" || path.startsWith("/api/km/pro/acct/") || path.startsWith("/api/km/pro/a/")) {
    const { handleAcct } = await import("./km_acct.js");
    const r = await handleAcct(request, env, path, h, { proRow, proActive });
    if (r) return r;
  }
  return h.json({ ok: false, error: "not_found" }, 404);
}

async function proStatus(request, env, h) {
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  const t = h.now(), month = t.slice(0, 7);
  // KM-PRO-F5 · νέος πελάτης απευθείας PRO: πλήρωσε στο web ΠΡΙΝ φτιάξει λογαριασμό → η συνδρομή δένεται εδώ
  try { const { proClaim } = await import("./km_paddle.js"); await proClaim(env, a.id.folder, a.acc.email, t); }
  catch (e) { console.error("pro claim:", e && e.message); }
  const row = await proRow(env, a.id.folder);
  const u = await env.DB.prepare("SELECT calls, usd_micro FROM km_pro_usage WHERE folder_id = ? AND month = ?")
    .bind(a.id.folder, month).first();
  const lim = proLimits(env, await limitsRow(env, a.id.folder));
  const used = await quotaUsed(env, a.id.folder, month).catch(() => 0);
  // όριο «ρυθμισμένο» = ΚΑΙ αναγνώσεις ΚΑΙ κόστος (ίδιος κανόνας με την ανάγνωση) — αλλιώς unset, ποτέ μισή εικόνα
  const set = !!(lim.reads && lim.usd);
  const blocked = !set ? "unset" : (u && u.usd_micro >= Math.round(lim.usd * 1e6)) ? "cost" : used >= lim.reads ? "reads" : null;
  let sub = false;
  try { sub = !!(await env.DB.prepare("SELECT 1 AS x FROM km_pro_sub WHERE folder_id = ? AND status IN ('active','trialing','past_due','paused') LIMIT 1").bind(a.id.folder).first()); } catch (e) {}
  return h.json({ ok: true, pro: proActive(env, row, t), plan: row ? row.plan : null, status: row ? row.status : null,
                  until: row ? row.until : null, sub,
                  month: { calls: u ? u.calls : 0, usd: u ? u.usd_micro / 1e6 : 0, reads: used, limit: set ? lim.reads : null,
                           left: set ? Math.max(0, lim.reads - used) : null, blocked, renews: proRenews(month) } });
}

async function proRead(request, env, h) {
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return h.json({ ok: false, error: "not_active" }, 409);
  return proReadFor(request, env, h, a.id.folder);
}
// KM-PRO-F3 · η ίδια ανάγνωση και για μέλος της ομάδας (υπάλληλο) — το κόστος γράφεται στον ΦΑΚΕΛΟ
export async function proReadFor(request, env, h, folder) {
  const t = h.now(), month = t.slice(0, 7);
  if (!proActive(env, await proRow(env, folder), t)) return h.json({ ok: false, error: "not_pro" }, 403);
  const b = await h.safeJson(request);
  const bad = pagesOk(b && b.pages);
  if (bad) return h.json({ ok: false, error: bad }, bad === "too_big" ? 413 : 400);
  // KM-PRO-F5 · ΟΡΙΑ ΜΗΝΑ ανά λογαριασμό — ρύθμιση (env / km_pro_limits), ΠΟΤΕ σταθερά. Η ανάγνωση ΠΕΡΙΜΕΝΕΙ
  // την 1η του επόμενου μήνα· ο χρήστης το ΒΛΕΠΕΙ (read_limit + used/limit/renews) και συνεχίζει χειροκίνητα.
  const lim = proLimits(env, await limitsRow(env, folder));
  if (!lim.reads || !lim.usd) {
    console.error("pro read: ΔΕΝ έχει ρυθμιστεί όριο μήνα (PRO_MONTHLY_READS / PRO_MONTHLY_USD) — η ανάγνωση PRO σταμάτησε");
    return h.json({ ok: false, error: "limit_unset" }, 503);
  }
  const u = await env.DB.prepare("SELECT calls, usd_micro FROM km_pro_usage WHERE folder_id = ? AND month = ?").bind(folder, month).first();
  if (u && u.usd_micro >= Math.round(lim.usd * 1e6)) return limitHit(h, await quotaUsed(env, folder, month), lim.reads, month, "cost");
  let took;
  try { took = await quotaTake(env, folder, month, lim.reads, t); }
  catch (e) { console.error("pro quota:", e && e.message); return h.json({ ok: false, error: "limit_unset" }, 503); }
  if (!took) return limitHit(h, await quotaUsed(env, folder, month), lim.reads, month, "reads");
  const model = env.PRO_READ_MODEL || PRO_MODEL_DEFAULT;
  let r;
  try { r = await proExtract(env, h, b.pages, model); }
  catch (e) {
    await quotaGive(env, folder, month);
    await proUsage(env, folder, month, { calls: 1, fail: 1 });
    console.error("pro read:", e && e.message);   // 🔴 ΜΟΝΟ το μήνυμα — ποτέ η εικόνα
    const st = /anthropic_(429|529)/.test(String(e && e.message)) ? 429 : 503;
    return h.json({ ok: false, error: "provider", retry_after: 30 }, st);
  }
  const good = r.data.lines.length > 0;
  if (!good) await quotaGive(env, folder, month);
  await proUsage(env, folder, month, { calls: 1, ok: good ? 1 : 0, fail: good ? 0 : 1, lines: r.data.lines.length, in: r.usage.in, out: r.usage.out, micro: r.usage.micro });
  const used = await quotaUsed(env, folder, month);
  return h.json(Object.assign({ ok: true }, r.data, { month: { reads: used, limit: lim.reads, left: Math.max(0, lim.reads - used), renews: proRenews(month) } }));
}

async function proGrant(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  // 🔴 ΜΟΝΟ όπου PRO_LIVE=1 (staging). Στην παραγωγή η συνδρομή έρχεται ΜΟΝΟ από τον πάροχο (Φ5).
  if (String(env.PRO_LIVE || "") !== "1") return h.json({ ok: false, error: "pro_not_live" }, 409);
  const b = (await h.safeJson(request)) || {};
  const folder = (h.clean(b.folder_id, 64) || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(folder)) return h.json({ ok: false, error: "bad_folder_id" }, 400);
  const status = b.status === "cancelled" ? "cancelled" : "test";
  const t = h.now();
  await env.DB.prepare(
    `INSERT INTO km_pro (folder_id, plan, status, started_at, until, source, updated_at) VALUES (?, 'pro', ?, ?, NULL, 'admin', ?)
     ON CONFLICT(folder_id) DO UPDATE SET status = excluded.status, source = 'admin', until = NULL, updated_at = excluded.updated_at`
  ).bind(folder, status, t, t).run();   // F5: η δοκιμή admin ξαναγίνεται ΚΑΘΑΡΗ (όχι παλιό until/source του παρόχου)
  return h.json({ ok: true, folder_id: folder, status });
}

async function proReadTest(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await h.safeJson(request)) || {};
  const bad = pagesOk(b.pages);
  if (bad) return h.json({ ok: false, error: bad }, 400);
  const model = typeof b.model === "string" && PRO_PRICES[b.model] ? b.model : (env.PRO_READ_MODEL || PRO_MODEL_DEFAULT);
  try {
    const r = await proExtract(env, h, b.pages, model);
    return h.json(Object.assign({ ok: true, model, usage: r.usage }, r.data));
  } catch (e) {
    return h.json({ ok: false, error: String(e && e.message).slice(0, 120) }, 502);
  }
}

// KM-PRO-F5 · όριο ΑΝΑ λογαριασμό (admin). null = ισχύει η γενική ρύθμιση.
async function proLimitSet(request, env, h) {
  if (!h.adminOk(request, env)) return new Response("Not found", { status: 404 });
  const b = (await h.safeJson(request)) || {};
  const folder = (h.clean(b.folder_id, 64) || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(folder)) return h.json({ ok: false, error: "bad_folder_id" }, 400);
  const rl = b.reads_limit === null ? null : posNum(b.reads_limit), ul = b.usd_limit === null ? null : posNum(b.usd_limit);
  if ((b.reads_limit !== null && b.reads_limit !== undefined && !rl) || (b.usd_limit !== null && b.usd_limit !== undefined && !ul)) return h.json({ ok: false, error: "bad_limit" }, 400);
  const t = h.now();
  await env.DB.prepare(
    `INSERT INTO km_pro_limits (folder_id, reads_limit, usd_limit, note, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(folder_id) DO UPDATE SET reads_limit = excluded.reads_limit, usd_limit = excluded.usd_limit, note = excluded.note, updated_at = excluded.updated_at`
  ).bind(folder, rl ? Math.floor(rl) : null, ul, h.clean(b.note, 120), t).run();
  return h.json({ ok: true, folder_id: folder, limits: proLimits(env, { reads_limit: rl, usd_limit: ul }) });
}

// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-F1 · Kostometro PRO — Φάση 1: ΑΝΑΓΝΩΣΗ ΑΝΑ ΓΡΑΜΜΗ (Brief PRO ↔ FastWrite 12/10/2026)
//
//   GET  /api/km/pro/status          -> { pro, plan, until, month: {calls, usd} }
//   POST /api/km/pro/read            -> { pages:[b64 jpeg] } → κεφαλίδα + γραμμές + έλεγχοι
//   POST /api/km/admin/pro/grant     -> (KM_ADMIN_KEY) { folder_id, status } — ΜΟΝΟ για δοκιμές
//   POST /api/km/admin/pro/read-test -> (KM_ADMIN_KEY) { pages, model? } — μέτρηση χωρίς λογαριασμό
//   GET  /api/km/pro/trial           -> KM-PRO-V201 · κατάσταση δοκιμής PRO (συνδρομή Paddle σε «trialing», μία ανά email)
//   POST /api/km/pro/paddle/webhook  -> γεγονότα του παρόχου πληρωμών (src/km_paddle.js, F5)
//   POST /api/km/admin/pro/link      -> (KM_ADMIN_KEY) { sub_id, folder_id } — συνδρομή σε άλλο email (υποστήριξη)
//
// Αρχές:
//   · Η φωτογραφία περνά από τον server ΧΩΡΙΣ αποθήκευση (Πολιτική §Α9, ίδιο με το δώρο 20).
//   · Ο server ΠΡΟΤΕΙΝΕΙ (συσκευασία, τιμή μονάδας) — δεν αποφασίζει. Ο Boss επιβεβαιώνει.
//   · Κάθε γραμμή φέρει σημάδι ελέγχου: ποσότητα × τιμή ≈ αξία. Το σύνολο: Σ γραμμών ≈ καθαρό.
//     Ό,τι δεν κλείνει → χειροκίνητη έγκριση (Α350 §9.8 Ε: «λάθος ανάγνωσης δεν γίνεται
//     σιωπηλά η προηγούμενη τιμή»).
//   · Κόστος: μετριέται ανά λογαριασμό ανά μήνα (km_pro_usage, τηλεμετρία).
//   · KM-PRO-V201 (18/10): κάθε ανάγνωση PRO ΧΡΕΩΝΕΤΑΙ από το προπληρωμένο υπόλοιπο του λογαριασμού (src/km_bal.js)
//     με την κλειδωμένη τιμή PRO κάθε αγοράς. Ο μηνιαίος μετρητής της v199 (PRO_MONTHLY_READS / _USD) ΚΑΤΑΡΓΗΘΗΚΕ:
//     απόφαση Stavros 15/10 «PRO χωρίς όριο αναγνώσεων, η χρήση πληρώνεται χωριστά».
// ═══════════════════════════════════════════════════════════════════════════

export const PRO_MODEL_DEFAULT = "claude-sonnet-5-5";
import { balDebit, balRelease, balView, balSettle, balReadSettle, trialHash } from "./km_bal.js";
const PRO_PRICES = {                                   // micro-$ ανά token
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
};
// KM-PRO-V201 · ΔΟΚΙΜΗ PRO: 14 ημέρες, χωρίς συνδρομή, χωρίς όριο τιμολογίων (απόφαση Stavros 18/10/2026).
export const PRO_TRIAL_DAYS = 14;
// «χαμηλό υπόλοιπο» στη σελίδα PRO: λιγότερα από τόσα τιμολόγια PRO (τεχνική επιλογή Claude — ~μία-δύο εβδομάδες παραλαβών)
const PRO_LOW_READS = 50;
// Κώστας στο PRO: κράτηση ανά μήνυμα στη δοκιμή (ταβάνι κόστους ενός μηνύματος· μέτρηση 18/10: 1ο μήνυμα 0,067 $,
// επόμενα ~0,014 $ — kostas_measure.json) · ταβάνι μήνα των συνδρομητών = ρύθμιση PRO_AGENT_MONTHLY_EUR (Α320 30/9: ~3 €).
const PRO_AGENT_TURN_MAX_USD = 0.12;
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
  if (!row || (row.status !== "active" && row.status !== "test" && row.status !== "trial")) return false;   // V201 · + δοκιμή 14 ημερών
  return !row.until || row.until > nowIso;
}

const posNum = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
// 1η του επόμενου μήνα (UTC) — εκεί μηδενίζει το ταβάνι μήνα του Κώστα
export function proRenews(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
}
const noBalance = async (h, env, folder) => h.json({ ok: false, error: "no_balance", bal: await balView(env, folder, null) }, 402);

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
  if (path === "/api/km/pro/trial" && method === "GET") return proTrial(request, env, h);   // KM-PRO-V201 · κατάσταση δοκιμής (ξεκινά ΜΟΝΟ στο web, με κάρτα)
  // KM-PRO-F5 · σελίδα αγοράς (site/pro/): ΜΟΝΟ δημόσια στοιχεία (client token + price id είναι δημόσια κατά την Paddle)
  if (path === "/api/km/pro/checkout-config" && method === "GET") {
    // V201 · ?email= → σε όποιον έχει ήδη κάνει δοκιμή, η τιμή ΧΩΡΙΣ δοκιμή (μία δοκιμή ανά email). Επιστρέφει μόνο ναι/όχι.
    const qe = String(new URL(request.url).searchParams.get("email") || "").trim().toLowerCase().slice(0, 200);
    let used = false, level = "none";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(qe)) {
      try { used = !!(await env.DB.prepare("SELECT 1 AS x FROM km_pro_trial WHERE email_h = ?").bind(await trialHash(env, qe)).first()); } catch (e) {}
      // V201 (απόφαση Stavros 18/10 16:30): η σελίδα ξέρει αν ο πελάτης (π.χ. από PRO.mini) έχει υπόλοιπο — ΜΟΝΟ ως επίπεδο
      // (none / low / ok), ΠΟΤΕ ποσό: η σελίδα είναι δημόσια και όποιος γράψει ξένο email θα έβλεπε το υπόλοιπό του.
      // none (και κάθε νέος πελάτης) → η προπληρωμή είναι ΥΠΟΧΡΕΩΤΙΚΗ: χωρίς υπόλοιπο ούτε η δοκιμή διαβάζει.
      try {
        const ac = await env.DB.prepare("SELECT folder_id FROM km_accounts WHERE email = ? AND deleted IS NULL LIMIT 1").bind(qe).first();
        if (ac) { const sm = await balView(env, ac.folder_id, null); level = sm.reads_pro < 1 ? "none" : sm.reads_pro < PRO_LOW_READS ? "low" : "ok"; }
      } catch (e) {}
    }
    const tok = typeof env.PADDLE_CLIENT_TOKEN === "string" ? env.PADDLE_CLIENT_TOKEN : "", price = typeof env.PADDLE_PRICE_ID === "string" ? env.PADDLE_PRICE_ID : "";
    const ready = String(env.PRO_LIVE || "") === "1" && /^(test|live)_[A-Za-z0-9]+$/.test(tok) && /^pri_[A-Za-z0-9]+$/.test(price);
    // KM-PRO-V201 · Π3 · η προπληρωμή χρήσης (10 €, μία φορά) — δημόσιο price id, όπως της συνδρομής
    const top = typeof env.PADDLE_TOPUP_PRICE_ID === "string" && /^pri_[A-Za-z0-9]+$/.test(env.PADDLE_TOPUP_PRICE_ID) ? env.PADDLE_TOPUP_PRICE_ID : null;
    const noTrial = typeof env.PADDLE_PRICE_NOTRIAL_ID === "string" && /^pri_[A-Za-z0-9]+$/.test(env.PADDLE_PRICE_NOTRIAL_ID) ? env.PADDLE_PRICE_NOTRIAL_ID : null;
    if (ready && used && !noTrial) return h.json({ ok: true, ready: false, reason: "trial_used" });   // ποτέ δεύτερη δοκιμή στο ίδιο email
    if (ready && qe && level === "none" && !top) return h.json({ ok: true, ready: false, reason: "topup_unavailable" });   // χωρίς υπόλοιπο ΚΑΙ χωρίς προπληρωμή → δεν ανοίγει
    return h.json(ready ? { ok: true, ready: true, env: tok.startsWith("test_") ? "sandbox" : "live", token: tok, price: used ? noTrial : price,
                            trial: !used, trial_days: PRO_TRIAL_DAYS, topup: top, bal: qe ? level : null, topup_required: !!qe && level === "none" } : { ok: true, ready: false });
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
  // KM-PRO-V201 · το υπόλοιπο (και ό,τι πλήρωσε στο web πριν τον λογαριασμό δένεται εδώ, όπως η συνδρομή)
  const bal = await balView(env, a.id.folder, a.acc.email);
  let sub = false;
  try { sub = !!(await env.DB.prepare("SELECT 1 AS x FROM km_pro_sub WHERE folder_id = ? AND status IN ('active','trialing','past_due','paused') LIMIT 1").bind(a.id.folder).first()); } catch (e) {}
  const trial = await trialInfo(env, a.acc.email, a.id.folder, t);
  const pro = proActive(env, row, t);
  return h.json({ ok: true, pro, plan: row ? row.plan : null, status: row ? row.status : null,
                  until: row ? row.until : null, sub, trial, bal,
                  month: { calls: u ? u.calls : 0, usd: u ? u.usd_micro / 1e6 : 0, blocked: pro && bal.reads_pro < 1 ? "balance" : null } });
}

async function proRead(request, env, h) {
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  if (a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return h.json({ ok: false, error: "not_active" }, 409);
  return proReadFor(request, env, h, a.id.folder);
}
// KM-PRO-F3 · η ίδια ανάγνωση και για μέλος της ομάδας (υπάλληλο) — το κόστος ΚΑΙ η χρέωση πάνε στον ΦΑΚΕΛΟ (Boss)
export async function proReadFor(request, env, h, folder) {
  const t = h.now(), month = t.slice(0, 7);
  if (!proActive(env, await proRow(env, folder), t)) return h.json({ ok: false, error: "not_pro" }, 403);
  const b = await h.safeJson(request);
  const bad = pagesOk(b && b.pages);
  if (bad) return h.json({ ok: false, error: bad }, bad === "too_big" ? 413 : 400);
  // KM-PRO-V201 · ΚΡΑΤΗΣΗ μίας ανάγνωσης PRO από το υπόλοιπο ΠΡΙΝ την κλήση (ατομικά — δύο συσκευές δεν ξοδεύουν τα ίδια).
  // Χωρίς υπόλοιπο: 402 + πόσα λείπουν· η φωτογραφία μένει στα «Εκκρεμή», ο χρήστης το ΒΛΕΠΕΙ (ποτέ σιωπηλή αποτυχία).
  const np = b.pages.length;   // πολλές σελίδες: κράτηση για τόσες αναγνώσεις (αναθεώρηση #1)
  const hold = await balDebit(env, folder, { kind: "pro", reads: np }, "pro", { hold: true });
  if (!hold.ok) {
    if (hold.error === "busy") return h.json({ ok: false, error: "busy", retry_after: 5 }, 503);
    return noBalance(h, env, folder);
  }
  const model = env.PRO_READ_MODEL || PRO_MODEL_DEFAULT;
  let r;
  try { r = await proExtract(env, h, b.pages, model); }
  catch (e) {
    try { await balRelease(env, folder, hold.op_id); } catch (x) { console.error("pro release:", x && x.message); }   // αποτυχία παρόχου: ΓΥΡΙΖΟΥΝ (αλλιώς το ωριαίο cron)
    await proUsage(env, folder, month, { calls: 1, fail: 1 });
    console.error("pro read:", e && e.message);   // 🔴 ΜΟΝΟ το μήνυμα — ποτέ η εικόνα
    const st = /anthropic_(429|529)/.test(String(e && e.message)) ? 429 : 503;
    return h.json({ ok: false, error: "provider", retry_after: 30 }, st);
  }
  // «καλή» = γραμμές ΜΕ ποσά — η αξία του PRO είναι οι γραμμές· γραμμές μόνο με περιγραφή δεν χρεώνονται (αναθεώρηση #4, Brief §3)
  const good = r.data.lines.some((l) => l.line_net !== null || l.unit_price !== null);
  let charged = 0;
  if (!good) await balRelease(env, folder, hold.op_id);   // διάβασε χωρίς ποσά/γραμμές → δεν χρεώνεται (Brief §3)
  else charged = await balReadSettle(env, folder, hold, "pro", np, r.usage.micro, posNum(env.KM_COST_PRO_USD));
  await proUsage(env, folder, month, { calls: 1, ok: good ? 1 : 0, fail: good ? 0 : 1, lines: r.data.lines.length, in: r.usage.in, out: r.usage.out, micro: r.usage.micro });
  return h.json(Object.assign({ ok: true }, r.data, { charged_eur: Math.round(charged / 100) / 1e4, bal: await balView(env, folder, null) }));
}

// ── KM-PRO-V201 · ΔΟΚΙΜΗ PRO 14 ΗΜΕΡΩΝ = ΣΥΝΔΡΟΜΗ PADDLE ΜΕ ΔΟΚΙΜΗ (απόφαση Stavros 18/10/2026, 16:19) ──
// Ο πελάτης βάζει κάρτα στη σελίδα PRO· η Paddle ΔΕΝ χρεώνει 14 ημέρες (κατάσταση «trialing», πρόσβαση ήδη από τη Φ5)
// και ακυρώνει όποτε θέλει πριν τη λήξη. Αναγνώσεις + Κώστας στη δοκιμή → από το υπόλοιπο (απόφαση 18/10). Μία δοκιμή
// ανά email: το km_pro_trial γράφεται από το webhook (km_paddle.js) και η σελίδα αγοράς δίνει, σε όποιον την έχει ήδη
// χρησιμοποιήσει, την τιμή ΧΩΡΙΣ δοκιμή (PADDLE_PRICE_NOTRIAL_ID). ΚΑΜΙΑ δοκιμή χωρίς κάρτα, κανένα κουμπί στην εφαρμογή (3.1.3γ).
async function subTrial(env, folder, t) {
  try {
    return await env.DB.prepare("SELECT period_end FROM km_pro_sub WHERE folder_id = ? AND status = 'trialing' AND (period_end IS NULL OR period_end > ?) ORDER BY period_end DESC LIMIT 1").bind(folder, t).first();
  } catch (e) { return null; }
}
async function trialInfo(env, email, folder, t) {
  const eh = await trialHash(env, email);
  let used = false;
  try { used = !!(eh && await env.DB.prepare("SELECT 1 AS x FROM km_pro_trial WHERE email_h = ?").bind(eh).first()); } catch (e) {}
  const st = await subTrial(env, folder, t);
  return { days: PRO_TRIAL_DAYS, used: used || !!st, active: !!st, until: st ? st.period_end : null };
}
async function proTrial(request, env, h) {
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  return h.json({ ok: true, trial: await trialInfo(env, a.acc.email, a.id.folder, h.now()), bal: await balView(env, a.id.folder, a.acc.email) });
}

// ── KM-PRO-V201 · Ο ΚΩΣΤΑΣ ΣΤΟ PRO (Π4: φεύγει από το Free, μένει στο PRO για τις ρυθμίσεις) ──
// Δοκιμή  → πληρώνει το υπόλοιπο (κόστος + 15 %, απόφαση 18/10): κράτηση ταβανιού ΠΡΙΝ, πραγματικό κόστος ΜΕΤΑ.
// Συνδρομή (ή δοκιμή admin) → πληρώνουμε εμείς, έως PRO_AGENT_MONTHLY_EUR τον μήνα (απόφαση 30/9, μένει 18/10).
// Λείπει η ρύθμιση → ο Κώστας δεν απαντά (ποτέ χωρίς ταβάνι, ίδιος κανόνας με τη Φ5).
export async function proAgentGate(env, folder, t) {
  const row = await proRow(env, folder);
  if (!proActive(env, row, t)) return { error: "pro_only", status: 403 };
  const month = t.slice(0, 7);
  // ποιος πληρώνει: δοκιμή (Paddle «trialing», χωρίς πληρωμένη συνδρομή) → υπόλοιπο · πληρωμένη συνδρομή / admin → εμείς
  let paid = row.source !== "mor", trialing = row.status === "trial";
  if (row.source === "mor") {
    const subs = (await env.DB.prepare("SELECT status FROM km_pro_sub WHERE folder_id = ? AND status IN ('active','past_due','trialing')").bind(folder).all()).results || [];
    paid = subs.some((x) => x.status === "active" || x.status === "past_due");
    trialing = !paid && subs.some((x) => x.status === "trialing");
  }
  if (trialing) {
    const max = Math.round((posNum(env.PRO_AGENT_TURN_MAX_USD) || PRO_AGENT_TURN_MAX_USD) * 1e6);
    const d = await balDebit(env, folder, { kind: "agent", usd_micro: max }, "agent", { hold: true });
    if (!d.ok) return d.error === "busy" ? { error: "busy", status: 503 } : { error: "no_balance", status: 402 };
    return { mode: "balance", folder, month, hold: d.op_id, max };   // max: ο βρόχος του Κώστα σταματά εκεί (αναθεώρηση #5)
  }
  const cap = posNum(env.PRO_AGENT_MONTHLY_EUR), fx = posNum(env.KM_FX_USD_EUR);
  if (!cap || !fx) { console.error("pro agent: λείπει PRO_AGENT_MONTHLY_EUR / KM_FX_USD_EUR — ο Κώστας PRO σταμάτησε"); return { error: "agent_unset", status: 503 }; }
  // ταβάνι = ΜΟΝΟ όσα πληρώσαμε εμείς (όχι ό,τι πλήρωσε ο ίδιος στη δοκιμή — αναθεώρηση #7)
  const u = await env.DB.prepare("SELECT us_eur_micro FROM km_pro_agent WHERE folder_id = ? AND month = ?").bind(folder, month).first();
  if (u && u.us_eur_micro >= Math.round(cap * 1e6)) return { error: "agent_cap", status: 429, renews: proRenews(month) };
  return { mode: "us", folder, month, fx };
}
export async function proAgentSettle(env, g, usdMicro) {
  if (!g || !g.mode) return;
  let eur = 0;
  if (g.mode === "balance") {
    await balRelease(env, g.folder, g.hold);
    if (usdMicro > 0) {
      const d = await balDebit(env, g.folder, { kind: "agent", usd_micro: usdMicro }, "agent", { allowNegative: true });
      eur = d && d.ok ? d.micro : 0;
    }
  } else eur = Math.round(usdMicro * g.fx);
  try {
    await env.DB.prepare(
      `INSERT INTO km_pro_agent (folder_id, month, turns, usd_micro, eur_micro, us_eur_micro, paid_by) VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(folder_id, month) DO UPDATE SET turns = turns + 1, usd_micro = usd_micro + excluded.usd_micro,
         eur_micro = eur_micro + excluded.eur_micro, us_eur_micro = us_eur_micro + excluded.us_eur_micro, paid_by = excluded.paid_by`
    ).bind(g.folder, g.month, Math.round(usdMicro), eur, g.mode === "balance" ? 0 : eur, g.mode === "balance" ? "balance" : "us").run();
  } catch (e) { console.error("pro agent usage:", e && e.message); }
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

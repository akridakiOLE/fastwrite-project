// KM-PRO-F4-LOCAL (14/10/2026) · ΤΟΠΙΚΟΣ ΔΙΔΥΜΟΣ ΤΟΥ STAGING για τη δοκιμή άκρη-σε-άκρη χωρίς δίκτυο.
//   Ο ΙΔΙΟΣ κώδικας του Worker (src/worker.js → km.js → km_pro.js → km_team.js → km_acct.js) πάνω σε
//   ΠΡΑΓΜΑΤΙΚΗ SQLite (node:sqlite, όλα τα schema/*.sql) και R2 σε φάκελο του δίσκου. Σερβίρει και το site/.
//   ΔΕΝ αγγίζει ούτε staging ούτε παραγωγή. Η ανάγνωση PRO (Claude) ΔΕΝ γίνεται εδώ — η δοκιμή τη δίνει έτοιμη.
//     node tools/pro/f4local.mjs --port=8788 --dir=<φάκελος δεδομένων>
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
process.removeAllListeners("warning"); process.on("warning", () => {});
const { DatabaseSync } = await import("node:sqlite");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=").slice(1).join("=") : d; };
const PORT = Number(arg("port", "8788"));
const DIR = arg("dir", join(ROOT, "_f4local"));
mkdirSync(join(DIR, "r2"), { recursive: true });

// ── D1 ──
const db = new DatabaseSync(join(DIR, "d1.sqlite"));
const files = readdirSync(join(ROOT, "schema")).filter((f) => f.endsWith(".sql") && !f.startsWith("gnomi"));
files.sort((a, b) => (a === "km.sql" ? -1 : b === "km.sql" ? 1 : a.localeCompare(b)));
for (const f of files) {
  const txt = readFileSync(join(ROOT, "schema", f), "utf8").replace(/--[^\n]*/g, "");
  for (const st of txt.split(/;\s*(?:\n|$)/)) { const s = st.trim(); if (!s) continue; try { db.exec(s); } catch (e) { /* ALTER που έχει ήδη γίνει κ.λπ. */ } }
}
const conv = (x) => (x === undefined ? null : typeof x === "boolean" ? (x ? 1 : 0) : x);
function stmt(q) {
  let args = [];
  const st = {
    bind(...a) { args = a.map(conv); return st; },
    async first(col) { const r = db.prepare(q).get(...args); if (r === undefined) return null; return col ? r[col] : { ...r }; },
    async all() { return { results: db.prepare(q).all(...args).map((r) => ({ ...r })), success: true }; },
    async run() { const r = db.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    async raw() { return db.prepare(q).all(...args).map((r) => Object.values(r)); },
    __run() { return db.prepare(q).run(...args); },
  };
  return st;
}
const DB = {
  prepare: stmt,
  async batch(list) { const out = []; db.exec("BEGIN"); try { for (const s of list) { const r = s.__run(); out.push({ success: true, meta: { changes: Number(r.changes) } }); } db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return out; },
  async exec(q) { db.exec(q); return {}; },
};
// ── R2 σε δίσκο ──
const kf = (k) => join(DIR, "r2", encodeURIComponent(k));
const FOLDERS = {
  async put(k, body) { const u8 = body instanceof ArrayBuffer ? new Uint8Array(body) : body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer()); writeFileSync(kf(k), u8); return { key: k, size: u8.length }; },
  async get(k) { if (!existsSync(kf(k))) return null; const b = readFileSync(kf(k)); return { key: k, size: b.length, body: new Uint8Array(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), text: async () => b.toString("utf8") }; },
  async head(k) { return existsSync(kf(k)) ? { key: k, size: statSync(kf(k)).size } : null; },
  async delete(k) { for (const x of Array.isArray(k) ? k : [k]) { try { unlinkSync(kf(x)); } catch (e) {} } },
  async list({ prefix = "", cursor, limit = 1000 } = {}) {
    const all = readdirSync(join(DIR, "r2")).map(decodeURIComponent).filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0, page = all.slice(start, start + limit);
    return { objects: page.map((key) => ({ key, size: statSync(kf(key)).size })), truncated: start + limit < all.length, cursor: String(start + limit) };
  },
};
// ── στατικά (site/) ──
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const ASSETS = { async fetch(req) {
  let p = decodeURIComponent(new URL(req.url).pathname);
  let f = join(ROOT, "site", p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(f), { headers: { "Content-Type": MIME[extname(f)] || "application/octet-stream" } });
} };
const env = { DB, FOLDERS, ASSETS, STAGING_LOGIN: "1", PRO_LIVE: "1", KM_ADMIN_KEY: "local-admin", KM_PUBLIC_ORIGIN: "http://127.0.0.1:" + PORT, AG_PUBLIC: "false" };
const worker = (await import(pathToFileURL(join(ROOT, "src", "worker.js")).href)).default;
const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); }, passThroughOnException() {} };

createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = new Request("http://127.0.0.1:" + PORT + req.url, { method: req.method, headers: req.headers, body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined, duplex: "half" });
    const out = await worker.fetch(r, env, ctx);
    const hd = {}; out.headers.forEach((v, k) => { hd[k] = v; });
    res.writeHead(out.status, hd);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error("f4local:", e && e.stack || e);
    res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
  }
}).listen(PORT, "127.0.0.1", () => console.log("F4LOCAL_READY http://127.0.0.1:" + PORT + " · δεδομένα: " + DIR));
// διαχείριση από τη δοκιμή: SQL απευθείας (ό,τι κάνει το d1() του f3check στο staging)
process.on("message", (m) => { try { if (m && m.sql) { db.exec(m.sql); process.send({ ok: true }); } } catch (e) { process.send({ ok: false, error: String(e.message) }); } });

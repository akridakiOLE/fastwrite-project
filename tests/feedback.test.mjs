// Τεστ για «Η γνώμη σου» (Brief Ε §3) — 14/9/2026.
//
// Τρέχει ΧΩΡΙΣ δίκτυο και ΧΩΡΙΣ Cloudflare: πραγματική sqlite (node:sqlite) με
// το ΠΡΑΓΜΑΤΙΚΟ schema/km_feedback.sql, και λεπτός προσαρμογέας στη θέση του D1.
//
// Τρέξιμο:  node --experimental-sqlite tests/feedback.test.mjs
//           node --experimental-sqlite tests/feedback.test.mjs --mutate
//
// Το --mutate σπάει επίτηδες τους φρουρούς. ΠΡΕΠΕΙ να κοκκινίσει. Αν περάσει
// και με --mutate, το τεστ δεν δοκιμάζει τίποτα (μάθημα 6/9/2026).

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const MUTATE = process.argv.includes("--mutate");

let src = readFileSync("src/km.js", "utf8");
if (MUTATE) {
  src = src.replace("const FEEDBACK_MAX_PER_DAY = 5;", "const FEEDBACK_MAX_PER_DAY = 9999;");
  src = src.replace('if (stars === null && !text) return json({ ok: false, error: "empty" }, 400);', "");
  src = src.replace('if (wantsReply && !email) return json({ ok: false, error: "bad_email" }, 400);', "");
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("schema/km_feedback.sql", "utf8"));

const stmt = (sql, args) => {
  const p = sqlite.prepare(sql);
  return {
    async first() { return p.get(...args) ?? null; },
    async run() { p.run(...args); return {}; },
    async all() { return { results: p.all(...args) }; },
  };
};
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }) };
const env = { DB, KM_ADMIN_KEY: "secret123" };

// ⚠ Ο Node ΠΕΤΑΕΙ το `cf` αν δοθεί στον constructor — είναι ιδιότητα της
// Cloudflare, όχι του προτύπου. Το κολλάμε πάνω στο αντικείμενο, όπως ακριβώς
// το βλέπει ο Worker. (Μάθημα 14/9/2026: το τεστ κοκκίνισε και έφταιγε το
// τεστ, όχι ο κώδικας.)
const post = (body, cf) => {
  const r = new Request("https://fastwrite.tech/api/km/feedback", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
  Object.defineProperty(r, "cf", { value: cf || { country: "CY" }, configurable: true });
  return r;
};
const call = (body, cf) => mod.handleKm(post(body, cf), env, null, "/api/km/feedback");

let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + " — " + e.message); }
};
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error((what || "") + " πήρα " + a + " περίμενα " + b);
};

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ" : "ΚΑΝΟΝΙΚΟ");

await check("κενή γνώμη απορρίπτεται (400 empty)", async () => {
  const r = await call({ install_id: "dev-a" });
  eq(r.status, 400, "status:"); eq((await r.json()).error, "empty", "error:");
});

await check("χωρίς install_id απορρίπτεται (400)", async () => {
  const r = await call({ stars: 5 });
  eq(r.status, 400);
});

await check("«Θέλω απάντηση» με άκυρο email απορρίπτεται", async () => {
  const r = await call({ install_id: "dev-a", stars: 4, reply: true, email: "οχι-email" });
  eq(r.status, 400); eq((await r.json()).error, "bad_email");
});

await check("κανονική γνώμη περνάει και ΔΕΝ κρατά email χωρίς reply", async () => {
  const r = await call({ install_id: "dev-a", stars: 5, text: "πολύ καλό", ver: "v60", email: "a@b.gr" });
  eq(r.status, 200);
  const row = sqlite.prepare("SELECT stars,text,ver,month,country,email FROM km_feedback ORDER BY id DESC LIMIT 1").get();
  eq(row.stars, 5); eq(row.ver, "v60"); eq(row.country, "CY");
  eq(row.email, null, "email χωρίς reply:");
  if (!/^\d{4}-\d{2}$/.test(row.month)) throw new Error("ο μήνας δεν είναι ΕΕΕΕ-ΜΜ: " + row.month);
});

await check("βαθμός εκτός 1-5 γίνεται κενός, δεν ρίχνει την κλήση", async () => {
  const r = await call({ install_id: "dev-a", stars: 99, text: "κάτι" });
  eq(r.status, 200);
  eq(sqlite.prepare("SELECT stars FROM km_feedback ORDER BY id DESC LIMIT 1").get().stars, null);
});

await check("το install_id ΔΕΝ αποθηκεύεται πουθενά", async () => {
  const cols = sqlite.prepare("PRAGMA table_info(km_feedback)").all().map((c) => c.name);
  if (cols.includes("install_id")) throw new Error("στήλη install_id υπάρχει!");
  const dump = JSON.stringify(sqlite.prepare("SELECT * FROM km_feedback").all())
             + JSON.stringify(sqlite.prepare("SELECT * FROM km_feedback_rate").all());
  if (dump.includes("dev-a")) throw new Error("το install_id βρέθηκε σε καθαρό κείμενο");
});

await check("φρένο: το 6ο μήνυμα της ίδιας συσκευής την ίδια μέρα κόβεται (429)", async () => {
  for (let i = 0; i < 6; i++) await call({ install_id: "dev-b", text: "μ" + i });
  const r = await call({ install_id: "dev-b", text: "το έκτο" });
  eq(r.status, 429); eq((await r.json()).error, "too_many");
});

await check("άλλη συσκευή δεν επηρεάζεται από το φρένο", async () => {
  const r = await call({ install_id: "dev-c", text: "καθαρή συσκευή" });
  eq(r.status, 200);
});

await check("σελίδα διαχείρισης: χωρίς κλειδί 404, με κλειδί 200", async () => {
  const bad = await mod.handleKm(new Request("https://x/api/km/admin/feedback"), env, null, "/api/km/admin/feedback");
  eq(bad.status, 404, "χωρίς κλειδί:");
  const ok = await mod.handleKm(new Request("https://x/api/km/admin/feedback?k=secret123"), env, null, "/api/km/admin/feedback");
  eq(ok.status, 200, "με κλειδί:");
  const html = await ok.text();
  if (!html.includes("Η γνώμη σου")) throw new Error("η σελίδα δεν έχει τίτλο");
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\nΠΡΑΣΙΝΟ: όλοι οι φρουροί πέρασαν");
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));

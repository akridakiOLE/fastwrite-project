// FastWrite — fastwrite.tech Worker
// ---------------------------------------------------------------------------
// Σερβίρει το στατικό site (site/) και προσθέτει τα δυναμικά σημεία του
// ερωτηματολογίου /gnomi:
//
//   POST /api/gnomi/e            -> συμβάντα χωνιού (view / start / q / abandon / t5 / t15)
//   POST /api/gnomi/submit       -> οι απαντήσεις
//   GET  /api/gnomi/apotelesmata -> ο πίνακας αποτελεσμάτων (θέλει ?k=<κλειδί>)
//
// ⚠ ΜΑΘΗΜΑ 14/8/2026: ό,τι ΔΕΝ είναι στο run_worker_first του wrangler.toml
// πάει ΠΡΩΤΑ στα static assets, που απαντούν 405 σε POST. Κάθε νέο route εδώ
// ΠΡΕΠΕΙ να προστεθεί ΚΑΙ εκεί, αλλιώς δεν καλείται ποτέ.
//
// ⚠ ΕΚΔΟΣΗ 2 ΤΟΥ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ (15/8/2026) — 3 ερωτήσεις αντί για 8.
// Οι στήλες q1/q2/q3 του gnomi_responses ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΟΥΝΤΑΙ με νέο νόημα.
// Η στήλη v ξεχωρίζει τις εκδόσεις: v=2 είναι το νέο ερωτηματολόγιο.
// Οι στήλες q1_other/q4/q5/q6 μένουν NULL — δεν διαγράφηκαν επίτηδες, ώστε να
// μη χρειαστεί καμία καταστροφική μετάβαση σε παραγωγή.
//
// GDPR: δεν αποθηκεύεται IP. Μόνο χώρα (Cloudflare) και user-agent.
// ---------------------------------------------------------------------------

const V = 2; // έκδοση ερωτηματολογίου

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/gnomi/e" && request.method === "POST") {
      const body = await safeJson(request);
      if (body) ctx.waitUntil(logEvent(env, request, body));
      return noContent();
    }

    if (path === "/api/gnomi/submit" && request.method === "POST") {
      const body = await safeJson(request);
      if (!body || !body.answers) return json({ ok: false }, 400);
      try {
        await saveResponse(env, request, body);
        // «out» = δήλωσε ότι δεν παραλαμβάνει εμπόρευμα. Καταγράφεται, αλλά
        // ΔΕΝ μετράει ως ολοκληρωμένο ερωτηματολόγιο — αλλιώς μολύνει τον δείκτη.
        ctx.waitUntil(
          logEvent(env, request, {
            sid: body.sid,
            ev: body.out ? "out" : "submit",
            q: body.out ? 1 : 4,
            src: body.src,
          })
        );
        return json({ ok: true });
      } catch (err) {
        console.error("gnomi submit failed:", err);
        return json({ ok: false }, 500);
      }
    }

    // ⚠ Είναι κάτω από /api/ ΕΠΙΤΗΔΕΣ: το run_worker_first του Cloudflare
    // πιάνει μόνο μοτίβα με αστερίσκο ("/api/*"). Με ακριβή διαδρομή
    // ("/gnomi/apotelesmata") ο worker ΔΕΝ καλείται και η σελίδα βγάζει 404.
    if (path === "/api/gnomi/apotelesmata") {
      // Χωρίς σωστό κλειδί η σελίδα ΔΕΝ υπάρχει. Αν δεν έχει οριστεί καθόλου
      // κλειδί στο Cloudflare, κλειδώνει τα πάντα — ασφαλής προεπιλογή.
      const k = url.searchParams.get("k") || "";
      if (!env.GNOMI_KEY || k !== env.GNOMI_KEY) {
        return new Response("Not found", { status: 404 });
      }
      try {
        return await dashboard(env);
      } catch (err) {
        console.error("dashboard failed:", err);
        return new Response("Σφάλμα: " + err.message, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// Βοηθητικά
// ---------------------------------------------------------------------------

async function safeJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function noContent() {
  return new Response(null, { status: 204 });
}

function clean(v, max) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, max || 200);
}

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function logEvent(env, request, b) {
  try {
    await env.DB.prepare(
      "INSERT INTO gnomi_events (sid, ev, q, src, ts, country, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        clean(b.sid, 40),
        clean(b.ev, 20),
        b.q === null || b.q === undefined ? null : Number(b.q) || 0,
        clean(b.src, 12),
        new Date().toISOString(),
        (request.cf && request.cf.country) || null,
        clean(request.headers.get("user-agent"), 300)
      )
      .run();
  } catch (err) {
    console.error("gnomi event log failed:", err);
  }
}

async function saveResponse(env, request, b) {
  const a = b.answers || {};
  await env.DB.prepare(
    `INSERT INTO gnomi_responses
       (sid, ts, src, country, user_agent, v, q1, q2, q3, email, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      clean(b.sid, 40),
      new Date().toISOString(),
      clean(b.src, 12),
      (request.cf && request.cf.country) || null,
      clean(request.headers.get("user-agent"), 300),
      V,
      clean(a.q1, 160),
      clean(a.q2, 160),
      clean(a.q3, 160),
      clean(a.email, 160),
      clean(a.comment, 2000)
    )
    .run();
}

// ---------------------------------------------------------------------------
// Ο πίνακας αποτελεσμάτων
// ---------------------------------------------------------------------------

const QLABEL = {
  1: "Σε χρέωσε προμηθευτής ακριβότερα, χωρίς να στο πει;",
  2: "Το βλέπεις τη στιγμή της παραλαβής;",
  3: "Πώς θα έβρισκες τεμάχια ανά κωδικό μέσα στη χρονιά;",
  4: "Τελευταία οθόνη (email + σχόλιο)",
};

// Οι ακριβείς ετικέτες των επιλογών — χρησιμοποιούνται για τα κριτήρια.
// ⚠ Πρέπει να ταιριάζουν ΓΡΑΜΜΑ ΠΡΟΣ ΓΡΑΜΜΑ με το site/gnomi/index.html.
const Q1_OUT = "Δεν παραλαμβάνω εμπόρευμα από προμηθευτές";
const Q1_HIT = [
  "Ναι, το κατάλαβα τυχαία",
  "Ναι, γιατί το ελέγχω",
]; // «του έχει συμβεί»
const Q2_BLIND = [
  "Όχι εκείνη τη στιγμή — θα φανεί αργότερα στα βιβλία",
  "Όχι, δεν υπάρχει τρόπος να το ξέρω τότε",
]; // «τυφλός τη στιγμή της παραλαβής»
const Q2_SOLVED = "Ναι, το βλέπω αμέσως από το σύστημά μου";

// ⚠ ΤΟ ΡΟΛΟΪ ΤΗΣ ΜΕΤΡΗΣΗΣ. Ο πίνακας gnomi_events ΔΕΝ έχει στήλη έκδοσης,
// οπότε χωρίς αυτό το όριο το χωνί θα ανακάτευε διαφορετικές περιόδους σε
// έναν αριθμό χωρίς νόημα. Τα παλιά δεδομένα ΔΕΝ διαγράφονται ΠΟΤΕ· μένουν
// στη βάση ως σημείο αναφοράς και βγαίνουν με ερώτημα ανά ημερομηνία.
//
// ΙΣΤΟΡΙΚΟ ΤΟΥ ΡΟΛΟΓΙΟΥ — μόνο προσθήκες:
//   2026-08-15T17:30:00Z  v1 (8 ερωτήσεις) -> v2 (3 ερωτήσεις).
//                         Τελευταίο συμβάν v1: 17:12:31Z.
//                         Κλείσιμο περιόδου: 78 συνεδρίες, 0 συμπληρωμένα.
//   2026-08-16T12:40:00Z  Αλλαγή κοινού: Advantage+ κλειστό + λογικό ΚΑΙ
//                         (Retail industry / Foodservice / Χονδρική πώληση).
//                         Κοινό 2,4 εκατ. -> 1,7 εκατ.
//                         Κλείσιμο περιόδου: 82 έφτασαν · 38 στα 5" ·
//                         16 στα 15" · 2 ξεκίνησαν · 1 τελείωσε · 1 email.
//                         15" -> απάντησε = 12,5%  (το νούμερο προς σύγκριση)
const SINCE = "2026-08-16T12:40:00Z";

const TARGET = 20;   // δείγμα απόφασης
const NEED_BLIND = 12;
const NEED_HIT = 6;

async function dashboard(env) {
  const [ev, resp] = await Promise.all([
    env.DB.prepare(
      "SELECT ev, q, COUNT(DISTINCT sid) AS c FROM gnomi_events WHERE ts >= ? GROUP BY ev, q"
    )
      .bind(SINCE)
      .all(),
    env.DB.prepare(
      "SELECT ts, src, country, v, q1, q2, q3, email, comment FROM gnomi_responses WHERE ts >= ? ORDER BY id DESC LIMIT 300"
    )
      .bind(SINCE)
      .all(),
  ]);

  const E = ev.results || [];
  const ALL = resp.results || [];
  const OLD = ALL.filter((r) => r.v !== V);
  const R = ALL.filter((r) => r.v === V);

  // Οι «εκτός κοινού» καταγράφονται αλλά δεν μετράνε ως συμπληρωμένα.
  const OUT = R.filter((r) => r.q1 === Q1_OUT);
  const IN = R.filter((r) => r.q1 !== Q1_OUT);

  const get = (name, q) => {
    const row = E.find(
      (r) => r.ev === name && (q === undefined ? true : Number(r.q) === q)
    );
    return row ? row.c : 0;
  };

  const views = get("view");
  const starts = get("start");
  const submits = get("submit");
  const outs = get("out");
  const t5 = get("t5");
  const t15 = get("t15");

  const steps = [];
  for (let i = 2; i <= 4; i++) steps.push({ q: i, reached: get("q", i) });

  const abandons = [];
  for (let i = 1; i <= 4; i++) {
    const c = get("abandon", i);
    if (c) abandons.push({ q: i, c });
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  const dist = (field, rows) => {
    const m = new Map();
    (rows || R).forEach((r) => {
      const v = r[field];
      if (v === null || v === undefined || v === "") return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const bar = (n, d) =>
    `<div class="bar"><i style="width:${d ? Math.min(100, (n / d) * 100) : 0}%"></i></div>`;

  const distTable = (title, rows) => {
    if (!rows.length) return "";
    const max = rows[0][1];
    return `<h3>${esc(title)}</h3><table class="dist">${rows
      .map(
        ([k, v]) =>
          `<tr><td class="k">${esc(k)}</td><td class="n mono">${v}</td><td class="b">${bar(
            v,
            max
          )}</td></tr>`
      )
      .join("")}</table>`;
  };

  // --- Τα κριτήρια απόφασης, υπολογισμένα ------------------------------------
  const nBlind = IN.filter((r) => Q2_BLIND.indexOf(r.q2) !== -1).length;
  const nHit = IN.filter((r) => Q1_HIT.indexOf(r.q1) !== -1).length;
  const nSolved = IN.filter((r) => r.q2 === Q2_SOLVED).length;
  const nEmail = IN.filter((r) => r.email && r.email.length > 3).length;

  let verdict, vclass;
  if (IN.length < TARGET) {
    verdict = `Δείγμα ${IN.length}/${TARGET} — πολύ νωρίς για απόφαση`;
    vclass = "wait";
  } else if (nSolved > IN.length / 2) {
    verdict = "ΚΟΚΚΙΝΟ — το πρόβλημα είναι ήδη λυμένο για τους περισσότερους";
    vclass = "red";
  } else if (nBlind >= NEED_BLIND && nHit >= NEED_HIT) {
    verdict = "ΠΡΑΣΙΝΟ — υπάρχει τυφλό σημείο και υπάρχει ζημιά";
    vclass = "green";
  } else {
    verdict = "ΘΟΛΟ — συνέχισε μέχρι τα 40, χωρίς αλλαγές";
    vclass = "amber";
  }

  const funnelRows = [
    ["Έφτασαν στη σελίδα", views, views],
    ["Έμειναν 5 δευτερόλεπτα", t5, views],
    ["Έμειναν 15 δευτερόλεπτα", t15, views],
    ["Απάντησαν την 1η ερώτηση", starts, views],
    ...steps.map((s) => [
      s.q === 4 ? "Τελευταία οθόνη" : `Ερώτηση ${s.q}`,
      s.reached,
      views,
    ]),
    ["ΤΕΛΕΙΩΣΑΝ", submits, views],
    ["Εκτός κοινού (δήλωσαν)", outs, views],
  ];

  const html = `<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Αποτελέσματα /gnomi — FastWrite</title>
<style>
:root{--bg:#0a0e14;--bg2:#131820;--bg3:#1a2030;--border:#2a3140;--text:#e6e8ec;--text2:#a8b0bd;--text3:#6b7385;--accent:#00E5A0;--warn:#fbbf24;--danger:#f87171}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5;font-size:15px;padding:24px 16px 60px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{max-width:980px;margin:0 auto}
h1{font-size:24px;margin-bottom:4px}
.sub{color:var(--text3);font-size:13px;margin-bottom:26px}
h2{font-size:18px;margin:34px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--border)}
h3{font-size:14px;color:var(--text2);margin:20px 0 8px;font-weight:600}
.kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.kpi{flex:1;min-width:150px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.kpi .v{font-size:30px;font-weight:700;font-family:ui-monospace,monospace;color:var(--accent)}
.kpi .l{font-size:12px;color:var(--text3);margin-top:2px}
table{width:100%;border-collapse:collapse}
.fun td{padding:7px 8px;border-bottom:1px solid var(--bg3);vertical-align:middle}
.fun td.l{width:200px;color:var(--text2);font-size:13px}
.fun td.n{width:52px;text-align:right;font-family:ui-monospace,monospace}
.fun td.p{width:52px;text-align:right;color:var(--text3);font-size:12px;font-family:ui-monospace,monospace}
.fun tr.hi td{color:var(--text);font-weight:600}
.fun tr.hi td.n{color:var(--accent)}
.bar{background:var(--bg3);height:9px;border-radius:5px;overflow:hidden}
.bar>i{display:block;height:100%;background:var(--accent)}
.dist td{padding:5px 8px;border-bottom:1px solid var(--bg3)}
.dist td.k{font-size:13px;color:var(--text2)}
.dist td.n{width:44px;text-align:right;font-family:ui-monospace,monospace}
.dist td.b{width:38%}
.resp{font-size:13px;margin-top:10px}
.resp th{text-align:left;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--border)}
.resp td{padding:8px;border-bottom:1px solid var(--bg3);vertical-align:top}
.resp .c{max-width:280px}
.empty{color:var(--text3);padding:22px 0;font-style:italic}
.note{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;color:var(--text2);font-size:13px;margin-top:12px}
.verdict{border-radius:10px;padding:16px 18px;font-size:17px;font-weight:700;margin-bottom:14px;border:1px solid var(--border);background:var(--bg2)}
.verdict.green{border-left:4px solid var(--accent);color:var(--accent)}
.verdict.red{border-left:4px solid var(--danger);color:var(--danger)}
.verdict.amber{border-left:4px solid var(--warn);color:var(--warn)}
.verdict.wait{border-left:4px solid var(--text3);color:var(--text2)}
.crit td{padding:6px 8px;border-bottom:1px solid var(--bg3);font-size:13px}
.crit td.k{color:var(--text2)}
.crit td.n{width:90px;text-align:right;font-family:ui-monospace,monospace;color:var(--text)}
</style></head><body><div class="wrap">

<h1>Αποτελέσματα — <span class="mono">/gnomi</span> <span style="color:var(--text3);font-size:15px">v${V}</span></h1>
<div class="sub">Δικά μας δεδομένα, όχι εκτίμηση πλατφόρμας · ανανέωσε τη σελίδα για επικαιροποίηση<br>Μετράει από <span class="mono">${esc(SINCE.slice(0, 16).replace("T", " "))} UTC</span> — ό,τι προηγήθηκε ανήκει στο παλιό ερωτηματολόγιο και δεν προσμετράται</div>

<div class="verdict ${vclass}">${esc(verdict)}</div>
<table class="crit">
  <tr><td class="k">Συμπληρωμένα εντός κοινού</td><td class="n">${IN.length} / ${TARGET}</td></tr>
  <tr><td class="k">Τυφλοί τη στιγμή της παραλαβής (χρειάζεται ≥ ${NEED_BLIND})</td><td class="n">${nBlind}</td></tr>
  <tr><td class="k">Έχουν όντως χρεωθεί ακριβότερα (χρειάζεται ≥ ${NEED_HIT})</td><td class="n">${nHit}</td></tr>
  <tr><td class="k">Το έχουν ήδη λυμένο (κόκκινο αν πλειοψηφία)</td><td class="n">${nSolved}</td></tr>
  <tr><td class="k">Άφησαν email — το σήμα που κοστίζει κάτι</td><td class="n">${nEmail}</td></tr>
  <tr><td class="k">Δήλωσαν εκτός κοινού</td><td class="n">${OUT.length}</td></tr>
</table>

<div class="kpis">
  <div class="kpi"><div class="v">${views}</div><div class="l">έφτασαν στη σελίδα</div></div>
  <div class="kpi"><div class="v">${starts}</div><div class="l">ξεκίνησαν (${pct(starts, views)}%)</div></div>
  <div class="kpi"><div class="v">${submits}</div><div class="l">τελείωσαν (${pct(submits, views)}%)</div></div>
</div>

<h2>Το χωνί — πού τους χάνουμε</h2>
<table class="fun">
${funnelRows
  .map(
    ([label, n, d], i) =>
      `<tr class="${i === 0 || label === "ΤΕΛΕΙΩΣΑΝ" ? "hi" : ""}"><td class="l">${esc(
        label
      )}</td><td class="n">${n}</td><td class="p">${pct(n, d)}%</td><td>${bar(n, d)}</td></tr>`
  )
  .join("")}
</table>
${
  abandons.length
    ? `<h3>Εγκατέλειψαν στην οθόνη</h3><table class="dist">${abandons
        .map(
          (a) =>
            `<tr><td class="k">${esc(
              (a.q === 4 ? "Τελευταία οθόνη" : "Ερώτηση " + a.q) +
                " — " +
                (QLABEL[a.q] || "")
            )}</td><td class="n mono">${a.c}</td><td class="b">${bar(
              a.c,
              Math.max(...abandons.map((x) => x.c))
            )}</td></tr>`
        )
        .join("")}</table>`
    : ""
}

<h2>Σύνοψη απαντήσεων${R.length ? ` <span class="mono" style="color:var(--text3);font-size:14px">(${R.length})</span>` : ""}</h2>
${
  R.length
    ? distTable(QLABEL[1], dist("q1")) +
      distTable(QLABEL[2], dist("q2", IN)) +
      distTable(QLABEL[3], dist("q3", IN))
    : `<div class="empty">Καμία απάντηση ακόμα.</div>`
}

<h2>Κάθε απάντηση</h2>
${
  R.length
    ? `<table class="resp"><tr>
<th>Πότε</th><th>Πηγή</th><th>Χώρα</th><th>1 · Χρεώθηκε ακριβότερα;</th><th>2 · Το βλέπει στην παραλαβή;</th><th>3 · Τεμάχια ανά κωδικό</th><th>Email</th><th>Σχόλιο</th></tr>
${R.map(
  (r) => `<tr>
<td class="mono" style="white-space:nowrap;color:var(--text3)">${esc((r.ts || "").slice(0, 16).replace("T", " "))}</td>
<td class="mono" style="font-size:12px">${esc(r.src)}</td>
<td class="mono" style="font-size:12px">${esc(r.country)}</td>
<td>${esc(r.q1)}</td>
<td>${esc(r.q2)}</td>
<td>${esc(r.q3)}</td>
<td class="mono" style="font-size:12px">${esc(r.email)}</td>
<td class="c">${esc(r.comment)}</td></tr>`
).join("")}
</table>`
    : `<div class="empty">Καμία απάντηση ακόμα.</div>`
}
${
  OLD.length
    ? `<div class="note">⚠ Υπάρχουν <b>${OLD.length}</b> απαντήσεις από παλιότερη έκδοση του ερωτηματολογίου. Δεν μετριούνται εδώ — άλλες ερωτήσεις, άλλο νόημα.</div>`
    : ""
}

<div class="note">
<b>Πώς διαβάζεται:</b> «έφτασαν» = φόρτωσε η σελίδα στον browser τους. Τα crawler bots
δεν τρέχουν JavaScript, άρα <b>δεν μετριούνται εδώ</b> — σε αντίθεση με τα νούμερα του
Meta, που είναι στατιστικό μοντέλο. Ένας άνθρωπος μετριέται μία φορά, όσες φορές κι αν
πατήσει. Όποιος δήλωσε «δεν παραλαμβάνω εμπόρευμα» καταγράφεται, αλλά <b>δεν μετράει
ως συμπληρωμένο</b>.
</div>

</div></body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

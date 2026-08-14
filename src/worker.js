// FastWrite — fastwrite.tech Worker
// ---------------------------------------------------------------------------
// Σερβίρει το στατικό site (site/) και προσθέτει τα δυναμικά σημεία του
// ερωτηματολογίου /gnomi:
//
//   POST /api/gnomi/e          -> συμβάντα χωνιού (view / start / q / abandon)
//   POST /api/gnomi/submit     -> οι απαντήσεις
//   GET  /gnomi/apotelesmata   -> ο πίνακας αποτελεσμάτων (θέλει ?k=<κλειδί>)
//
// ⚠ ΜΑΘΗΜΑ 14/8/2026: ό,τι ΔΕΝ είναι στο run_worker_first του wrangler.toml
// πάει ΠΡΩΤΑ στα static assets, που απαντούν 405 σε POST. Κάθε νέο route εδώ
// ΠΡΕΠΕΙ να προστεθεί ΚΑΙ εκεί, αλλιώς δεν καλείται ποτέ.
//
// GDPR: δεν αποθηκεύεται IP. Μόνο χώρα (Cloudflare) και user-agent.
// ---------------------------------------------------------------------------

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
        ctx.waitUntil(
          logEvent(env, request, { sid: body.sid, ev: "submit", q: 8, src: body.src })
        );
        return json({ ok: true });
      } catch (err) {
        console.error("gnomi submit failed:", err);
        return json({ ok: false }, 500);
      }
    }

    if (path === "/gnomi/apotelesmata") {
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
       (sid, ts, src, country, user_agent, q1, q1_other, q2, q3, q4, q5, q6, email, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      clean(b.sid, 40),
      new Date().toISOString(),
      clean(b.src, 12),
      (request.cf && request.cf.country) || null,
      clean(request.headers.get("user-agent"), 300),
      clean(a.q1, 120),
      clean(a.q1_other, 120),
      clean(a.q2, 40),
      clean(a.q3, 40),
      a.q4 === undefined || a.q4 === null ? null : Number(a.q4) || null,
      a.q5 === undefined || a.q5 === null ? null : Number(a.q5) || null,
      clean(a.q6, 120),
      clean(a.q7, 160),
      clean(a.q8, 2000)
    )
    .run();
}

// ---------------------------------------------------------------------------
// Ο πίνακας αποτελεσμάτων
// ---------------------------------------------------------------------------

const QLABEL = {
  1: "Τι σε περιγράφει καλύτερα;",
  2: "Πόσα παραστατικά τον μήνα;",
  3: "Πόσες ώρες τον μήνα;",
  4: "Φωτογραφίζεις τιμολόγιο — πόσο χρήσιμο;",
  5: "Ειδοποίηση αλλαγής τιμής — πόσο χρήσιμο;",
  6: "Πώς περνάνε σήμερα τα δεδομένα;",
  7: "Email",
  8: "Θέλεις να μου πεις κάτι;",
};

async function dashboard(env) {
  const [ev, resp] = await Promise.all([
    env.DB.prepare(
      "SELECT ev, q, COUNT(DISTINCT sid) AS c FROM gnomi_events GROUP BY ev, q"
    ).all(),
    env.DB.prepare(
      "SELECT ts, src, country, q1, q1_other, q2, q3, q4, q5, q6, email, comment FROM gnomi_responses ORDER BY id DESC LIMIT 300"
    ).all(),
  ]);

  const E = ev.results || [];
  const R = resp.results || [];

  const get = (name, q) => {
    const row = E.find(
      (r) => r.ev === name && (q === undefined ? true : Number(r.q) === q)
    );
    return row ? row.c : 0;
  };

  const views = get("view");
  const starts = get("start");
  const submits = get("submit");

  // Το χωνί ανά ερώτηση
  const steps = [];
  for (let i = 1; i <= 8; i++) steps.push({ q: i, reached: get("q", i) });

  // Πού εγκατέλειψαν
  const abandons = [];
  for (let i = 0; i <= 8; i++) {
    const c = get("abandon", i);
    if (c) abandons.push({ q: i, c });
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  // Κατανομές
  const dist = (field) => {
    const m = new Map();
    R.forEach((r) => {
      const v = r[field];
      if (v === null || v === undefined || v === "") return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const avg = (field) => {
    const v = R.map((r) => r[field]).filter((x) => typeof x === "number");
    if (!v.length) return null;
    return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
  };

  const bar = (n, d) =>
    `<div class="bar"><i style="width:${d ? (n / d) * 100 : 0}%"></i></div>`;

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

  const funnelRows = [
    ["Έφτασαν στη σελίδα", views, views],
    ["Πάτησαν «Ξεκίνα»", starts, views],
    ...steps.map((s) => [`Ερώτηση ${s.q}`, s.reached, views]),
    ["ΤΕΛΕΙΩΣΑΝ", submits, views],
  ];

  const html = `<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Αποτελέσματα /gnomi — FastWrite</title>
<style>
:root{--bg:#0a0e14;--bg2:#131820;--bg3:#1a2030;--border:#2a3140;--text:#e6e8ec;--text2:#a8b0bd;--text3:#6b7385;--accent:#00E5A0}
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
.fun td.l{width:180px;color:var(--text2);font-size:13px}
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
</style></head><body><div class="wrap">

<h1>Αποτελέσματα — <span class="mono">/gnomi</span></h1>
<div class="sub">Δικά μας δεδομένα, όχι εκτίμηση πλατφόρμας · ανανέωσε τη σελίδα για επικαιροποίηση</div>

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
      `<tr class="${i === 0 || i === funnelRows.length - 1 ? "hi" : ""}"><td class="l">${esc(
        label
      )}</td><td class="n">${n}</td><td class="p">${pct(n, d)}%</td><td>${bar(n, d)}</td></tr>`
  )
  .join("")}
</table>
${
  abandons.length
    ? `<h3>Εγκατέλειψαν στην ερώτηση</h3><table class="dist">${abandons
        .map(
          (a) =>
            `<tr><td class="k">${a.q === 0 ? "Στην εισαγωγή" : "Ερώτηση " + a.q + " — " + esc(QLABEL[a.q] || "")}</td><td class="n mono">${a.c}</td><td class="b">${bar(
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
      distTable(QLABEL[2], dist("q2")) +
      distTable(QLABEL[3], dist("q3")) +
      distTable(QLABEL[6], dist("q6")) +
      `<h3>Μέσοι όροι (κλίμακα 1-5)</h3><table class="dist">
        <tr><td class="k">${esc(QLABEL[4])}</td><td class="n mono">${avg("q4") || "—"}</td><td class="b">${bar(
        Number(avg("q4") || 0),
        5
      )}</td></tr>
        <tr><td class="k">${esc(QLABEL[5])}</td><td class="n mono">${avg("q5") || "—"}</td><td class="b">${bar(
        Number(avg("q5") || 0),
        5
      )}</td></tr>
      </table>`
    : `<div class="empty">Καμία απάντηση ακόμα.</div>`
}

<h2>Κάθε απάντηση</h2>
${
  R.length
    ? `<table class="resp"><tr>
<th>Πότε</th><th>Ρόλος</th><th>Παρ/κά</th><th>Ώρες</th><th>Q4</th><th>Q5</th><th>Σήμερα</th><th>Email</th><th>Σχόλιο</th></tr>
${R.map(
  (r) => `<tr>
<td class="mono" style="white-space:nowrap;color:var(--text3)">${esc((r.ts || "").slice(0, 16).replace("T", " "))}</td>
<td>${esc(r.q1 === "Άλλο" && r.q1_other ? r.q1_other : r.q1)}</td>
<td class="mono">${esc(r.q2)}</td>
<td class="mono">${esc(r.q3)}</td>
<td class="mono">${r.q4 === null ? "" : r.q4}</td>
<td class="mono">${r.q5 === null ? "" : r.q5}</td>
<td>${esc(r.q6)}</td>
<td class="mono" style="font-size:12px">${esc(r.email)}</td>
<td class="c">${esc(r.comment)}</td></tr>`
).join("")}
</table>`
    : `<div class="empty">Καμία απάντηση ακόμα.</div>`
}

<div class="note">
<b>Πώς διαβάζεται:</b> «έφτασαν» = φόρτωσε η σελίδα στον browser τους. Τα crawler bots
δεν τρέχουν JavaScript, άρα <b>δεν μετριούνται εδώ</b> — σε αντίθεση με τα νούμερα του
Meta, που είναι στατιστικό μοντέλο. Ένας άνθρωπος μετριέται μία φορά, όσες φορές κι αν
πατήσει.
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

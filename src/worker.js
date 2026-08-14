// FastWrite — fastwrite.tech Worker
// ---------------------------------------------------------------------------
// Σερβίρει το στατικό site (site/) και προσθέτει ΜΟΝΟ τρία δυναμικά σημεία για
// το ερωτηματολόγιο /gnomi:
//
//   GET  /gnomi              -> στατική σελίδα + server-side καταγραφή άφιξης
//   POST /api/gnomi/e        -> συμβάντα χωνιού (view / start / q / abandon)
//   POST /api/gnomi/submit   -> οι απαντήσεις
//
// ΟΤΙΔΗΠΟΤΕ ΑΛΛΟ πέφτει αυτούσιο στα static assets — η υπόλοιπη σελίδα δεν
// αλλάζει συμπεριφορά. Αν αποτύχει η καταγραφή, ΠΟΤΕ δεν σπάει η σελίδα.
//
// GDPR: δεν αποθηκεύεται IP. Μόνο χώρα (από το Cloudflare) και user-agent,
// όπως ακριβώς κάνει ήδη ο beta worker.
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // ---- API: συμβάντα χωνιού -------------------------------------------
    if (path === "/api/gnomi/e" && request.method === "POST") {
      const body = await safeJson(request);
      if (body) ctx.waitUntil(logEvent(env, request, body));
      return noContent();
    }

    // ---- API: υποβολή απαντήσεων ----------------------------------------
    if (path === "/api/gnomi/submit" && request.method === "POST") {
      const body = await safeJson(request);
      if (!body || !body.answers) return json({ ok: false }, 400);
      try {
        await saveResponse(env, request, body);
        ctx.waitUntil(logEvent(env, request, { sid: body.sid, ev: "submit", q: 8, src: body.src }));
        return json({ ok: true });
      } catch (err) {
        console.error("gnomi submit failed:", err);
        return json({ ok: false }, 500);
      }
    }

    // ---- Η σελίδα: καταγραφή άφιξης server-side --------------------------
    // Αυτό είναι το ground truth. Δεν εξαρτάται από JavaScript, από cookies,
    // ούτε από το μοντέλο του Meta.
    if (path === "/gnomi") {
      ctx.waitUntil(
        logEvent(env, request, {
          sid: null,
          ev: "arrive",
          q: null,
          src: url.searchParams.get("fbclid") ? "fb" : null,
        })
      );
    }

    return env.ASSETS.fetch(request);
  },
};

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
    // Best-effort. Η καταγραφή δεν επιτρέπεται ΠΟΤΕ να σπάσει τη σελίδα.
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

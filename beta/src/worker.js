// FastWrite — Private Beta Worker
// ---------------------------------------------------------------------------
// Serves the private beta landing page (static assets in ./public) and a
// /download route that:
//   1. logs the download to D1 (ref, timestamp, country, user-agent) for the
//      per-tester funnel — WITHOUT storing the raw IP (GDPR-friendly by design),
//   2. redirects to the installer .zip hosted on GitHub Releases.
//
// This Worker is SEPARATE from the production fastwrite.tech Worker. It has its
// own name, its own D1, and its own subdomain (beta.fastwrite.tech), so it
// cannot affect production. See beta/DEPLOY.md for the deploy steps.
// ---------------------------------------------------------------------------

// The public GitHub Release asset. The release tag MUST be "beta-v2" and the
// uploaded file MUST be named "FastWrite-Windows.zip" (see DEPLOY.md).
// To ship a new build later: upload a new asset and bump this URL's tag.
const DOWNLOAD_URL =
  "https://github.com/akridakiOLE/fastwrite-project/releases/download/beta-v2/FastWrite-Windows.zip";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/download") {
      // Sanitise ?ref= (defensive: cap length, strip anything weird).
      const rawRef = url.searchParams.get("ref") || "";
      const ref = rawRef.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);

      // Log in the background; never let logging block or break the download.
      ctx.waitUntil(logDownload(env, request, ref));

      return Response.redirect(DOWNLOAD_URL, 302);
    }

    // Everything else -> static assets (the landing page).
    return env.ASSETS.fetch(request);
  },
};

async function logDownload(env, request, ref) {
  try {
    await env.DB.prepare(
      "INSERT INTO downloads (ref, ts, country, user_agent) VALUES (?, ?, ?, ?)"
    )
      .bind(
        ref || null,
        new Date().toISOString(),
        (request.cf && request.cf.country) || null,
        request.headers.get("user-agent") || null
      )
      .run();
  } catch (err) {
    // Logging is best-effort. A logging failure must never block a download.
    console.error("download log failed:", err);
  }
}

-- FastWrite beta — D1 schema for the per-tester download funnel.
-- Run once after creating the D1 database (see beta/DEPLOY.md).

CREATE TABLE IF NOT EXISTS downloads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ref         TEXT,            -- the ?ref= tag of the tester link (NULL if none)
  ts          TEXT NOT NULL,   -- ISO-8601 UTC timestamp of the download
  country     TEXT,            -- 2-letter country from Cloudflare (coarse, not IP)
  user_agent  TEXT             -- browser/OS string
);

CREATE INDEX IF NOT EXISTS idx_downloads_ref ON downloads (ref);
CREATE INDEX IF NOT EXISTS idx_downloads_ts  ON downloads (ts);

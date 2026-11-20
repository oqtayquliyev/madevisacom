-- MadeVisa database (Cloudflare D1).
--
-- Paste this whole file into Cloudflare → Storage & databases → D1 → madevisa → Console
-- and press Execute. Running it again is safe (it only creates what is missing).
--
-- Free plan limits it is designed around: 500 MB per database, 5 million rows read and
-- 100,000 rows written per day. The website reads ready-made lists ("blobs") instead of
-- scanning the jobs table, and the daily job cycle only writes new and closed jobs.

-- Every live job. Filled and cleaned by the daily job cycle (fetcher/run.ts).
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,          -- short stable id, e.g. "k3x9q2m1ab"
  source      TEXT NOT NULL,             -- where it came from, e.g. "greenhouse:stripe"
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  country     TEXT,                      -- ISO code (DE, NL …) or NULL when unclear / several
  city        TEXT,
  location    TEXT,                      -- location exactly as the company wrote it
  remote      INTEGER NOT NULL DEFAULT 0,
  arrangement TEXT,                      -- onsite | hybrid | remote
  visa        TEXT,                      -- offered | not_offered | NULL (ad doesn't say)
  employment  TEXT,
  experience  TEXT,
  salary      TEXT,
  department  TEXT,
  url         TEXT NOT NULL,             -- the company's own job page
  posted_at   TEXT NOT NULL,             -- ISO date the company posted it
  first_seen  TEXT NOT NULL,             -- ISO date MadeVisa first saw it
  description TEXT                       -- cleaned HTML
);
CREATE INDEX IF NOT EXISTS jobs_posted ON jobs (posted_at);
CREATE INDEX IF NOT EXISTS jobs_country ON jobs (country, posted_at);
CREATE INDEX IF NOT EXISTS jobs_visa ON jobs (visa, posted_at);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs (company, posted_at);

-- Ready-made lists the website serves as they are (all jobs for the board, statistics,
-- the sitemap). Split into parts because one SQL statement may be at most 100 KB.
CREATE TABLE IF NOT EXISTS blobs (
  key        TEXT NOT NULL,
  part       INTEGER NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, part)
);

-- One line per run of the daily job cycle (shown on /job-market and /status).
CREATE TABLE IF NOT EXISTS runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  added          INTEGER NOT NULL DEFAULT 0,
  removed        INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  sources_ok     INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  failed_list    TEXT,                   -- which company feeds failed, so they can be fixed or removed
  note           TEXT
);

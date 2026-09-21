CREATE TABLE IF NOT EXISTS source_blobs (
  hash TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_gzip BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY, race_id TEXT NOT NULL, race_date TEXT NOT NULL,
  edition TEXT NOT NULL, observed_at TEXT NOT NULL, start_at TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)), reasons_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_course_time ON observations(race_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_day ON observations(race_date, observed_at DESC);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY, race_id TEXT NOT NULL, observed_at TEXT NOT NULL,
  status TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
  UNIQUE(race_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS results_course_time ON results(race_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
  status TEXT NOT NULL, details_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leases (
  name TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS control (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS observations_no_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS observations_no_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS observations_no_replace BEFORE INSERT ON observations WHEN EXISTS(SELECT 1 FROM observations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS sources_no_update BEFORE UPDATE ON source_blobs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS sources_no_delete BEFORE DELETE ON source_blobs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS sources_no_replace BEFORE INSERT ON source_blobs WHEN EXISTS(SELECT 1 FROM source_blobs WHERE hash=NEW.hash) BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS results_no_update BEFORE UPDATE ON results BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS results_no_delete BEFORE DELETE ON results BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS results_no_replace BEFORE INSERT ON results WHEN EXISTS(SELECT 1 FROM results WHERE id=NEW.id OR (race_id=NEW.race_id AND payload_hash=NEW.payload_hash)) BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

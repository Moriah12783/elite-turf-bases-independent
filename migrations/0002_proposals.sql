CREATE TABLE models (
  id TEXT PRIMARY KEY, trained_at TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TABLE proposals (
  id TEXT PRIMARY KEY, race_id TEXT NOT NULL, observation_id TEXT NOT NULL REFERENCES observations(id),
  model_id TEXT NOT NULL REFERENCES models(id), created_at TEXT NOT NULL, start_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('EXPERIMENTAL','ABSTAIN')),
  valid_until TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
  UNIQUE(observation_id,model_id)
);
CREATE INDEX proposals_race_time ON proposals(race_id,created_at DESC);
CREATE INDEX proposals_created ON proposals(created_at DESC);
CREATE TRIGGER models_no_update BEFORE UPDATE ON models BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER models_no_delete BEFORE DELETE ON models BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER models_no_replace BEFORE INSERT ON models WHEN EXISTS(SELECT 1 FROM models WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER proposals_no_update BEFORE UPDATE ON proposals BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER proposals_no_delete BEFORE DELETE ON proposals BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER proposals_no_replace BEFORE INSERT ON proposals WHEN EXISTS(SELECT 1 FROM proposals WHERE id=NEW.id OR (observation_id=NEW.observation_id AND model_id=NEW.model_id)) BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

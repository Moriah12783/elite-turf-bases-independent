-- References point exclusively to decisions actually emitted before departure.
CREATE TABLE edition_references (
  race_id TEXT NOT NULL,
  edition TEXT NOT NULL CHECK(edition IN ('T_MATIN','T90','T30','T15')),
  proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
  policy TEXT NOT NULL DEFAULT 'FIRST_RECORDED_EDITION_V1' CHECK(policy='FIRST_RECORDED_EDITION_V1'),
  PRIMARY KEY(race_id,edition)
);

-- Earlier versions already archived every decision. Do not generate new predictions.
INSERT INTO edition_references(race_id,edition,proposal_id)
SELECT p.race_id,json_extract(p.payload_json,'$.edition'),p.id FROM proposals p
WHERE p.created_at<p.start_at AND json_extract(p.payload_json,'$.edition') IN ('T_MATIN','T90','T30','T15')
AND p.id=(SELECT x.id FROM proposals x WHERE x.race_id=p.race_id AND x.created_at<x.start_at
  AND json_extract(x.payload_json,'$.edition')=json_extract(p.payload_json,'$.edition')
  ORDER BY x.created_at,x.id LIMIT 1);

CREATE TRIGGER edition_references_no_update BEFORE UPDATE ON edition_references BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER edition_references_no_delete BEFORE DELETE ON edition_references BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER edition_references_identity BEFORE INSERT ON edition_references
WHEN NOT EXISTS(SELECT 1 FROM proposals WHERE id=NEW.proposal_id AND race_id=NEW.race_id
  AND json_extract(payload_json,'$.edition')=NEW.edition AND created_at<start_at)
BEGIN SELECT RAISE(ABORT,'INVALID_EDITION_REFERENCE'); END;
CREATE TRIGGER edition_references_no_replace BEFORE INSERT ON edition_references
WHEN EXISTS(SELECT 1 FROM edition_references WHERE (race_id=NEW.race_id AND edition=NEW.edition) OR proposal_id=NEW.proposal_id)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

-- Same transaction as the proposal: a crash cannot lose the first decision's reference.
CREATE TRIGGER proposals_capture_edition AFTER INSERT ON proposals
WHEN NEW.created_at<NEW.start_at AND json_extract(NEW.payload_json,'$.edition') IN ('T_MATIN','T90','T30','T15')
BEGIN
  INSERT INTO edition_references(race_id,edition,proposal_id)
  SELECT NEW.race_id,json_extract(NEW.payload_json,'$.edition'),NEW.id
  WHERE NOT EXISTS(SELECT 1 FROM edition_references WHERE race_id=NEW.race_id AND edition=json_extract(NEW.payload_json,'$.edition'));
END;

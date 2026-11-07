CREATE TABLE custom_drill_groups(drill_id TEXT NOT NULL REFERENCES custom_drill_sets(id) ON DELETE CASCADE,group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,PRIMARY KEY(drill_id,group_id));
CREATE TRIGGER prevent_skill_cycle BEFORE INSERT ON skill_prerequisites
WHEN NEW.skill_id IN (
  WITH RECURSIVE ancestors(id) AS (
    SELECT NEW.prerequisite_id UNION SELECT p.prerequisite_id FROM skill_prerequisites p JOIN ancestors a ON p.skill_id=a.id
  ) SELECT id FROM ancestors
) BEGIN SELECT RAISE(ABORT,'SKILL_CYCLE'); END;
ALTER TABLE ai_policy ADD COLUMN total_daily_limit INTEGER NOT NULL DEFAULT 1000;

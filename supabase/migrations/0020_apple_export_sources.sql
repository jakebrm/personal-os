-- Allow the Apple Health auto-export pipeline (and the nutritionist skill)
-- to write rows: extend the source CHECK constraints.
ALTER TABLE nutrition_logs DROP CONSTRAINT IF EXISTS nutrition_logs_source_check;
ALTER TABLE nutrition_logs ADD CONSTRAINT nutrition_logs_source_check
  CHECK (source IN ('macrofactor', 'manual', 'nutritionist', 'apple'));

ALTER TABLE body_logs DROP CONSTRAINT IF EXISTS body_logs_source_check;
ALTER TABLE body_logs ADD CONSTRAINT body_logs_source_check
  CHECK (source IN ('manual', 'starfit', 'apple'));

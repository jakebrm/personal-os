-- Migrate goals category enum to new taxonomy:
-- fitness | faith | academic | finance | professional | other

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_category_check;

-- Remap existing rows before applying new constraint
UPDATE goals SET category = 'fitness'      WHERE category IN ('health', 'fitness');
UPDATE goals SET category = 'academic'     WHERE category IN ('reading', 'habits');
UPDATE goals SET category = 'other'        WHERE category = 'custom'
  OR category NOT IN ('fitness','faith','academic','finance','professional','other');

ALTER TABLE goals
  ALTER COLUMN category SET DEFAULT 'other',
  ADD CONSTRAINT goals_category_check
    CHECK (category IN ('fitness','faith','academic','finance','professional','other'));

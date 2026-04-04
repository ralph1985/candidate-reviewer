ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS intake_conclusions TEXT,
  ADD COLUMN IF NOT EXISTS intake_other_questions TEXT,
  ADD COLUMN IF NOT EXISTS intake_good_practices TEXT,
  ADD COLUMN IF NOT EXISTS intake_design_patterns TEXT;

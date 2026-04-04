ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS candidate_deploy_url TEXT,
  ADD COLUMN IF NOT EXISTS exercise_name TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_email TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_recommended BOOLEAN,
  ADD COLUMN IF NOT EXISTS predefined_questions JSONB,
  ADD COLUMN IF NOT EXISTS import_source JSONB;

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_at ON reviews(reviewed_at DESC);

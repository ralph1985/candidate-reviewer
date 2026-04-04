CREATE TABLE IF NOT EXISTS review_phase_results (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  phase_key TEXT NOT NULL CHECK (phase_key IN ('architecture', 'tests', 'security', 'documentation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  score INTEGER CHECK (score BETWEEN 0 AND 10),
  summary TEXT,
  details JSONB,
  raw_output TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, phase_key)
);

CREATE INDEX IF NOT EXISTS idx_review_phase_results_review_id ON review_phase_results(review_id);
CREATE INDEX IF NOT EXISTS idx_review_phase_results_status ON review_phase_results(status);

CREATE OR REPLACE FUNCTION set_updated_at_review_phase_results()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_review_phase_results ON review_phase_results;
CREATE TRIGGER trg_set_updated_at_review_phase_results
BEFORE UPDATE ON review_phase_results
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_review_phase_results();

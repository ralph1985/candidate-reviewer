ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_status_check;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_status_check
  CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled'));

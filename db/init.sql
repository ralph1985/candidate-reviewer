CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  candidate_name TEXT NOT NULL,
  github_url TEXT NOT NULL,
  candidate_deploy_url TEXT,
  exercise_name TEXT,
  reviewer_name TEXT,
  reviewer_email TEXT,
  reviewed_at TIMESTAMPTZ,
  intake_conclusions TEXT,
  intake_other_questions TEXT,
  intake_good_practices TEXT,
  intake_design_patterns TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  scores JSONB,
  final_report TEXT,
  interview_recommended BOOLEAN,
  predefined_questions JSONB,
  import_source JSONB,
  recommendation TEXT NOT NULL DEFAULT 'pendiente' CHECK (recommendation IN ('apto', 'no_apto', 'pendiente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_at ON reviews(reviewed_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at_reviews()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_reviews ON reviews;
CREATE TRIGGER trg_set_updated_at_reviews
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_reviews();

CREATE TABLE IF NOT EXISTS review_phase_results (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  phase_key TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS review_skills (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_skills_active ON review_skills(active);
CREATE INDEX IF NOT EXISTS idx_review_skills_sort_order ON review_skills(sort_order ASC);

CREATE OR REPLACE FUNCTION set_updated_at_review_skills()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_review_skills ON review_skills;
CREATE TRIGGER trg_set_updated_at_review_skills
BEFORE UPDATE ON review_skills
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_review_skills();

CREATE TABLE IF NOT EXISTS challenge_definitions (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'challenge' CHECK (kind IN ('challenge')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  content_format TEXT NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html')),
  content TEXT NOT NULL,
  source_path TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_definitions_active ON challenge_definitions(active);
CREATE INDEX IF NOT EXISTS idx_challenge_definitions_kind ON challenge_definitions(kind);

CREATE OR REPLACE FUNCTION set_updated_at_challenge_definitions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_challenge_definitions ON challenge_definitions;
CREATE TRIGGER trg_set_updated_at_challenge_definitions
BEFORE UPDATE ON challenge_definitions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_challenge_definitions();

INSERT INTO review_skills (key, name, description, prompt_template, active, sort_order)
VALUES
  (
    'challenge_requirements',
    'Cumplimiento del enunciado',
    'Valida si la implementación cubre los requisitos del enunciado de la prueba técnica.',
    'Analiza el repositorio contra el enunciado oficial de la prueba detectada. Enumera requisitos cumplidos, parcialmente cumplidos y no cumplidos con evidencia concreta (ficheros/comportamientos).',
    TRUE,
    5
  ),
  (
    'architecture',
    'Arquitectura',
    'Revisión de arquitectura, modularidad y mantenibilidad.',
    'Analiza arquitectura del repositorio: estructura, modularidad, separación de responsabilidades, mantenibilidad y deuda técnica.',
    TRUE,
    10
  ),
  (
    'security',
    'Seguridad',
    'Revisión de riesgos de seguridad y buenas prácticas.',
    'Analiza seguridad: manejo de secretos, validación de entradas, dependencias, hardening básico y riesgos potenciales.',
    TRUE,
    20
  ),
  (
    'tests',
    'Tests',
    'Revisión de estrategia y calidad de pruebas.',
    'Analiza calidad de testing: cobertura funcional, claridad de tests, estrategia de pruebas, casos límite y señales de fragilidad.',
    TRUE,
    30
  ),
  (
    'documentation',
    'Documentación',
    'Revisión de calidad documental y capacidad de onboarding.',
    'Analiza documentación: README, guías de ejecución, onboarding, claridad de decisiones técnicas y limitaciones conocidas.',
    TRUE,
    40
  )
ON CONFLICT (key) DO NOTHING;

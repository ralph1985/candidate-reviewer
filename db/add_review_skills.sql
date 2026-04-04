DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'review_phase_results'
      AND constraint_name = 'review_phase_results_phase_key_check'
  ) THEN
    ALTER TABLE review_phase_results DROP CONSTRAINT review_phase_results_phase_key_check;
  END IF;
END $$;

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

INSERT INTO review_skills (key, name, description, prompt_template, active, sort_order)
VALUES
  (
    'architecture',
    'Arquitectura',
    'Revisión de arquitectura, modularidad y mantenibilidad.',
    'Analiza arquitectura del repositorio: estructura, modularidad, separación de responsabilidades, mantenibilidad y deuda técnica.',
    TRUE,
    10
  ),
  (
    'tests',
    'Tests',
    'Revisión de estrategia y calidad de pruebas.',
    'Analiza calidad de testing: cobertura funcional, claridad de tests, estrategia de pruebas, casos límite y señales de fragilidad.',
    TRUE,
    20
  ),
  (
    'security',
    'Seguridad',
    'Revisión de riesgos de seguridad y buenas prácticas.',
    'Analiza seguridad: manejo de secretos, validación de entradas, dependencias, hardening básico y riesgos potenciales.',
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

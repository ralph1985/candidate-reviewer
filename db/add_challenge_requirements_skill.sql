INSERT INTO review_skills (key, name, description, prompt_template, active, sort_order)
VALUES (
  'challenge_requirements',
  'Cumplimiento del enunciado',
  'Valida si la implementación cubre los requisitos del enunciado de la prueba técnica.',
  'Analiza el repositorio contra el enunciado oficial de la prueba detectada. Enumera requisitos cumplidos, parcialmente cumplidos y no cumplidos con evidencia concreta (ficheros/comportamientos).',
  TRUE,
  5
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  prompt_template = EXCLUDED.prompt_template,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order;

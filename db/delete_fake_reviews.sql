-- Borra todas las revisiones ficticias cargadas para demo visual
DELETE FROM reviews
WHERE candidate_name LIKE '[FAKE] %';

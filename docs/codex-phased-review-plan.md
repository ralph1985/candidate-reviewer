# Codex Phased Review Plan

## Objetivo

Permitir revisiones técnicas por fases desde la interfaz web, ejecutando cada fase con Codex CLI en el VPS y guardando resultados parciales/finales en PostgreSQL.

## Estado actual

- Existe flujo de revisión (`/api/reviews/:id/run`) y persistencia final en `reviews`.
- El runner actual es heurístico y no persiste resultados detallados por fase.

## Fases objetivo

1. `architecture`
2. `tests`
3. `security`
4. `documentation`

Cada fase debe guardar:

- estado
- score
- resumen
- salida/raw
- timestamps

## Diseño técnico

### BD

Nueva tabla `review_phase_results`:

- `id`
- `review_id` (FK -> `reviews.id`)
- `phase_key`
- `status`
- `score`
- `summary`
- `details` (jsonb)
- `raw_output`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

### Backend

- Extender runner para ejecución secuencial por fases.
- Añadir callback por fase para persistencia incremental.
- Mantener `reviews` como resumen final (estado global + recomendación + informe final).
- Endpoint nuevo `GET /api/reviews/:id/phases`.

### Frontend

- Mostrar bloques/fases evaluadas en la vista de detalle/edición.
- Estado visual por fase (`pending`, `running`, `done`, `failed`).

## Integración Codex CLI (siguiente iteración)

- Por fase, construir prompt estructurado.
- Invocar Codex CLI con timeout y captura de salida.
- Parsear salida a JSON seguro (`score`, `summary`, `details`).
- Si Codex CLI falla, registrar `failed` en esa fase y continuar o abortar según política.
- Requisito runtime: contenedor con binario `codex` instalado y accesible en `PATH`.
- Requisito auth: sesión/token de Codex CLI disponible dentro del contenedor.
- Requisito formato: configurar args/prompts de Codex para devolver JSON estricto por fase.

## Plan de implementación

- [x] Documento de plan
- [x] Modelo de datos por fase
- [x] Runner por fases con persistencia incremental
- [x] Endpoint para consultar fases
- [x] UI para visualizar fases por revisión
- [x] Adaptador base Codex CLI por fase (con fallback heuristico)
- [ ] Robustecer prompt/parseo y politicas de reintento para produccion
- [ ] Configurar auth de Codex CLI en contenedor y validar `engine=codex-cli`

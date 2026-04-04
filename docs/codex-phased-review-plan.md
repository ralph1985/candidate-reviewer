# Codex Phased Review Plan

## Objetivo

Permitir revisiones técnicas por fases desde la interfaz web, ejecutando cada fase con Codex CLI en el VPS y guardando resultados parciales/finales en PostgreSQL.

## Estado actual

- Existe flujo de revisión (`/api/reviews/:id/run`) con persistencia final en `reviews`.
- Existe persistencia detallada por fase en `review_phase_results`.
- Runner con adaptación Codex CLI + fallback heurístico.
- Workspace persistente por review (`REVIEW_WORKSPACES_ROOT/review-<id>`).
- Preflight de seguridad antes de instalación y ejecución real de tests en fase `tests`.

## Fases objetivo

1. `architecture`
2. `security`
3. `tests`
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

## Integración Codex CLI

- Por fase, construir prompt estructurado.
- Invocar Codex CLI con timeout y captura de salida.
- Parsear salida a JSON seguro (`score`, `summary`, `details`).
- Si Codex CLI falla, aplicar fallback y registrar motivo.
- Requisito runtime: contenedor con binario `codex` instalado y accesible en `PATH`.
- Requisito auth: sesión/token de Codex CLI disponible dentro del contenedor.
- Requisito formato: configurar args/prompts de Codex para devolver JSON estricto por fase.
- Requisito adicional: contenedor con herramientas mínimas para ejecutar tests del stack objetivo.

## Plan de implementación

- [x] Documento de plan
- [x] Modelo de datos por fase
- [x] Runner por fases con persistencia incremental
- [x] Endpoint para consultar fases
- [x] UI para visualizar fases por revisión
- [x] Adaptador base Codex CLI por fase (con fallback heuristico)
- [x] Workspace persistente por review
- [x] Preflight de seguridad antes de instalación de dependencias
- [x] Ejecución real de tests (Node) con logs en fase `tests`
- [ ] Robustecer prompt/parseo y politicas de reintento para produccion
- [ ] Configurar auth de Codex CLI en contenedor y validar `engine=codex-cli`

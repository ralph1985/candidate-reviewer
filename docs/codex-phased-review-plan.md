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
- [ ] Cargar revisiones reales históricas desde formularios PDF: extraer con ChatGPT a JSON normalizado, leer ese JSON desde la app y persistir candidatos/revisiones/fases en PostgreSQL mediante importador administrable

## Formato JSON objetivo para importación histórica (PDF -> ChatGPT -> app)

```json
{
  "source": {
    "kind": "google-form-pdf",
    "fileName": "revision-candidato-2026-04-01.pdf",
    "extractedAt": "2026-04-04T18:25:00Z"
  },
  "candidate": {
    "name": "Nombre Apellidos",
    "email": "candidato@example.com",
    "githubUrl": "https://github.com/org/repo",
    "position": "Frontend Developer",
    "notes": "Notas opcionales del formulario"
  },
  "review": {
    "status": "completed",
    "recommendation": "hire",
    "finalScore": 82,
    "summary": "Resumen global de la revisión",
    "reportMarkdown": "Informe completo en markdown",
    "reviewedAt": "2026-04-01T10:30:00Z"
  },
  "phases": [
    {
      "phaseKey": "architecture",
      "status": "done",
      "score": 78,
      "summary": "Resumen de arquitectura",
      "details": {
        "strengths": ["modularidad"],
        "risks": ["acoplamiento en capa api"]
      },
      "rawOutput": "Texto bruto opcional",
      "startedAt": "2026-04-01T10:00:00Z",
      "finishedAt": "2026-04-01T10:10:00Z"
    },
    {
      "phaseKey": "security",
      "status": "done",
      "score": 85,
      "summary": "Resumen de seguridad",
      "details": {},
      "rawOutput": "",
      "startedAt": "2026-04-01T10:11:00Z",
      "finishedAt": "2026-04-01T10:18:00Z"
    },
    {
      "phaseKey": "tests",
      "status": "done",
      "score": 80,
      "summary": "Resumen de tests",
      "details": {},
      "rawOutput": "",
      "startedAt": "2026-04-01T10:19:00Z",
      "finishedAt": "2026-04-01T10:25:00Z"
    },
    {
      "phaseKey": "documentation",
      "status": "done",
      "score": 88,
      "summary": "Resumen de documentación",
      "details": {},
      "rawOutput": "",
      "startedAt": "2026-04-01T10:26:00Z",
      "finishedAt": "2026-04-01T10:30:00Z"
    }
  ]
}
```

Reglas:

- `candidate.githubUrl` obligatorio.
- `review.status` admitidos: `pending`, `running`, `completed`, `failed`.
- `review.recommendation` admitidos: `hire`, `strong-hire`, `no-hire`, `needs-more-signal`.
- `phases[*].phaseKey` admitidos: `architecture`, `security`, `tests`, `documentation`.
- `phases[*].status` admitidos: `pending`, `running`, `done`, `failed`.
- Campos desconocidos se ignorarán en el importador.

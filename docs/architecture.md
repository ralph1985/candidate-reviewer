# Arquitectura

## Componentes

1. Frontend (`frontend/`)
- Astro (render estático).
- TailwindCSS para UI.
- Layout compartido con sidebar/drawer responsive.
- Rutas separadas por dominio funcional (`/`, `/reviews/new`, `/reviews`, `/reviews/detail`, `/skills`).

2. Backend (`backend/`)
- Fastify.
- Endpoints REST para revisiones y fases.
- Endpoint de importación histórica (`POST /api/imports/historical-review`) para cargar JSON normalizado de formularios previos.
- Runner de revisión con flujo por fases.

3. Base de datos (PostgreSQL)
- Tabla `reviews` para estado global.
- Tabla `review_phase_results` para detalle por fase.
- Tabla `review_skills` para definir fases/prompt administrables.
- Tabla `challenge_definitions` para enunciados oficiales (retos + requisitos globales como página 404).
- `reviews` también guarda metadatos de histórico importado: evaluador, email, fecha original (`reviewed_at`), deploy, ejercicio, preguntas predefinidas e `import_source`.

4. Infraestructura
- Contenedor único para app (frontend estático servido por backend).
- Conexión a PostgreSQL compartido en red Docker (`infra-net`).
- Exposición vía reverse-proxy por ruta (`/cr/`).
- Assets estáticos servidos tanto en `/` como en `/cr/` para compatibilidad con proxy.

## Flujo de revisión

1. Usuario crea revisión (`POST /api/reviews`).
2. Usuario lanza ejecución (`POST /api/reviews/:id/run`).
3. Backend marca revisión en `running` y limpia fases previas.
4. Backend carga skills activas de `review_skills` (ordenadas).
5. Backend detecta la prueba objetivo combinando `exercise_name` y URL de repositorio contra `challenge_definitions`.
6. Runner clona repo en workspace persistente por review (`review-<id>`).
7. Antes de instalar dependencias, ejecuta preflight de seguridad (bloquea si detecta riesgos críticos).
8. Fase `tests`: instalación segura (`--ignore-scripts`) + ejecución real de tests cuando aplique.
9. Fase `challenge_requirements`: evalúa cumplimiento del enunciado oficial detectado y requisitos globales.
10. Runner evalúa el resto de fases en secuencia.
11. Cada fase se persiste en `review_phase_results`.
12. Al terminar, backend actualiza `reviews` con score global, informe y recomendación.

## Estrategia de motor

- Si `CODEX_CLI_ENABLED=true`, intenta ejecutar Codex CLI por fase.
- Si falla Codex (no binario, auth, timeout, parseo), aplica fallback heurístico y registra error en `details.codexError`.
- La fase `tests` usa motor de ejecución de pruebas con logs en `raw_output`.
- La fase `security` ejecuta preflight local antes de cualquier instalación.

## Decisiones técnicas

- Persistencia incremental por fase para observabilidad de progreso.
- Workspace persistente para reproducibilidad de revisiones.
- Estado global separado de detalle por fase.
- API simple para permitir futuras UIs más ricas sin cambios de backend.

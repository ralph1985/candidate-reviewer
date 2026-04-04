# Arquitectura

## Componentes

1. Frontend (`frontend/`)
- Astro (render estático).
- TailwindCSS para UI.
- Pantalla única con navegación lateral por secciones.

2. Backend (`backend/`)
- Fastify.
- Endpoints REST para revisiones y fases.
- Runner de revisión con flujo por fases.

3. Base de datos (PostgreSQL)
- Tabla `reviews` para estado global.
- Tabla `review_phase_results` para detalle por fase.

4. Infraestructura
- Contenedor único para app (frontend estático servido por backend).
- Conexión a PostgreSQL compartido en red Docker (`infra-net`).
- Exposición vía reverse-proxy por ruta (`/cr/`).

## Flujo de revisión

1. Usuario crea revisión (`POST /api/reviews`).
2. Usuario lanza ejecución (`POST /api/reviews/:id/run`).
3. Backend marca revisión en `running` y limpia fases previas.
4. Runner clona repo y evalúa fases en secuencia.
5. Cada fase se persiste en `review_phase_results`.
6. Al terminar, backend actualiza `reviews` con score global, informe y recomendación.

## Estrategia de motor

- Si `CODEX_CLI_ENABLED=true`, intenta ejecutar Codex CLI por fase.
- Si falla Codex (no binario, auth, timeout, parseo), aplica fallback heurístico y registra error en `details.codexError`.

## Decisiones técnicas

- Persistencia incremental por fase para observabilidad de progreso.
- Estado global separado de detalle por fase.
- API simple para permitir futuras UIs más ricas sin cambios de backend.

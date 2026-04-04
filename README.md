# candidate-reviewer

Aplicación web para revisar pruebas técnicas de candidatos con ejecución automática por fases y almacenamiento histórico en PostgreSQL.

## Stack

- Frontend: Astro + TailwindCSS
- Backend: Fastify (Node.js)
- Base de datos: PostgreSQL
- Runtime recomendado: Docker Compose

## Estado actual

- Gestión de revisiones (`create`, `list`, `update`).
- Gestión de skills/fases desde UI (key, nombre, prompt, activo, orden).
- Ejecución automática por fases leyendo skills activas desde PostgreSQL.
- Persistencia detallada de resultados por fase.
- Integración base con Codex CLI (con fallback heurístico si falla o no está autenticado).

## Inicio rápido

```bash
cp .env.example .env
# ajusta DATABASE_URL

docker compose up -d --build
```

App:
- local: `http://localhost:3000`
- detrás de proxy: `https://<tu-host>/cr/`

## Documentación

- Guía general: [docs/README.md](./docs/README.md)
- Arquitectura: [docs/architecture.md](./docs/architecture.md)
- API: [docs/api.md](./docs/api.md)
- Operación y despliegue: [docs/operations.md](./docs/operations.md)
- Plan por fases con Codex: [docs/codex-phased-review-plan.md](./docs/codex-phased-review-plan.md)

## Scripts útiles

```bash
# frontend
cd frontend && npm run dev

# backend
cd backend && npm run dev

# build frontend/backend
cd frontend && npm run build
cd ../backend && npm run build
```

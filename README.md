# candidate-reviewer

MVP para revisión técnica automática de candidatos.

Stack:
- Frontend: Astro (estático)
- Backend/API: Fastify (Node.js)
- Base de datos: PostgreSQL

## Modelo de datos (MVP)

Tabla `reviews`:
- `candidate_name`
- `github_url`
- `status` (`pending`, `running`, `done`, `failed`)
- `scores` (JSONB)
- `final_report`
- `recommendation` (`apto`, `no_apto`, `pendiente`)
- timestamps (`created_at`, `updated_at`, `started_at`, `finished_at`)

## Requisitos

- Node.js 22+
- PostgreSQL disponible en el VPS
- Docker (opcional para ejecución en contenedor)

## Configuración rápida

1. Copia variables de entorno:

```bash
cp .env.example .env
```

2. Crea la tabla en PostgreSQL:

```bash
psql "$DATABASE_URL" -f db/init.sql
```

3. Instala dependencias:

```bash
cd frontend && npm install
cd ../backend && npm install
```

## Desarrollo

Terminal 1 (frontend):

```bash
cd frontend
npm run dev
```

Terminal 2 (backend):

```bash
cd backend
npm run dev
```

- Frontend: `http://localhost:4321`
- API: `http://localhost:3000`

## Build y ejecución local

```bash
cd frontend && npm run build
cd ../backend && npm run build
STATIC_DIR=../frontend/dist PORT=3000 npm run start
```

## Docker

Construir imagen:

```bash
docker build -t candidate-reviewer:latest .
```

Ejecutar contenedor:

```bash
docker run --rm -p 3000:3000 --env-file .env candidate-reviewer:latest
```

La app servirá frontend + API desde el mismo puerto (`3000`).

# Instalación local en PC (revisor)

Guía para instalar `candidate-reviewer` en un PC desde cero con Docker, sin depender del VPS.

## Requisitos

- Git
- Docker Engine + Docker Compose plugin
- Puerto `3000` libre en tu máquina

Opcional (si quieres ejecutar revisiones con Codex CLI en vez de fallback heurístico):

- Tener sesión iniciada en Codex CLI en el host:

```bash
codex login
codex login status
```

## Instalación rápida (recomendada)

1. Clona el repositorio y entra al proyecto.

```bash
git clone <URL_DEL_REPO>
cd candidate-reviewer
```

2. Crea archivo de entorno.

```bash
cp .env.example .env
```

3. Ajusta `.env` según necesidad:
- `CODEX_CLI_ENABLED=true` para usar Codex CLI real.
- `CODEX_CLI_ENABLED=false` si solo quieres probar UI/API con fallback.
- Opcional: si quieres una URL de BD distinta para modo local, exporta `LOCAL_DATABASE_URL` antes de levantar.

4. Levanta todo (app + PostgreSQL local).

```bash
docker compose -f docker-compose.local.yml up -d --build
```

5. Verifica salud:

```bash
curl http://localhost:3000/health
```

Debe devolver:

```json
{ "ok": true }
```

6. Abre la UI:
- `http://localhost:3000/`
- `http://localhost:3000/reviews`
- `http://localhost:3000/skills`
- `http://localhost:3000/challenges`

## Qué monta `docker-compose.local.yml`

- `candidate-reviewer-db` (PostgreSQL 16)
  - Base `candidate_reviewer`
  - Usuario `postgres`
  - Password `postgres`
  - Carga esquema inicial automáticamente desde `db/init.sql`
- `candidate-reviewer` (backend+frontend)
  - Puerto `3000`
  - Conexión por defecto a `candidate-reviewer-db`
  - Monta `${HOME}/.codex` dentro del contenedor para reutilizar sesión de Codex

## Operación básica

Ver contenedores:

```bash
docker ps | rg candidate-reviewer
```

Ver logs:

```bash
docker logs --tail 200 candidate-reviewer
```

Parar:

```bash
docker compose -f docker-compose.local.yml down
```

Parar y borrar datos de PostgreSQL local:

```bash
docker compose -f docker-compose.local.yml down -v
```

## Problemas comunes

1. `Run IA` no usa Codex real y cae en fallback.
- Verifica `CODEX_CLI_ENABLED=true` en `.env`.
- Verifica login en host: `codex login status`.
- Reinicia contenedor: `docker compose -f docker-compose.local.yml up -d --build`.

2. No arranca por puerto ocupado.
- Cambia mapping en `docker-compose.local.yml` (por ejemplo `"3001:3000"`).

3. Error de conexión a base de datos.
- Revisa estado de `candidate-reviewer-db`.
- Si hay esquema corrupto de pruebas previas, recrea con `down -v` y vuelve a levantar.

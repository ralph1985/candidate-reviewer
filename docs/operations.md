# Operación y despliegue

## Variables de entorno

Archivo base: `.env.example`

Variables clave:

- `PORT`
- `DATABASE_URL`
- `CODEX_CLI_ENABLED`
- `CODEX_CLI_BIN`
- `CODEX_CLI_ARGS`
- `CODEX_CLI_TIMEOUT_MS`
- `REVIEW_WORKSPACES_ROOT`
- `REVIEW_WORKSPACE_CLEANUP_AFTER_RUN`
- `REVIEW_TEST_TIMEOUT_MS`

## Levantar servicio

```bash
cd /home/monis/apps/candidate-reviewer
docker compose up -d --build
```

Instalación local rápida (incluye PostgreSQL):

```bash
cd /home/monis/apps/candidate-reviewer
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

## Ver estado

```bash
docker ps | rg candidate-reviewer
curl http://localhost:3000/health
```

## Rutas UI

- Local directo:
  - `http://localhost:3000/`
  - `http://localhost:3000/reviews/new`
  - `http://localhost:3000/reviews`
  - `http://localhost:3000/reviews/detail?id=<id>`
  - `http://localhost:3000/skills`
  - `http://localhost:3000/challenges`
- Detrás de proxy con prefijo `/cr`:
  - `https://<host>/cr/`
  - `https://<host>/cr/reviews/new`
  - `https://<host>/cr/reviews`
  - `https://<host>/cr/reviews/detail?id=<id>`
  - `https://<host>/cr/skills`
  - `https://<host>/cr/challenges`

## Migraciones SQL

Esquema base:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/init.sql
```

Fases (si necesitas aplicar de forma incremental):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_review_phases.sql
```

Skills y fases dinámicas (incremental):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_review_skills.sql
```

Skill de cumplimiento del enunciado:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_challenge_requirements_skill.sql
```

Reordenar skills por defecto para ejecutar `security` antes de `tests`:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/reorder_security_before_tests.sql
```

Campos extra para importación histórica (evaluador, deploy, fecha revisión, preguntas, source):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_historical_import_fields.sql
```

Campos de intake en flujo UI (conclusiones, otras preguntas, buenas prácticas, patrones/arquitectura):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_review_intake_fields.sql
```

Estado `cancelled` para revisiones detenidas por usuario:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_cancelled_review_status.sql
```

Tabla de enunciados oficiales:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_challenge_definitions.sql
```

URL pública de cada challenge (enlace para revisar exactamente la prueba enviada al candidato):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_challenge_public_url.sql
```

Skills base adicionales (fases de revisión completas usadas en evaluaciones reales, incluyendo bloques como `readme`, `funcionamiento`, `codigo`, `modelado_datos`, `testing`, `css`, `accesibilidad`, `ci_cd`, `pwa`, `analisis_estatico`, `git`):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/add_base_phase_skills_from_abel.sql
```

Eliminar legado de enunciado 404 (si existía de una versión anterior):

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/remove_404_challenge.sql
```

Sincronización de enunciados (se ejecuta también al arrancar backend):

```bash
curl -X POST http://localhost:3000/api/challenges/sync
```

## Datos ficticios

Las revisiones de demo se marcan con prefijo `[FAKE]` en `candidate_name`.

Borrado masivo de demos:

```bash
docker exec -i postgres-shared psql -U postgres -d candidate_reviewer < db/delete_fake_reviews.sql
```

## Runbook de incidencias

1. La revisión queda en `running` mucho tiempo.
- Revisar logs del contenedor.
- Verificar conectividad a GitHub y timeout.
- Recordar que solo puede haber una revisión en `running` a la vez (lock global).

2. Las fases salen con `engine=heuristic-fallback`.
- Comprobar que `codex` existe en contenedor.
- Comprobar auth de Codex CLI dentro del contenedor.
- Revisar `details.codexError` en `review_phase_results`.
- Si `codexError` indica JSON no parseable y cada fase tarda ~15s, subir `CODEX_CLI_TIMEOUT_MS` (recomendado `180000`).

3. No se ejecutan tests.
- Revisar fase `tests` en `review_phase_results.details.execution`.
- Verificar que el repo tiene `package.json` con script `test`.
- Revisar bloqueos de preflight en `details.securityPreflight.blockedReasons`.
- En imágenes Alpine, ejecutar comandos con `sh` (no `bash`) para evitar `spawn bash ENOENT`.

4. Error al cargar revisiones desde `/cr/`.
- Verificar que frontend usa base path `/cr`.
- Verificar carga de CSS en `GET /cr/_astro/*.css`.
- Probar `GET /cr/api/reviews` desde proxy.

## Comandos de diagnóstico

```bash
docker logs --tail 200 candidate-reviewer
curl -H 'Host: <host>' http://127.0.0.1:8080/cr/api/reviews
```

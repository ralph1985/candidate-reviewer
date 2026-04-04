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

## Levantar servicio

```bash
cd /home/monis/apps/candidate-reviewer
docker compose up -d --build
```

## Ver estado

```bash
docker ps | rg candidate-reviewer
curl http://localhost:3000/health
```

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

2. Las fases salen con `engine=heuristic-fallback`.
- Comprobar que `codex` existe en contenedor.
- Comprobar auth de Codex CLI dentro del contenedor.
- Revisar `details.codexError` en `review_phase_results`.

3. Error al cargar revisiones desde `/cr/`.
- Verificar que frontend usa base path `/cr`.
- Probar `GET /cr/api/reviews` desde proxy.

## Comandos de diagnóstico

```bash
docker logs --tail 200 candidate-reviewer
curl -H 'Host: <host>' http://127.0.0.1:8080/cr/api/reviews
```

# API

Base URL:

- local: `http://localhost:3000`
- proxy: `https://<host>/cr`

## Health

`GET /health`

Respuesta:

```json
{ "ok": true }
```

## Revisiones

### Listar revisiones

`GET /api/reviews`

### Obtener revisión

`GET /api/reviews/:id`

### Crear revisión

`POST /api/reviews`

Body:

```json
{
  "candidateName": "Nombre Apellido",
  "githubUrl": "https://github.com/org/repo"
}
```

### Actualizar revisión

`PATCH /api/reviews/:id`

Body (campos opcionales):

```json
{
  "status": "pending|running|done|failed",
  "recommendation": "pendiente|apto|no_apto",
  "scores": { "arquitectura": 8, "tests": 7 },
  "finalReport": "texto"
}
```

### Ejecutar revisión automática

`POST /api/reviews/:id/run`

- Devuelve `202` cuando lanza ejecución en background.

## Fases

### Listar fases de una revisión

`GET /api/reviews/:id/phases`

Respuesta (ejemplo):

```json
[
  {
    "review_id": 12,
    "phase_key": "architecture",
    "status": "done",
    "score": 7,
    "summary": "...",
    "details": { "engine": "codex-cli" },
    "raw_output": "...",
    "started_at": "...",
    "finished_at": "..."
  }
]
```

## Skills

### Listar skills

`GET /api/skills`

### Crear skill

`POST /api/skills`

Body:

```json
{
  "key": "architecture",
  "name": "Arquitectura",
  "description": "Opcional",
  "promptTemplate": "Prompt que se enviará a Codex",
  "active": true,
  "sortOrder": 10
}
```

### Actualizar skill

`PATCH /api/skills/:id`

Body (todo opcional):

```json
{
  "name": "Arquitectura y diseño",
  "promptTemplate": "Nuevo prompt",
  "active": true,
  "sortOrder": 15
}
```

## Códigos de error comunes

- `400`: parámetros inválidos.
- `404`: revisión no encontrada.
- `409`: revisión ya en ejecución.
- `500`: error interno.

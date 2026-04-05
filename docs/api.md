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

## Runtime config

`GET /api/runtime-config`

Respuesta (ejemplo):

```json
{ "codexCliTimeoutMs": 420000 }
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
  "githubUrl": "https://github.com/org/repo",
  "deployUrl": "https://app.example.com",
  "exerciseName": "Memoria",
  "reviewerName": "Evaluador",
  "reviewerEmail": "eval@empresa.com",
  "intakeConclusions": "Texto inicial de conclusiones",
  "predefinedQuestions": ["Pregunta 1", "Pregunta 2"],
  "intakeOtherQuestions": "Preguntas adicionales",
  "intakeGoodPractices": "Notas de buenas prácticas",
  "intakeDesignPatterns": "Notas de patrones y arquitectura"
}
```

Notas:

- Esta creación manual usa campos mínimos.
- Para carga histórica completa (evaluador, deploy, ejercicio, fases, preguntas), usar el endpoint de importación.

### Actualizar revisión

`PATCH /api/reviews/:id`

Body (campos opcionales):

```json
{
  "candidateName": "Nuevo nombre",
  "githubUrl": "https://github.com/org/repo",
  "deployUrl": "https://app.example.com",
  "exerciseName": "Memoria",
  "reviewerName": "Evaluador",
  "reviewerEmail": "eval@empresa.com",
  "intakeConclusions": "Conclusiones",
  "predefinedQuestions": ["Pregunta 1"],
  "intakeOtherQuestions": "Preguntas extra",
  "intakeGoodPractices": "Buenas prácticas",
  "intakeDesignPatterns": "Patrones/arquitectura",
  "status": "pending|running|done|failed|cancelled",
  "recommendation": "pendiente|apto|no_apto",
  "scores": { "arquitectura": 8, "tests": 7 },
  "finalReport": "texto"
}
```

### Ejecutar revisión automática

`POST /api/reviews/:id/run`

- Devuelve `202` cuando lanza ejecución en background.
- Devuelve `409` si ya existe otra revisión en `running`.

### Parar revisión automática

`POST /api/reviews/:id/stop`

- Devuelve `202` cuando consigue abortar la ejecución en curso.
- Si la revisión no está en `running`, devuelve `409`.

## Importación histórica

### Importar revisión histórica desde JSON normalizado

`POST /api/imports/historical-review`

Body (resumen):

```json
{
  "metadata": { "evaluador": "Nombre", "email": "mail@dominio.com", "fecha": "2025-08-08 13:03" },
  "candidato": {
    "nombre": "Nombre Candidato",
    "repositorio": "https://github.com/org/repo",
    "deploy": "https://app.example.com",
    "ejercicio": "Memoria"
  },
  "evaluacion": {
    "readme": { "puntuacion": 1, "comentarios": ["..."] },
    "testing": { "puntuacion": 3, "comentarios": ["..."] }
  },
  "conclusion": { "entrevista": true, "comentarios": ["..."] },
  "preguntas_predefinidas": ["..."]
}
```

Reglas:

- Obligatorios: `candidato.nombre`, `candidato.repositorio`.
- `conclusion.entrevista=true` mapea a `recommendation=apto`.
- `conclusion.entrevista=false` mapea a `recommendation=no_apto`.
- Cada bloque de `evaluacion` se guarda como fila en `review_phase_results` (`phase_key` normalizada).

Respuesta:

- `201` con objeto `{ review, phases }`.

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

## Enunciados (Challenges)

### Listar enunciados sincronizados

`GET /api/challenges`

Incluye campos como `public_url` para enlazar al enunciado público enviado al candidato.

### Resincronizar enunciados desde `challenges/pages`

`POST /api/challenges/sync`

Respuesta:

```json
{
  "upserted": 5,
  "skipped": []
}
```

## Códigos de error comunes

- `400`: parámetros inválidos.
- `404`: revisión no encontrada.
- `409`: revisión ya en ejecución.
- `500`: error interno.

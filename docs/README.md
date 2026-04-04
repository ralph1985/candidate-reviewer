# Documentación de candidate-reviewer

Este directorio centraliza la documentación funcional y técnica del proyecto.

## Índice

1. [Arquitectura](./architecture.md)
2. [API](./api.md)
3. [Operación y despliegue](./operations.md)
4. [Plan de revisión por fases con Codex](./codex-phased-review-plan.md)

## Resumen funcional

La aplicación permite:

- Crear revisiones de candidatos con URL de repositorio GitHub.
- Lanzar una revisión automática.
- Guardar puntuación global e informe final.
- Guardar trazabilidad por fases con estado y score por bloque.

## Modelo de datos (alto nivel)

- `reviews`: entidad principal de revisión.
- `review_phase_results`: resultados detallados por fase para cada revisión.

## Estado de motor de evaluación

- Modo actual: integración base con Codex CLI y fallback heurístico.
- Para producción: completar autenticación de Codex CLI en contenedor y endurecer parseo/reintentos.

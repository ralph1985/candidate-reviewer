# Documentación de candidate-reviewer

Este directorio centraliza la documentación funcional y técnica del proyecto.

## Índice

1. [Arquitectura](./architecture.md)
2. [API](./api.md)
3. [Operación y despliegue](./operations.md)
4. [Instalación local en PC](./local-install.md)
5. [Plan de revisión por fases con Codex](./codex-phased-review-plan.md)

## Resumen funcional

La aplicación permite:

- Crear revisiones de candidatos con URL de repositorio GitHub.
- Lanzar una revisión automática (bloqueo global: una ejecución simultánea).
- Parar una revisión en curso.
- Guardar puntuación global e informe final.
- Guardar trazabilidad por fases con estado y score por bloque.
- Gestionar skills/prompt de revisión.
- Consultar enunciados oficiales cargados y su URL pública asociada.

## Modelo de datos (alto nivel)

- `reviews`: entidad principal de revisión.
- `review_phase_results`: resultados detallados por fase para cada revisión.

## Estado de motor de evaluación

- Modo actual: integración base con Codex CLI y fallback heurístico.
- Para producción: completar autenticación de Codex CLI en contenedor y endurecer parseo/reintentos.

INSERT INTO review_skills (key, name, description, prompt_template, active, sort_order)
VALUES
  (
    'readme',
    'Instrucciones y README',
    'Valida la calidad de README e instrucciones de ejecución.',
    'Evalúa README e instrucciones de puesta en marcha. Comprueba claridad, completitud, pasos reproducibles, prerequisitos y posibles contradicciones. Devuelve fortalezas, riesgos y recomendaciones accionables.',
    TRUE,
    50
  ),
  (
    'funcionamiento',
    'Funcionamiento de la App',
    'Valida el comportamiento funcional de la aplicación según el enunciado.',
    'Valida el funcionamiento de la aplicación frente al enunciado oficial. Identifica OKs, KOs, casos límite y regresiones visibles, con evidencia concreta (ficheros, rutas, comportamiento esperado vs real).',
    TRUE,
    60
  ),
  (
    'codigo',
    'Desarrollo y organización de código',
    'Revisión de organización del código, modularidad y mantenibilidad.',
    'Revisa estructura del código, modularidad, separación de responsabilidades, naming, complejidad y deuda técnica. Prioriza impacto en mantenibilidad y facilidad de evolución.',
    TRUE,
    70
  ),
  (
    'modelado_datos',
    'Modelado de datos y persistencia',
    'Revisión de modelado de estado/datos y mecanismos de persistencia.',
    'Evalúa modelado de datos, flujo de estado y persistencia. Señala acoplamientos, inconsistencias, riesgos de corrupción y oportunidades de simplificación.',
    TRUE,
    80
  ),
  (
    'testing',
    'Testing',
    'Revisión de estrategia de testing y calidad de pruebas.',
    'Evalúa la estrategia de testing (unitario, integración, e2e), cobertura relevante, fiabilidad y mantenibilidad de tests. Señala huecos críticos y pruebas faltantes.',
    TRUE,
    90
  ),
  (
    'css',
    'CSS y estilos de la App',
    'Revisión de estilos, consistencia visual y robustez responsive.',
    'Evalúa estilos y sistema visual: consistencia, mantenibilidad del CSS/SCSS, responsividad, uso de componentes visuales y posibles problemas de regresión UI.',
    TRUE,
    100
  ),
  (
    'accesibilidad',
    'Accesibilidad',
    'Revisión de accesibilidad técnica y semántica.',
    'Evalúa accesibilidad: semántica HTML, navegación por teclado, estados de foco, ARIA, contraste y feedback para lectores de pantalla.',
    TRUE,
    110
  ),
  (
    'ci_cd',
    'Construcción, Integración Continua y Despliegue',
    'Revisión de calidad de pipelines de build, CI y despliegue.',
    'Evalúa build, CI/CD y estrategia de despliegue. Valida reproducibilidad, controles de calidad, seguridad de pipeline y trazabilidad del release.',
    TRUE,
    120
  ),
  (
    'pwa',
    'Progressive Web App',
    'Revisión de capacidades PWA y soporte offline.',
    'Evalúa capacidades PWA: service worker, manifest, estrategia offline, caching y experiencia en reintentos sin red.',
    TRUE,
    130
  ),
  (
    'analisis_estatico',
    'Análisis estático y formateo automático de código',
    'Revisión de linting, formateo y herramientas de calidad estática.',
    'Evalúa análisis estático y formato automático: ESLint, Prettier, reglas relevantes, consistencia y su integración en CI.',
    TRUE,
    140
  ),
  (
    'git',
    'Git y Workflow de trabajo',
    'Revisión de historial de commits y flujo de trabajo Git.',
    'Evalúa prácticas Git: granularidad de commits, convenciones de mensajes, ramas, trazabilidad y señales de workflow profesional.',
    TRUE,
    150
  )
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  prompt_template = EXCLUDED.prompt_template,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order;

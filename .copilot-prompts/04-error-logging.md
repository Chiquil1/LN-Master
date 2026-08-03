Prompt: Manejo de Errores y Logging

Como especialista en manejo de errores móviles:

1. Añade try-catch donde falte y un sistema de logging central.
2. Evita `console.log` en producción; usa wrapper `logger`.
3. Manejo de errores de red, retry y traducción de mensajes.
4. Integra `reportError()` y `logger` en puntos críticos.

Archivos prioritarios: `src/services/plugin/fetch.ts`, `src/utils/error.ts`, `App.tsx`.
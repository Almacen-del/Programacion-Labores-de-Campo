# Arles Control Web

Carpeta independiente creada el 28 de agosto de 2026 por solicitud del usuario.

## Alcance actual

WEB 1: prueba de viabilidad de Cloudflare Pages Free y Supabase Free para un
solo usuario. No es todavía la migración completa ni un sitio publicado.

El proyecto hermano `Análisis de datos Arles SAS` se utiliza solo como fuente
de referencia. No se modifica su código, SQLite ni credenciales de escritorio.
Los datos privados de prueba y el respaldo de código se guardan en `.private/`,
excluidos de Git. No se copian claves OAuth, tokens ni bases con credenciales.

El maestro de labores de Drive se mantiene en solo lectura. No se hacen
públicos sus archivos ni se activan planes de pago.

## Documentación

- `docs/PLAN_MIGRACION_WEB.md`: copia del plan; autorizado iniciar únicamente WEB 1.
- `docs/WEB_1_ESTADO.md`: evidencia y pendientes de la etapa.

## Pruebas locales

Las mediciones locales orientan la prueba; no certifican por sí solas los
límites ni la ejecución de funciones alojadas en Supabase.

Con Node.js y npm instalados:

```powershell
npm ci --ignore-scripts
npm test
npm run benchmark
npm run verify:desktop
```

El benchmark usa la copia privada ya descargada; esto es una herramienta de
desarrollo, no un flujo de importación manual para la futura aplicación.
El respaldo de referencia debe existir en `.private/desktop-baseline`.
`snapshot-desktop.mjs` permite crearlo una sola vez en un entorno nuevo y se
niega a sobrescribir uno existente. No ejecutar el respaldo de nuevo aquí.

No hay interfaz web, servidor desplegado ni sincronización automática activa
todavía. Ver el informe de estado antes de continuar con los servicios externos.

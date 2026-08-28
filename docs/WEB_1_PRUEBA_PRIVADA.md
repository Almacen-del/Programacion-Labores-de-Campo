# WEB 1 — Prueba privada del lector

Estado: desplegado y probado el 28 de agosto de 2026 con autorización expresa
del usuario. Doce pruebas Node aprobadas; rechazos de seguridad y lectura del
maestro comprobados en Supabase Edge. WEB 1 completa sigue pendiente.

## Propósito

Medir el lector en Supabase sobre la misma copia del maestro ya analizada.
No es una pantalla de importación manual ni sustituye la futura sincronización
automática desde Drive. Es una herramienta temporal de ingeniería de WEB 1.

Destino: proyecto `dziwhbjyvxdbplthpazt`, función
[`web1-probe`](https://supabase.com/dashboard/project/dziwhbjyvxdbplthpazt/functions/web1-probe).
No se creó otro proyecto ni se tocó el escritorio.

## Resultado verificado

| Prueba alojada | Resultado |
|---|---|
| Sin credencial | 401 UNAUTHORIZED |
| Credencial incorrecta | 401 UNAUTHORIZED |
| Credencial correcta, archivo no autorizado | 422 UNAPPROVED_WORKBOOK |
| Credencial correcta, copia aprobada del maestro | 200 |
| Comparación del resultado completo con escritorio | SHA-256 idéntico |

El maestro respondió con 6.269 registros: 5.943 válidos, 148 observados,
178 bloqueados y 529 alertas. JSON interno: 3.930.146 bytes. No se devolvieron
sus filas ni se guardaron en tablas o buckets.
La solicitud real tardó 2.274 ms incluyendo transporte; el análisis dentro
de la función reportó 348 ms. Ninguno de esos tiempos se presenta como CPU.

El registro de cierre del servidor, filtrado por el identificador exacto de
esa solicitud, reportó **388 ms de CPU** y **13.222.544 bytes de memoria al
cierre** (aproximadamente 12,61 MiB). Este último valor NO es el pico de
memoria durante el análisis. Runtime observado: Supabase Edge 1.74.3,
compatible con Deno 2.1.4, región de ejecución `us-east-1`.
La [documentación del evento de cierre](https://supabase.com/docs/guides/troubleshooting/edge-function-shutdown-reasons-explained)
confirma la unidad de CPU y el alcance de la medida de memoria.

El lector funcionó en esta prueba con el archivo actual y sin superar el
límite de CPU de la solicitud. Esto no certifica todavía el sistema completo:
faltan descarga Drive integrada al lector, persistencia del maestro,
crecimiento de datos, pico de memoria, retención y dos ciclos programados.
OAuth y renovación se verificaron posteriormente en una función separada;
véase [resultado OAuth](WEB_1_OAUTH.md).

Evidencias locales, excluidas de Git:

- `.private/evidence/hosted-security-1787921603133.json`: tres rechazos correctos.
- `.private/evidence/hosted-real-1787921615643.json`: puertas de seguridad repetidas
  y ejecución real con comparación de hash y resumen.
- `.private/evidence/hosted-metrics-2026-08-28.json`: CPU y memoria al cierre
  obtenidas del registro correspondiente a la solicitud del maestro.
- Solicitud del maestro: `01a0486e-c7cd-7454-adff-a64a0cf61507`.
- Función: `fba4766b-7222-43e0-841a-1bf05bb2ae52`, versión de despliegue 1.
- Bundle local de 12.253 bytes; SHA-256:
  `157a8e9f93abc70e10fe53298fab40d7a52f8cf5df96c6ff2e8cd8c6422c37ee`.

Una consulta de seguridad previa a finalizar el despliegue devolvió 404 y
detuvo el script sin enviar el maestro. Después de confirmar la publicación,
las comprobaciones se repitieron correctamente. La evidencia de ese intento
inicial se conserva para trazabilidad, no se cuenta como prueba aprobada.

## Protección antes de datos reales

- Credencial dedicada `WEB1_PROBE_SECRET`, aleatoria con al menos 256 bits de
  entropía al generarla; solo servidor y ejecutor de la prueba. Nunca Git,
  frontend, logs, query string o instrucciones con el valor literal.
- `WEB1_EXPECTED_XLSX_SHA256` restringe la prueba a la copia concreta aprobada.
  Una versión distinta se rechaza antes del parser.
- El handler falla cerrado si falta la configuración; valida la credencial
  antes de leer el cuerpo; solo permite POST binario; limita bytes declarados
  y reales a 25 MiB. El hash previo evita procesar un archivo arbitrario.
- Devuelve conteos, hashes y duración; nunca devuelve registros, colaboradores,
  observaciones ni errores internos del parser. Respuestas no almacenables.
- No contiene acceso a tablas, claves de administración, Drive ni OAuth.
- `verify_jwt = false` es intencional para esta credencial exclusiva, que el
  handler valida. No se permite quitar la validación del handler ni usar una
  clave pública como sustituto. Referencia: [autenticación de funciones](https://supabase.com/docs/guides/functions/auth).
- Rechaza solapamientos dentro del mismo isolate; esto no es el bloqueo
  distribuido definitivo de la sincronización de WEB 3.

## Procedimiento aplicado y pendientes

1. Completado: autorización de la modificación concreta y creación únicamente de
   `web1-probe` y configurar sus dos valores de servidor en el proyecto indicado.
   No usar claves del escritorio ni publicar datos en Vercel.
2. Completado: compatibilidad de importaciones y ejecución en el runtime Edge.
3. Completado: con la función protegida, comprobar solicitud sin credencial y con credencial
   incorrecta: deben devolver 401; archivo distinto: 422. No enviar datos reales
   hasta que esos rechazos estén comprobados en el servidor.
4. Completado: ejecución de la copia ya descargada de 1.918.842 bytes y SHA-256
   `19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f`.
5. Completado: comparación de `snapshotHash` con
   `a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205`,
   6.269 registros y 529 alertas, además del resto del resumen local.
6. Completado: CPU y memoria al cierre desde la observabilidad del servidor.
   Pico de memoria pendiente. `parseWallMs`
   mide solo duración de análisis; NO es CPU. El endpoint declara
   `cpuMeasured: false` para no confundir medidas.
7. Resultado documentado. OAuth web y renovación ya se verificaron por
   separado; almacenamiento del maestro y dos ejecuciones programadas con
   navegador cerrado siguen pendientes para completar WEB 1.

Para esta prueba del lector se configuraron exclusivamente `WEB1_PROBE_SECRET` y
`WEB1_EXPECTED_XLSX_SHA256`. La copia de la credencial en este equipo está en
`.private/probe-credentials/`, excluida de Git, con permisos Windows limitados
al usuario local. No se imprimió su valor ni se reutilizaron claves del
escritorio, de administración de Supabase o de Google.

Comandos reproducibles para el equipo que conserva la copia y credencial:

```powershell
node scripts/build-edge-probe.mjs
node scripts/verify-hosted-probe.mjs
node scripts/verify-hosted-probe.mjs --real
```

El último comando solo envía la copia real después de comprobar los rechazos
y su hash local. No ejecutar `prepare-probe-secret.mjs` de nuevo: se niega a
sobrescribir la credencial ya creada. La función es una prueba privada, no
un servicio completo de sincronización. OAuth web y renovación ya están
verificados por separado. No hay todavía cron, login de las cuentas de la
aplicación ni interfaz.

# WEB 1 — Prueba privada del lector

Estado: código local preparado; 12 pruebas Node aprobadas (5 del lector y
7 del endpoint). No desplegado, no ejecutado en Deno/Edge, sin secretos reales.

## Propósito

Medir el lector en Supabase sobre la misma copia del maestro ya analizada.
No es una pantalla de importación manual ni sustituye la futura sincronización
automática desde Drive. Es una herramienta temporal de ingeniería de WEB 1.

Destino autorizado para preparar: proyecto `dziwhbjyvxdbplthpazt`, función
propuesta `web1-probe`. No crear otro proyecto ni tocar el escritorio.

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

## Secuencia pendiente de ejecución remota

1. Confirmar la modificación concreta antes de desplegar: crear únicamente
   `web1-probe` y configurar sus dos valores de servidor en el proyecto indicado.
   No usar claves del escritorio ni publicar datos en Vercel.
2. Verificar compatibilidad de importaciones y ejecución en el runtime Edge.
3. Con la función protegida, comprobar solicitud sin credencial y con credencial
   incorrecta: deben devolver 401; archivo distinto: 422. No enviar datos reales
   hasta que esos rechazos estén comprobados en el servidor.
4. Ejecutar la copia ya descargada de 1.918.842 bytes y SHA-256
   `19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f`.
5. Comparar `snapshotHash` con
   `a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205`,
   6.269 registros y 529 alertas, además del resto del resumen local.
6. Obtener CPU y memoria desde la observabilidad del servidor. `parseWallMs`
   mide solo duración de análisis; NO es CPU. El endpoint declara
   `cpuMeasured: false` para no confundir medidas.
7. Documentar el resultado. OAuth web, renovación, almacenamiento y dos
   ejecuciones programadas con navegador cerrado siguen siendo requisitos
   aparte para completar WEB 1.

No se ha enviado la copia a Supabase ni se han generado credenciales reales.
Las pruebas locales no certifican el runtime, las cuotas ni la privacidad de
un despliegue todavía inexistente.

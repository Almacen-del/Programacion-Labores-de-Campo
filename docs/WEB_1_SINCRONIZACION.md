# WEB 1 — Sincronización del maestro en Supabase

Evidencia histórica de WEB 1. La interfaz autorizada posteriormente se documenta
en [WEB_2_ESTADO.md](WEB_2_ESTADO.md).

Fecha: 28 de agosto de 2026. Activada por autorización del usuario.
Estado: sincronización activa cada cinco minutos; primera carga y tres ciclos
automáticos correctos, incluidos dos con las páginas de configuración cerradas.
No se inició WEB 2 ni se construyó interfaz en este bloque.

## Funcionamiento

1. Supabase Cron ejecuta `arles-master-sync-5min` cada cinco minutos.
2. Una función privada de base de datos consulta la credencial de Vault y
   llama a `master-sync/run`. La credencial no aparece en el comando cron.
3. El sincronizador toma un bloqueo temporal de base de datos, recupera el
   token OAuth cifrado y renueva el acceso a Google en servidor.
4. Consulta ID, versión, modificación, tamaño y MD5 del archivo maestro.
   Si coinciden con lo ya guardado, registra `UNCHANGED`: no descarga Excel
   ni ejecuta el lector.
5. Si cambió, descarga exclusivamente el maestro autorizado, limita a 25 MiB,
   verifica tamaño/MD5 y vuelve a consultar metadatos para detectar cambios
   durante la descarga.
6. Analiza las tres hojas aprobadas. Si falta una hoja reconocible, el archivo
   está vacío, no tiene ninguna fila válida o falla el lector, conserva la
   versión actual y registra un error. Las filas observadas/bloqueadas de una
   importación admitida se conservan, con sus alertas y datos de origen.
7. Guarda el resultado completo como versión privada. El servidor calcula
   nuevamente su SHA-256 antes de confirmar la transacción. Versión y puntero
   vigente se actualizan de forma atómica; no hay borrado previo de datos.

El maestro no se modifica. No se convierten sus formatos, no se cambian
permisos y no se publica información operativa. Esta es una lectura automática,
no una función de importación manual para el usuario final.

## Primera sincronización real

- Inicio de servidor: 2026-08-28T13:47:54.551059Z (08:47 en Colombia).
- Final: 2026-08-28T13:47:58.966329Z; aproximadamente 4,42 s entre esos eventos.
- Resultado `UPDATED`, HTTP 200; run ID `cab842f1-5bd7-449e-8f6a-800de74a9398`.
- Descarga autenticada: 1.918.842 bytes; Drive versión `12195`.
- Lectura del Excel: 505 ms de reloj, no CPU.
- Dos consultas de metadatos, antes y después de descargar.
- Resultado: 6.269 registros; 5.943 válidos, 148 observados, 178 bloqueados
  y 529 alertas. Las alertas no equivalen al número de filas.
- JSON completo: 3.930.146 bytes.
- SHA-256 del archivo:
  `19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f`.
- SHA-256 del JSON completo:
  `a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205`.
  Coincide exactamente con la referencia previamente validada del escritorio;
  no se compararon solo los totales.

Métricas posteriores de Supabase, filtradas por la solicitud exacta:

| Operación | Request ID del proveedor | CPU | Memoria al cierre |
|---|---|---:|---:|
| Carga completa | `01a048a0-815e-7a02-8185-c4c0488591d0` | 689 ms | 15.118.624 bytes |
| Sondeo 13:55 UTC | `01a048a7-0463-7b50-9f4c-92f3cf3f4ac9` | 126 ms | 13.970.648 bytes |
| Sondeo 14:00 UTC | `01a048ab-975f-73cd-b035-0b8bbd94bfb3` | 126 ms | 13.970.600 bytes |

La carga completa registró 5.870 ms en `execution_time_ms` del proveedor,
incluyendo más fases que los 4,42 s entre inicio y fin de base de datos. Su
CPU estuvo por debajo del límite de 2.000 ms por solicitud. La memoria al
cierre fue aproximadamente 14,42 MiB: **no es pico de memoria**. El cierre
del isolate ocurre después de responder y su timestamp no mide la duración
de la solicitud. Las métricas anteriores de 388 ms correspondían a otra
función (`web1-probe`), no a esta sincronización completa.

Evidencias privadas: `master-sync-invocations-2026-08-28.txt` y
`master-sync-cpu-2026-08-28.txt`, dentro de `.private/evidence/`.
Función `72e78e9d-56ec-489e-8d47-f9dedcf4be6a`; la carga corrió en
`us-east-1` y los dos sondeos en `us-west-2`.

## Programación y evidencia

El trabajo de Supabase se activó a las 13:48:39 UTC (08:48 en Colombia),
job ID `1`. El primer ciclo en 13:50 UTC terminó `UNCHANGED`, HTTP 200, con
0 bytes descargados y 0 ejecuciones del lector. Se mantuvo una sola versión.

Las páginas de configuración quedaron cerradas a las
2026-08-28T13:50:41.981Z; la única pestaña controlada restante era `about:blank`.
La comprobación de los ciclos posteriores se hace mediante consultas de estado:
el observador local **nunca llama `/run`** ni implementa la sincronización.
Para aprobar exige coincidencia de tres evidencias del servidor: ejecución
de Cron, solicitud `pg_net` HTTP 200 y ejecución del sincronizador terminada
con el mismo identificador de despacho, posterior al cierre de las páginas.

Comprobación aprobada a las 14:00:06.256 UTC (09:00 en Colombia):

| Ciclo UTC | Ejecución del sincronizador | Resultado | HTTP |
|---|---|---|---:|
| 13:55 | `1dee728e-1992-42b1-ac34-4514c48a35a2` | UNCHANGED | 200 |
| 14:00 | `8f970381-397e-4543-9220-615f0b6fafa9` | UNCHANGED | 200 |

Ambos consultaron metadatos una vez, descargaron 0 bytes y conservaron el
mismo hash, sin errores ni versiones duplicadas. Cron confirmó `succeeded`
y pg_net confirmó respuesta sin timeout para ambos despachos. Al terminar,
la única pestaña controlada seguía siendo `about:blank`; posteriormente se
reabrió el panel para consultar métricas. El proceso local de observación terminó.

Evidencia privada: `.private/evidence/master-sync-scheduled-validation-1787925606257.json`.
Esto demuestra ejecución independiente de la página, no todavía detección de
una edición nueva real: el maestro no cambió durante estos ciclos. Los casos
de cambios y errores se cubrieron localmente; la aceptación de una nueva
edición operativa queda para la validación funcional, sin alterar el maestro
con datos de prueba.

## Seguridad y recuperación

- `MASTER_SYNC_SECRET`: nuevo secreto exclusivo de invocación, 256 bits,
  guardado en secretos Edge y copiado a Vault por un RPC de servidor; no se
  pegó su valor en consultas SQL ni en el historial de cron.
- `/run` admite esa credencial; `/status` y `/schedule` exigen la credencial
  administrativa ya existente. No aceptan el token de un usuario de la web.
- Cuatro rechazos remotos 401 comprobados: ejecución sin secreto, secreto
  erróneo, uso de la credencial de cron para consultar estado y para configurar
  la programación.
- Esquema `arles_sync_private`, cuatro tablas con RLS, sin acceso de `anon`
  ni `authenticated`. Sus cuatro RPC son exclusivos de `service_role`.
  Auditoría SQL: 4 tablas con RLS, 0 RPC expuestos; ambos roles sin lectura de
  `vault.decrypted_secrets`; la conexión OAuth previa se conserva.
- Bloqueo global de 180 segundos. Un proceso interrumpido no publica datos
  parciales; la siguiente ejecución registra el vencimiento y puede reintentar.
- Reintento en el siguiente ciclo, sin bucles agresivos ni borrado de datos.
- Los errores se guardan mediante códigos limitados, sin contenido del Excel,
  tokens ni respuestas completas de Google en los registros de la aplicación.
- Todavía no hay avisos visuales ni correos de error: el estado es consultable
  por el endpoint administrativo; su presentación pertenece a etapas futuras.

Migración aplicada manualmente desde SQL Editor:
`supabase/migrations/20260828140000_web1_master_sync.sql`.
Habilitó `pg_cron` 1.6.4 y `pg_net` 0.20.4; Vault 0.3.1 ya estaba instalado.
No repetir la migración: conciliar el historial manual antes de utilizar
Supabase CLI para nuevas migraciones.

## Almacenamiento y límites conservadores

Medidas SQL de la prueba inicial, no estimaciones de tamaño del archivo:

| Medida | Bytes |
|---|---:|
| Base completa antes de crear la sincronización | 10.497.171 |
| Base completa después del primer snapshot | 11.742.355 |
| Tablas, índices y TOAST del esquema de sincronización | 925.696 |
| Datos JSON lógicos de la versión | 3.930.146 |
| Base completa después de los tres ciclos automáticos | 11.848.851 |
| Esquema de sincronización después de esos ciclos | 942.080 |

Estos números miden objetos distintos: PostgreSQL comprime el contenido y
contabiliza estructuras adicionales. No equivalen al medidor completo del
plan en el panel del proveedor, que puede actualizarse con demora.

Mientras no se apruebe una política de retención, **no se eliminan versiones**.
Protecciones de este piloto:

- Máximo 10 MiB de JSON por versión.
- Máximo 100 versiones distintas o 100 MiB de JSON acumulado, lo que ocurra
  primero. Con el tamaño actual caben aproximadamente 26 versiones completas.
- No guarda otra versión si la base ya alcanza 400 MiB.
- Máximo 50.000 ejecuciones y 50.000 despachos en el historial propio; al
  alcanzar el límite se requiere intervención, no se borra el historial.

Estos son límites de seguridad del piloto, no una política de retención
definitiva. Al alcanzarlos conserva la última versión y registra `STORAGE_LIMIT`
o `LOG_LIMIT`. La operación sostenida requiere acordar archivado/retención y
contemplar también los registros propios de Cron/pg_net.

Cada cinco minutos equivale a 8.640 invocaciones en 30 días o 8.928 en 31,
antes de consultas de estado, pruebas y reintentos. Son menos de 2% de las
500.000 invocaciones mensuales del plan Free consultado. El almacenamiento
depende de cambios reales, no del número de sondeos: no se guarda un Excel
ni un JSON completo en cada ciclo sin cambios.

No se afirma una cifra de transferencia mensual sin observar el uso real.
La descarga desde Google es entrada al sincronizador; no representa por sí
sola la salida de Supabase. Faltan la interfaz, consultas, exportaciones y
frecuencia real de cambios para estimar el consumo final.

Decisión: **viabilidad técnica favorable para continuar el piloto en Free**
con el archivo actual y estos límites. No equivale a operación definitiva
aprobada, a consumo mensual medido ni a garantía de servicio gratuito continuo.

## Validación local y comandos

36 pruebas completas aprobadas: 13 OAuth, 11 sincronización, 5 lector y 7
prueba privada. Original de escritorio: 57 archivos verificados sin cambios.
Los casos negativos de cambios de estructura, archivo corrupto y errores
usan dobles de prueba locales; no se dañó ni modificó el maestro para probarlos.

```powershell
node scripts/build-master-sync.mjs
node scripts/check-master-sync.mjs gates
node scripts/check-master-sync.mjs status
```

`run` dispara una ejecución de ingeniería; `schedule` instala/verifica el
trabajo con el intervalo fijo aprobado. No hace falta ejecutarlos manualmente
para el uso normal. No volver a ejecutar `prepare-sync-secret.mjs`: se niega
a sobrescribir la credencial.

Artefacto inicial desplegado: 22.795 bytes; SHA-256
`06bafffe5288ff8d1d3bfce08e1d02a14fbf2d714249a07be50a13b0df3be8f3`.

## Pendientes antes del uso definitivo

- Resolver OAuth externo en estado Prueba y su caducidad de siete días;
  no se modificó el estado de publicación ni se promete conexión permanente.
- Consentimiento y pruebas reales con el ingeniero antes del retiro del
  administrador temporal. No se accedió a su correo.
- Retención, respaldo y recuperación del sistema completo, crecimiento real
  del maestro y supervisión de cuotas. Free puede pausarse por inactividad.
- Login privado, frontend y Gantt corresponden a las etapas siguientes.

Fuentes: [programación en Supabase](https://supabase.com/docs/guides/functions/schedule-functions),
[Vault](https://supabase.com/docs/guides/database/vault),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[descarga Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads),
[cuotas Free](https://supabase.com/pricing),
[límites de funciones](https://supabase.com/docs/guides/functions/limits),
[métricas de cierre](https://supabase.com/docs/guides/troubleshooting/edge-function-shutdown-reasons-explained),
[caducidad OAuth en Prueba](https://developers.google.com/identity/protocols/oauth2#expiration).

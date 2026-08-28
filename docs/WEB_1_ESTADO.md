# WEB 1 — Informe parcial de viabilidad

Informe histórico de WEB 1. La autorización posterior y entrega de WEB 2 están
en [WEB_2_ESTADO.md](WEB_2_ESTADO.md); los límites siguientes corresponden a este bloque.

Fecha: 28 de agosto de 2026.

Estado: preparación local, acceso a los paneles y prueba privada alojada
verificados. OAuth web y renovación real del token también verificados;
véase [resultado OAuth](WEB_1_OAUTH.md). La persistencia privada y el sondeo
cada cinco minutos ya están activos. Dos ejecuciones con páginas cerradas,
13:55 y 14:00 UTC, quedaron verificadas; véase [sincronización](WEB_1_SINCRONIZACION.md).
La viabilidad técnica del piloto es favorable. No se inicia WEB 2 ni se declara
operación definitiva: faltan consentimiento sostenido fuera del estado Prueba,
retención/respaldo y participación del ingeniero.

Actualización posterior del mismo día: el usuario reubicó el proyecto y
proporcionó Supabase y Vercel. Véase [proyectos web](PROYECTOS_WEB.md) para
los enlaces, los planes verificados y el alcance personal aclarado por el usuario.
Las cifras locales que siguen corresponden a la prueba inicial. El informe de
sincronización contiene las medidas posteriores de persistencia y programación.

## Separación y protección

- Carpeta actual: `C:\Users\Almacen\Documents\ChatGPT\Arles Control Web\Programacion Labores de Campo`.
- Original de escritorio: `C:\Users\Almacen\Documents\ChatGPT\Análisis de datos Arles SAS`.
- Respaldo de 57 archivos de código, configuración de ejemplo y documentación:
  436.652 bytes, verificados mediante SHA-256.
- Originales del manifiesto revalidados sin cambios al finalizar la prueba.
- Se excluyeron las credenciales Google, tokens, perfil SQLite, dependencias,
  builds, `.git` y archivos de datos previos. No es un respaldo de la base operativa.
- Copia de código, maestro descargado y evidencia detallada bajo `.private/`,
  excluida por `.gitignore`. No se publicaron en Git. Posteriormente se autorizó
  procesar el maestro en Supabase y guardar su resultado en tablas privadas.
- No se modificaron el maestro, sus permisos, el inventario ni el escritorio.
- No se crearon proyectos externos, planes de pago ni facturación. OAuth web
  se creó posteriormente mediante autorización expresa, según `WEB_1_OAUTH.md`.

Posteriormente se autorizó y desplegó `web1-probe` en el proyecto Supabase
aportado por el usuario. Se comprobó su protección antes de enviar la copia
del Excel: 401 sin credencial, 401 con credencial incorrecta y 422 para otro
archivo. La copia aprobada respondió 200 con hash de resultado idéntico al
escritorio. Esa copia se procesó en memoria, sin guardarla en tablas/buckets.
Los resultados y límites de la prueba se detallan en `WEB_1_PRUEBA_PRIVADA.md`.
CPU de la ejecución real: 388 ms según el evento del servidor asociado al
request ID; memoria al cierre 13.222.544 bytes, no pico de memoria.

## Fuente actual y cuenta

Maestro: `1ZJKtvkmo7fddZi4CS30vcaXXZSOTuIzz`,
`MA-F-009 PROGRAMACIÓN DE LABORES CAMPO.xlsx`.

Drive informa XLSX, 1.918.842 bytes y modificación el
2026-08-27 a las 18:25:15.865 UTC (13:25 en Colombia). Se descargó una copia
autenticada en solo lectura, sin convertir ni guardar cambios en Drive.
La copia tiene el mismo tamaño reportado; ambas variantes del lector usan
exactamente sus mismos bytes.

SHA-256 de la copia:
`19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f`.

La cuenta del conector Drive es `Almacen@arlessas.com` y tiene acceso.
La sesión inicial de Google del navegador estaba en `vivero@arlessas.com`.
Durante la revisión OAuth se accedió al panel del proyecto con
`Almacen@arlessas.com`; esto no equivale al consentimiento de Drive ni a la
autorización de entrada a la futura web. Véase [preparación OAuth](WEB_1_OAUTH.md).
Posteriormente el usuario confirmó `almacen@arlessas.com` para administración
temporal de pruebas y `dir.siembrasnuevas@arlessas.com` para el ingeniero como
usuario definitivo. Su autenticación todavía no se ha implementado ni probado.
El usuario no tiene acceso al correo del ingeniero; esa prueba real queda
pendiente de su participación. Véase `PROYECTOS_WEB.md` para el relevo seguro.
La consulta de permisos devolvió permisos de usuarios, sin `anyone` ni
dominio en la respuesta. No se cambió su uso compartido.

## Prueba reproducible local

Se copió el lector y se sustituyó la entrada por ruta local por una entrada
de bytes. Las reglas de hojas, filas, fechas, duplicados y alertas se
conservaron. Usa `read-excel-file` 9.3.10, igual que el escritorio.
Usa compatibilidad Node; compilarlo localmente no demostraba funcionamiento
en Edge. Las pruebas alojadas posteriores sí verificaron ese funcionamiento.

Resultados actuales (no los conteos históricos):

| Categoría | Resultado |
|---|---:|
| Siembras nuevas | 4.046 filas |
| Siembra de producción | 2.171 filas |
| Plateo mecanico | 52 filas |
| Total | 6.269 registros |
| Válidos | 5.943 |
| Observados | 148 |
| Bloqueados por validación | 178 |
| Alertas | 529 |

`A S` y `Hoja 1` permanecen fuera de los perfiles aprobados. Las filas
observadas o bloqueadas se conservan con su trazabilidad; no se corrigieron
ni eliminaron datos del maestro. Las 529 alertas no equivalen a 529 filas.

Se ejecutaron tres procesos independientes por lector, de forma secuencial.
En las seis ejecuciones coincidieron el hash del archivo y el hash del JSON
completo de hojas, registros y resumen; no se compararon solo los totales.

| Medida local | Escritorio (referencia) | Prototipo por bytes |
|---|---:|---:|
| Tiempo de lectura y análisis | 652–728 ms | 526–627 ms |
| CPU del proceso durante lectura y análisis | 1.421–1.812 ms | 1.266–1.484 ms |
| Pico RSS del proceso | 109,4–113,6 MiB | 118,2–119,2 MiB |
| JSON completo por versión | 3.930.146 bytes | 3.930.146 bytes |

Entorno: Windows, Node.js v24.15.0. CPU agrega tiempo de proceso y puede
exceder la duración de reloj. Las medidas de lectura/análisis no incluyen
Google OAuth, descarga de red, serialización de salida ni escritura en base.
RSS es memoria del proceso local, no memoria medida por Supabase.

Evidencia detallada local:
`.private/evidence/local-benchmark-1787918903116.json`.

Cinco pruebas automatizadas aprobadas: igualdad con referencia, trazabilidad
y duplicados, fechas/datos obligatorios, perfiles de hojas y rechazo de bytes
vacíos/excesivos/no Excel. Instalación auditada: 0 vulnerabilidades reportadas
por npm en ese momento; no representa garantía de seguridad futura.

## Costos y riesgos pendientes

[Supabase Free](https://supabase.com/pricing) publica 500 MB de base,
1 GB de archivos, 5 GB de salida y 500.000 invocaciones de funciones al mes.
La sesión posterior permitió verificar organización Free, proyecto activo y
26 MB / 500 MB de base usados; detalles en `PROYECTOS_WEB.md`.

Las [funciones alojadas](https://supabase.com/docs/guides/functions/limits)
tienen 256 MB y 2 segundos de CPU por solicitud, con 150 segundos de duración
en Free. El consumo local no equivale a CPU de servidor. La prueba privada
midió 388 ms de CPU del lector. La sincronización completa posterior midió
689 ms de CPU y 15.118.624 bytes de memoria al cierre; los dos sondeos sin
cambios midieron 126 ms de CPU cada uno. No confundir duración de reloj con
CPU ni memoria al cierre con pico de memoria.

Un sondeo cada cinco minutos son 8.640 ejecuciones en 30 días o 8.928 en 31,
antes de reintentos y otras funciones. La sincronización implementada consulta
metadatos y no reimporta cuando el archivo sigue igual.

Como escenarios aritméticos, NO política de retención aprobada:

- 30 copias del JSON actual: 117,9 MB antes de índices, estructura PostgreSQL,
  auditoría, planes, inventario y crecimiento.
- 30 copias XLSX actuales: 57,6 MB de archivos.
- Guardar un JSON completo en cada sondeo de 30 días: aproximadamente 34 GB;
  no es una estrategia admisible con la cuota indicada.
- Salida mensual: dependerá de consultas y exportaciones reales. No se puede
  deducir solo del tamaño del Excel; descargar Drive al servidor es entrada,
  no equivale por sí mismo a transferencia de salida de Supabase.

El tamaño JSON NO equivale al almacenamiento PostgreSQL. Después de tres
ciclos automáticos se midieron 942.080 bytes en el esquema de sincronización
y 11.848.851 bytes en la base completa. Retención definitiva y consumo mensual
de ancho de banda siguen pendientes.
Free puede pausarse tras inactividad y no incluye respaldos automáticos.
No se promete operación gratuita ininterrumpida.

La propuesta inicial de Cloudflare fue reemplazada por el proyecto Vercel
proporcionado por el usuario. Hobby verificado; el usuario declara uso
personal sin uso administrativo ni beneficio empresarial previsto.
Existe un despliegue inicial, pero la dirección devuelve 404: no hay todavía
una interfaz funcional. La sincronización privada ya funciona por separado.

## Orden de verificación inicial y pendientes

Los puntos 2–4 y 6–7 ya se ejecutaron; la renovación de token del punto 5 y
las medidas iniciales de almacenamiento del punto 8 también están verificadas.
Siguen pendientes el acceso final, consentimiento sostenido, retención y
consumo mensual completo. Se conserva el orden original como trazabilidad:

1. Sesiones de servicios y dos identidades de aplicación confirmadas. Pendiente
   probar el acceso temporal y, con participación del ingeniero, el definitivo.
2. Inspeccionar los proyectos proporcionados de Supabase y Vercel, titularidad,
   plan y elegibilidad gratuita. Reutilizarlos sin crear duplicados. Presentar
   la configuración concreta antes de confirmar cambios externos.
3. Crear un entorno privado mínimo, con rechazo de solicitudes no autorizadas
   probado antes de cargar datos reales. Sin frontend público con datos.
4. Preparar OAuth WEB separado del escritorio, Drive con alcance mínimo y
   archivo exacto. No reutilizar el secreto ni el cliente de escritorio.
   Distinguir login de la web del consentimiento para Drive.
5. Validar renovación del acceso y configuración sostenida. Google documenta
   [expiración de tokens en Testing](https://developers.google.com/identity/protocols/oauth2#expiration);
   no cambiar el estado de publicación sin autorización.
6. Ejecutar el parser alojado sobre la misma copia, medir consumo del servidor
   y comparar hashes/conteos con la evidencia local.
7. Probar dos ejecuciones programadas con la página cerrada y evidencias del
   servidor; no simularlas mediante un temporizador local.
8. Medir almacenamiento/salida y emitir decisión de viabilidad. Si el runtime
   falla o no cabe en Free, proponer adaptación antes de WEB 2; nunca pagar,
   ampliar permisos o convertir el maestro como salida automática.

La descarga utilizada aquí es una prueba de ingeniería. El producto seguirá
el requisito de sincronización automática desde Drive, sin importación manual
del maestro de labores por parte del usuario.

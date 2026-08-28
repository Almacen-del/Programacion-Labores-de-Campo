# WEB 3 — Sincronización confiable

28 de agosto de 2026. Autorizada por el usuario; sin cambios en maestro ni escritorio.
Se mantiene Vercel/Supabase y revisión automática de Drive cada cinco minutos.
Frontend publicado Ready: `dpl_5A25GfHSEs3A2su4AU9z8kTyFn6Y` en
https://programacion-labores-de-campo.vercel.app.
Migración confirmada con «Success. No rows returned» en Supabase.
Función `drive-oauth` actualizada; endpoint de reconexión publicado y comprobado:
401 sin sesión desde el origen permitido, 403 desde origen ajeno. RPC de estado
anónima: 401. Página publicada abre el login privado correctamente.

## Implementación

- Mensajes comprensibles para pérdida de acceso, estructura, descarga, almacenamiento
  e interrupciones. La última versión publicada sigue disponible ante errores.
- Indicador de antigüedad se recalcula incluso si falla la consulta del servidor.
- Panel de conexión y procesamiento; botón Reconectar Drive solo para el titular
  temporal `almacen@arlessas.com`. No concede permisos de escritura al maestro.
- Reconexión exige sesión autorizada, identidad Google confirmada, origen permitido,
  estado cifrado de un solo uso, PKCE y cookie segura. Se valida la cuenta, el archivo,
  el alcance y la renovación del nuevo token antes de sustituir el anterior.
- Cancelar o fallar conserva la credencial anterior. Sustitución compare-and-swap
  impide que un callback viejo sobrescriba una reconexión más reciente; se revalida
  al titular al guardar. Inicio limitado a uno por minuto, estados duran diez minutos.
- Comparación atómica de versiones: contenido nuevo, contenido ausente, contenido
  igual y posibles correcciones en la misma posición. Usa multiconjuntos para
  conservar duplicados legítimos; mover filas idénticas no cuenta como altas/bajas.
- El maestro no tiene un ID estable: las correcciones son candidatas, no certezas.
  Están incluidas en entradas/salidas y no se suman aparte. No se inventan vínculos.
- Solo se guarda un resumen vigente de comparación. Los snapshots previos permanecen
  intactos. No se crean copias del maestro ni se toca futura planificación de la web.
- Las vistas ya se renuevan automáticamente al consultar una nueva versión válida.

## Verificación económica

Una ronda focalizada: 31 pruebas aprobadas (OAuth, acceso/RLS, comparación,
cancelación, fallo de renovación y replay). No se repitió la suite completa del lector.
Compilación frontend y empaquetado OAuth correctos. Datos de prueba solo locales.
Estado real a las 10:00 de Colombia: Cron activo, sin error, 6.269 registros y
un solo snapshot. Último ciclo UNCHANGED, una lectura de metadatos y cero bytes descargados.
La reconexión completa con Google no se forzó sobre una credencial saludable.

Migración: `20260828170000_web3_sync.sql`, aplicada por SQL Editor; no repetir ni
ejecutar migraciones CLI sin reconciliar el historial de aplicaciones manuales.
RPC `web3_sync_info` es SECURITY DEFINER con autorización explícita antes de leer:
devuelve solo estado y resumen, nunca tokens ni payloads privados.

## Aceptación operativa pendiente

El usuario debe hacer una modificación normal en su maestro y avisar cuál fue.
Esperar el siguiente ciclo más el procesamiento y comprobar que aparece en la web,
sin importación manual. No se introdujeron filas ficticias ni se fabricó evidencia
de un cambio real. La comparación empieza con el próximo cambio posterior a WEB 3.

Google permanece en Testing: este trabajo no resuelve por sí mismo la caducidad
del consentimiento. No se cambió estado OAuth ni permisos del ingeniero. Su login
real y el relevo de Drive siguen pendientes de participación y entrega controlada.

El usuario indicó que subió WEB 2; checkout base `6a235e4`. Los cambios WEB 3 quedan
sin commit/push del agente: subirlos a GitHub antes de otro despliegue automático.
WEB 4 (Gantt) requiere la siguiente autorización; no se adelantó inventario.

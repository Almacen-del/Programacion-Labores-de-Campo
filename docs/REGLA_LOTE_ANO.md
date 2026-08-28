# Inclusión por lote y año de siembra

Solicitud del usuario del 28 de agosto de 2026, antes de WEB 6.

- Solo se guardan filas con lote no vacío y año de siembra interpretable como entero.
- Si falta cualquiera, se omite la fila completa, sus alertas y su aporte a los totales.
- No existe una lista permanente de rechazados. Cada cambio del maestro se lee de nuevo: completar ambos campos incorpora la fila; quitar uno la retira de la versión vigente.
- El maestro de labores continúa revisándose cada cinco minutos, aun con la página cerrada. Requiere conexión Drive vigente y ejecución exitosa.
- Sin cambios de contenido no se duplican registros. Se conservan versiones elegibles de cambios reales según la política ya existente.
- La regla también se aplica al inventario, pero su método de futuras actualizaciones sigue pendiente: todavía no tiene sincronización Drive de cinco minutos.
- No se modifica el maestro original, el Excel de inventario ni el programa de escritorio.

## Aplicación

Migración `20260828210000_required_keys.sql`: normalización de ingesta, limpieza de snapshots históricos y proyección, recálculo de conteos, limpieza de inventario y totales solo de filas incluidas. Mantiene identificador y estado pendiente de la versión del inventario.

Respaldo externo privado: `.private/backups/required-keys-20260828/`. El JSON del maestro coincide por SHA-256 con la única versión almacenada antes del cambio; el inventario se contrastó por igualdad JSON con la base. El SQL de aplicación incorpora guardas para abortar si esos datos cambiaron antes de ejecutarse.

Conteos al aplicar: labores 6.269 → 5.975 (294 omitidas); inventario 57 → 53 (4 omitidas). Cero labores persistidas sin ambas claves. El número futuro puede variar legítimamente con nuevas correcciones del maestro.

Verificación focalizada: 19 pruebas de lector, sincronización e integración PostgreSQL; compilación web correcta. Se verificó omisión, reincorporación, retirada al borrar claves, cero filas elegibles, limpieza histórica y ausencia de duplicación al repetir contenido.

WEB 6 no iniciada. Los respaldos y demás datos operativos no se suben al repositorio público.

## Publicación y continuidad

Frontend publicado en Vercel: `dpl_317cBwix8xjDK7as1TYcJxFNjzno`.
Lector Edge actualizado con la misma regla.

Se detectó un fallo previo en cada cambio real de versión: SQLSTATE 21000,
`DELETE requires a WHERE clause`. La protección de la API impedía limpiar
la caché con el DELETE global de WEB 2. La migración
`20260828211000_sync_projection_scoped.sql` limita el borrado a los registros
de la versión sustituida; sus alertas salen por la FK en cascada. No se
desactiva la protección y no se altera el maestro.

Sincronización real verificada el 28/08/2026 a las 10:48:55 de Colombia:
HTTP 200, `UPDATED`, 5.975 registros, 32 alertas, sin error. La prueba usa
el mismo flujo que el cron, sin añadir filas ficticias al archivo real.

# WEB 7 — Aceptación y transición

Inicio autorizado por el usuario el 28 de agosto de 2026. Revisión preparatoria
realizada; **no se declara aceptación final ni cambio definitivo de uso**.
No se retiran cuentas, revocan tokens, modifican fuentes, activan cobros ni
programan copias. El respaldo sigue siendo manual por elección del usuario.

## Evidencia comprobada en esta etapa

- Maestro: 5.975 registros (5.943 válidos, 31 observados, 1 bloqueado), 32 alertas.
- Últimos ciclos automáticos: 11:25, 11:30 y 11:35 de Colombia, 28/08/2026.
  Ejecuciones con dispatch de cron, HTTP 200, sin cambios y sin error; cada una
  consultó metadatos sin descargar ni generar otro snapshot.
- Dos snapshots almacenados, 8.114.088 bytes de JSON. Base: 20.679.827 bytes.
  Son medidas puntuales de la aplicación, no un presupuesto mensual completo.
- Acceso real anónimo rechazado con HTTP 401 en bootstrap, registros, historia,
  hook de admisión, respaldo, capacidad y exportación. JWT inválido también
  rechazado. Inicio por Google activo; correo y acceso anónimo desactivados.
- Los 57 archivos del escritorio incluidos en el manifiesto original conservan
  sus hashes. Esta comprobación no cubre nuevos archivos ni la base SQLite;
  no demuestra que no haya datos operativos nuevos que reconciliar.
- Consulta de base de solo lectura: ambas cuentas siguen autorizadas. La del
  ingeniero todavía no tiene usuario registrado ni inicio de sesión en Auth.
  No se creó ese usuario ni se inició sesión en su nombre.
- Inventario actual: 53 filas, 4 con observaciones, sin fecha efectiva confirmada.
  Cero filas sin lote/año en registros actuales, históricos e inventario.
- Se verificó nuevamente la integridad del respaldo manual ya descargado y que
  contiene el mismo hash de maestro vigente; no fue necesario repetir la
  restauración completa ni descargar otra copia idéntica.

Evidencia privada actual: `.private/evidence/master-sync-status-1787935101284.json`
y comprobaciones `check-web2-public.mjs`, `check-web6-public.mjs`.
Consulta de aceptación: `scripts/web7-preflight.sql`; resultado privado en
`.private/evidence/web7-preflight-20260828.txt`.

## Evidencia previa aprovechada sin repetir pruebas costosas

- Entrada real de la cuenta temporal, Gantt/filtros/detalle y reporte de agosto
  con 336 registros fuente, verificados durante WEB 4 y WEB 6.
- Respaldo real `arles-respaldo-2026-08-28T16-22-26.261Z.json` recuperado en base
  aislada: 2 snapshots, 5.975 registros, 32 alertas y 1 versión de inventario.
  No fue una restauración sobre Supabase ni una prueba del acceso del ingeniero.
- Pruebas locales de errores, cambios de estructura, duplicación, exclusión y
  reincorporación por lote/año. No se provocaron fallos de OAuth ni se insertaron
  filas de prueba en el maestro real.

## Condiciones para la aceptación final

| Condición | Estado |
|---|---|
| Cuenta temporal y consultas publicadas | Verificadas en etapas previas; acceso se conserva |
| Entrada real del ingeniero y uso en Lenovo | Requiere participación del ingeniero; no se suplanta |
| Cambio operativo del maestro con navegador cerrado | Pendiente aceptación controlada por usuario; no basta un ciclo sin cambios |
| Relevo de Drive sin depender de la cuenta temporal | Pendiente; exige ajuste de identidad/configuración y autorización antes de revocar |
| Consentimiento Google para uso sostenido | Pendiente revisión y aprobación; no se da por resuelto por funcionar hoy |
| Fecha efectiva y futuras actualizaciones del inventario | Pendientes de validación |
| Reconciliar novedades de la base de escritorio | Pendiente antes del cambio definitivo |
| Planificación editable y reglas de avance | No implementadas; requieren alcance aprobado, no se presentan como terminadas |
| Retención del historial y consumo total del proveedor | Pendientes; sin borrado ni planes pagos automáticos |
| Aceptación expresa y retirada del acceso temporal | No autorizadas todavía |

## Entrega preparada

Guía: [GUIA_USUARIO.md](GUIA_USUARIO.md), con enlace, uso, filtros, inventario,
respaldo manual, recuperación y lista de aceptación para el Lenovo.

Próximo paso: el ingeniero inicia sesión desde su equipo con
`dir.siembrasnuevas@arlessas.com` y realiza la lista de aceptación. Después se
revisa el relevo de Drive. Solo al confirmar acceso, sincronización independiente,
respaldo y aceptación se solicita retirar la cuenta de pruebas.

No se modifica el proveedor ni se vuelve a desplegar la aplicación solo para
marcar esta etapa: WEB 7 es aceptación, no una etiqueta de versión nueva.

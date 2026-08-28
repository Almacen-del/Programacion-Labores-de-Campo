# WEB 6 — Reportes, respaldo y capacidad

28 de agosto de 2026. Inicio autorizado. Bloque funcional implementado; etapa
no cerrada hasta acordar custodia, frecuencia y retención y validar consumo
total en los proveedores. Sin planes pagos, purgas ni cambios de OAuth.

## Disponible

- Reporte CSV del control con fechas, filtros compartidos del Gantt, procedencia
  y hash de versión. Incluye bloqueados con fecha; omite filas sin lote/año.
- Gantt CSV como matriz por lote/labor/día: número de registros por día y huecos
  vacíos. No dibuja continuidad ficticia, porcentajes ni planificación no aprobada.
- Exportación de todas las coincidencias, no solo la página visible; límite
  explícito de 20.000 registros y rango máximo de 93 días. No entrega truncados.
- CSV con BOM UTF-8, separador punto y coma, comillas escapadas y neutralización
  de fórmulas. Formatos gráficos/PDF y estética final quedan por validar.
- Respaldo JSON consistente de todos los snapshots almacenados, versiones de
  inventario, fechas/notas de confirmación, configuración funcional y lista de
  acceso autorizada. Incluye huella SHA-256; no equivale a firma de autenticidad.
- No incluye secretos OAuth, usuarios/sesiones Auth, logs ni originales Excel.
  No hay planes propios que respaldar porque la planificación editable aún
  no está implementada. La identidad Auth del confirmante no se restaura.
- Guardias de respaldo: 24 MiB de contenido base y 32 MiB de JSON generado;
  puede requerir una copia técnica por partes al crecer. No elimina historial.
- Métricas de base, snapshots, inventarios, revisiones/errores del mes y tráfico
  parcial registrado por el sincronizador. Aviso al 80% de guardias locales.
  No presenta esas métricas como uso total facturado: navegación, OAuth, otras
  funciones y otros tráficos requieren contrastar los paneles de los proveedores.

Migración: `20260828220000_web6_reports_backup.sql`. Funciones restringidas a
miembros activos, sin acceso anónimo, sin cambios de membresías. No repetir
migraciones aplicadas manualmente mediante un push indiscriminado.

## Recuperación

1. Descargar el JSON desde Reportes. Guardarlo fuera del proyecto Supabase en
   una ubicación privada y controlada. Contiene datos operativos sin cifrar;
   no adjuntarlo a GitHub ni enviarlo por enlaces públicos.
2. Conservar también este repositorio y los Excel originales. El respaldo no
   es una copia del proyecto completo del proveedor ni de sus credenciales.
3. Verificar sin conexión a producción:

   `node scripts/verify-backup.mjs "ruta-al-respaldo.json"`

   El comando valida la huella y restaura en PostgreSQL PGlite aislado en
   memoria, usando las migraciones de la aplicación. Reconstruye registros,
   alertas, historia y versiones de inventario. Compara payloads y fechas/notas.
   Cierra la base de prueba al terminar; no escribe ni conecta con Supabase.
4. Ante una pausa del proveedor, comprobar primero si basta reactivar el mismo
   proyecto; no importar encima de una base existente. Antes de recuperación
   real: respaldar cualquier dato nuevo y aprobar destino vacío y acceso.
5. En recuperación real sobre un proyecto limpio, un técnico aplicará las
   migraciones con extensiones Cron/net disponibles y cargará los datos con
   parámetros, verificando hashes y conteos antes de publicar. Reconfigurar
   URL del frontend, acceso Auth y OAuth por sus flujos normales. No copiar
   sesiones ni reconstruir secretos desde el JSON.
6. Rehabilitar el cron solo después de verificar acceso al maestro exacto.
   Validar consulta real con el ingeniero antes de retirar acceso temporal.

La restauración probada es de datos en entorno aislado, no un simulacro completo
de caída/recreación del proveedor ni de inicio de sesión del ingeniero.

## Verificación focalizada

Compilación TypeScript/Vite y dos pruebas WEB 6: seguridad CSV/huecos del Gantt;
RPC privada, rechazo ajeno/anónimo, filtros y 61 filas sin truncar a la página,
exclusión de bloqueados del Gantt, protección por snapshot, ausencia de credenciales,
integridad del archivo y restauración aislada de registros e inventario confirmado.
No se insertaron registros ficticios ni se confirmó inventario real en producción.

Publicación final Vercel Ready: `dpl_9K65mkdQcwgAbfkDg1ZuaakkAfRT`.
Migración aplicada correctamente en Supabase. Navegación real con cuenta temporal
y métricas verificadas. Exportación Gantt agosto 2026: 336 registros fuente,
archivo CSV de 20.809 bytes descargado.

Respaldo real descargado en Descargas:
`arles-respaldo-2026-08-28T16-22-26.261Z.json` (10.832.899 bytes).
Verificación y recuperación aislada correctas: 2 snapshots, 5.975 registros
vigentes, 32 alertas y 1 versión de inventario; sin credenciales y sin modificar
producción. Esta copia local no sustituye la futura custodia externa acordada.

## Decisiones pendientes

- Destino externo y custodio del respaldo; frecuencia y aviso de fallo.
- Retención de historial y logs. Propuesta inicial: mantener sin borrado hasta
  aprobar política; generar copia antes de cada cambio relevante. No se ha
  activado ningún trabajo automático nuevo.
- Consumo mensual total real de Supabase/Vercel y formatos finales de reportes.
- Validación del usuario. WEB 7 no iniciada.

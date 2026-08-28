# Plan de migración web — Control de Labores Arles

Fecha: 28 de agosto de 2026.

Estado: WEB 1 realizada y WEB 2 autorizada expresamente por el usuario; véase
[entrega WEB 2](WEB_2_ESTADO.md). Las etapas WEB son independientes
de los bloques históricos de escritorio. No se autorizan cobros.
WEB 3 autorizada posteriormente; implementación y aceptación pendiente en
[estado WEB 3](WEB_3_ESTADO.md).
WEB 4 autorizada: Gantt de ejecución, lotes e indicadores; planificación editable
y aceptación visual siguen sujetos a aprobación. Véase [WEB 4](WEB_4_ESTADO.md).
Actualización: el usuario aporta proyectos existentes en Supabase y Vercel;
este último sustituye la propuesta inicial de frontend en Cloudflare,
sujeto a verificar plan y elegibilidad. Véase [proyectos web](PROYECTOS_WEB.md).

## 1. Objetivo y límites

Crear una aplicación web privada para un solo usuario, basada en el Cuadro de
Control y con el Gantt por lote y labor como función distintiva. Mantener el
maestro de programación de labores en Google Drive como fuente principal,
actualizada automáticamente, y el inventario general como maestro secundario.

Alcance aclarado por el usuario: herramienta personal de una sola persona
para automatizar su trabajo, sin uso administrativo ni beneficio empresarial
previsto. Durante desarrollo se aprueban dos cuentas: `almacen@arlessas.com`
como administrador temporal de pruebas y `dir.siembrasnuevas@arlessas.com`
como ingeniero y usuario definitivo. No se amplía el acceso a todo el dominio.

- Vercel Hobby: plan verificado; frontend para el uso personal declarado.
- Supabase Free: PostgreSQL, acceso privado, archivos privados y funciones.
- Supabase Cron: revisión periódica del maestro, aunque el navegador esté cerrado.
- Google Drive: lectura del archivo autorizado, sin modificarlo ni hacerlo público.
- Objetivo de infraestructura: $0 mensuales dentro de las cuotas gratuitas.
- Sin dominio comprado, planes pagos ni activación de facturación automática.
- Conservar el escritorio y su base local durante toda la migración.
- Dos identidades autorizadas durante pruebas y un usuario definitivo tras la
  entrega; no es un sistema multiempresa ni de roles complejos.

No se garantiza servicio ininterrumpido gratuito ni funcionamiento completo sin
internet. Tampoco se convierte el archivo de Drive ni se amplían permisos sin
autorización específica.

## 2. Punto de partida verificado

El proyecto local contiene React/TypeScript, Electron, SQLite, un lector Excel
con validaciones y un servicio de sincronización con Drive. La interfaz depende
de `window.arles`, expuesto por Electron; publicar sus archivos estáticos no
basta para tener una aplicación web funcional.

La lectura Excel utiliza módulos Node y el cifrado de tokens depende de
Windows. Ambos requieren adaptación al entorno de servidor; la base se debe
migrar de SQLite a PostgreSQL, no copiar como archivo a Supabase.

El Gantt actual es una estructura demostrativa con motor pendiente. Construir
el Gantt completo es trabajo funcional adicional, no una función ya terminada
que solo deba publicarse. La última evidencia documentada del Bloque 2 deja
pendiente la aceptación real de la conexión; se verificará de nuevo.

## 3. Etapas y condiciones de aprobación

### WEB 1 — Viabilidad técnica y costo cero

Después de autorizar el inicio:

1. Respaldar y caracterizar el estado local, sin incluir secretos en reportes.
2. Confirmar las identidades de prueba y definitiva y el acceso al maestro exacto.
3. Verificar recursos y cuotas disponibles en cuentas propiedad de Arles.
4. Preparar un entorno mínimo privado de prueba. Proteger el acceso antes de
   cargar datos reales; no publicar una base abierta como paso temporal.
5. Configurar OAuth web separado del cliente de escritorio. Distinguir el
   inicio de sesión de la web de la autorización para leer Drive.
6. Descargar y procesar una copia del maestro real en la función alojada:
   medir CPU, memoria, duración, filas, alertas y tamaño almacenado.
7. Comparar los resultados con el lector local usando la misma versión del
   archivo; no tratar los conteos históricos como valores actuales fijos.
8. Probar renovación de acceso y dos ejecuciones programadas con la página
   cerrada. Registrar ejecución en servidor, no inferir éxito del temporizador.
9. Estimar consumo mensual con el archivo real, retención e historial.

**Salida:** informe de viabilidad gratuito con medidas, límites y evidencia.
Si no cabe, se detiene la migración completa y se propone una adaptación; no
se activa un plan pago ni se convierte el maestro automáticamente.

Resultado del piloto al 28 de agosto: OAuth y renovación verificados, carga
real persistida con hash idéntico al escritorio y dos ciclos cada cinco minutos
con páginas cerradas aprobados. Viabilidad técnica favorable con el maestro
actual; véase `WEB_1_SINCRONIZACION.md`. El núcleo de sincronización se adelantó
solo para demostrar WEB 1: no completa la interfaz y aceptación de WEB 3 ni
autoriza iniciar WEB 2. Retención, consentimiento sostenido y relevo al usuario
definitivo permanecen como condiciones de operación, sin cambios a planes pagos.

Un cliente OAuth externo en estado Testing con permisos Drive puede emitir
refresh tokens con vencimiento a siete días. Antes de operación continua se
debe validar la configuración apropiada y cualquier requisito de Google. El
cambio de estado OAuth se revisará y autorizará antes de ejecutarlo; no implica
abrir los datos de la web al público. Véase [caducidad de Google OAuth](https://developers.google.com/identity/protocols/oauth2#expiration).

### WEB 2 — Base web y acceso privado

- Mantener la aplicación de escritorio y crear una entrada web independiente.
- Reutilizar diseño, navegación, contratos y reglas compatibles.
- Sustituir las llamadas Electron por una API web validada.
- Migraciones PostgreSQL para fuentes, versiones, filas, alertas y auditoría.
- Acceso exclusivo de las dos cuentas aprobadas durante pruebas, sin registro
  público ni autorización general del dominio; retiro controlado de la temporal
  al entregar, después de verificar el acceso definitivo.
- Políticas de seguridad por fila (RLS) y almacenamiento privado: probar tanto
  el acceso permitido como el rechazo de un visitante y otra cuenta.
- Credenciales Drive, refresh tokens y claves privilegiadas exclusivamente en
  el servidor; nunca en React, logs, Git o archivos descargables.
- Endpoints administrativos autenticados y tarea programada con credencial
  propia validada; evitar que cualquier visitante dispare importaciones.

**Salida:** web privada con navegación y servicios reales, accesible desde el
Lenovo y otros equipos con la misma identidad autorizada.

### WEB 3 — Sincronización automática confiable

- Intervalo propuesto de cinco minutos, sujeto al resultado de WEB 1.
- Consultar metadatos primero y procesar solo cuando cambie el archivo.
- Descarga XLSX o exportación de Sheets según el tipo real, sin convertir el original.
- Adaptar el lector al entorno disponible; si se requiere dividir el trabajo,
  hacerlo con reanudación y publicación atómica de la versión completa.
- Conservar valores originales y trazabilidad de archivo, hoja y fila.
- Distinguir altas, correcciones y eliminaciones en la nueva versión; preservar
  versiones anteriores y no borrar planificación creada dentro de la aplicación.
- Evitar importaciones simultáneas y duplicados al reintentar.
- Si hay errores, mantener la última versión válida y mostrar su antigüedad.
- Mostrar última revisión, última importación, estado y error entendible.
- Renovar tokens en servidor y ofrecer reconexión si Google revoca el permiso.
- Actualizar las vistas abiertas cuando haya una nueva versión válida.

**Salida:** cambio real del maestro reflejado sin importar archivos a mano.
La comprobación de cambios se hace con una edición operativa del usuario o una
copia de prueba expresamente autorizada. No se insertan filas de prueba en el maestro.
El objetivo normal es el siguiente ciclo más el tiempo de procesamiento, no
una promesa de actualización instantánea ni de disponibilidad 24/7.

### WEB 4 — Cuadro de Control y Gantt prioritarios

Entregar primero una versión consultable y después la planificación:

- Cuadro de Control con datos reales, alertas y fecha de actualización.
- Gantt mensual: agrupación por lote y subfila por labor.
- Vista semanal y rango personalizado; navegación entre periodos y marca de hoy.
- Filtros compartidos: fechas, lotes, labores y año de siembra; colaborador,
  insumo, maquinaria, origen y alertas cuando existan esos datos.
- Detalle al seleccionar una barra, con sus registros fuente.
- Barras ejecutadas basadas en evidencia: inicialmente separar días sin
  actividad, sin dibujar ejecución continua en intervalos desconocidos.
- Barras programadas separadas de ejecutadas; guardar planes y revisiones en
  Supabase si el usuario aprueba administrar la planificación dentro de la web.
- Actividad sin planificación visible y relaciones ambiguas señaladas.
- Colores, estados, reglas de agrupación y avance sujetos a aprobación.
- Sin porcentajes inventados: mostrar «Sin regla de avance» cuando corresponda.
- Consultas paginadas, índices y prueba de rendimiento con el volumen real.

**Salida:** Cuadro de Control y Gantt funcionales aprobados visualmente por el
usuario. No se posterga el Gantt hasta terminar el módulo de inventario.

### WEB 5 — Inventario general secundario

- Pestaña propia, separada del maestro de labores.
- Carga inicial del inventario proporcionado, con vista previa y validación.
- Versiones con fecha efectiva, comparación de cambios e historial.
- Definir si futuras actualizaciones vendrán de otro archivo en Drive o de una
  carga validada. La prohibición de importación manual del maestro de labores
  se mantiene; el método del inventario aún está pendiente.
- No habilitar edición directa del inventario como supuesto no aprobado.
- Asociar por lote solo cuando la correspondencia sea clara.
- Usar el inventario vigente en cada fecha para reglas históricas aprobadas.

**Salida:** inventario actualizable y trazable, sin desplazar al Cuadro de Control.

### WEB 6 — Reportes, respaldos y límites

- Exportaciones del control y Gantt filtrados; formatos finales por validar.
- Métricas de tamaño, invocaciones y transferencia, con advertencias dentro de la web.
- Proponer y aprobar retención de snapshots y registros; no borrar historial
  silenciosamente para ajustarse a las cuotas.
- Copia recuperable de planes, inventario y configuración funcional, además
  de los datos derivados de Drive. El maestro no respalda los planes de la web.
- Definir destino externo de respaldo y custodio; una copia dentro del mismo
  proyecto Supabase no será la única recuperación disponible.
- No exportar tokens ni credenciales como parte de respaldos descargables.
- Probar restauración y documentar recuperación tras pausa del proveedor.
- Ante límites, informar y conservar los datos; nunca cambiar a pago automáticamente.

**Salida:** recuperación probada y presupuesto de uso validado.

### WEB 7 — Aceptación y cambio de uso

- Probar login autorizado y rechazo de acceso ajeno.
- El ingeniero realizará su inicio de sesión real; no se sustituye por la cuenta
  temporal ni se solicitan sus contraseñas. Su participación está pendiente.
- Antes de retirar el acceso temporal, verificar el acceso definitivo y la
  continuidad de la sincronización Drive sin depender del administrador de
  pruebas. Confirmar la entrega antes de revocar permisos; no borrar datos.
- Probar cambio del maestro con navegador cerrado, reintento sin duplicados,
  cambio de estructura, pérdida de acceso y renovación de sesión.
- Probar filtros, Gantt, inventario histórico, reportes y restauración.
- Verificar funcionamiento en el Lenovo y navegador objetivo.
- Reconciliar cualquier dato nuevo del escritorio antes del cambio definitivo.
- Entregar URL, instrucciones de uso, respaldo y procedimiento de recuperación.
- Conservar escritorio y respaldo local como retorno seguro; no afirmar que
  escritorio y web sincronizan planificación entre sí.

**Salida:** aceptación expresa del usuario. Ningún pendiente se marca cumplido
solo porque la web cargue correctamente.

## 4. Condiciones del plan gratuito verificadas

Al 28 de agosto de 2026, Supabase Free incluye 500 MB de base, 1 GB de archivos,
5 GB de transferencia de salida y 500.000 invocaciones de funciones. Puede
pausarse por inactividad y no incluye respaldos automáticos. Véanse [precios](https://supabase.com/pricing)
y [pausas por inactividad](https://supabase.com/docs/guides/platform/free-project-pausing).

Sus funciones tienen 256 MB de memoria, 2 segundos de CPU por solicitud y
150 segundos de duración en Free. La CPU, no solo el número de filas, es el
riesgo principal del lector Excel. Véanse [límites de ejecución](https://supabase.com/docs/guides/functions/limits).

Una comprobación cada cinco minutos equivale a 8.640 ejecuciones en treinta
días, antes de reintentos, procesamiento dividido, navegación y otras tareas.
Esto no demuestra por sí solo que la aplicación quepa en las cuotas.
La programación se apoya en [Cron y Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

El frontend se ha actualizado a Vercel por indicación del usuario. Su plan
[Hobby](https://vercel.com/docs/plans/hobby) restringe el uso a proyectos
personales no comerciales. El usuario ha aclarado ese alcance personal y se
continúa sobre esa base; no equivale a una certificación de Vercel.
Si cambia el uso, revisar las condiciones. No cambiar a pago ni a otro
proveedor sin acuerdo del usuario.

## 5. Decisiones del usuario en su momento

| Decisión | Antes de |
|---|---|
| Aprobar este plan y autorizar iniciar WEB 1 | Cualquier implementación o recurso externo |
| Cuentas confirmadas: almacen@arlessas.com temporal y dir.siembrasnuevas@arlessas.com definitiva | WEB 1; pendiente implementación y prueba |
| Resolver consentimiento OAuth para uso sostenido | Operación continua |
| Aprobar planificación dentro de la web, estados y agrupación de días | Parte planificada de WEB 4 |
| Elegir método futuro del inventario | WEB 5 |
| Aprobar retención, destino y frecuencia de respaldos | WEB 6 |
| Validar web y autorizar cambio de uso | WEB 7 |

No se requieren todas las decisiones agronómicas para iniciar la prueba de
viabilidad. Cada etapa tendrá evidencia y revisión antes de la siguiente.

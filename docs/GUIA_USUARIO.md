# Guía rápida — Control de Labores Arles

Web: https://programacion-labores-de-campo.vercel.app/

## Entrar

En el Lenovo, abre el enlace en el navegador e inicia sesión con Google usando
`dir.siembrasnuevas@arlessas.com`. No necesitas instalar el programa de escritorio.
No compartas contraseñas ni códigos de acceso. El acceso temporal de pruebas
`almacen@arlessas.com` permanece hasta completar la entrega.

## Consultar labores

1. En **Control**, revisa la última revisión del maestro y sus alertas.
2. En **Gantt**, elige mes, semana o rango de hasta 93 días. «Última actividad»
   permite ir al último mes que contiene registros.
3. Selecciona lote, labor y los demás filtros; pulsa **Aplicar filtros**.
4. Pulsa un segmento para ver registros del día y abre su detalle para consultar
   la hoja y fila del maestro. Los filtros se comparten con Lotes, Indicadores
   y Reportes.

Cada barra representa actividad registrada, no un plan aprobado. Un hueco no
demuestra que no se trabajó. Los colores distinguen labores, no porcentajes de
cumplimiento; aún no hay planificación editable ni reglas de avance.

## Cambios en el maestro

Las correcciones se hacen en el archivo original, no en esta web. El servidor
lo revisa cada cinco minutos incluso si la página está cerrada. La página
abierta actualiza la consulta aproximadamente cada minuto; puedes usar
**Actualizar consulta** después del ciclo del servidor.

- Solo entran filas con **lote y año de siembra**. Si falta cualquiera, no se
  guardan ni se cuentan.
- Al completar ambos campos, la fila vuelve a evaluarse en la siguiente
  sincronización. Si están presentes, entra con sus validaciones habituales.
- Si no cambia el contenido, las revisiones no duplican registros.
- Si ocurre un error de acceso, formato o capacidad, se conserva la última
  versión correcta. Revisa la fecha: no confundas información conservada con
  información recién sincronizada.

La sincronización sigue dependiendo de la conexión temporal de pruebas hasta
realizar el relevo autorizado al ingeniero. No cerrar ni revocar esa conexión
por cuenta propia durante la aceptación.

## Inventario

Es un maestro secundario, separado de las labores. Permite consultar versiones,
filtrar lotes y revisar sus observaciones. Si la fecha efectiva está pendiente,
es una vista previa, no inventario vigente. No confirmes una fecha por suposición:
debe corresponder al inventario real.

La consulta por fecha usa versiones confirmadas vigentes a esa fecha. El método
de futuras actualizaciones del inventario aún debe acordarse; no tiene la
sincronización automática de cinco minutos del maestro de labores.

## Reportes y copia de seguridad manual

En **Reportes**, ajusta el periodo y revisa los filtros; descarga el control o
Gantt en CSV. Incluye todas las coincidencias, no solo la página visible.

Para guardar una copia, pulsa **Descargar respaldo JSON**. Es manual: tú decides
cuándo hacerlo y dónde conservarlo. Verifica que el archivo haya terminado de
descargarse. Contiene datos privados sin cifrar; no lo subas a GitHub ni a enlaces
públicos. Conviene conservar otra copia privada fuera del computador.

No hay copias programadas ni eliminación automática de historial. El JSON no
incluye contraseñas, tokens, sesiones ni los archivos Excel originales; conserva
también los originales y el código de la aplicación.

La recuperación exige revisión técnica y reconectar Google; no basta subir el
JSON a la página. Procedimiento: [recuperación y límites](WEB_6_ESTADO.md).

## Si algo falla

| Situación | Acción |
|---|---|
| Acceso denegado | Comprueba la cuenta de Google; no uses otra cuenta del dominio como sustituta. |
| Revisión antigua o error de sincronización | Guarda el mensaje y la hora; consulta Sincronización. No borres la base ni vuelvas a cargar el maestro manualmente. |
| No aparece una labor | Revisa lote/año, fecha, filtros y hoja/fila; los bloqueados no se dibujan en el Gantt. |
| Aviso de capacidad | Descarga un respaldo y solicita revisión. No se contratará un plan ni se borrará historial automáticamente. |
| Problema con el CSV | Abre/importa como UTF-8 con separador punto y coma. Los textos que podrían ejecutar fórmulas están protegidos. |

Cierra sesión al terminar en equipos compartidos. Conserva el escritorio como
respaldo de transición; escritorio y web no sincronizan planes entre sí.

## Prueba de aceptación del ingeniero

- [ ] Entré con mi cuenta desde el Lenovo.
- [ ] Consulté un lote/labor conocido, apliqué filtros y abrí la procedencia de una barra.
- [ ] Revisé el inventario y distinguí vista previa de versión confirmada.
- [ ] Descargué un reporte y un respaldo manual y comprobé los archivos.
- [ ] Una corrección operativa legítima del maestro apareció tras un ciclo;
      no se añadieron filas ficticias para esta comprobación.
- [ ] Entiendo las funciones pendientes y acepto la versión consultable.

Anotar fecha, navegador, lote/labor y resultado, sin contraseñas. Para el cambio
definitivo se necesita además resolver el relevo de Drive, revisar cualquier
dato nuevo del escritorio y autorizar expresamente retirar el acceso temporal.

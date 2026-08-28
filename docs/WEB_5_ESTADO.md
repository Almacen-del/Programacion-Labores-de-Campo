# WEB 5 — Inventario secundario en revisión

28 de agosto de 2026. Inicio autorizado. No se modifican Excel original, maestro
de labores, planificación ni permisos de Google. La carga inicial queda DRAFT:
no se inventa una fecha efectiva ni se declara inventario vigente.

## Fuente y hallazgos

Archivo `Inventario general Arles.xlsx`, Hoja1, encabezados filas 7–8; inventario
filas 9–65. 57 filas, 8 con pendientes y 143 celdas de fórmula. Huella original
SHA-256 `924b1ee5021dd58e3c2f7394896eae796ef3d3f1f14725e4955a66810835a5fd`,
verificada sin cambios después de la lectura. Datos y SQL de carga en `.private/inventory`,
excluidos de Git y de la publicación frontend.

Referencia temporal original: «INVENTARIO JUNIO, AGOSTO/25, SEPTIEMBRE».
No determina una fecha efectiva única. Se solicita confirmación explícita en la web.

Totales declarados: área principal 461,8955555555556 Ha; Alquería 449,69 Ha;
75.455 plantas vivas; plantación sembrada 80.311. Las sumas numéricas coinciden
con los tres primeros; árboles por fila suman 85.382, diferencia de 5.071 frente
a la plantación declarada. No se corrige ni elimina la fila Jardín Clonal ni se
concluye que sea duplicada. La discrepancia permanece visible para validación.

Vacíos permanecen vacíos, textos «PTE POR INVENTARIO» se conservan. Las fórmulas
y sus referencias compartidas se guardan como XML original, junto con los valores
calculados guardados por Excel; la web no ejecuta ni recalcula esas fórmulas.
Los totales generales se mantienen separados de las filas de lotes.

## Implementación

- Pestaña propia: filtros por lote/pendientes, paginación de 25 filas, detalle de
  procedencia y valores originales, conciliación de totales y selección de versiones.
- Vista previa antes de confirmar. Confirmación exige fecha no futura, nota,
  aceptación de observaciones y confirmación final. Versiones confirmadas no se
  sobrescriben. Reintentar la misma confirmación no duplica ni cambia la nota.
- Consulta histórica elige solo versiones confirmadas cuya fecha efectiva sea
  anterior o igual a la solicitada; nunca utiliza un borrador ni una versión posterior.
- Comparación con versión previa confirmada por contenido, preservando multiplicidad.
  Entradas/salidas no se presentan como correcciones inequívocas.
- Vinculación a labores solo con etiqueta literal coincidente y única en el inventario.
  No se normalizan códigos ni se fusionan 244/24, 266/26, 355/35 o nombres parecidos.
  El vínculo permite consultar labores; no aplica inventario a porcentajes o cálculos
  históricos del Gantt, cuyas reglas siguen sin aprobar.
- Ingesta de datos solo en servidor, con validación y hash único; no se habilita
  carga manual futura ni otro OAuth sin escoger el método. Límites preventivos:
  100 versiones, guardia de 25 MiB de payload existente y 400 MiB de base total.
  No se borran versiones para liberar espacio automáticamente.
- RLS y membresía activa protegen lecturas. Confirmación autenticada es la única
  escritura disponible al usuario; tablas e ingesta no admiten escritura directa.

## Verificación y despliegue

Dos pruebas focalizadas WEB 5 aprobadas: borrador, confirmación, idempotencia,
historia, comparación, permisos y rechazo de accesos ajenos. Se corrigió el uso
de savepoints del test para rechazos esperados dentro de una transacción; no fue
un fallo de la migración. No se repitió la batería previa después de esa corrección.
Compilación TypeScript/Vite correcta. No se confirmó ningún inventario real en pruebas.

Migración `20260828193000_web5_inventory.sql`; aplicación manual por SQL Editor.
No volver a ejecutarla ni usar push de migraciones sin reconciliar el historial.
Carga inicial de servidor mediante `scripts/prepare-inventory.mjs`: solo prepara
el archivo original fijo, no constituye todavía el flujo futuro del usuario.
Publicación Vercel Ready: `dpl_HENqNfhv9FsBjcyaQqzdeghdBydm`, en
https://programacion-labores-de-campo.vercel.app. Migración confirmada con éxito;
versión inicial `a372e05f-4ee0-41e8-9b57-d07c23446e45`, estado DRAFT, sin fecha efectiva.
Entrada real con cuenta temporal y pantalla de inventario verificadas: 57 filas,
8 con pendientes, primera página 1–25, advertencia de vista previa visible y
confirmación cerrada sin enviar. Diseño de escritorio revisado visualmente.
Huella del Excel original comprobada nuevamente al finalizar, sin cambios.
Despliegue final Ready `dpl_Cw3uP3dPtihjQVtiWghdDd2i2tpK`: ajuste de presentación
del año sin separadores de miles y etiqueta de la discrepancia en español.

## Pendientes para cerrar WEB 5

1. Confirmar fecha efectiva y revisar discrepancia de 5.071 árboles/filas pendientes.
2. Elegir actualizaciones futuras: archivo en Drive o carga de Excel validada.
   La prohibición de importación manual del maestro de labores sigue intacta.
3. Validación del ingeniero y reglas históricas antes de usar inventario en cálculos.

Los cambios de WEB 5 quedan sin commit/push del agente: subirlos a GitHub antes
de otro despliegue automático. WEB 6 no queda autorizada por esta entrega.

# WEB 4 — Gantt de ejecución

28 de agosto de 2026. Autorizada por el usuario. Alcance: ejecución consultable,
sin edición del maestro, inventario, planificación editable ni porcentajes inventados.

## Entregado

- Gantt mensual, semanal (lunes a domingo) y rango personalizado de hasta 93 días.
  Navegación entre periodos, Hoy en Colombia y acceso al mes de última actividad.
- Agrupación por lote y subfila por labor. Solo se representa cada día con evidencia:
  los días consecutivos forman barras contiguas, los huecos permanecen vacíos.
- Número de registros sobre cada segmento. Clic abre los registros del día y desde
  ellos el detalle original con hoja/fila. Pagina 25 combinaciones y 50 filas de detalle.
- Paleta estable por labor (puede repetirse); trama y marca ámbar para observaciones.
  Colores no equivalen a avance ni cumplimiento. La identificación inequívoca es el texto.
  Nombres del maestro se preservan literalmente: variantes de mayúsculas o escritura
  no se fusionan sin una regla aprobada; pueden aparecer como subfilas separadas.
- Filtros compartidos entre Gantt, Lotes e Indicadores: fechas, lote, labor, año de
  siembra, colaborador, insumo, maquinaria, hoja y presencia de alertas.
- Lotes: resumen por combinación y acceso a sus días registrados. Indicadores:
  registros, lotes, labores y fechas distintas en todo el periodo filtrado, no solo
  la página actual. No se suman cantidades con unidades heterogéneas.
- Bloqueados y filas sin lote/labor no se dibujan; se informa cuántos están excluidos
  del rango. Filas sin fecha se cuentan aparte entre todos los registros que coinciden
  con filtros no temporales. Las observadas sí aparecen identificadas.
- Sin planes aprobados no se puede afirmar si una actividad estaba programada:
  se presenta como actividad registrada y «Sin regla de avance».
- Filtros, barras y detalle se actualizan al cambiar la versión publicada. No se mezclan
  páginas de snapshots diferentes; el servidor rechaza consultas obsoletas.
- Calendario con desplazamiento horizontal y encabezados fijos; controles y barras
  accesibles por teclado. Diseño adaptable, pendiente prueba física en el Lenovo.

## Seguridad, rendimiento y pruebas

Migración `20260828183000_web4_gantt.sql`: tres RPC públicas SECURITY INVOKER,
RLS vigente, validación de filtros/rango/paginación y snapshot esperado. Sin nuevos
permisos de escritura ni secretos frontend. Índice por fecha/lote/labor para no bloqueados.
No almacena otra copia de los datos ni modifica snapshots.

Una ronda focalizada: 20 pruebas aprobadas (18 de base/RLS, incluidas 3 nuevas WEB 4,
y 2 de calendario). Cubre acceso ajeno, filtro inválido, snapshot obsoleto, exclusiones,
procedencia, filtros combinados, paginación, observaciones, bisiesto y cambio de año.
Compilación TypeScript/Vite correcta. No se repitieron pruebas OAuth ni lector completo.

Publicación Vercel Ready: `dpl_HJN35iGWhTN636UZaWfMbWf51YCL`, en
https://programacion-labores-de-campo.vercel.app. Migración aplicada correctamente
por SQL Editor. Consulta real bajo rol authenticated con identidad autorizada, sin
modificar datos: agosto de 2026 devuelve 336 registros representables, 52 lotes,
22 labores, 27 días con actividad, 2 observados, 111 combinaciones y 25 en la primera
página; 6 sin fecha aparte y 0 excluidos fechados en agosto. Tiempo SQL medido: 77 ms,
una sola muestra (no incluye red ni garantiza todas las consultas futuras).
Entrada real con la cuenta temporal y vista mensual publicada verificadas. Una
consulta inicial de permisos falló transitoriamente; «Reintentar acceso» permitió
entrar sin cambiar cuentas ni permisos. Captura visual de escritorio: barras con
segmentos contiguos y días separados, filtros legibles y sin solapamientos.
Barra real comprobada: lote 1, «Aplicacion de cal», 1 de agosto; abre dos registros
con procedencia «Siembras nuevas», filas 3820 y 3822, sin modificar sus datos.

## Pendientes de aceptación

1. Validación visual del usuario: agrupación, barras, colores y filtros.
2. Aprobar si se administrarán planes dentro de la web y definir estados/reglas de
   avance antes de implementar barras programadas. No se infieren de las ejecutadas.
3. Cambio operativo real del maestro para cerrar aceptación WEB 3; sigue pendiente.
4. Prueba del ingeniero y su Lenovo. Inventario corresponde a WEB 5.

Subir los cambios de WEB 4 a GitHub antes de otro despliegue automático desde una
versión anterior. El agente no realiza commit/push. Migraciones aplicadas manualmente
no se vuelven a ejecutar por CLI sin reconciliar el historial.

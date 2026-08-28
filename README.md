# Arles Control Web

Carpeta independiente creada el 28 de agosto de 2026 por solicitud del usuario.
Ubicación actual: `C:\Users\Almacen\Documents\ChatGPT\Arles Control Web\Programacion Labores de Campo`.

## Proyectos proporcionados por el usuario

- [GitHub](https://github.com/Almacen-del/Programacion-Labores-de-Campo): repositorio público; únicamente código y documentación sin secretos ni datos operativos.
- [Supabase](https://supabase.com/dashboard/project/dziwhbjyvxdbplthpazt): proyecto seleccionado para base de datos y sincronización.
- [Vercel](https://vercel.com/almacen-2787s-projects/programacion-labores-de-campo): frontend en Hobby para el uso personal declarado; sustituye la propuesta inicial de Cloudflare.

WEB 2 publicada: [abrir aplicación](https://programacion-labores-de-campo.vercel.app).
Acceso privado con Google; registros, alertas y estado del maestro de solo lectura.
Ver [entrega y pendientes actuales](docs/WEB_2_ESTADO.md).

## Alcance actual

WEB 1: viabilidad y sincronización automática. WEB 2: base web privada implementada
por autorización expresa del usuario. No es todavía la migración completa:
Gantt, inventario funcional y demás módulos mantienen sus etapas posteriores.
Objetivo de costo cero dentro de las cuotas verificadas, sin garantía de consumo ilimitado.

El proyecto original `Análisis de datos Arles SAS` se utiliza solo como fuente
de referencia. No se modifica su código, SQLite ni credenciales de escritorio.
Los datos privados de prueba y el respaldo de código se guardan en `.private/`,
excluidos de Git. No se copian claves OAuth, tokens ni bases con credenciales
del escritorio. Las credenciales nuevas de instalación web se resguardan
en la carpeta privada y en secretos de servidor, nunca en el repositorio.

El maestro de labores de Drive se mantiene en solo lectura. No se hacen
públicos sus archivos ni se activan planes de pago.

## Documentación

Acceso previsto: administrador temporal `almacen@arlessas.com` durante
pruebas e ingeniero `dir.siembrasnuevas@arlessas.com` como usuario definitivo.
El acceso real de la cuenta temporal está verificado. El ingeniero queda autorizado,
pero su primera entrada requiere su participación; no se ha suplantado su identidad.

- `docs/PLAN_MIGRACION_WEB.md`: plan por etapas; WEB 2 autorizada expresamente.
- `docs/WEB_2_ESTADO.md`: publicación, acceso, pruebas y pendientes actuales.
- `docs/WEB_1_ESTADO.md`: evidencia y pendientes de la etapa.
- `docs/WEB_1_OAUTH.md`: conexión Drive web verificada, seguridad y límites.

## Pruebas locales

Las mediciones locales orientan la prueba; no certifican por sí solas los
límites ni la ejecución de funciones alojadas en Supabase.

Con Node.js y npm instalados:

```powershell
npm ci --ignore-scripts
npm test
```

Estas pruebas no requieren `.private/`, archivos reales, cuentas ni secretos.
La referencia de escritorio en `tests/fixtures/desktop/` contiene solamente
código del lector aprobado y sus tipos; no contiene datos de labores.

Comprobaciones adicionales solo en el equipo que conserva el respaldo y el maestro:

```powershell
npm run benchmark
npm run verify:desktop
```

El benchmark usa la copia privada ya descargada; esto es una herramienta de
desarrollo, no un flujo de importación manual para la futura aplicación.
El respaldo se conserva en `.private/desktop-baseline`.
`snapshot-desktop.mjs` permite crearlo una sola vez en un entorno nuevo
indicando `--source` con la ruta absoluta del escritorio y se niega a
sobrescribir uno existente. La verificación usa la ruta del manifiesto y
sigue funcionando aunque se cambie de ubicación esta carpeta web.
No ejecutar el respaldo de nuevo aquí.

La interfaz WEB 2 consulta los datos privados. La sincronización automática del maestro
está activa cada cinco minutos en Supabase; ver
[configuración y evidencia](docs/WEB_1_SINCRONIZACION.md).
La [prueba privada de servidor](docs/WEB_1_PRUEBA_PRIVADA.md) está desplegada
en Supabase: rechazos de seguridad verificados y maestro procesado con el
mismo resultado que el escritorio. Esa prueba aislada no habilita el login;
la sincronización está implementada por separado en `master-sync`.

OAuth de Drive conectado con `almacen@arlessas.com`: Supabase ya renovó el
token y leyó los metadatos del maestro. La app Google sigue en Prueba; falta
resolver la duración del consentimiento antes del uso continuo. El login de usuario
de WEB 2 usa otro cliente OAuth, separado del acceso a Drive y del escritorio.
El maestro y el escritorio permanecen intactos.

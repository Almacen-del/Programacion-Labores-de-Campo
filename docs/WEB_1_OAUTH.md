# WEB 1 — Preparación de OAuth para Drive

Fecha: 28 de agosto de 2026. Estado: OAuth web conectado con la cuenta de
pruebas; token renovado y metadatos del maestro leídos desde Supabase.
Este paso por sí solo no activa el login. La sincronización programada se
implementó posteriormente: véase `WEB_1_SINCRONIZACION.md`.

## Resultado de la ejecución autorizada

- El usuario autorizó expresamente el cliente web, almacenamiento cifrado y
  permiso `drive.file` después de conocer que incluye capacidad de escritura.
- Cliente creado: `Control de Labores Arles Web - Drive`, tipo Aplicación web.
  ID: `433631251791-pja5srsup0cms8a8l8ak3h4v1lgram16.apps.googleusercontent.com`.
  Único retorno: `https://dziwhbjyvxdbplthpazt.supabase.co/functions/v1/drive-oauth/callback`.
  El primer intento de creación falló; se comprobó que no existía antes de
  reintentar. El segundo fue exitoso. No se modificó el cliente Windows.
- Cuatro secretos nuevos guardados en Supabase y comprobados por sus huellas:
  `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`,
  `DRIVE_OAUTH_ENCRYPTION_KEY` y `DRIVE_OAUTH_ADMIN_SECRET`.
  Copia de instalación local en `.private/probe-credentials/drive-oauth.json`,
  excluida de Git y con acceso NTFS restringido al usuario de Windows.
- Migración `20260828132000_web1_drive_oauth.sql` aplicada desde SQL Editor:
  esquema privado, dos tablas con RLS y seis RPC disponibles solo para
  `service_role`. Auditoría SQL: 2 tablas protegidas, 6 RPC, 0 RPC accesibles
  por `anon` o `authenticated`. No contiene filas del Excel.
  Aplicación manual: no se registró mediante Supabase CLI. No volver a aplicar
  el archivo; reconciliar el historial de migraciones antes de usar `db push`.
- Función `drive-oauth` desplegada. `verify_jwt=false` permite el retorno de
  Google: el inicio/verificación exigen una credencial de ingeniería;
  lanzamiento/retorno exigen tickets y estados de un solo uso, vigencia de
  diez minutos, PKCE y cookie Secure/HttpOnly/SameSite=Lax.
- El usuario de Google observado fue `Almacen@arlessas.com`; en Picker se
  seleccionó exclusivamente `MA-F-009 PROGRAMACIÓN DE LABORES CAMPO.xlsx`.
  El servidor confirmó correo, permiso exacto, ID y tipo XLSX antes de guardar
  el refresh token cifrado con AES-256-GCM. Nunca se devolvió al navegador.
- Renovación forzada desde servidor: **HTTP 200**, 2026-08-28 13:25:10 UTC
  (08:25 en Colombia). `connected=true`, `refreshed=true`.
  Metadatos: ID `1ZJKtvkmo7fddZi4CS30vcaXXZSOTuIzz`, 1.918.842 bytes,
  última modificación 2026-08-27T18:25:15.865Z, sin cambios respecto al maestro
  previamente observado. Esta verificación no descarga ni modifica el archivo.

Validación: 24 pruebas completas aprobadas y, tras corregir compatibilidad de
POST vacío de Deno, 13 pruebas OAuth aprobadas (incluyen una nueva regresión;
25 casos totales en el repositorio). Los 57 archivos originales del escritorio
se verificaron sin cambios. Instalación de dependencias: 0 vulnerabilidades
reportadas por npm en ese momento, no garantía de seguridad futura.

Seis barreras remotas aprobadas después de la corrección: 401 sin credencial,
401 con credencial incorrecta, 401 para verificación sin credencial, 400 sin
estado, 400 con estado inexistente y 400 sin ticket. El inicio autorizado
respondió 200. Los dos intentos previos 400 se conservan como evidencia del
fallo de compatibilidad, no como pruebas aprobadas.

Evidencias privadas (sin secretos en sus contenidos):

- `.private/evidence/oauth-acl-2026-08-28.txt`.
- `.private/evidence/drive-oauth-gates-1787923405722.json`.
- `.private/evidence/drive-oauth-start-1787923406823.json`.
- `.private/evidence/drive-oauth-verify-1787923510726.json`.

Artefacto desplegado tras la corrección: 13.667 bytes, SHA-256
`3a6f8608700ae3f19cc8c805f02631cba72c3215d6a5bddb776dfcf22339355a`.
No contiene credenciales literales; se construye con
`node scripts/build-drive-oauth.mjs`. La biblioteca oficial de Google está
fijada a `google-auth-library@11.0.2`.

## Operación de ingeniería

Con las credenciales locales autorizadas, sin mostrarlas en terminal:

```powershell
node scripts/check-drive-oauth.mjs gates
node scripts/check-drive-oauth.mjs verify
```

`start` guarda un enlace de uso único en una ruta privada, no lo imprime.
Si ya existe conexión, el inicio devuelve 409 y no la reemplaza.
No hay desconexión, revocación ni sustitución automática: deben diseñarse
para el relevo al ingeniero y confirmarse antes de modificar el acceso activo.

## Pendientes

- La app Google permanece externa y en Prueba. Con permisos Drive, Google
  documenta caducidad de siete días para el refresh token en ese estado.
  No se promete conexión indefinida ni se cambió a Producción.
- El ingeniero todavía debe autorizar su propia conexión; no se usó su correo.
- Persistencia y sincronización programada implementadas posteriormente;
  evidencia de los ciclos, medición y cierre técnico en `WEB_1_SINCRONIZACION.md`.
- Login de aplicación, frontend y Gantt no se han implementado en este paso.

Los apartados siguientes conservan la revisión y propuesta previa como contexto.

## Verificado sin cambios remotos

- Proyecto Google Cloud `control-labores-arles`, número `433631251791`, activo.
- Drive API y Google Picker API habilitadas.
- Sesión del panel cambiada a `Almacen@arlessas.com`, con acceso al proyecto.
  El bloqueo MFA visto inicialmente correspondía a la otra cuenta, Vivero;
  no se modificó la seguridad de ninguna cuenta.
- Existe un único cliente OAuth: `Control de Labores Arles Windows`, tipo
  Escritorio. No se abrió, copió ni modificó su secreto.
- Público: externo, estado Prueba; único usuario de prueba
  `Almacen@arlessas.com`. El ingeniero todavía no está agregado.
- Google muestra advertencia de configuración de marca incompleta.
  Nombre, asistencia y contacto del desarrollador están presentes; página
  principal, política de privacidad, condiciones y dominios están vacíos.
  No se ha demostrado cuál de esos campos provoca la advertencia ni se
  introducirán direcciones ficticias o páginas que aún no existan.

## Configuración propuesta previamente y autorizada

1. Crear un cliente de tipo Aplicación web llamado
   `Control de Labores Arles Web - Drive`, separado del escritorio.
2. Preparar una función de servidor `drive-oauth` en el Supabase existente
   `dziwhbjyvxdbplthpazt`, con retorno exacto:
   `https://dziwhbjyvxdbplthpazt.supabase.co/functions/v1/drive-oauth/callback`.
   Función creada durante la ejecución descrita arriba. No confundir este retorno de Drive con
   `/auth/v1/callback`, que corresponde al login de Supabase.
3. Solicitar únicamente `https://www.googleapis.com/auth/drive.file` y acceso
   offline. Seleccionar el maestro `1ZJKtvkmo7fddZi4CS30vcaXXZSOTuIzz` mediante
   Google Picker y validar en servidor su ID y el correo autorizante.
4. Usar primero `almacen@arlessas.com`; el consentimiento definitivo del
   ingeniero necesita su participación posterior. No agregar otros usuarios
   ni retirar accesos existentes como efecto de esta prueba.
5. Mantener secreto de cliente y clave de cifrado exclusivamente en secretos
   del servidor; token renovable cifrado y estado temporal de uso único en
   almacenamiento restringido al backend. Ningún secreto en GitHub, Vercel
   frontend, respuestas públicas, historial de comandos o registros.
6. Probar rechazo de estados inválidos/repetidos, cuentas/archivos ajenos,
   renovación de token y lectura de metadatos del maestro. No declarar
   conexión completada por el solo mensaje de consentimiento de Google.

Advertencia que debe conocer el usuario: `drive.file` permite crear/modificar
los archivos autorizados, aunque limita su alcance por archivo. No es un
permiso de solo lectura. La aplicación se limitará por código a consultas y
descarga del maestro; no implementará escritura, borrado ni cambios de
permisos. No se solicitará `drive.readonly`, que da lectura de todo Drive.

La prueba no cambia el estado Prueba a Producción. En apps externas en Prueba,
Google documenta caducidad de siete días para tokens renovables con permisos
de Drive; por tanto, esta prueba no demuestra operación indefinida. Resolver
la publicación sostenida exige una revisión posterior y autorización expresa.

## Fuentes oficiales consultadas

- [Permisos de Drive y almacenamiento de tokens](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [Picker con retorno OAuth y selección de archivos](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker).
- [Consulta de identidad Drive con drive.file](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get).
- [OAuth para servidor web](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Caducidad de tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

La revisión inicial fue de solo lectura; la ejecución posterior creó los
recursos enumerados arriba. No se alteraron el contenido del maestro, sus
permisos de uso compartido ni la aplicación de escritorio. Sí se otorgó a
la nueva aplicación el consentimiento OAuth expresamente autorizado.

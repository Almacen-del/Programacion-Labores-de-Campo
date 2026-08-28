# Proyectos web — actualización del 28 de agosto de 2026

## Referencias y alcance

| Elemento | Referencia | Verificación |
|---|---|---|
| Carpeta de trabajo | `C:\Users\Almacen\Documents\ChatGPT\Arles Control Web\Programacion Labores de Campo` | Archivos y repositorio Git presentes |
| GitHub | [Almacen-del/Programacion-Labores-de-Campo](https://github.com/Almacen-del/Programacion-Labores-de-Campo) | Remoto coincide; repositorio PUBLIC; rama principal `main` |
| Supabase | [dziwhbjyvxdbplthpazt](https://supabase.com/dashboard/project/dziwhbjyvxdbplthpazt) | Sesión disponible; proyecto Healthy; organización Free |
| Vercel | [programacion-labores-de-campo](https://vercel.com/almacen-2787s-projects/programacion-labores-de-campo) | Sesión disponible; equipo Hobby; GitHub conectado |

Supabase muestra `Gestion labores de campo`, cómputo nano en Oregon,
organización `Gestion Labores de Campo` y cuenta conectada `Almacen-del`.
En esta revisión: 26 MB / 500 MB de base, 0 GB / 1 GB de archivos,
0 GB / 5 GB de salida y 0 usuarios activos. Son lecturas del panel, no una
garantía de cuota futura. El panel indica que no hay migraciones ni respaldos.

Vercel muestra equipo `almacen-2787's projects`, plan Hobby, repositorio
correcto y despliegue Ready del commit `3937de3`. Sin embargo,
[la dirección publicada](https://programacion-labores-de-campo.vercel.app)
devuelve `404 NOT_FOUND`. El proyecto está configurado como `Other`, sin
comando de build ni directorio de salida sobrescritos. El código remoto de
WEB 1 aún no contiene una interfaz/index de la aplicación: Ready no significa
que el Cuadro de Control esté funcionando.

La cuenta de administración de los servicios no se toma automáticamente como
una identidad autorizada para la aplicación. Las dos cuentas aprobadas por
el usuario se detallan a continuación.
Actualización con autorización expresa: se desplegó únicamente `web1-probe`
y se configuraron dos valores propios en los secretos de Supabase. La función
valida su credencial dedicada y la copia exacta del Excel. Prueba real correcta;
véase [evidencia del despliegue](WEB_1_PRUEBA_PRIVADA.md).
No se hicieron commits, push, cambios de facturación ni despliegues Vercel
por parte del asistente. Los commits locales creados por el usuario se preservan.

## Acceso aprobado durante pruebas y entrega

| Correo | Finalidad | Duración prevista |
|---|---|---|
| `almacen@arlessas.com` | Administrador temporal de pruebas | Desarrollo y aceptación |
| `dir.siembrasnuevas@arlessas.com` | Ingeniero, usuario definitivo | Uso personal posterior a la entrega |

El usuario no tiene acceso al correo del ingeniero todavía. Se pueden hacer
las pruebas disponibles con la cuenta temporal; el inicio de sesión real del
ingeniero debe realizarlo él y permanece pendiente. No se solicitarán sus
contraseñas ni se simulará ese acceso como prueba aprobada.

Solo estas dos identidades están aprobadas durante pruebas. No se permiten
por ello todos los correos del dominio ni registro público. Los privilegios
de la aplicación no implican permisos de propietario de Supabase, Vercel,
GitHub, Google Cloud o Drive, ni acceso del navegador a secretos de servidor.

El retiro del administrador temporal se preparará como parte de la entrega,
después de verificar acceso y funcionamiento con el ingeniero y de confirmar
el cierre con el usuario. No se revoca ni elimina ninguna cuenta ahora.
La operación definitiva debe quedar sin depender de sesiones o credenciales
personales del administrador temporal. Antes del retiro se comprobará quién
mantendrá el consentimiento de Drive y la renovación de su acceso; autorizar
la entrada a la web no otorga por sí mismo permisos sobre el maestro.

Estado: cuentas registradas como decisión de diseño, no creadas ni habilitadas
todavía. No se enviaron invitaciones ni se cambiaron permisos de usuarios.
La prueba privada posterior se autorizó por separado y usa una credencial
de ingeniería, no el login de estas cuentas.

## Condición de costo cero para Vercel

El usuario aporta Vercel para el frontend en lugar de la propuesta inicial
de Cloudflare Pages. Supabase continúa como backend y lugar propuesto para
las tareas programadas; el frontend no asume ese trabajo.

La documentación oficial del [plan Hobby](https://vercel.com/docs/plans/hobby)
y las [reglas de uso](https://vercel.com/docs/limits/fair-use-guidelines)
restringen Hobby al uso personal no comercial y requieren Pro o Enterprise
para uso comercial. Un solo usuario no elimina esa restricción.

El usuario aclara expresamente que será una herramienta personal para una
sola persona, sin uso de administrativos y sin beneficio empresarial previsto;
su finalidad es automatizar su propio trabajo. Este es el alcance de diseño
vigente y se continúa la preparación técnica con Vercel Hobby.
La declaración no se presenta como una aprobación emitida por Vercel.
Si cambia el uso, se revisarán las condiciones antes de ampliar el acceso.
No se autoriza un cambio a pago. El carácter personal tampoco hace públicos
los datos del maestro: se mantiene el acceso exclusivo y la lectura de Drive.

## GitHub y privacidad

El repositorio es público según GitHub. En el índice actual no aparecen el
maestro Excel, `.private/`, `.env*`, `node_modules/`, `dist/`, SQLite ni
credenciales OAuth. Las exclusiones se comprobaron con Git.

Se amplía `.gitignore` para archivos locales de Vercel, Excel y tipos comunes
de credenciales. Esto no sustituye revisar cada cambio antes de publicarlo
ni protege archivos que hubieran sido versionados previamente.

Se incorpora una referencia de pruebas que contiene únicamente el código
del lector de escritorio y sus tipos. Así `npm test` no exige subir el
respaldo privado ni los datos reales a GitHub.

El script de verificación del escritorio usa el origen guardado en su
manifiesto: ya no depende de que el proyecto web sea una carpeta hermana.

## Pendientes para continuar WEB 1

1. Sesiones y planes verificados en ambos paneles; no repetir el inicio de sesión.
2. Cuentas confirmadas: administrador temporal e ingeniero según la tabla.
   Falta implementar y probar su autenticación; la prueba real del ingeniero
   requiere su participación cuando tenga disponibilidad.
3. Prueba privada desplegada y ejecutada; ver [guía de la prueba](WEB_1_PRUEBA_PRIVADA.md).
   Doce pruebas locales aprobadas; 401/401/422 y ejecución real 200 en Edge.
4. Mantener el alcance personal declarado y el límite de costo cero.
5. OAuth web separado creado con autorización concreta; token renovado y
   lectura de metadatos comprobada con la cuenta temporal. Ver `WEB_1_OAUTH.md`.
   No se reutilizaron credenciales del escritorio. Falta resolver el estado
   Prueba para uso sostenido y posteriormente el relevo al ingeniero.
6. Persistencia privada y Cron cada cinco minutos activos. Dos ciclos reales
   con páginas cerradas verificados a las 13:55 y 14:00 UTC. Medidas y límites
   en `WEB_1_SINCRONIZACION.md`; viabilidad favorable para el piloto en Free,
   no garantía de operación permanente ni consumo mensual completo medido.

No se inicia WEB 2, no se compran servicios y no se toca el programa de
escritorio como consecuencia de esta actualización.

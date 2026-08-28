# WEB 2 — Base privada publicada

Fecha: 28 de agosto de 2026. Implementada por autorización expresa del usuario.

Aplicación: https://programacion-labores-de-campo.vercel.app
Despliegue Vercel de producción Ready: `dpl_4i5bFaqhzNBPP4Vv4cAfSQQneyZG`.

## Entregado

- Inicio de sesión Google privado para `almacen@arlessas.com` (pruebas) y
  `dir.siembrasnuevas@arlessas.com` (ingeniero). No se habilita todo el dominio.
- Cuadro de control con 6.269 registros: 5.943 válidos, 148 observados y
  178 bloqueados; 529 alertas, sin corregir el maestro silenciosamente.
- Registros paginados, filtros por fechas, lote, labor y validación;
  detalle con hoja, fila y valores originales. Alertas e historial de sincronización.
- Consulta de estado cada minuto mientras la página está visible. La revisión de
  Drive continúa cada cinco minutos en servidor, incluso con el navegador cerrado.
- Gantt, Lotes, Indicadores, Inventario y Reportes aparecen claramente pendientes.
  La pestaña de inventario está reservada, sin inventar existencias.

## Acceso y protección

Google habilitado en Supabase; proveedor Email y usuarios anónimos deshabilitados.
Hook Before User Created activo con lista explícita de dos correos. RLS valida
usuario real, email confirmado e identidad Google verificada, no solo el email del JWT.
API pública de consultas SECURITY INVOKER; sin permisos de escritura para usuarios.
Seis tablas protegidas por RLS. El esquema de sincronización y sus secretos siguen privados.

Cliente OAuth de login separado de Drive y del escritorio:
`Control de Labores Arles Web - Acceso privado`.
Callback Google: `https://dziwhbjyvxdbplthpazt.supabase.co/auth/v1/callback`.
Site URL: URL de producción indicada arriba. Redirecciones exactas autorizadas:
`https://programacion-labores-de-campo.vercel.app/auth/callback` y
`http://127.0.0.1:5173/auth/callback`; sin comodines.

Login PKCE, sesión en sessionStorage, datos operativos solo en memoria.
Frontend contiene únicamente URL y clave publicable de Supabase. Secretos OAuth
permanecen privados/servidor y se excluyen del repositorio y despliegue frontend.
CSP, noindex, nosniff, protección contra marcos y callback no-store verificados.

## Verificación realizada

- 48 pruebas automáticas aprobadas: 36 existentes y 12 PostgreSQL/RLS nuevas.
- Compilación TypeScript/Vite correcta; producción Ready y rutas raíz/callback HTTP 200.
- Diagnóstico SQL alojado PASS: RLS, permisos, RPC invoker y rechazo de identidad falsificada.
- Seis comprobaciones HTTP PASS: consultas/hook anónimos rechazados, JWT inválido
  rechazado y proveedores configurados correctamente.
- Login Google real con la cuenta temporal, tanto local como en producción;
  los 6.269 registros y la revisión automática de las 09:45 de Colombia fueron visibles.
- Paginación local 1–50 y 51–100 comprobada; en producción, filtro Bloqueados
  devuelve 178 registros (1–50 en primera página). No se alteró el maestro para probar cambios.
- 57 archivos del escritorio verificados sin cambios. No se modificaron sus credenciales.

Pruebas de ingeniero, usuario externo y revocación en PostgreSQL usan fixtures:
no equivalen a una sesión real del ingeniero ni a una prueba física en su Lenovo.

## Datos y espacio

La interfaz mantiene una sola proyección indexada de la versión vigente, no una copia
histórica adicional cada cinco minutos. Sin cambios no se reconstruyen sus registros.
La publicación de cambios es transaccional; un fallo conserva la versión anterior.
La proyección ocupa 6.701.056 bytes y la base completa 19.049.619 bytes en la medición
posterior a migración y primer login. Estas cifras son una medición, no una cuota garantizada.
El historial original conserva su guardia lógica de 100 MiB (aproximadamente 26 versiones
del tamaño actual), más índices/proyección y registros de ejecución. No se borró historia.

Migración aplicada manualmente en SQL Editor:
`supabase/migrations/20260828153000_web2_private_app.sql`.
No volver a ejecutarla: antes de usar migraciones CLI, reconciliar su historial con
la aplicación manual ya realizada. Diagnóstico de solo lectura disponible en
`scripts/verify-web2-security.sql`.

## Desarrollo y entrega

Instalar con `npm ci`; verificar con `npm test` y `npm run build`.
Para desarrollo, preparar variables públicas según `.env.example` y ejecutar `npm run dev`.
Nunca subir `.private`, `.env.local`, credenciales, tokens, archivos XLSX ni datos operativos.

Publicación realizada directamente con Vercel CLI sobre el proyecto existente.
Los cambios WEB 2 quedan locales, sin commit ni push realizado por el agente.
**Subir estos cambios a GitHub antes de otro despliegue automático desde main**:
el main previo no contiene WEB 2 y podría sustituir la aplicación nueva.
La cuenta CLI de GitHub consultada no tiene permiso de escritura; no se cambiaron permisos.

## Pendientes y siguiente autorización

- Aceptación del usuario y primera entrada real del ingeniero, sin suplantarlo.
- Resolver Google en estado Prueba para operación sostenida: el consentimiento de
  Drive puede caducar a los siete días. Branding muestra configuración incompleta.
  No se publicó la app OAuth ni se contrataron servicios en esta etapa.
- Relevo futuro de la cuenta temporal y conexión Drive al ingeniero; respaldos/retención.
- Verificación física en el equipo final y tamaños móviles no realizada.
- WEB 3: completar experiencia de sincronización/reconexión y aceptación de cambios reales.
  Gantt funcional corresponde a WEB 4; inventario funcional a su etapa posterior.
  Esta entrega no autoriza automáticamente implementarlos.

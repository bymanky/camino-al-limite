# Camino al Limite

Inscripciones del trail de 5 km en el marco de **Emprende Camino**, producido por **By Manky**. React + TypeScript + Vite, Supabase y GitHub Pages. Precio fijo: **$1200 UYU por equipo**, de exactamente cuatro integrantes.

## Estado de entrega

El repositorio pertenece a `bymanky/camino-al-limite`. La dirección de publicación configurada es https://bymanky.github.io/camino-al-limite/ y el backend está preparado. La conexión al proyecto real queda pendiente de seleccionar la nueva organización de Supabase. Sin variables de conexión, la web permite recorrer el formulario pero bloquea el envío y el acceso administrativo; no simula inscripciones exitosas. No se usa la base de datos de otra aplicación.

## Qué incluye

- Sitio adaptable a celular con inscripción en tres pasos.
- Equipo e integrantes guardados en una sola transacción, importe validado en servidor e intentos idempotentes.
- Pagos presenciales en Ecos Regionales o Sociedad de Fomento Rural de Flores; transferencia BROU cuenta corriente 001400338 - 00004, Ana Prat.
- Adjuntos privados de hasta 5 MB en PDF/JPG/PNG. Formato validado por cabecera del archivo y tipo declarado.
- Comprobante PDF con QR por equipo; enlace privado para volver a descargarlo. Los QR no contienen datos personales.
- Panel de administración con nombre de usuario y contraseña, recuperación de acceso, filtros, correcciones, confirmación de pagos y cancelación.
- Escaneo desde cámara, código manual y asistencia por integrante con protección contra duplicados y auditoría.
- Exportación de nómina filtrada en CSV para Excel y PDF imprimible.
- Configuración del evento, reglamento y privacidad. Las inscripciones no se abren sin publicar ambos textos.

## 1. Preparar Supabase

1. Crear un proyecto **nuevo** en la organización que elija la organización del evento. Consultar el costo de su plan antes de confirmar la creación.
2. En SQL Editor, ejecutar **una sola vez** `supabase/sql/schema.sql`. Es un esquema inicial para un proyecto vacío, no una actualización para otra aplicación.
3. El esquema crea tablas, funciones de transacción, permisos y el bucket privado `trail-receipts`. Las tablas no tienen acceso para `anon` ni `authenticated`: todo pasa por la Edge Function, que valida la sesión y el administrador.
4. En Authentication, deshabilitar la creación pública de usuarios. Los participantes se inscriben sin cuentas y no necesitan esta función.
5. En Authentication > URL Configuration, configurar como Site URL la dirección de GitHub Pages y permitir como redirect la dirección completa de recuperación: `https://bymanky.github.io/camino-al-limite/?recovery=1#/admin`. Agregar también la URL local si se prueba recuperación en desarrollo.
6. Configurar el correo de recuperación de Supabase con un proveedor SMTP de la organización. Verificar el envío real antes de abrir las inscripciones.

### Primer administrador

1. En Authentication > Users, crear o invitar al administrador usando su correo real. La contraseña la define el administrador de manera privada; no se incluye una contraseña compartida en este repositorio.
2. Copiar su UUID de usuario y ejecutar este ejemplo reemplazando el UUID y el nombre de usuario:

```sql
insert into trail_private.admins (user_id, username)
values ('UUID-DEL-USUARIO-DE-AUTH', 'organizacion');
```

El usuario debe tener entre 3 y 40 caracteres en minúsculas: letras sin tilde, números, guion, guion bajo o punto. La relación con Supabase Auth es privada. El inicio de sesión muestra solo usuario y contraseña; la recuperación llega al correo real del administrador.

Para revocar el acceso, marcar `active = false` en `trail_private.admins`. Cada operación administrativa comprueba este campo, incluso con una sesión existente. Para agregar administradores, repetir el alta privada; no existe registro público.

## 2. Publicar el backend

Usar la versión vigente de Supabase CLI y consultar su ayuda antes de ejecutar los comandos.

```text
supabase login
supabase link --project-ref REFERENCIA_DEL_PROYECTO
supabase secrets set --env-file RUTA_PRIVADA_AL_ARCHIVO_DE_SECRETOS
supabase functions deploy trail-api --no-verify-jwt
```

La configuración `verify_jwt = false` es intencional para permitir el formulario público. **Cada acción administrativa verifica el JWT con Supabase Auth y comprueba el rol privado en servidor**. Ocultar una pantalla no es la protección.

Secretos adicionales del backend (guardar fuera del repositorio y nunca en variables `VITE_`):

```text
ALLOWED_ORIGINS=https://bymanky.github.io,http://127.0.0.1:5174
TRAIL_TOKEN_SECRET=VALOR_ALEATORIO_PRIVADO_DE_AL_MENOS_32_CARACTERES
```

Generar `TRAIL_TOKEN_SECRET` con un generador criptográfico y conservarlo estable: se usa para derivar los tokens privados y QR. Cambiarlo invalida la regeneración de comprobantes anteriores. Supabase proporciona automáticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a las funciones.

Después de publicar, ejecutar los asesores de seguridad de Supabase y verificar las pruebas reales del apartado de validación.

## 3. Desarrollo local

Requiere Node 22 o posterior.

```text
npm ci
```

Copiar `.env.example` a `.env.local` y completar exclusivamente la URL y la clave **publishable** de Supabase:

```text
VITE_SUPABASE_URL=https://REFERENCIA.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE
```

```text
npm run dev -- --port 5174
npm test
npm run build
```

Nunca usar `service_role`, claves secretas o contraseñas en el frontend, en GitHub o en capturas de pantalla. La clave publishable es pública por diseño y el acceso está restringido en el servidor.

## 4. GitHub Pages

Repositorio previsto: `bymanky/camino-al-limite`.

1. En Settings > Pages, seleccionar **GitHub Actions** como origen.
2. En Settings > Secrets and variables > Actions > Variables, agregar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Subir el código a `main` o volver a ejecutar la acción **Publicar Camino al Limite**.
4. La acción instala desde el lockfile, ejecuta pruebas, compila y publica el sitio.

Dirección esperada: `https://bymanky.github.io/camino-al-limite/`. El panel se abre desde el enlace Administración o agregando `#/admin` al final.

El sitio usa rutas con `#` y recursos relativos para que funcione en la subcarpeta de GitHub Pages. La cámara requiere HTTPS o localhost y permiso del usuario.

## 5. Abrir el evento

Ingresar al panel y completar fecha, hora, largada, contacto, cierre de inscripciones, reglamento y aviso de privacidad. El tamaño del equipo es fijo: cuatro personas. Si no hay fecha o lugar se muestra «Próximamente». La fecha límite usa la hora de Uruguay (UTC-03:00). Publicar los textos aprobados por la organización y luego habilitar «Inscripciones abiertas».

No se inventan reglamentos, consentimientos ni datos del evento. Las versiones del reglamento y aviso aceptadas se guardan junto a cada inscripción. La web no envía el PDF por correo: lo entrega para descargar y mediante enlace privado.

## Validación

31 pruebas automáticas incluidas: reglas de equipos de exactamente cuatro personas, duplicados, consentimiento, CSV con ceros iniciales y protección contra fórmulas, precio validado en base, transacciones completas, reintentos sin duplicados, permisos para visitantes y usuarios comunes, autorización administrativa, auditoría, asistencia idempotente, cancelación, PDF con cuatro integrantes y QR, y paginación de la nómina. La base SQL se verifica con Postgres embebido (PGlite), con tablas de Auth y Storage de prueba; no sustituye la comprobación de los servicios reales de Supabase. También se comprobó el formulario en un navegador con pantalla de celular y se inspeccionó visualmente un PDF generado con datos ficticios.

Antes de admitir participantes reales, verificar en el proyecto final:

- Crear una inscripción con cuatro integrantes; comprobar que se rechazan equipos de uno, dos, tres o cinco.
- Descargar el PDF, volver a abrir el enlace privado y escanear el QR desde otro celular.
- Adjuntar una transferencia y revisar que solo administradores puedan acceder al archivo.
- Confirmar un pago, corregir una inscripción y revisar `trail_audit`.
- Escanear dos veces y comprobar que la hora de asistencia no cambia.
- Cancelar una inscripción y comprobar que no admite nuevos ingresos.
- Probar recuperación de contraseña y acceso con usuario sin permisos.
- Exportar la nómina, probar una conexión interrumpida y reintentar sin duplicar.
- Verificar la dirección publicada, cámara y descarga en Android e iPhone.

## Notas operativas

- El enlace del comprobante funciona como una credencial privada de lectura: no compartir públicamente. Muestra equipo e integrantes, pero no documentos ni contactos.
- Los PDFs reflejan el estado al momento de emisión. La verificación siempre consulta el estado actual.
- Sin conexión no se permite validar asistencia. El panel muestra una advertencia ante pagos pendientes.
- No hay aprobación automática de pagos, integración bancaria ni correo de confirmación automática.
- El límite antispam es de 8 envíos de inscripción por IP cada 15 minutos; login 10 y recuperación 4. Revisar el límite si muchos equipos se inscriben desde una misma red.
- Para pruebas, usar documentos ficticios y un proyecto dedicado. No subir datos reales a GitHub.
- Fuentes de Google Fonts con tipografías de respaldo; la ilustración del paisaje está incluida como SVG, sin depender de fotos externas.

## Referencias técnicas

- [Seguridad en Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Recuperación de contraseñas](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)

# Autenticación y autorización

Este documento registra las decisiones confirmadas sobre autenticación, gestión de cuentas y autorización para la aplicación base reutilizable.

## Registro

- El registro público está habilitado.
- El registro requiere nombre, correo electrónico y contraseña.
- El correo electrónico debe ser único.
- Las contraseñas se almacenan únicamente mediante hashes seguros.
- Las cuentas nuevas quedan activas inmediatamente y reciben un rol predeterminado configurable sin privilegios administrativos.
- El registro tendrá limitación de intentos.
- La verificación del correo electrónico queda fuera del alcance inicial.

## Sesiones

- Las sesiones utilizan un access token de corta duración y un refresh token.
- El access token se conserva únicamente en la memoria del frontend.
- El refresh token se almacena en una cookie `HttpOnly`, `Secure` y `SameSite`.
- Los tokens nunca se almacenan en `localStorage`.
- Los tiempos predeterminados son configurables: 15 minutos para el access token y 7 días para el refresh token.
- El refresh token rota en cada renovación y el token anterior queda invalidado.
- Solo se almacenan hashes de los refresh tokens para permitir la revocación segura de sesiones.

## Roles y permisos

- Cada usuario tiene exactamente un rol a la vez.
- Los administradores pueden crear roles y asignarles permisos.
- Los roles son datos configurables; los permisos son definidos por la aplicación.
- No se pueden crear permisos arbitrarios desde la interfaz de administración.

## Administración de usuarios

Los administradores autorizados pueden:

- Crear usuarios.
- Editar los datos del perfil de un usuario.
- Cambiar el rol de un usuario.
- Desactivar y reactivar cuentas.
- Asignar una contraseña temporal que deberá cambiarse en el siguiente inicio de sesión.

Los usuarios no se eliminan permanentemente. Desactivar una cuenta revoca todas sus sesiones activas, pero conserva su historial y sus relaciones.

## Cambio de contraseña

- Los usuarios autenticados pueden cambiar su contraseña después de confirmar la contraseña actual.
- Un cambio de contraseña exitoso revoca todas las demás sesiones activas.
- La recuperación de contraseña por correo electrónico queda fuera del alcance inicial.

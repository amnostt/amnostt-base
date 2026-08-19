# Autenticación y autorización

Este documento registra las decisiones confirmadas sobre autenticación, gestión de cuentas y autorización para la aplicación base reutilizable.

## Alcance del contrato mínimo

La implementación inicial abarca únicamente los modelos mínimos de identidad, login, refresh, logout, `/auth/me`, el principal autenticado, los permisos con alcance `own` y `any`, y la revocación de sesiones. Las decisiones sobre registro, administración de usuarios y roles, cambio o recuperación de contraseña y otras funciones avanzadas se conservan como referencia futura, pero no forman parte de las etapas 2–4 del plan de implementación del CRUD.

## Registro

- El registro público está habilitado.
- El registro requiere nombre, correo electrónico y contraseña.
- El correo electrónico debe ser único.
- Las contraseñas se almacenan únicamente mediante hashes seguros.
- Las cuentas nuevas quedan activas inmediatamente y reciben un rol predeterminado configurable sin privilegios administrativos.
- El registro tendrá limitación de intentos.
- La verificación del correo electrónico queda fuera del alcance inicial.

## Modelo mínimo de identidad

`User` contiene únicamente los datos necesarios para autenticar una cuenta y construir el principal:

- `id`.
- `name`.
- `email`.
- `passwordHash`.
- `isActive`.
- Una relación obligatoria con un `Role`.

`Role` contiene:

- `id`.
- `name`.
- Una relación con los permisos que tiene asignados.

`Permission` contiene:

- `id`.
- `code`, definido por la aplicación, por ejemplo `tasks:read:own`.

`Session` contiene:

- `id`.
- Una relación obligatoria con un `User`.
- `refreshTokenHash`.
- `expiresAt`.
- `revokedAt`, nullable.

Una sesión está activa cuando no ha expirado y `revokedAt` es nulo.

## Sesiones

- El inicio de sesión acepta exclusivamente `email` y `password`.
- Un inicio de sesión exitoso devuelve el access token junto con el principal autenticado.
- Una cuenta desactivada se trata como no autenticada: no puede iniciar sesión ni obtener el principal mediante `/auth/me`, aunque presente credenciales o un access token válidos.
- Las sesiones utilizan un access token de corta duración y un refresh token.
- El access token se conserva únicamente en la memoria del frontend.
- El access token identifica al usuario y a la sesión, pero no es la fuente confiable de roles o permisos; cada acceso protegido comprueba que la cuenta y la sesión siguen activas y resuelve los permisos vigentes en el backend.
- El refresh token se almacena en una cookie `HttpOnly`, `Secure` y `SameSite`.
- Los tokens nunca se almacenan en `localStorage`.
- Los tiempos predeterminados son configurables: 15 minutos para el access token y 7 días para el refresh token.
- El refresh token rota en cada renovación y el token anterior queda invalidado.
- La reutilización de un refresh token ya rotado revoca toda la sesión asociada y exige iniciar sesión nuevamente.
- Solo se almacenan hashes de los refresh tokens para permitir la revocación segura de sesiones.

## Principal autenticado

El backend construye el principal autenticado exclusivamente a partir de la cuenta, la sesión y los permisos vigentes. En los contratos de la API, este mismo principal se expone como `currentUser`; no constituye un modelo diferente. Su estructura mínima es:

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "User",
  "role": "member",
  "permissions": ["tasks:read:own"]
}
```

## Endpoints mínimos

### `POST /auth/login`

Autentica una cuenta activa mediante:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Un login exitoso responde con `200 OK`, establece el refresh token mediante una cookie segura y devuelve:

```json
{
  "accessToken": "access-token",
  "currentUser": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User",
    "role": "member",
    "permissions": ["tasks:read:own"]
  }
}
```

El login responde con el mismo `401 Unauthorized` genérico cuando el correo no existe, la contraseña es incorrecta o la cuenta está desactivada, sin revelar cuál de esas condiciones ocurrió.

### `POST /auth/refresh`

No recibe un cuerpo; utiliza exclusivamente el refresh token almacenado en la cookie segura.

Una renovación exitosa responde con `200 OK`, invalida el refresh token anterior, establece uno nuevo en la cookie y devuelve únicamente un nuevo access token:

```json
{
  "accessToken": "access-token"
}
```

La identidad actual se obtiene mediante `/auth/me`; refresh no devuelve `currentUser`.

Refresh responde con un `401 Unauthorized` genérico y elimina la cookie cuando el refresh token falta, es inválido o expiró, ya fue rotado, pertenece a una sesión revocada o corresponde a una cuenta desactivada.

### `POST /auth/logout`

No recibe un cuerpo ni requiere un access token vigente; utiliza la cookie del refresh token para identificar la sesión cuando sea posible.

Logout revoca la sesión asociada cuando existe, elimina siempre la cookie y responde con `204 No Content`. La operación es idempotente: una cookie ausente, inválida o asociada a una sesión ya revocada produce la misma respuesta.

### `GET /auth/me`

Requiere un access token válido y obtiene el principal únicamente cuando la cuenta y la sesión continúan activas.

Una consulta exitosa responde con `200 OK`:

```json
{
  "currentUser": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User",
    "role": "member",
    "permissions": ["tasks:read:own"]
  }
}
```

`/auth/me` responde con un `401 Unauthorized` genérico cuando falta el access token, el token es inválido o expiró, la sesión fue revocada o expiró, o la cuenta está desactivada.

## Verificación de login e identidad

Esta unidad queda cerrada cuando se pueden verificar los siguientes escenarios:

1. Credenciales válidas y una cuenta activa producen un login `200 OK`, establecen la cookie del refresh token y devuelven el access token junto con `currentUser`.
2. Credenciales inválidas o una cuenta desactivada producen un login `401 Unauthorized` sin emitir tokens.
3. Un access token válido asociado a una sesión y una cuenta activas permite que `/auth/me` responda `200 OK` con `currentUser`.
4. Un access token inválido o expirado, una sesión revocada o expirada, o una cuenta desactivada hacen que `/auth/me` responda `401 Unauthorized`.

## Verificación de renovación y cierre de sesión

Esta unidad queda cerrada cuando se pueden verificar los siguientes escenarios:

1. Un refresh token válido asociado a una sesión y una cuenta activas produce un `200 OK`, un nuevo access token y la rotación de la cookie.
2. Un refresh token ausente, inválido o expirado, una sesión revocada o una cuenta desactivada producen un `401 Unauthorized`, eliminan la cookie y no emiten un nuevo token.
3. La reutilización de un refresh token ya rotado produce un `401 Unauthorized` y revoca completamente la sesión asociada.
4. Logout con una sesión vigente produce un `204 No Content`, revoca la sesión y elimina la cookie; cualquier refresh posterior falla.
5. Logout sin cookie, con una cookie inválida o con una sesión ya revocada produce igualmente un `204 No Content` y elimina la cookie.

## Roles y permisos

- Cada usuario tiene exactamente un rol a la vez.
- Los permisos efectivos de un usuario son exactamente los permisos asignados a su rol; no se conceden ni deniegan permisos directamente a usuarios en esta etapa.
- Los administradores pueden crear roles y asignarles permisos.
- Los roles son datos configurables; los permisos son definidos por la aplicación.
- No se pueden crear permisos arbitrarios desde la interfaz de administración.
- Cada permiso usa el formato `<resource>:<action>:<scope>`, por ejemplo `tasks:read:own` o `tasks:update:any`.
- El alcance solo puede ser `own` o `any`.
- `own` permite la acción únicamente cuando `resource.ownerId` coincide con `currentUser.id`.
- `any` permite la acción sobre cualquier recurso y también cubre los recursos propios.
- Un usuario autenticado que no posee el permiso requerido recibe `403 Forbidden`.
- La decisión de ocultar recursos ajenos mediante `404 Not Found` pertenece al contrato específico de cada recurso y queda fuera de este documento.

## Verificación de autorización

Esta unidad queda cerrada cuando se pueden verificar los siguientes escenarios:

1. `tasks:read:own` permite leer una tarea cuyo `ownerId` coincide con `currentUser.id`.
2. `tasks:read:own` rechaza la lectura de una tarea cuyo `ownerId` pertenece a otro usuario.
3. `tasks:read:any` permite leer tanto tareas propias como ajenas.
4. Un usuario autenticado sin permiso para la acción recibe `403 Forbidden`.
5. Un cambio en los permisos asignados al rol se refleja en la siguiente petición porque el backend vuelve a resolver los permisos vigentes.
6. Una cuenta o sesión inactiva produce `401 Unauthorized` antes de evaluar permisos.

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

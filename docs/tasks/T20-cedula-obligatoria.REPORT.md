# T20 — Cédula obligatoria de todo firmante

Fecha: 10 de noviembre de 2026.

## Resultado y alcance

La API exige una cédula válida para cada firmante enviado por HTTP, incluidos
testigos. Los contratos históricos siguen admitiendo lectura y copia sin cédula;
sus borradores no pueden enviarse a aprobación hasta completarla.

Se leyeron `docs/CODE_STANDARDS.md`, `docs/PRINCIPIOS.md`, la tarea T20 y los
informes T17 y T19. La implementación y las pruebas se limitaron a `api/`;
este informe es la única escritura de la tarea fuera de ese directorio.
Esta tarea no modificó `src/`, no hizo commit, no leyó `api/.env` ni imprimió
secretos. No se añadieron dependencias ni migraciones.

Durante la ejecución se observaron cambios ajenos en `src/`; se dejaron intactos
y no forman parte de esta entrega.

## Contrato HTTP

Todas las rutas conservan el prefijo `/api/v1`, los permisos y las protecciones
de sesión existentes. El error conserva la forma común:

```ts
{ error: { code: string; message: string; details?: unknown } }
```

### Crear y editar

**`POST /contracts`** exige `signatories[].cedula: string` para todas las personas.
**`PATCH /contracts/:id`**, cuando incluye `signatories`, exige lo mismo en cada
elemento del array completo de reemplazo. No hay excepción por rol, casilla,
testigo adicional ni formato documental.

Se reutiliza el validador dominicano existente: normalización a once dígitos,
validación de formato y dígito verificador. Se admiten las cédulas con guiones
aceptadas previamente y se persisten normalizadas. Se conserva el rechazo de
cédulas duplicadas dentro del contrato y las reglas de vinculación de identidad
por correo confirmado.

Cédula omitida, null, vacía, solo espacios, con formato inválido o dígito
verificador incorrecto: **400 `VALIDATION_ERROR`**, con `details` como array de
`{ field, message }`. El campo señala el índice exacto, por ejemplo:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "details": [
      {
        "field": "signatories.3.cedula",
        "message": "Escribe un texto válido."
      }
    ]
  }
}
```

El ejemplo corresponde a una cédula omitida o null; los strings inválidos
reciben el mensaje específico del validador. El rechazo ocurre antes de escribir
contrato, personas o versión.

Omitir `signatories` del PATCH conserva los datos de personas históricos y permite
editar los demás campos admitidos. No obliga a corregir la cédula para guardar
una edición de metadatos.

### Detalle y envío a aprobación

**`GET /contracts/:id`**, y las respuestas que reutilizan ese detalle, añaden:

```ts
{
  missingCedula: string[];
  can: {
    submit: boolean;
    // Las demás capacidades conservan su forma.
  };
}
```

`missingCedula` contiene los nombres de quienes tienen cédula null, vacía o solo
espacios, en el orden de firmantes del detalle. Si un nombre histórico está vacío,
usa el ID contractual del firmante. Cuando no falta ninguna, devuelve `[]`.
`can.submit` es false si falta alguna cédula; con todas completas sigue dependiendo
del rol, responsable y estado contractual existentes. El campo no se añade a
listados ni a respuestas de verificación pública.

**`POST /contracts/:id/submit`** devuelve **409 `CONFLICT`** para un borrador o
contrato devuelto al que falte alguna cédula. Mensaje:

```text
Falta la cédula de <nombre o ID>[, <nombre o ID>...]. Completa los datos de los firmantes antes de enviar a aprobación.
```

La comprobación ocurre con el contrato bloqueado, dentro de la transacción,
antes de crear aprobación, cambiar estados de firmantes o enviar notificaciones.
No basta con la capacidad informativa del detalle. Los actores sin permiso
conservan sus respuestas 403/404, sin recibir este mensaje con nombres.

El override administrativo hacia `pending_approval` aplica la misma comprobación
para que esa vía tampoco permita enviar un borrador incompleto a aprobación.

### Contratos antiguos, enmiendas y renovaciones

La creación de enmiendas y la aprobación de renovaciones continúan copiando
firmantes históricos sin cédula a un contrato nuevo en `draft`. No se hace
obligatoria la columna de BD ni se revalidan las copias con el esquema HTTP.

El hijo muestra `missingCedula` y `can.submit: false`. Para corregirlo, enviar
PATCH con el array completo de firmantes y sus cédulas válidas. El detalle pasa
a `missingCedula: []`, permite submit según los permisos y el siguiente envío
devuelve 200 con estado `pending_approval`.

La corrección se aplica al borrador hijo. El original conserva sus personas,
contenido, evidencia, PDF, sello y verificación.

## Implementación y decisiones

- `signatory` es el esquema HTTP con cédula obligatoria. `InternalSignatory`
  permite omitirla en la preparación interna de personas y en la reconciliación
  de copias históricas. `PreparedSignatory` conserva esa compatibilidad.
- `cedula.ts` centraliza la detección y el conflicto. Capacidades, detalle,
  submit y override comparten esa regla, sin duplicar validadores de documentos.
- Los fixtures HTTP de T13/T15 y el fixture de firma de T18 usado también por T17
  ahora incluyen la cédula sintética válida que genera `testCedula()` para su
  usuario. No se debilitan las expectativas ni los controles de identidad.
- No se reescriben documentos, versiones ni evidencia histórica; tampoco se
  cambia la validación pública ni se usa la cédula para conceder acceso.
- No quedan dudas pendientes ni atajos intencionales.

## Verificación

Todos los comandos npm y las pruebas se ejecutaron desde
`C:/Program Files/Git/bin/bash.exe`. Dotenv apuntó a un archivo inexistente.
`DATABASE_URL_TEST` se mantuvo heredada y se validó sin imprimirla:
PostgreSQL local `simaud_test2`, `127.0.0.1:55433`.

| Comprobación en `api/` | Resultado final |
| --- | --- |
| `npm run typecheck` | Correcto, salida 0. |
| `npm run format:check` | Correcto para todo `src` y `test` de la API, salida 0. |
| `npm run build` | Correcto, salida 0. |
| `npm test -- --reporter=verbose` | **69/69 archivos; 733 pruebas aprobadas, una omitida, cero fallos; salida 0; 353,32 s.** |
| Casos T20 dentro de la suite completa | **7/7 aprobados.** |
| `git diff --check -- api docs/tasks/T20-cedula-obligatoria.REPORT.md` | Correcto. |

La omisión corresponde a la comprobación de permisos POSIX de disco, exclusiva de
Linux. No se eliminaron pruebas, no se cambiaron umbrales y no hay comprobaciones
obligatorias pendientes. La suite final se ejecutó en un proceso nuevo, después
de cerrar el código y las pruebas.

Cobertura propia en `api/test/t20-cedula.test.ts`: siete casos, que incluyen
omisión/null/vacío/espacios/cédulas inválidas tanto en POST como en PATCH, testigos,
normalización con guiones y duplicados, rechazo sin cambios persistidos,
borradores antiguos y devueltos, permisos/opacidad, bloqueo del override,
enmiendas y renovaciones históricas que se desbloquean tras completar las personas,
y conservación de PDF y verificación pública del original sin cédula.

La primera ejecución dirigida pasó las regresiones de T13/T15/T17 y detectó dos
errores en los casos nuevos: el fixture histórico usa un nombre con dígitos y ese
nombre no es válido como entrada HTTP nueva. Se corrigió el nombre enviado al
completar el borrador; la repetición dirigida aprobó los siete casos T20.

Logs en `api/tmp/`, ignorados por git: `t20-targeted.log`,
`t20-targeted-final.log`, `t20-typecheck-final.log`,
`t20-format-check-final.log`, `t20-build-final.log` y `t20-full-suite-final.log`.

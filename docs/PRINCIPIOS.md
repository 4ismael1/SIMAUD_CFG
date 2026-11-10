# Principios de SIMAUD — lo que el sistema debe y no debe hacer

Reglas de sentido común para un sistema de **contratos legales con firma electrónica**. Son obligatorias para todo el código
(API y front, Claude y Codex). Ante la duda, gana la opción más segura y conservadora. Si una tarea contradice estos
principios, se detiene y se pregunta al dueño.

## 1. Integridad del documento
- **Lo firmado no se modifica.** Una vez que alguien firma, esa versión queda congelada. Cualquier cambio crea una versión
  nueva y vuelve a aprobación; las firmas anteriores quedan ligadas a la versión que se leyó.
- **Lo firmado no se borra.** Un contrato con al menos una firma, o que ya pasó por aprobación, **no se elimina físicamente
  nunca**, ni siquiera un administrador: se **cancela** (con motivo) o se **archiva**. Solo se pueden eliminar borradores y
  contratos devueltos sin firmas, y el borrado queda auditado.
- El PDF final es inmutable y verificable (huella SHA-256, sello del sistema, código de verificación).

## 2. Rastro de auditoría
- Toda acción relevante (crear, editar, enviar, aprobar, devolver, firmar, cancelar, archivar, cambiar rol, forzar estado,
  borrar) deja registro: quién, cuándo, desde dónde y qué cambió.
- El registro **no se edita ni se borra** desde la aplicación y sobrevive aunque se elimine el objeto (borradores).
- Las acciones excepcionales del administrador (forzar estado) exigen motivo y quedan marcadas como tales.

## 3. Mínimo privilegio
- Cada rol ve y hace solo lo suyo. **El servidor decide siempre**; el front solo oculta lo que no se puede hacer.
- Nadie se aprueba a sí mismo, nadie firma por otro ni fuera de turno, nadie se quita el último rol de administrador.
- Ante un recurso ajeno, la API responde «no encontrado» (no revela que existe).

## 4. Identidad y sesiones
- La identidad que concede acceso es el **correo confirmado** (o una invitación de un solo uso). Un dato editable por el
  usuario (cédula, nombre) nunca otorga acceso a nada.
- Cerrar sesión o cambiar la contraseña invalida el acceso al instante en todos los dispositivos afectados.
- Contraseñas con Argon2; límites de intentos por cuenta y por IP; mensajes que no revelan si una cuenta existe.

## 5. Datos personales
- Se recoge solo lo necesario. Cédulas, correos e IPs no se exponen en listados, URLs, logs ni respuestas públicas;
  en la constancia pública aparecen enmascarados.
- Las imágenes de firma se guardan **cifradas** en disco, fuera de la web, y solo se sirven a quien tiene permiso.
- Nada sensible en `localStorage` ni en la URL. Los secretos viven en variables de entorno, nunca en git ni en la BD.

## 6. Conservación
- Los contratos firmados y su evidencia se conservan **indefinidamente** por defecto (la institución definirá un plazo
  legal; hasta entonces no se purga nada firmado). La papelera de 8 días es solo para archivos de borradores y avatares.
- Las copias de seguridad están cifradas, fuera del servidor, y se prueban restaurando.

## 7. Comportamiento predecible
- Ninguna acción termina en silencio: siempre hay aviso de éxito o de error (ver `CODE_STANDARDS.md`, «Acciones»).
- Lo destructivo o irreversible se confirma; lo reversible ofrece «Deshacer».
- Las operaciones críticas son atómicas (transacción) e idempotentes: repetir una petición no duplica firmas ni aprobaciones.
- Fechas y plazos en hora de Santo Domingo; montos en decimal exacto (nunca float).

## 8. Lo que el sistema NO hace
- No envía correos a direcciones que el usuario no haya aportado o confirmado; no envía contenido del contrato por correo.
- No guarda firmas dibujadas o subidas para reutilizarlas (solo el estilo de la firma escrita, con permiso del usuario).
- No permite firmar sin leer el documento completo ni sin aceptar la declaración.
- No afirma ser «firma digital cualificada» mientras no se use un certificado de una entidad acreditada (INDOTEL).
- No carga recursos de terceros en producción (fuentes, scripts): todo autoalojado, compatible con la CSP estricta.

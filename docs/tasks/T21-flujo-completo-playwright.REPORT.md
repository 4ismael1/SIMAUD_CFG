# T21 — Recorrido completo con Playwright

## Resultado

El recorrido completo pasó dos veces desde una base limpia mediante `npm run e2e`, usando Chrome sin ventana. La última ejecución terminó con **42 pasos OK, cero fallos, 420,6 segundos de recorrido y salida 0**. Playwright informó `1 passed (7.2m)`, incluyendo su arranque y cierre.

La última carpeta es **`e2e/output/2026-11-11T01-00-27-485Z/`**, con fecha-hora UTC. Contiene cinco PDF, CSV, 50 capturas, 29 vídeos divididos por turno, las páginas renderizadas, inspecciones JSON e informe HTML. El comprobador de artefactos terminó con «Artefactos revisados sin secretos e2e.». [Resumen de la ejecución](../../e2e/output/2026-11-11T01-00-27-485Z/RESUMEN.md), [informe HTML](../../e2e/output/2026-11-11T01-00-27-485Z/html/index.html).

| Ejecución completa         | Resultado                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `2026-11-11T00-52-09-388Z` | 42 pasos OK, 423,6 s, salida 0. Incluyó un aviso EBUSY del observador de Vite.                |
| `2026-11-11T01-00-27-485Z` | 42 pasos OK, 420,6 s, salida 0. Arranque de Vite con los resultados excluidos del observador. |

| Objeto de la última ejecución             | Código                |
| ----------------------------------------- | --------------------- |
| Original enmendado                        | `CT-2026-0001`        |
| Verificación del original                 | `CEPP-36FA-5H7W-BSJA` |
| Enmienda vigente                          | `CT-2026-0001-E1`     |
| Verificación de la enmienda               | `V2PG-ZJN9-P520-JES0` |
| Segundo contrato cancelado y desarchivado | `CT-2026-0002`        |
| Borrador de renovación procesada          | `CT-2026-0003`        |
| Contrato con firmas reiniciadas           | `CT-2026-0004`        |

Los archivos son `borrador.pdf`, `final.pdf`, `copia-oficial.pdf`, `enmienda.pdf`, `alterado-un-byte.pdf` y `reportes.csv`. El original, la enmienda y la copia oficial tienen dos páginas cada uno. Se inspeccionaron visualmente sus seis páginas renderizadas, con firmas, nombres, cédulas, roles, tablas y QR legibles. La marca de copia aparece en ambas páginas y la primera página del original conserva el encabezado definido por la plantilla.

## Ejecución desde Git Bash

Ejecutar en la raíz del repositorio.

```sh
npm run e2e
npm run e2e:headed
npm run e2e:ui
```

Para abrir el último informe HTML con su servidor local de consulta:

```sh
npx playwright show-report e2e/output/2026-11-11T01-00-27-485Z/html
```

Cada comando prepara una ejecución nueva, comprueba que los puertos 3100 y 5175 están libres, compila la API dentro de `e2e/.storage/`, genera secretos y un sello de prueba, reinicia exclusivamente `simaud_e2e`, aplica las migraciones y siembra seis cuentas confirmadas. Playwright administra la API en 3100 y Vite en 5175 mediante `webServer`. Chrome usa `channel: 'chrome'`. El modo con ventana añade `slowMo` de 180 ms.

La siembra comprueba host, puerto, usuario y nombre configurados, además de `current_database()`, antes del reinicio. La API recibe un entorno construido por lista blanca y un `DOTENV_CONFIG_PATH` inexistente. Su directorio de trabajo coloca los archivos cifrados dentro de `e2e/.storage/storage/`. El proxy de Vite recibe `VITE_API_PROXY=http://127.0.0.1:3100`.

Las contraseñas y claves aleatorias se escriben en `e2e/.env.e2e`. Las claves del sello están en `e2e/.secrets/<ejecución>/`. Estos directorios, el almacenamiento y los resultados ya estaban incluidos en `.gitignore`. Se emplean las dos imágenes facilitadas en `e2e/fixtures/`.

Se requieren Node, dependencias instaladas de raíz y API, Chrome, OpenSSL y Python con PyMuPDF. Las dependencias de npm se conservan. PyMuPDF estaba disponible y se usa para extraer texto y renderizar todas las páginas descargadas. `tsx` encontraba `uv_os_get_passwd ENOMEM` en este entorno de Windows. La compilación aislada con TypeScript permite ejecutar los scripts existentes de sello y migración mediante Node.

## Cobertura implementada

- Admin crea variables y una plantilla con título, categoría, negrita, lista, tabla, datos insertados con `{{`, dos casillas con sus roles y prefijos, márgenes y vista PDF. Guarda y reabre. Visita Usuarios, Configuración, Auditoría y exporta reportes filtrados a CSV.
- Supervisor revisa panel y catálogo. Gestor completa el asistente, busca las dos personas por cédula, añade testigo, revisa el documento, guarda, descarga borrador y envía.
- Devolución con observaciones, corrección, reenvío y aprobación por supervisor.
- Primera firma subida con ajuste de tamaño y arrastre, petición individual de nueva firma, nueva firma dibujada, segunda imagen y firma escrita del testigo.
- Descarga y extracción del PDF final, nombres, cédulas formateadas, roles, páginas, imágenes, ausencia de cabecera institucional en la primera página y constancia con código y QR.
- Contexto anónimo independiente, registro de código, comparación del original, alteración exacta de un byte, rechazo y descarga de copia oficial marcada en cada página.
- Enmienda con motivo, cambio del dato de una cláusula, aprobación, tres firmas, PDF y cadena del original enmendado. Verificación pública de la sustitución E1.
- Segundo contrato cancelado con motivo y archivado/desarchivado. Renovación solicitada y procesada hasta el nuevo borrador. Notificaciones, cambio de teléfono y reinicio de firmas parciales en otro contrato.

## Decisiones de implementación

- `representante_cargo` se crea en el catálogo. Con una casilla cuyo prefijo es `representante`, T19 obtiene ese valor del usuario vinculado. Se añade `cargo_servicio`, con etiqueta «Cargo contractual», para completar un cargo como dato del contrato y modificar esa cláusula en la corrección y la enmienda. La persona institucional sembrada tiene cargo «Director administrativo».
- Los contratos se crean con fecha de fin a diez días. La enmienda vigente queda disponible para solicitar renovación. Se procesa la solicitud hasta el borrador nuevo, conforme al recorrido pedido.
- Las fechas del recorrido se fijan al inicio según `America/Santo_Domingo`.
- Cada cambio de actor cierra el contexto anterior y abre uno aislado. Las instantáneas de sesión de cada cuenta se conservan en memoria del controlador y la aplicación recupera la sesión mediante su flujo normal. Los vídeos se dividen por turno y se identifican por cuenta en el resumen. Se espacian las peticiones de negocio 680 ms para respetar el presupuesto existente de 100 peticiones por minuto por IP. Las peticiones canceladas liberan su turno. Las esperas de UI usan condiciones de Playwright.
- Una pasada que conservaba abiertos los contextos anteriores se bloqueó al volver al gestor después de la copia oficial. Los tramos completos habían pasado de forma independiente. Se cambió el controlador para mantener un único contexto abierto por turno y cerrar también sus conexiones y su grabación antes del siguiente actor.
- Se guardan capturas por paso, vídeos identificados por cuenta en `RESUMEN.md`, PDF, renderizados de páginas, CSV e informe HTML. Las trazas de la corrida sin ventana están desactivadas para proteger credenciales y sesiones. El control de contraseña se completa mediante el setter del campo y su evento de entrada, evitando que Playwright incluya el valor en el título de la acción. Un comprobador inspecciona también el ZIP interno del informe HTML buscando los secretos generados.
- Algunos informes preliminares guardaron la contraseña en títulos de acciones `fill`. Esos títulos se sanearon sin mostrar sus valores. Se corrigió la entrada privada en el código del recorrido y se comprobó el informe posterior.
- El cierre explícito utiliza únicamente los PID de los dos servicios propios registrados en la carpeta de la ejecución. Resuelve la denegación de `taskkill` del entorno al terminar los `webServer` en Windows. En modo UI los servicios permanecen disponibles durante la sesión interactiva.
- El modo UI vuelve a sembrar la base al iniciar el test, permitiendo repetirlo desde su interfaz con datos iniciales. El sello y las credenciales corresponden a la sesión interactiva preparada por el lanzador.
- Una configuración preliminar pasó un archivo de certificado a `SIGNING_TRUST_PATH`, que espera un directorio. Esto produjo un rechazo del sello durante la depuración pública. Se retiró ese parámetro, usando la confianza incorporada en el certificado activo. Las comprobaciones posteriores del original, del byte alterado y de la copia oficial pasaron.
- El observador del Vite propio excluye `e2e/**`, mediante `e2e/vite.mjs`. Se evita el aviso EBUSY que producía observar un PDF mientras se escribía. La ejecución definitiva utilizó este lanzador y completó los 42 pasos.

## Fallos y rarezas observados en la app

### Pérdida de sesión ante un 429

Una pasada inicial rápida acumuló peticiones de navegación hasta obtener 429 en renovaciones, eventos y `/me`. La pantalla volvió al login al fallar la consulta de sesión. La cadencia del recorrido evita saturar el presupuesto. El comportamiento ante 429 queda pendiente en la app. [Captura de la pérdida de sesión](../../e2e/output/2026-11-10T23-35-42-987Z/capturas/08-admin-filtra-reportes-y-exporta-csv-FALLO.png).

### Vista previa rich-v2 con undefined

La revisión del asistente mostraba literalmente `undefined`. El helper `previewContent()` reconocía `document` exclusivamente para `rich-v1`. [Captura de la vista previa](../../e2e/output/2026-11-10T23-42-08-391Z/capturas/10-gestor-crea-contrato-con-datos-firmantes-y-testigo-FALLO.png).

Durante el trabajo se incorporó externamente el commit `511a89e`, que corrige esa lectura y los datos por casilla. La implementación del recorrido conserva aserciones estrictas para el contenido y la ausencia de `undefined`.

### Ficha desactualizada después de corregir y enviar desde el asistente

Al pulsar «Enviar a aprobación» desde la edición del asistente, la ficha conservó «Borrador» y las acciones de edición y envío, aunque la petición de envío había terminado. La actualización invalida la caché antes de la petición posterior de submit, que se hace directamente desde el asistente. [Captura de la ficha desactualizada](../../e2e/output/2026-11-10T23-47-03-235Z/capturas/13-gestor-corrige-y-reenvía-FALLO.png).

El recorrido guarda primero el borrador corregido y después envía desde la ficha, mediante la acción normal que invalida la caché contractual. Se aplica el mismo procedimiento a la enmienda.

### Respuestas esperadas de las cuentas nuevas

El primer intento de recuperar sesión devuelve 401 al entrar sin cookie. La consulta de estilo de firma devuelve 404 cuando la cuenta todavía carece de estilo guardado. Se registran en el resumen como respuestas HTTP observadas.

### Inestabilidad del lienzo de dibujo en línea

En varias pasadas, el arrastre dejó un punto o un segmento breve y «Revisar y firmar» permaneció deshabilitado. También se observó que el control llegaba a habilitarse y volvía a deshabilitarse. [Captura del lienzo](../../e2e/output/debug-remainder-fifth/capturas/01-firmante-uno-vuelve-a-firmar-dibujando-FALLO.png).

El componente descartaba la tinta al recibir un cambio de tamaño. Además, su lectura de `getCoalescedEvents()` admitía una lista vacía sin recurrir a la muestra original. Esos dos comportamientos se corrigieron externamente en `7cd4b17`. Durante la depuración se verificó el lienzo ampliado. El recorrido definitivo vuelve al lienzo en línea, espera a que las fuentes estén listas y hace un trazo continuo con el ratón. Se descartó el intento de completar el trazo mediante puntos contiguos.

### Mensaje del testigo en la previsualización de firma

Para el testigo adicional, el modal dice «Este documento no tiene casillas de firma», aunque la plantilla contiene dos. También omite la etiqueta TESTIGO en esa previsualización. Su casilla adicional contiene nombre, cédula, imagen y rol correctos en el PDF final. [Captura de la previsualización del testigo](../../e2e/output/debug-remainder-sixth/capturas/firma-CT-2026-0001-WITNESS-type.png).

### Cédula de la declaración

La primera captura de dibujo mostraba la cédula sin separadores en la declaración. Durante el trabajo se incorporó externamente `e5eaddf`, que aplica el formato. [Captura del estado anterior](../../e2e/output/debug-remainder-2026-11-10/capturas/01-firmante-uno-vuelve-a-firmar-dibujando-FALLO.png).

## Comprobaciones ejecutadas

| Comprobación                           | Resultado observado                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| Web `npm run typecheck`                | Correcto, salida 0.                                                 |
| Web `npm test`                         | 141 pruebas aprobadas, 17 archivos, salida 0.                       |
| Web `npm run build`                    | Correcto, aviso de chunk superior a 500 kB.                         |
| Web `npm run format:check`             | Señala 29 archivos existentes de `src/`.                            |
| API `npm run typecheck`                | Correcto.                                                           |
| API `npm run format:check`             | Correcto.                                                           |
| Compilación aislada de API             | Correcta y utilizada por cada ejecución.                            |
| E2E `npx tsc -p e2e/tsconfig.json`     | Correcto, salida 0.                                                 |
| Prettier de archivos propios           | Correcto, salida 0.                                                 |
| Recorrido completo sin ventana         | Dos ejecuciones completas aprobadas. Última con 42 pasos, salida 0. |
| Comprobación de secretos en resultados | Correcta, salida 0, también dentro del ZIP del informe HTML.        |
| `git diff --check`                     | Correcto.                                                           |

La verificación integral se ejecutó sin ventana. Los scripts con ventana e interfaz comparten el mismo recorrido y la configuración del Chrome instalado. Los servicios propios terminaron al cerrar la ejecución y los puertos 3100/5175 quedaron libres. Las escrituras propias están dentro del alcance de T21 y el trabajo se entrega sin commit.

El formato de los archivos propios se aplica por lista explícita. El alcance de las escrituras propias comprende `e2e/`, `playwright.config.ts`, los tres scripts de `package.json`, el destino configurable del proxy de `vite.config.ts`, `api/src/db/seed-e2e.ts` y este informe. Las inspecciones de estado se contrastan con el árbol compartido para distinguir las actualizaciones externas.

Después de la última pasada aparecieron cambios externos sin commit en `api/src/lib/mail/`, `api/src/modules/contracts/service.ts`, `api/assets/mail/` y `src/app/layout/NotificationBell.tsx`. Las escrituras observadas en la campana y el servicio contractual tienen fecha del 11 de noviembre a las 01:14 y 01:16 UTC, posteriores al recorrido. Se conservaron esos cambios. Se repitieron los typechecks web y API y las 141 pruebas web con resultado correcto sobre el árbol compartido actualizado. Las dos pasadas integrales certifican la versión ejecutada antes de esas actualizaciones posteriores.

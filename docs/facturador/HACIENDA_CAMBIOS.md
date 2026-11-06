# Registro de cambios normativos — Hacienda

Log of the Ministerio de Hacienda / Dirección General de Tributación rules that `@happy-prod/facturador` implements. Each entry names the source, the date it takes effect, the rule, and the code that enforces it.

When a new annex or resolution changes the XML, add a section here in the same pass as the code. Do not record a rule as implemented until a validator or the XML builder actually enforces it.

## 1 de noviembre de 2026 — Anexos y Estructuras v4.4

**Status:** implemented in `@happy-prod/facturador@2.0.4`.

**Source**

- Comunicado: [Actualización de los Anexos y Estructuras versión 4.4](https://www.hacienda.go.cr/docs/ActualizacionAnexosyEstructurasVersion4.4CEv2.pdf)
- Annex in force: [Anexos y Estructuras v4.4](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf), bitácora de ajustes al 22 de abril de 2026
- The new codes are mandatory in emission systems from **1 November 2026**. They were already accepted in STAG and production before that date. Early use was allowed.

**What Hacienda changed**

1. Identification fields may carry an alphanumeric cédula jurídica, matching the Registro Nacional format for new sociedades (example `3-101-A00001`). Existing numeric cédulas jurídicas do not change. The Registro Nacional has said the alphanumeric consecutive starts in Q4 2026 and that the exact date will be announced at least two months ahead.
2. Nota 9 (código de referencia) adds `13`, `14`, `15`, `16`, and `17`, and restates code `12`.
3. Nota 10 (tipo de documento de referencia) adds `19` and `20`.

### Identificación — Nota 4 y Nota 4.1

| Tipo | Código | `Identificacion/Numero` | Segmento de 12 caracteres en la clave |
|------|--------|-------------------------|----------------------------------------|
| Cédula física | `01` | 9 dígitos, sin cero al inicio, sin guiones | 3 ceros al inicio |
| Cédula jurídica | `02` | 10 caracteres alfanuméricos, sin guiones | 2 ceros al inicio. Las letras se conservan |
| DIMEX | `03` | 11 o 12 dígitos, sin ceros al inicio | 1 cero si trae 11 dígitos |
| NITE | `04` | 10 dígitos, sin ceros al inicio | 2 ceros al inicio |
| Extranjero no domiciliado | `05` | hasta 20 caracteres (FEC) | no es el caso normal de la clave |
| No contribuyente | `06` | hasta 20 caracteres (FEC) | no es el caso normal de la clave |

Example: cédula `3-101-A00001` is sent as `3101A00001` and occupies `003101A00001` inside the clave. The clave stays 50 characters and may contain letters when the issuer is a jurídica.

**Code:** `utils/haciendaReglas.js` (`cedulaForXml`, `cedulaForClave`, `cedulaFormatError`), `services/clave.js`, `services/xml.js` (`Numero` and `ProveedorSistemas`), `utils/validateFacturaPayload.js`.

A 12-character jurídica that is exactly two zeros plus the 10-character id is accepted and unpadded for the XML. Any other 12-digit jurídica is rejected, because Hacienda requires 10 characters in `Numero`.

### Nota 9 — `referencia.codigo`

| Código | Nombre | Efecto contable | Regla en este API |
|--------|--------|-----------------|-------------------|
| `01` | Anula documento de referencia | Período en que se emite la NC/ND | Se emite tal cual. Si se reemite, el comprobante nuevo usa `07` |
| `02` | Corrige monto | Período en que se emite la NC/ND | Se emite tal cual |
| `04` | Referencia a otro documento | — | Aceptado |
| `05` | Sustituye comprobante provisional por contingencia | — | Aceptado |
| `06` | Devolución de mercancía | Período en que se emite la NC/ND | Se emite tal cual |
| `07` | Sustituye comprobante electrónico | Período en que se genera el comprobante nuevo | Usar en el comprobante que reemplaza una anulación con `01` |
| `08` | Factura endosada | — | Aceptado |
| `09` | Nota de crédito financiera | — | Aceptado |
| `10` | Nota de débito financiera | — | Aceptado |
| `11` | Proveedor no domiciliado | — | Aceptado |
| `12` | Nota de crédito financiera por exoneración posterior a la facturación | Período en que se emite la nota de crédito | Solo `tipo_documento` `03`. Exoneración concreta de impuestos locales aprobada después de la venta |
| `13` | Anula documento de referencia por error material | Período del comprobante que se modifica | Si hace falta un comprobante nuevo, ese nuevo usa `15` |
| `14` | Corrige monto por error material | Período del comprobante que se modifica | NC o ND |
| `15` | Sustituye comprobante electrónico por error material | — | Va en el comprobante nuevo, no en la nota que anula |
| `16` | Sustituye comprobante electrónico rechazado | — | El comprobante nuevo reemplaza uno que Hacienda rechazó |
| `17` | Pago a comprobante electrónico | — | Exclusivo del Recibo Electrónico de Pago. Este API no emite ese documento, así que el código se rechaza |
| `99` | Otros | — | Requiere `razon` |

`codigo` `15` (Nota 9) is not `tipoDoc` `15` (Nota 10). They are different fields.

### Nota 10 — `referencia.tipoDoc`

Codes `01` through `18` and `99` were already in the annex. This update adds:

| Código | Documento | En este API |
|--------|-----------|-------------|
| `19` | Factura electrónica de exportación | Aceptado como documento referenciado. No emitimos FEE (tipo `09`) |
| `20` | Recibo electrónico de pago | Aceptado como documento referenciado. No emitimos REP (tipo `10`) |

`tipoDoc` `16` (comprobante de proveedor no domiciliado) sigue limitado a la factura de compra (`tipo_documento` `08`), como ya decía la Nota 10.

**Code:** `referenciaErrors()` in `utils/haciendaReglas.js`, called from `utils/validateFacturaPayload.js`. The XML writer already copies `referencia.tipoDoc` and `referencia.codigo` into `InformacionReferencia`; no new XML tags were required for these codes.

### Fuera de alcance de este corte

- Emisión de Factura Electrónica de Exportación (tipo `09`) y de Recibo Electrónico de Pago (tipo `10`). Solo se pueden referenciar.
- La fecha en que el Registro Nacional empiece a asignar cédulas `3-101-A00001`. El XML y la clave ya las aceptan.

## v4.4 ya cubierto antes del 1 de noviembre de 2026

These rules come from MH-DGT-RES-0027-2024 and the v4.4 annex (obligatorio desde el 1 de setiembre de 2025, con códigos de actividad CIIU 4). They were already in this library. They are listed so this file is the single record, not only the November 2026 delta.

| Regla | Dónde |
|-------|--------|
| Esquema XML v4.4 (FE, ND, NC, TE, FEC) | `services/xml.js` namespaces |
| `ProveedorSistemas` | `services/xml.js` |
| `CodigoActividadReceptor` opcional en FE/NC/ND; obligatorio en el layout de FEC | `services/xml.js` |
| `Impuesto` en cada línea, incluida tarifa 0 | `services/xml.js` |
| `PlazoCredito` obligatorio en condición de venta `02` y `10` | `utils/validateFacturaPayload.js` |
| Condición `12` solo en factura electrónica; condición `13` obligatoria en FEC | `utils/validateFacturaPayload.js` |
| `Ubicacion` omitida en FEC cuando el emisor es tipo `05` o `06` | `services/xml.js` |
| `CodigoDescuento` antes de `NaturalezaDescuento` | `services/xml.js` |
| `TotalMedioPago` dentro de cada `MedioPago` | `services/xml.js` |
| NC/ND a factura de compra (`tipoDoc` `15`, `17`, `18`) invierten emisor y receptor | `src/factura.js` |

## Cómo agregar el siguiente cambio

1. Cite the comunicado or the annex bitácora and the effective date.
2. Add or adjust the code in `utils/haciendaReglas.js` when it is a code list or an identification format.
3. Add a test in `utils/haciendaReglas.test.js`.
4. Add a section to this file with status `implementado` or `pendiente`.

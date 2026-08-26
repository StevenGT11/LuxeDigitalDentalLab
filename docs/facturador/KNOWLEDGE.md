# @happy-prod/facturador — AI knowledge base

Use this when integrating Costa Rica electronic invoicing (Hacienda XML v4.4).

## Package

- **Name:** `@happy-prod/facturador`
- **Registry:** GitHub Packages (`https://npm.pkg.github.com`)
- **Entry:** `src/index.js`
- **Node:** >= 18
- **Server-side only** — never import from browser / client bundles

## Install

```
# consumer .npmrc
@happy-prod:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

npm install @happy-prod/facturador
```

## Two modes (same payload)

| Mode | How | Auth env vars |
|------|-----|----------------|
| **B. npm library (preferred for Happy Prod apps)** | `import { enviarFactura } from '@happy-prod/facturador'` | None — secrets stay in your process |
| **A. HTTP API** | `POST /api/factura/enviar` | `PASSWORD_FACTURADOR` + optional `ALLOWED_ORIGINS` |

Express is a thin wrapper over the same library functions.

## Library API (high level)

```js
import {
  validarFactura,   // same as POST /api/factura/validar
  generarFactura,   // sign only
  enviarFactura,    // sign + Hacienda recepción
  consultarFactura  // poll acceptance
} from '@happy-prod/facturador';
```

Typical flow:

1. `validarFactura(payload, { requireHacienda: true })`
2. `enviarFactura(payload)` → persist `data.clave` + `data.xml`
3. Poll `consultarFactura({ clave, config })` until accepted/rejected → persist `data.respuesta_xml`

## Security (required)

- Never send `certificado_p12`, `pin`, or Hacienda passwords from the browser.
- Load P12 / PIN / Hacienda creds from a vault on the server.
- Do not put `PASSWORD_FACTURADOR` in frontend code (HTTP mode only).

## Payload shape (identical for lib and HTTP)

### Required top-level

| Field | Notes |
|-------|--------|
| `config` | Emisor + P12 + (for enviar) Hacienda creds |
| `tipo_documento` | `01` FE, `02` ND, `03` NC, `04` Tiquete, `08` FEC |
| `consecutivo_num` | Integer you manage; never reuse |
| `lineas` | Non-empty array |
| `cliente` | Required for `01`/`02`/`03`/`08` (not for `04`) |
| `referencia` | Required for `02`/`03`/`08` |

### `config` required fields

- `cedula` (9–12 digits), `razon_social`, `codigo_actividad`, `tipo_cedula` (`01`–`04`)
- `certificado_p12` (base64 .p12), `pin`
- `casa_matriz` (e.g. `001`), `terminal` (e.g. `00001`)
- For **enviar**: `hacienda_usuario`, `hacienda_password`, optional `hacienda_ambiente` (`staging`|`production`)

### `cliente`

- `cedula`, `nombre_completo`, `tipo_cedula`
- Optional: `correo_electronico`, `codigo_actividad` → XML `CodigoActividadReceptor` (FE v4.4)
- **`project_name`** (telemetry): string identifying the consuming app (e.g. `luxe-dental`). Supabase URL/key are built into `@happy-prod/facturador` — apps do not configure the database. Metadata only.

### Each line

| Field | Required | Notes |
|-------|----------|--------|
| `descripcion` | yes | |
| `cantidad` | yes | > 0 |
| `precio_unitario` | yes | >= 0 |
| `impuesto_tarifa` | yes | `0` exempt; `1`/`2`/`4`/`8`/`13` taxed |
| `codigo_tarifa_iva` | optional | `02`=1%, `03`=2%, `04`=4%, `07`=8%, `08`=13%; derived from rate if omitted |
| `cabys` | strongly recommended | 13 digits |
| `unidad_medida` | recommended | `Sp`/`Spe`/`OS`/`STE`/`STN` = servicio; else mercancía |
| `factor_iva` | optional | Bienes usados; ignores `impuesto_tarifa` when set |

**Never** pair `CodigoTarifaIVA 08` with a rate other than 13%.

## Document-type notes

- **01 FE / 04 Tiquete:** standard sale
- **02 ND / 03 NC:** need `referencia` (`tipoDoc`, `numero`, `fechaEmision`, `codigo`, `razon`)
- **08 FEC:** you are buyer; API swaps Emisor/Receptor; `condicion_venta` must be `"13"`; seller may use `tipo_cedula: "06"`

## IVA quick map

| `impuesto_tarifa` | `CodigoTarifaIVA` |
|-------------------|-------------------|
| 0 | 10 (exenta) |
| 1 | 02 |
| 2 | 03 |
| 4 | 04 |
| 8 | 07 |
| 13 | 08 |

## After send

- `hacienda_status: 202` = queued, **not** final acceptance
- Poll `consultarFactura` / `POST /api/factura/consultar`
- Store signed XML + final `respuesta_xml`

## Full docs

See `INTEGRATION_GUIDE.md` in the package (also exposed by this MCP as a resource).
Use tools: `facturador_search_docs`, `facturador_get_section`, `facturador_validate_payload`.

# 🚀 Easy Implementation Guide - Facturador API

## For Apps That Want to Use Facturador

This guide shows how to integrate the Facturador service from **any app** (web, POS, mobile, backend).

---

## 📋 Base URL

```
Development:  http://localhost:3000
Production:  https://your-facturador-server.com
```

All endpoints use prefix: `/api/`

---

## 🔐 API Authentication (PASSWORD_FACTURADOR)

When the server has `PASSWORD_FACTURADOR` set in its environment, **all API endpoints** (except `/api/health`) require authentication.

| Header | Required value |
|--------|-----------------|
| `X-Facturador-Password` | The same value as `PASSWORD_FACTURADOR` in the server's `.env` |

**Example:**
```http
POST /api/factura/enviar
Content-Type: application/json
X-Facturador-Password: your-secret-password

{ "config": ..., "tipo_documento": "01", ... }
```

- If the header is missing or incorrect → `401 Unauthorized`
- If `PASSWORD_FACTURADOR` is *not* set on the server → no auth required (e.g. local dev)

---

## ⚡ Quick Start (3 Steps)

### 1. Call the API

```
POST {BASE_URL}/api/factura/enviar
Content-Type: application/json
X-Facturador-Password: <your-password>   # required when PASSWORD_FACTURADOR is set
```

### 2. Send Your Data

```json
{
  "config": { /* your business config */ },
  "tipo_documento": "01",
  "consecutivo_num": 1,
  "cliente": { /* customer info */ },
  "lineas": [ /* invoice lines */ ]
}
```

### 3. Handle the Response

```json
{
  "success": true,
  "data": {
    "clave": "50628022...",
    "consecutivo": "00100001010000000001",
    "hacienda_status": 202,
    "xml": "<?xml..."
  }
}
```

---

## 🎯 Endpoint Overview

### High level (most apps only need these)

| What you want | Endpoint | Method |
|----------------|----------|--------|
| **Validate payload** (no side effects) | `/api/factura/validar` | POST |
| **Generate, sign & send** to Hacienda | `/api/factura/enviar` | POST |
| Generate & sign only (no Hacienda) | `/api/factura/generar` | POST |
| **Consult** acceptance/rejection | `/api/factura/consultar` | POST |
| **Health** (no auth when password is set) | `/api/health` | GET |

### Full API surface (this repo)

All paths assume base `http://localhost:3000` (or your host). Unless noted, they are under `/api` and respect `PASSWORD_FACTURADOR` + `X-Facturador-Password` the same as the rest of `/api/*`.

| Area | Method | Path | Purpose |
|------|--------|------|---------|
| Factura | POST | `/api/factura/validar` | Validate body; add `?accion=enviar` to require Hacienda credentials |
| Factura | POST | `/api/factura/generar` | Build clave/consecutivo, XML v4.4, sign with P12 |
| Factura | POST | `/api/factura/enviar` | Same as `generar` + POST to Hacienda recepción |
| Factura | POST | `/api/factura/consultar` | GET estado + `respuesta-xml` (body: `clave` + `config` with Hacienda user/pass) |
| Clave | POST | `/api/clave/generar` | Clave + consecutivo from cedula, tipo doc, consecutivo num |
| Clave | GET | `/api/clave/campo/:tipo_documento` | DB field name helper for consecutivo by doc type |
| XML | POST | `/api/xml/generar` | Unsigned XML from **pre-shaped** emisor/receptor/lineas (see route comments) |
| XML | POST | `/api/xml/validar` | Light checks: looks like XML, optional signature marker |
| Signer | POST | `/api/signer/sign` | Sign arbitrary XML (P12 + pin) |
| Signer | POST | `/api/signer/validate-certificate` | Inspect/validate P12 |
| Auth | POST | `/api/auth/token` | Hacienda IDP OAuth2 token (usuario, password, ambiente) |
| Auth | POST | `/api/auth/invalidate` | Clear in-memory token cache on this server |
| Auth | GET | `/api/auth/environments` | `staging` / `production` + IDP URLs |
| Hacienda | POST | `/api/hacienda/enviar` | Send **already signed** XML (body shape differs from `/api/factura/enviar`) |
| Hacienda | POST | `/api/hacienda/consultar` | Same query as factura but `hacienda: { usuario, password, ambiente }` nested |
| Hacienda | GET | `/api/hacienda/endpoints` | Recepción base URLs staging/production |
| Health | GET | `/api/health` | `{ status, timestamp }` — excluded from password middleware |

**Not exposed as routes:** `routes/facturas.js` and `routes/hacienda/*.ts` exist in the repo but are **not** mounted by `server.js`. The running service uses the `.js` routers above.

### Checklist for a consuming project

Use this to compare your app with what Facturador already does vs what you must still own.

| Topic | Handled by Facturador | Your app must still |
|-------|------------------------|---------------------|
| Clave + consecutivo | Yes (`/api/factura/*`, `/api/clave/generar`) | Store next `consecutivo_num` per tipo doc + sucursal/terminal; never reuse |
| XML schema v4.4 | Yes (`services/xml.js`) | Send valid `cabys` (13 digits), `unidad_medida`, amounts |
| XAdES-BES signing | Yes (P12 in `config`) | Safely store P12 / PIN; rotate certs |
| Hacienda OAuth2 | Yes (cached token in process) | Valid `hacienda_usuario` / `hacienda_password` per environment |
| Recepción + consulta | Yes | Poll `consultar` after 202; persist `xml` + final `respuesta_xml` |
| UI / products DB | No | Catalog, customers, printing PDF, email to client |

---

## 📤📥 Request & Response – What the UI Sends and Receives

### What the UI Must Send

For every invoice operation, the UI must send a complete request body. The API does not store state; all config and invoice data is passed each time.

| Endpoint | Required in request |
|----------|---------------------|
| `/api/factura/enviar` | `config`, `tipo_documento`, `consecutivo_num`, `cliente` (for 01/02/03/08), `lineas` |
| `/api/factura/generar` | Same as `enviar`, except `hacienda_usuario` / `hacienda_password` not required |
| `/api/factura/consultar` | `clave` (50-digit key), `config` with `hacienda_usuario`, `hacienda_password`, optional `hacienda_ambiente` |

See **Request Body Structure** below for the full schema.

**Amounts:** `precio_unitario`, `descuento`, and line totals are in **main currency units** (e.g. colones as you want them on the XML: `100` → `100.00` in the comprobante), not cents. Keep `medios_pago[].monto` aligned with `TotalComprobante` when you send the array.

---

### Response Structures – What the API Returns

#### `POST /api/factura/enviar`

```json
{
  "success": true,
  "message": "Comprobante recibido por Hacienda. Procesando...",
  "data": {
    "clave": "50628022300100001010000000001",
    "consecutivo": "00100001010000000001",
    "tipo_documento": "01",
    "fecha_emision": "2025-02-28T12:00:00.000Z",
    "subtotal": 100,
    "impuesto": 13,
    "total": 113,
    "moneda": "CRC",
    "hacienda_status": 202,
    "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clave` | string | 50-digit Hacienda key (save for `consultar`) |
| `consecutivo` | string | Full consecutivo number |
| `hacienda_status` | number | HTTP status from Hacienda (`202` = received for processing). If Hacienda returns an error status, `success` may be `false` and `message` will describe the failure — still inspect `data` if present. |
| `xml` | string | **Signed invoice XML – save this file** |

---

#### `POST /api/factura/generar`

```json
{
  "success": true,
  "data": {
    "clave": "50628022300100001010000000001",
    "consecutivo": "00100001010000000001",
    "tipo_documento": "01",
    "fecha_emision": "2025-02-28T12:00:00.000Z",
    "subtotal": 100,
    "impuesto": 13,
    "total": 113,
    "moneda": "CRC",
    "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
    "xmlBase64": "PD94bWwgdmVyc2lvbi..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `xml` | string | **Signed invoice XML – save this file** |
| `xmlBase64` | string | Same XML in base64 (e.g. for storage or display) |

---

#### `POST /api/factura/consultar`

**Request body**

```json
{
  "clave": "50605052600070253076100100001010000000039198747229",
  "config": {
    "hacienda_usuario": "cpf-...-@stag.comprobanteselectronicos.go.cr",
    "hacienda_password": "...",
    "hacienda_ambiente": "staging"
  }
}
```

**When Hacienda has finished processing** (`success: true`):

```json
{
  "success": true,
  "data": {
    "clave": "50628022300100001010000000001",
    "fecha": "2025-02-28T12:00:00.000Z",
    "estado": "aceptado",
    "respuesta_xml": "<string from Hacienda (often base64 or XML per their payload)>",
    "detalle_mensaje": "optional human-readable detail when present",
    "rechazo": {
      "codigo": "...",
      "estado": "...",
      "detalle": "...",
      "razon": "..."
    }
  }
}
```

`rechazo` is only populated when `estado === "rechazado"` (parsed from Hacienda for easier UI messaging).

| Field | Type | Description |
|-------|------|-------------|
| `estado` | string | From Hacienda: typically `aceptado`, `rechazado` |
| `respuesta_xml` | string | **Persist this** — Hacienda’s `respuesta-xml` field |
| `rechazo` | object | Only if rejected — shortcut fields for dashboards |

**Still processing (404 from Hacienda / not visible yet)**

```json
{
  "success": false,
  "message": "Comprobante no encontrado en Hacienda (aún procesando)",
  "estado": "procesando"
}
```

Note: there is **no** `data` wrapper in this case — poll again after a few seconds.

---

### What the UI Should Save

| When | What to save | Use for |
|------|--------------|---------|
| After `enviar` or `generar` | `data.xml` | Invoice XML (signed comprobante) |
| After `consultar` (when processed) | `data.respuesta_xml` | Hacienda acceptance/rejection XML |

**Recommended flow**

1. Call `POST /api/factura/enviar` → save `data.xml` and `data.clave` (and `hacienda_status`; `202` means queued, not yet accepted/rejected).
2. Poll `POST /api/factura/consultar` with `{ "clave": "...", "config": { ...hacienda_usuario, hacienda_password... } }`.
3. While the response is `success: false` with `estado: "procesando"` (and the “no encontrado” message), wait a few seconds and retry.
4. When the response is `success: true`, persist `data.respuesta_xml` and branch on `data.estado` (`aceptado` / `rechazado`). If `data.rechazo` is present, show it in the UI.

---

### `/api/factura/*` vs `/api/hacienda/*`

- **`/api/factura/enviar`**: one JSON payload (config + lines + cliente…); Facturador builds clave, XML, signs, encodes Base64, obtains token, calls recepción.
- **`/api/hacienda/enviar`**: for integrations that already have signed XML. Body uses nested `hacienda: { usuario, password, ambiente }` and flat `emisor` / `receptor` objects with `tipo_identificacion` / `numero_identificacion` (see `routes/hacienda.js`).
- **`/api/factura/consultar`** vs **`/api/hacienda/consultar`**: same Hacienda query; factura expects `config.hacienda_*`, hacienda route expects `hacienda.*`.

---

## 📱 Implementation by Platform

### JavaScript / Browser (Svelte, React, Vue, etc.)

```javascript
const FACTURADOR_URL = 'http://localhost:3000'; // or your server
const FACTURADOR_PASSWORD = process.env.FACTURADOR_PASSWORD || ''; // if server requires auth

async function enviarFactura(datos) {
  const headers = { 'Content-Type': 'application/json' };
  if (FACTURADOR_PASSWORD) headers['X-Facturador-Password'] = FACTURADOR_PASSWORD;

  const response = await fetch(`${FACTURADOR_URL}/api/factura/enviar`, {
    method: 'POST',
    headers,
    body: JSON.stringify(datos),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Error al generar factura');
  }

  return result.data;
}

// Usage
const factura = await enviarFactura({
  config: myConfig,
  tipo_documento: '01',
  consecutivo_num: 42,
  cliente: { cedula: '102340567', nombre_completo: 'Juan Pérez', tipo_cedula: '01' },
  lineas: [
    { descripcion: 'Producto', cantidad: 1, precio_unitario: 100, impuesto_tarifa: 13 }
  ]
});
```

---

### Node.js / Backend

```javascript
const FACTURADOR_URL = process.env.FACTURADOR_URL || 'http://localhost:3000';
const FACTURADOR_PASSWORD = process.env.FACTURADOR_PASSWORD || '';

async function enviarFactura(datos) {
  const headers = { 'Content-Type': 'application/json' };
  if (FACTURADOR_PASSWORD) headers['X-Facturador-Password'] = FACTURADOR_PASSWORD;

  const response = await fetch(`${FACTURADOR_URL}/api/factura/enviar`, {
    method: 'POST',
    headers,
    body: JSON.stringify(datos),
  });

  return response.json();
}

// Or with axios
const axios = require('axios');
const result = await axios.post(
  `${FACTURADOR_URL}/api/factura/enviar`,
  datos,
  { headers: { 'Content-Type': 'application/json', ...(FACTURADOR_PASSWORD && { 'X-Facturador-Password': FACTURADOR_PASSWORD }) } }
);
```

---

### SvelteKit – Important

**Call from server-side** (avoids CORS):

```javascript
// ✅ In +page.server.ts (form action or server load)
export const actions = {
  enviar: async ({ request }) => {
    const formData = await request.formData();
    const datos = {
      config: JSON.parse(formData.get('config')),
      tipo_documento: formData.get('tipo_documento'),
      consecutivo_num: parseInt(formData.get('consecutivo_num')),
      cliente: JSON.parse(formData.get('cliente') || 'null'),
      lineas: JSON.parse(formData.get('lineas')),
    };

    const facturadorUrl = process.env.FACTURADOR_URL || 'http://localhost:3000';
    const password = process.env.FACTURADOR_PASSWORD || '';
    const headers = { 'Content-Type': 'application/json' };
    if (password) headers['X-Facturador-Password'] = password;

    const response = await fetch(`${facturadorUrl}/api/factura/enviar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(datos),
    });

    const result = await response.json();
    if (!result.success) {
      return fail(400, { error: result.error });
    }
    return { success: true, data: result.data };
  },
};
```

**If you call from the browser** (e.g. `+page.svelte`):

1. Facturador must be running (`npm start` in facturador folder)
2. Use the correct URL (same machine: `http://localhost:3000`)
3. CORS is enabled; if it still fails, see Troubleshooting below

---

### Python

```python
import os
import requests

FACTURADOR_URL = os.getenv("FACTURADOR_URL", "http://localhost:3000")
FACTURADOR_PASSWORD = os.getenv("FACTURADOR_PASSWORD", "")

def enviar_factura(datos):
    headers = {"Content-Type": "application/json"}
    if FACTURADOR_PASSWORD:
        headers["X-Facturador-Password"] = FACTURADOR_PASSWORD
    r = requests.post(
        f"{FACTURADOR_URL}/api/factura/enviar",
        json=datos,
        headers=headers
    )
    return r.json()

resultado = enviar_factura({
    "config": mi_config,
    "tipo_documento": "01",
    "consecutivo_num": 42,
    "cliente": {"cedula": "102340567", "nombre_completo": "Juan Pérez", "tipo_cedula": "01"},
    "lineas": [{"descripcion": "Producto", "cantidad": 1, "precio_unitario": 100, "impuesto_tarifa": 13}]
})
```

---

### cURL (Testing)

```bash
# If PASSWORD_FACTURADOR is set on the server, add: -H "X-Facturador-Password: your-password"
curl -X POST http://localhost:3000/api/factura/enviar \
  -H "Content-Type: application/json" \
  -H "X-Facturador-Password: your-password" \
  -d '{
    "config": {
      "cedula": "310123456789",
      "razon_social": "MI EMPRESA SA",
      "codigo_actividad": "4773.0",
      "tipo_cedula": "02",
      "certificado_p12": "BASE64...",
      "pin": "1234",
      "hacienda_usuario": "user@stag.comprobanteselectronicos.go.cr",
      "hacienda_password": "password",
      "hacienda_ambiente": "staging"
    },
    "tipo_documento": "01",
    "consecutivo_num": 1,
    "cliente": {
      "cedula": "102340567",
      "nombre_completo": "Juan Pérez",
      "tipo_cedula": "01"
    },
    "lineas": [
      {
        "descripcion": "Producto X",
        "cantidad": 1,
        "precio_unitario": 100,
        "impuesto_tarifa": 13
      }
    ]
  }'
```

---

## 📦 Request Body Structure

### Validate First: `POST /api/factura/validar`

Call this **before** `enviar` or `generar` to validate the payload. Returns errors immediately if any field is missing or invalid. No side effects (does not generate XML, sign, or contact Hacienda).

```bash
# Validate for generar (no Hacienda credentials needed)
POST /api/factura/validar
Body: { ... same as enviar ... }

# Validate for enviar (Hacienda credentials required)
POST /api/factura/validar?accion=enviar
Body: { ... same as enviar ... }
```

**Success:**
```json
{ "success": true, "message": "Payload válido. Puede proceder con enviar o generar." }
```

**Validation errors:**
```json
{
  "success": false,
  "error": "Datos incompletos o inválidos",
  "errors": [
    "config.codigo_actividad es requerido",
    "cliente.cedula es requerido"
  ]
}
```

---

### Complete Payload Example (all fields)

See **PAYLOAD_COMPLETO_EJEMPLO.json** for a full example. Summary:

```json
{
  "config": {
    "cedula": "310123456789",
    "razon_social": "MI EMPRESA SA",
    "codigo_actividad": "4773.0",
    "tipo_cedula": "01|02|03|04",
    "certificado_p12": "base64 string",
    "pin": "string",
    "hacienda_usuario": "user@stag.comprobanteselectronicos.go.cr",
    "hacienda_password": "string",
    "hacienda_ambiente": "staging|production",
    "casa_matriz": "001",
    "terminal": "00001",
    "nombre_comercial": "opcional",
    "provincia": 1,
    "canton": "01",
    "distrito": "01",
    "otras_senas": "dirección fiscal",
    "telefono": "22223333",
    "correo_electronico": "info@empresa.co.cr"
  },
  "tipo_documento": "01|02|03|04|08",
  "consecutivo_num": 1,
  "condicion_venta": "01",
  "medio_pago": "01",
  "medios_pago": [
    { "tipo": "01", "monto": 113 }
  ],
  "moneda": "CRC",
  "tipo_cambio": 1,
  "cliente": {
    "cedula": "string",
    "nombre_completo": "string",
    "tipo_cedula": "01|02|03|04",
    "correo_electronico": "opcional",
    "codigo_actividad": "opcional — FE v4.4 CodigoActividadReceptor"
  },
  "referencia": {
    "tipoDoc": "01",
    "numero": "00100001010000000001",
    "fechaEmision": "2025-02-28",
    "codigo": "01",
    "razon": "Ajuste"
  },
  "lineas": [
    {
      "descripcion": "string",
      "cantidad": 1,
      "precio_unitario": 100,
      "impuesto_tarifa": 13,
      "codigo_tarifa_iva": "opcional — 02=1%, 03=2%, 04=4%, 08=13%; derived from impuesto_tarifa if omitted",
      "unidad_medida": "Unid",
      "cabys": "1632099000000",
      "codigo": "opcional",
      "descuento": 0,
      "codigo_descuento": "07",
      "naturaleza_descuento": "opcional, solo requerido cuando codigo_descuento es 99"
    }
  ]
}
```

`referencia` is required only for tipo_documento 02, 03, 08. `cliente` is required for 01, 02, 03, 08 (not for 04 Tiquete).

- **`medios_pago`** (optional): array of `{ "tipo", "monto" }`. When omitted, Facturador builds one `MedioPago` from `medio_pago` and the invoice total. When provided, each `monto` should match the payable total (same currency units as the line math).
- **`cabys`**: optional per line in the validator, but Hacienda expects a valid 13-digit CABYS on the XML — always send it in production.
- **`unidad_medida`**: drives **servicios gravados** vs **mercancías gravadas** in `ResumenFactura`. Units treated as **servicio** in this API: `Sp`, `Spe`, `OS`, `STE`, `STN`. Any other value (e.g. `Unid`, `kg`) is treated as **mercancía**. Pick the unit that matches how Hacienda classifies the CABYS line.
- **`config.codigo_actividad`**: non-empty string as registered (e.g. `6201.0`, `4773.0`); the server trims whitespace and passes it through to the XML as **`CodigoActividadEmisor`**.
- **`cliente.codigo_actividad`** (optional): when present, emitted as **`CodigoActividadReceptor`** (Hacienda v4.4). Optional for FE/NC/ND until DGT makes it mandatory; omit if the client has no code. Use the exact RUT code (e.g. `6201.0`).

---

### IVA Tax Regimes per Line

There are three ways a line can carry tax:

#### 1. Standard IVA (`impuesto_tarifa`)

Used for most goods and services at 13 %, 4 %, 2 %, 1 %, or 0 % (exempt).

```json
{
  "descripcion": "Servicio de consultoría",
  "cantidad": 1,
  "precio_unitario": 1000,
  "impuesto_tarifa": 13
}
```

Optional explicit code (recommended when not 13%):

```json
{
  "descripcion": "Arroz",
  "cantidad": 1,
  "precio_unitario": 404,
  "impuesto_tarifa": 1,
  "codigo_tarifa_iva": "02",
  "cabys": "0113200000000"
}
```

| `impuesto_tarifa` | `CodigoTarifaIVA` | Notes |
|-------------------|-------------------|-------|
| `0` | `10` | Exempt (`Monto 0.00`) |
| `1` | `02` | Reduced 1% |
| `2` | `03` | Reduced 2% |
| `4` | `04` | Reduced 4% |
| `8` | `07` | Transitorio 8% |
| `13` | `08` | General 13% |

- Send **`codigo_tarifa_iva`** to force the Hacienda code (e.g. `"02"`). When omitted, Facturador derives it from `impuesto_tarifa`.
- Do **not** pair code `08` with a rate other than 13 — Hacienda rejects that mismatch.

#### 2. Régimen Bienes Usados — FactorCalculoIVA (`factor_iva`)

Used when selling **used goods** (e.g. gold, jewelry, precious metals) under the special IVA scheme.  
Tax is **not** a percentage of the sale price; instead a **multiplication factor** is applied and the seller absorbs the embedded tax.

| Field | Type | Description |
|-------|------|-------------|
| `factor_iva` | `number` | The IVA factor (e.g. `1.058` for 5.8 % embedded). **When present, `impuesto_tarifa` is ignored.** |
| `impuesto_codigo` | `string` | Impuesto code for the line. Defaults to `"08"` (Otros) when `factor_iva` is set. |

**Formula used by the API:**
```
impuestoMonto  = precioUnitario × cantidad × (factor_iva − 1)
montoTotalLinea = montoTotal + impuestoMonto
```

**Payload example (1 gram of gold, factor 1.058):**
```json
{
  "tipo_documento": "01",
  "consecutivo_num": 18,
  "cliente": {
    "cedula": "402060256",
    "nombre_completo": "GREIVIN JOSE RIVERA",
    "tipo_cedula": "01"
  },
  "lineas": [
    {
      "cabys": "4135002020000",
      "descripcion": "Metales comunes, plata u oro, semilabrados",
      "cantidad": 1,
      "precio_unitario": 1000,
      "unidad_medida": "Unid",
      "impuesto_tarifa": 0,
      "factor_iva": 1.058,
      "impuesto_codigo": "08"
    }
  ]
}
```

**Resulting XML block:**
```xml
<Impuesto>
  <Codigo>08</Codigo>
  <Tarifa>0.00</Tarifa>
  <FactorCalculoIVA>1.058</FactorCalculoIVA>
  <Monto>58.00</Monto>
</Impuesto>
<ImpuestoAsumidoEmisorFabrica>0.00</ImpuestoAsumidoEmisorFabrica>
<ImpuestoNeto>58.00</ImpuestoNeto>
<MontoTotalLinea>1058.00</MontoTotalLinea>
```

`TotalDesgloseImpuesto` in `ResumenFactura` will use the same `Codigo` (`08`) **without** `CodigoTarifaIVA`, matching Hacienda's v4.4 schema for this regime.

> ⚠️ Do **not** combine `factor_iva` and `impuesto_tarifa > 0` on the same line. When `factor_iva` is present it takes precedence and the tarifa is ignored.

#### 3. Exempt (no tax)

Simply omit `factor_iva` and set `impuesto_tarifa: 0` (or omit it). The API will emit the mandatory `<Impuesto>` block with `CodigoTarifaIVA 10` (Exenta) and `Monto 0.00` to satisfy the v4.4 schema.

---

### Minimal for `/api/factura/enviar`

```json
{
  "config": {
    "cedula": "string",
    "razon_social": "string",
    "codigo_actividad": "4773.0",
    "tipo_cedula": "01|02",
    "certificado_p12": "base64 string",
    "pin": "string",
    "hacienda_usuario": "string",
    "hacienda_password": "string",
    "hacienda_ambiente": "staging|production",
    "casa_matriz": "001",
    "terminal": "00001"
  },
  "tipo_documento": "01|02|03|04|08",
  "consecutivo_num": 1,
  "cliente": {
    "cedula": "string",
    "nombre_completo": "string",
    "tipo_cedula": "01|02"
  },
  "lineas": [
    {
      "descripcion": "string",
      "cantidad": 1,
      "precio_unitario": 100,
      "impuesto_tarifa": 13,
      "unidad_medida": "Unid"
    }
  ]
}
```

### Document Types

| Code | Name | Client Required |
|------|------|-----------------|
| 01 | Factura Electrónica | Yes |
| 04 | Tiquete Electrónico | No |
| 08 | Factura de Compra | Yes (seller) |
| 03 | Nota de Crédito | Yes + referencia |
| 02 | Nota de Débito | Yes + referencia |

### For type 08 (Compra) — roles are reversed

In a Factura de Compra **you are the buyer**: you create and sign the document with your P12. Hacienda requires the signer to be the `Receptor` (recipient) in the XML, and the seller to be the `Emisor`. The API handles this swap automatically — you still provide your credentials in `config` and the seller's info in `cliente`, exactly like any other document type.

> ⚠️ **`condicion_venta` must always be `"13"`** for tipo 08 (Venta Bienes Usados No Contribuyente). Hacienda rejects FEC with any other value with error **-517**, even though the XSD permits other codes. The API validator now enforces this. If your UI has a condicion_venta selector, lock it to `"13"` when `tipo_documento = "08"`.

**`cliente` = the seller** (required fields):

```json
"cliente": {
  "cedula": "101230456",
  "nombre_completo": "Juan Vendedor Mora",
  "tipo_cedula": "01",
  "correo_electronico": "opcional"
}
```

The seller does **not** need to be a Hacienda contribuyente. Any cedula type is accepted (see table below).

#### Seller identification types (`cliente.tipo_cedula`)

| Code | Type | Notes |
|------|------|-------|
| `01` | Cédula Física | Registered person — errors -37 and -407 may appear as observations if they have no registered address/activity, but the comprobante is still **aceptada** |
| `02` | Cédula Jurídica | Registered company |
| `03` | DIMEX | Foreign resident |
| `04` | NITE | DGT-issued ID |
| **`06`** | **No Contribuyente** | **Unregistered seller (e.g. scrap metal, copper, used goods). Use this + `condicion_venta: "13"` to suppress error -37 entirely. Requires `condicion_venta: "13"`. Only valid in tipo 08.** |

#### When the seller is completely unregistered (e.g. someone selling copper/scrap)

Use `tipo_cedula: "06"` with `condicion_venta: "13"`:

```json
{
  "tipo_documento": "08",
  "condicion_venta": "13",
  "cliente": {
    "cedula": "101230456",
    "nombre_completo": "Juan Vendedor Mora",
    "tipo_cedula": "06"
  }
}
```

- Hacienda v4.4 spec (change #14): `Ubicacion` is **not required** for the emisor when `tipo_cedula` is `06` → eliminates error -37
- Error -407 (`CodigoActividadEmisor` not registered) is a **non-blocking observation** for unregistered sellers — the comprobante is still **aceptada** and valid for tax purposes
- `condicion_venta: "13"` = "Venta Bienes Usados No Contribuyente" — required to use tipo 06; covers scrap metal, copper, recyclable materials, used goods from private individuals

**Add `referencia`** (required for tipo 08):

```json
"referencia": {
  "tipoDoc": "99",
  "tipoDocRefOtro": "Comprobante no electrónico",
  "codigoReferenciaOtro": "Compra de oro sin factura electronica",
  "numero": "REF-2024-001",
  "fechaEmision": "2024-02-28T00:00:00-06:00",
  "codigo": "01",
  "razon": "Régimen compra de objetos usados"
}
```

> ⚠️ **`codigoReferenciaOtro` is required by Hacienda when `tipoDoc: "99"`** (non-electronic document). Even though the XSD marks it as optional, Hacienda rejects FEC with error **-517** when this field is absent. Always include it with a description of the referenced document (e.g. `"Compra de oro sin factura electronica"`, `"Comprobante de compra"`, etc.). The API falls back to `"Comprobante no electrónico"` if you omit the field, but providing a meaningful value is recommended.

> **Hacienda error -60** ("El contribuyente que firma la factura electrónica no es el receptor") means the signer's certificate does not match the `Receptor` node. This happens when the XML is built with the buyer as `Emisor` instead of `Receptor`. The current API version corrects this automatically for tipo 08.

---

## 📝 Notas de Crédito (03) and Notas de Débito (02)

Both use the same `/api/factura/enviar` endpoint. The key difference from a regular invoice is the required `referencia` block and a separate consecutivo counter per document type.

### When to use each

| Document | Use when |
|----------|----------|
| **Nota de Crédito (03)** | Reduce or cancel a previously issued invoice: full cancellation, partial amount correction, merchandise return, price decrease |
| **Nota de Débito (02)** | Increase a previously issued invoice: additional charges, price adjustments upward, interest |

---

### `referencia` block — required for both

```json
"referencia": {
  "tipoDoc": "01",
  "numero": "50628022300100001010000000042",
  "fechaEmision": "2026-05-01",
  "codigo": "01",
  "razon": "Anulación total de factura"
}
```

| Field | Notes |
|-------|-------|
| `tipoDoc` | Type of the **original document** being referenced (see table below) |
| `numero` | The **50-digit `clave`** of the original comprobante |
| `fechaEmision` | Emission date of the original comprobante (`YYYY-MM-DD`) |
| `codigo` | Why you're issuing this NC/ND (see table below) |
| `razon` | Free-text explanation, 3–180 characters |

#### `referencia.tipoDoc` — type of the original document (Nota 10)

| Code | Original document |
|------|-------------------|
| `01` | Factura Electrónica |
| `02` | Nota de Débito Electrónica |
| `03` | Nota de Crédito Electrónica |
| `04` | Tiquete Electrónico |
| `08` | Comprobante emitido en contingencia |
| `17` | Nota de Crédito a Factura Electrónica de Compra |
| `18` | Nota de Débito a Factura Electrónica de Compra |
| `99` | Otros (free text required in `razon`) |

#### `referencia.codigo` — reason code (Nota 9)

| Code | Meaning | Accounting effect |
|------|---------|-------------------|
| `01` | Anula documento de referencia | Same period as the NC/ND |
| `02` | Corrige monto | Same period as the NC/ND |
| `06` | Devolución de mercancía | Same period as the NC/ND |
| `07` | Sustituye comprobante electrónico | Same period as the new comprobante |
| `09` | Nota de crédito financiera | No `lineas` or `Descuento` required |
| `10` | Nota de débito financiera | No `lineas` or `Descuento` required |
| `13` | Anula por error material | Same period as the **original** comprobante |
| `14` | Corrige monto por error material | Same period as the **original** comprobante |
| `99` | Otros | Free text in `razon` |

> **Accounting rule (Hacienda):** Codes `01`, `02`, `06` → effect in the **current period** (when the NC/ND is issued). Codes `13`, `14` → effect in the **original document's period**. If using `01` or `13` and you need to reissue, the replacement comprobante should use code `07` or `15` respectively.

---

### Scenario 1 — Full cancellation of an invoice

Cancel the entire invoice. Send the same lines, quantities, and prices as the original.

```json
{
  "tipo_documento": "03",
  "consecutivo_num": 5,
  "cliente": { "cedula": "102340567", "nombre_completo": "Juan Pérez", "tipo_cedula": "01" },
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "01",
    "razon": "Anulación total de factura"
  },
  "lineas": [
    {
      "descripcion": "Producto A",
      "cantidad": 5,
      "precio_unitario": 10000,
      "impuesto_tarifa": 13,
      "unidad_medida": "Unid",
      "cabys": "1234567890123"
    }
  ]
}
```

Result: credits back 100% of the original invoice. The original FE is fully voided.

---

### Scenario 2 — Partial return (some items returned)

Return 2 out of 5 items. Only send the returned quantity; the rest of the original invoice stays valid.

```json
{
  "tipo_documento": "03",
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "06",
    "razon": "Devolución de 2 unidades defectuosas"
  },
  "lineas": [
    {
      "descripcion": "Producto A devuelto",
      "cantidad": 2,
      "precio_unitario": 10000,
      "impuesto_tarifa": 13,
      "unidad_medida": "Unid",
      "cabys": "1234567890123"
    }
  ]
}
```

Result: credits back 2 units. The original FE is still valid for the remaining 3 units.

---

### Scenario 3 — Price correction downward (NC)

The price was wrong — you charged ₡12,000 but it should have been ₡10,000. Send only the **difference**.

```json
{
  "tipo_documento": "03",
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "02",
    "razon": "Corrección de precio unitario"
  },
  "lineas": [
    {
      "descripcion": "Ajuste precio Producto A",
      "cantidad": 1,
      "precio_unitario": 2000,
      "impuesto_tarifa": 13,
      "unidad_medida": "Unid",
      "cabys": "1234567890123"
    }
  ]
}
```

Result: credits back the ₡2,000 difference + 13% tax.

---

### Scenario 4 — Price correction upward (ND)

The price was too low — you charged ₡10,000 but it should have been ₡12,000. Send only the **difference** using a Nota de Débito.

```json
{
  "tipo_documento": "02",
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "02",
    "razon": "Ajuste de precio por cotización correcta"
  },
  "lineas": [
    {
      "descripcion": "Diferencia precio Producto A",
      "cantidad": 1,
      "precio_unitario": 2000,
      "impuesto_tarifa": 13,
      "unidad_medida": "Unid",
      "cabys": "1234567890123"
    }
  ]
}
```

Result: adds ₡2,000 + 13% tax on top of the original FE.

---

### Scenario 5 — Correcting a wrong product description or error material

The invoice had an error in description or data (not amounts). Cancel it and reissue.

**Step 1 — Anular con código 13 (error material):**
```json
{
  "tipo_documento": "03",
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "13",
    "razon": "Error en descripción del producto"
  },
  "lineas": [ { "...same lines as original..." } ]
}
```

**Step 2 — Issue a new corrected FE referencing the new comprobante:**
```json
{
  "tipo_documento": "01",
  "referencia": {
    "tipoDoc": "03",
    "numero": "...clave of the NC just issued...",
    "fechaEmision": "2026-05-13",
    "codigo": "15",
    "razon": "Reemisión con datos corregidos"
  },
  "lineas": [ { "...corrected lines..." } ]
}
```

> Codes `13`/`14` reflect the accounting effect in the **original document's period**, not the current one. Code `15` on the replacement says "this substitutes a previous comprobante."

---

### Scenario 6 — Adding a charge not in the original (ND)

Forgot to include shipping or an additional service. Add it with a Nota de Débito.

```json
{
  "tipo_documento": "02",
  "referencia": {
    "tipoDoc": "01",
    "numero": "...clave of original FE...",
    "fechaEmision": "2026-05-01",
    "codigo": "02",
    "razon": "Cargo de envío no incluido en factura original"
  },
  "lineas": [
    {
      "descripcion": "Flete y envío",
      "cantidad": 1,
      "precio_unitario": 5000,
      "impuesto_tarifa": 13,
      "unidad_medida": "Sp",
      "cabys": "9999999999999"
    }
  ]
}
```

---

### Scenario 7 — NC/ND referencing a Factura de Compra (tipo 08)

When your NC or ND points back to a FEC, use `referencia.tipoDoc: "17"` (NC to FEC) or `"18"` (ND to FEC). The API automatically applies the same emisor/receptor swap as the original FEC — **no change to your payload structure needed**. `config` is still you (the buyer/Receptor) and `cliente` is still the seller.

> ⚠️ **Common mistake:** `referencia.tipoDoc` uses Hacienda's Nota 10 numbering — **not** the `tipo_documento` codes. `"08"` in `referencia.tipoDoc` means "comprobante emitido en contingencia", **not** "Factura de Compra". To reference a FEC use `"17"` (NC) or `"18"` (ND).

#### If the original FEC used `tipo_cedula: "06"` (No Contribuyente / Régimen Objetos Usados)

The `tipo_cedula: "06"` is only accepted on the NC/ND `cliente` when `referencia.tipoDoc` is `"17"`, `"18"`, or `"15"`. You must also keep `condicion_venta: "13"` on the NC/ND.

```json
{
  "tipo_documento": "03",
  "condicion_venta": "13",
  "cliente": {
    "cedula": "101230456",
    "nombre_completo": "Juan Vendedor",
    "tipo_cedula": "06"
  },
  "referencia": {
    "tipoDoc": "17",
    "numero": "...50-digit clave of the original FEC...",
    "fechaEmision": "2026-06-01",
    "codigo": "01",
    "razon": "Anulación de factura de compra régimen objetos usados"
  },
  "lineas": [ { "...same lines and tax rate as original FEC..." } ]
}
```

| `referencia.tipoDoc` | Meaning | Allows `tipo_cedula: "06"` on cliente |
|----------------------|---------|--------------------------------------|
| `"08"` | Comprobante emitido en contingencia | ❌ No |
| `"17"` | Nota de Crédito a Factura Electrónica de Compra | ✅ Yes |
| `"18"` | Nota de Débito a Factura Electrónica de Compra | ✅ Yes |
| `"15"` | Sustituye una Factura Electrónica de Compra | ✅ Yes |

> **Hacienda error -60** ("El contribuyente que firma la nota de crédito no es el receptor, ya que referencia a una Factura de Compra") means the NC was built with the buyer as `Emisor`. The current API version fixes this automatically when `referencia.tipoDoc` is `"17"`, `"18"`, or `"15"`.

---

### Key rules — summary

| Rule | Detail |
|------|--------|
| **Separate consecutivo counter** | `consecutivo_num` must come from the NC (03) or ND (02) counter — never the FE (01) counter. One counter per type per casa_matriz/terminal. |
| **NC total ≤ original** | Hacienda validates: sum of all NCs against a FE cannot exceed the FE total + any NDs. |
| **Same tax rate as original** | Use `impuesto_tarifa: 13` (or whatever the original had), not `0`. The tax is credited/debited, not removed. |
| **CABYS required** | If the original comprobante had CABYS codes, NC/ND lines must include them too. |
| **Partial is valid** | You don't have to cancel the full invoice. Only send the lines/amounts being adjusted. |
| **Multiple NCs allowed** | You can issue several NCs against the same FE as long as the running total doesn't exceed the original. |
| **Staging reference** | The `referencia.numero` clave must exist **in the same environment** — staging claves for staging, production claves for production. |

---

## 🔑 Consecutivo Numbers

**Your app must track these.** The API does not store them.

- One counter per document type (01, 02, 03, 04, 08)
- Increment only after a successful response
- Pass the next number as `consecutivo_num`

---

## 🌐 CORS & Network

### Browser apps (Svelte, React, etc.)

- CORS is enabled (`Access-Control-Allow-Origin: *`)
- If calls fail: confirm the Facturador server is running and reachable
- For production: set `Access-Control-Allow-Origin` to your domain if you restrict it

### Server-to-server (Node, Python, etc.)

- No CORS
- Ensure the Facturador server is reachable from your backend (firewall, network)

---

## 🧪 Test First

```bash
# 1. Check Facturador is up (no auth needed)
curl http://localhost:3000/api/health

# 2. Test from your app (use your real config)
# Add -H "X-Facturador-Password: your-password" if PASSWORD_FACTURADOR is set
curl -X POST http://localhost:3000/api/factura/enviar \
  -H "Content-Type: application/json" \
  -H "X-Facturador-Password: your-password" \
  -d @test-invoice.json
```

---

## ❌ Error Handling

```javascript
const result = await enviarFactura(datos);

if (!result.success) {
  // result.error has the message
  console.error(result.error);
  // Common: 400 (bad data), 500 (server error)
}
```

---

## 📁 Reusable Client (Copy & Paste)

```javascript
// facturadorClient.js
const FACTURADOR_URL = process.env.FACTURADOR_URL || 'http://localhost:3000';
const FACTURADOR_PASSWORD = process.env.FACTURADOR_PASSWORD || '';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (FACTURADOR_PASSWORD) headers['X-Facturador-Password'] = FACTURADOR_PASSWORD;
  return headers;
}

export async function enviarFactura(config, tipoDocumento, consecutivoNum, cliente, lineas, opts = {}) {
  const res = await fetch(`${FACTURADOR_URL}/api/factura/enviar`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      config,
      tipo_documento: tipoDocumento,
      consecutivo_num: consecutivoNum,
      cliente,
      lineas,
      ...opts,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function generarFactura(config, tipoDocumento, consecutivoNum, cliente, lineas, opts = {}) {
  const res = await fetch(`${FACTURADOR_URL}/api/factura/generar`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      config,
      tipo_documento: tipoDocumento,
      consecutivo_num: consecutivoNum,
      cliente,
      lineas,
      ...opts,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function consultarEstado(config, clave) {
  const res = await fetch(`${FACTURADOR_URL}/api/factura/consultar`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ config, clave }),
  });
  const data = await res.json();
  // success: false + estado "procesando" is normal while Hacienda catches up — do not throw
  if (!data.success && data.estado === 'procesando') {
    return { procesando: true, message: data.message, clave };
  }
  if (!data.success) throw new Error(data.error || data.message);
  return data.data;
}

export async function healthCheck() {
  const res = await fetch(`${FACTURADOR_URL}/api/health`);
  return res.json();
}
```

---

## 🔧 Troubleshooting

### "enviar" request fails (fetch failed)

| Cause | Fix |
|-------|-----|
| Facturador not running | Run `npm start` in the facturador project |
| Wrong URL | Use `http://localhost:3000` for local, or your server URL |
| 401 Unauthorized | Add `X-Facturador-Password` header with the server's `PASSWORD_FACTURADOR` value |
| CORS from browser | Prefer calling from SvelteKit `+page.server.ts` |
| OPTIONS fails | Server uses 204 for preflight; restart Facturador after changes |

### Check connectivity

```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Hacienda rejects the invoice (Rechazado)

| Hacienda error | Cause | Fix |
|----------------|-------|-----|
| **El contribuyente que firma la factura electrónica no es el receptor** (error -60) | Old API version put the buyer as `Emisor` for tipo 08 instead of `Receptor` | Update to the current API version — it swaps emisor/receptor automatically for tipo 08. No change needed in your payload. |
| **Provincia, cantón y distrito del emisor no concuerdan** (error -37) | `provincia`, `canton`, `distrito` in config don't match the taxpayer's RUT at DGT | Use the **exact** codes from your Registro Único Tributario. Or **omit** these fields to use defaults (1, 01, 01). Verify your fiscal address at [Hacienda](https://www.hacienda.go.cr). |
| **Código de Actividad Económica no válido** (error -408) | `codigo_actividad` not in Hacienda’s catalog for the taxpayer | Use the exact code from your RUT / [catálogo de actividades](https://www.hacienda.go.cr). Send it as a string exactly as authorized (e.g. `6201.0`); the API does not rewrite formats. |
| **Código de tarifa 08 requiere tarifa 13** (or similar code/rate mismatch) | Older Facturador versions hard-coded `CodigoTarifaIVA` to `08` for every taxed line while still writing `<Tarifa>` from `impuesto_tarifa` (e.g. 1%) | Update Facturador. Send `impuesto_tarifa: 1` and optionally `codigo_tarifa_iva: "02"`. Expected XML: `CodigoTarifaIVA=02` + `Tarifa=1.00`. |
| **Total servicios gravados / mercancías gravadas no coincide** | `ResumenFactura` buckets do not match line classification | Align **`unidad_medida`** with the nature of the line: service units (`Sp`, `Spe`, `OS`, `STE`, `STN`) vs goods (`Unid`, etc.). Ensure `cabys` matches what you sell. |
| **`cvc-complex-type` … `NaturalezaDescuento` … `CodigoDescuento` is expected** | v4.4 requires `CodigoDescuento` (Nota 20) before `NaturalezaDescuento` in the `Descuento` block | The current API version adds `CodigoDescuento` automatically (defaults to `"07"` Descuento Comercial). Optionally pass `codigo_descuento` on the line to use a specific code. `naturaleza_descuento` is only required when `codigo_descuento` is `"99"`. |
| **`cvc-complex-type` … `MontoTotalLinea` … `Impuesto` is expected** (NC/ND lines) | v4.4 requires `<Impuesto>` in every line, but the line had `impuesto_tarifa: 0` so no block was emitted | (1) Set `impuesto_tarifa` on NC/ND lines to match the original invoice's rate (e.g. `13`). (2) The current API version also adds an exempt `Impuesto` block (CodigoTarifaIVA `10`) automatically for zero-rate lines as a fallback. |
| **`cvc-complex-type` / `MontoPago` / `TotalMedioPago`** | Old XML generator or cached server | Use current `services/xml.js` (`TotalMedioPago` inside `MedioPago` for v4.4) and restart Node after deploy. |
| **Numero Consecutivo ya utilizado** | Duplicate consecutivo | Increment `consecutivo_num` and never reuse numbers. |
| **Rechazado. Código 3 – montos diferentes** after sending with `factor_iva` | `impuesto_tarifa: 0` was used **without** `factor_iva`, so the API generated an exempt block (Código `01`, CodigoTarifaIVA `10`, Monto `0.00`) but the `ResumenFactura` totals and `MontoTotalLinea` did not reflect the factor-based monto | Add `"factor_iva": 1.058` (or the correct factor) and `"impuesto_codigo": "08"` to the line. The API will calculate `Monto = base × (factor − 1)`, emit the correct `FactorCalculoIVA` block, and update all summary totals. |

---

## 📚 More Details

- **PAYLOAD_COMPLETO_EJEMPLO.json** – Complete payload with all optional fields
- **test-invoice.json** – Minimal example request body
- **SHARE_WITH_POS.md** – POS-specific guide (if exists)

---

**Summary:** Use `POST /api/factura/enviar` with `config`, `tipo_documento`, `consecutivo_num`, `cliente` (when required), and `lineas`. Persist `data.xml` and `data.clave`. Poll `POST /api/factura/consultar` with `{ clave, config }` until `success: true`, then store `data.respuesta_xml` and handle `data.estado`. Optional `medios_pago` splits payment methods for v4.4. For a route-by-route map and ownership checklist, see **Endpoint Overview** and **Checklist for a consuming project** above.

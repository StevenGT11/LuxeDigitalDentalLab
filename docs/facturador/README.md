# Facturador docs (from @happy-prod/facturador@2.0.2)

Installed by: `npx @happy-prod/facturador install-mcp`

## Quick start (library)

```js
import { validarFactura, enviarFactura, consultarFactura } from '@happy-prod/facturador';

const payload = {
  config: {
    project_name: 'your-app-name', // telemetry
    // ... fiscal + p12 + hacienda
  },
  tipo_documento: '01',
  consecutivo_num: 1,
  cliente: { /* ... */ },
  lineas: [ /* ... */ ]
};

await validarFactura(payload, { requireHacienda: true });
const sent = await enviarFactura(payload);
// poll consultarFactura({ clave: sent.data.clave, config: payload.config })
```

## Files in this folder

| File | Purpose |
|------|---------|
| `KNOWLEDGE.md` | Condensed AI / human usage rules |
| `INTEGRATION_GUIDE.md` | Full guide (library + HTTP) |
| `PAYLOAD_COMPLETO_EJEMPLO.json` | Example payload |

## Cursor MCP

Config written to `.cursor/mcp.json` (server name: `facturador`).

Reload Cursor, then ask the agent to use Facturador tools / read these docs.

# Pendientes — Luxe Digital Dental Lab + Supabase

Proyecto: `tsngtzlwychbpagdinwj` · [Dashboard](https://supabase.com/dashboard/project/tsngtzlwychbpagdinwj)

## Completado

- [x] **Fase 1** — Auth (`profiles`, login, guards)
- [x] **Fase 2** — `clients`, `doctors`, UI portal y admin
- [x] **Fase 3** — Catálogo en Postgres
- [x] **Fase 4** — Casos (`cases`, ítems, historial, `next_case_number()`)
- [x] **Fase 5** — Storage (`case-scans`, `case-designs`), tabla `case_files`, subida/descarga firmada
- [x] **Fase 6** — Facturas (`invoices`, `invoice_lines`, `next_invoice_number()`)
- [x] **Fase 7 (código)** — Sin demo en localStorage tras hidratación Supabase; docs actualizadas

## Acción manual (producción)

1. Usuarios en **Authentication** + `UPDATE profiles SET role = 'admin'` para administradores
2. Variables `PUBLIC_SUPABASE_*` en Vercel (y `.env` local)
3. **Prueba E2E:** login cliente → nuevo caso con STL → admin ve caso, archivos y factura → cambiar estado factura

## Opcional / fuera de alcance acordado

- [ ] `lab_settings` y ajustes globales en DB
- [ ] Vistas analytics avanzadas solo-DB
- [ ] Migrar casos antiguos con `archivos` jsonb (base64) a Storage (script one-off si hay datos legacy)

## Notas técnicas

- **Adjuntos:** nuevos casos suben a Storage; registros en `case_files`. Casos viejos pueden seguir con `data_url` en jsonb hasta migración manual.
- **Facturas:** se crean en Postgres al registrar el caso (`createInvoiceInDb`).
- **Demo local:** `seedDemoCases` solo corre sin Supabase vinculado y sin caché hidratada.
- **Límite por archivo:** 50 MB (`MAX_CASE_FILE_BYTES`), alineado con buckets de Storage.

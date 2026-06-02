# Supabase — Luxe Digital Dental Lab

**Proyecto:** [tsngtzlwychbpagdinwj](https://supabase.com/dashboard/project/tsngtzlwychbpagdinwj)  
**Región:** us-west-2 · Postgres 17

## Paso 1 (enlazado al repo)

- Carpeta `supabase/` con `config.toml` y `migrations/`
- Variables en `.env` (plantilla en `.env.example`)
- Paquetes: `@supabase/supabase-js`, `@supabase/ssr`
- Cliente navegador: `src/lib/supabase/client.ts`
- Cliente servidor: `src/lib/supabase/server.ts`
- Sesión en cookies: `src/hooks.server.ts`

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `PUBLIC_SUPABASE_URL` | URL del proyecto |
| `PUBLIC_SUPABASE_ANON_KEY` | Clave anon / publishable (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo scripts/migraciones admin (opcional) |

## Comandos útiles (cuando instales Supabase CLI)

```bash
npx supabase link --project-ref tsngtzlwychbpagdinwj
npx supabase db push
npx supabase migration new nombre
```

## Fase 1 — Auth (hecho)

- Migración: `supabase/migrations/20260528120000_init_profiles.sql`
- Tabla `public.profiles` (rol `admin` | `client`, RLS, trigger al crear usuario en Auth)
- App: `src/lib/auth/auth.ts`, guards en `admin/+layout.server.ts` y `client/+layout.server.ts`

### Primer usuario administrador

Todo usuario nuevo en Auth recibe rol **`client`** por diseño (trigger `handle_new_user`). El primer **admin** hay que asignarlo en SQL.

1. Dashboard → **Authentication** → **Users** → crear usuario con email y contraseña.
2. **SQL Editor** (no uses solo el Table Editor para el rol; el trigger lo bloqueaba antes del fix `20260528180000`):
   ```sql
   update public.profiles
   set role = 'admin', nombre = 'Administrador'
   where email = 'tu-correo@ejemplo.com';
   ```
3. Comprueba:
   ```sql
   select id, email, role from public.profiles where email = 'tu-correo@ejemplo.com';
   ```
   Debe mostrar `role = admin`.
4. Cierra sesión en la app (o ventana privada) e inicia sesión de nuevo → deberías entrar a `/admin`.

**Nota:** Un usuario `client` no puede cambiarse a sí mismo a `admin` desde la app (es intencional). Solo otro admin o el SQL Editor pueden cambiar el rol.

## Fase 2 — Clientes y doctores (hecho)

- Migración: `supabase/migrations/20260528130000_clients_doctors.sql`
- Tablas: `clients`, `doctors`
- API: `src/lib/lab/clients-db.ts`, sesión portal: `src/lib/lab/client-session.ts`
- UI: `/client/perfil`, `/admin/clientes`, selector doctor en `/client/nuevo`

### Alta de cliente con acceso al portal (admin)

Desde **Admin → Clientes → Agregar cliente** se crea el usuario en **Auth** (correo + contraseña que defines tú). En la base de datos, en cadena:

1. `auth.users` (API admin con `SUPABASE_SERVICE_ROLE_KEY`)
2. Trigger `handle_new_user` → fila en `profiles` (rol `client`, nombre/clínica/teléfono desde metadata)
3. Trigger `profiles_ensure_client` → fila en `clients` enlazada por `profile_id`

Requisito en `.env` local y en Vercel:

```env
SUPABASE_SERVICE_ROLE_KEY=...   # Dashboard → Settings → API → service_role (solo servidor)
```

Código: `src/routes/admin/clientes/+page.server.ts`, `src/lib/auth/create-portal-user.ts`

### Eliminar cliente / acceso

En el detalle del cliente (**Admin → Clientes → [cliente] → Eliminar cliente**):

| Situación | Qué hace |
|-----------|----------|
| Sin casos | Borra fila en `clients`, doctores asociados y usuario en Auth. |
| Con casos | Borra usuario Auth y desactiva `clients` (`activo = false`); casos y facturas permanecen. |

Código: `src/lib/auth/delete-portal-user.ts`, acción `?/delete` en `[clientId]/+page.server.ts`

## Fase 3 — Catálogo (hecho)

- Migración: `supabase/migrations/20260528140000_treatment_catalog.sql`
- Tablas: `treatments`, `restoration_prices`, `surgical_guide_prices`, `pricing_addons`
- App: `treatments-db.ts`, `catalog-cache.ts`, hidratación en login

## Fase 4 — Casos (hecho)

- Migración: `supabase/migrations/20260528150000_cases.sql`
- Tablas: `cases`, `case_items`, `case_item_teeth`, `case_status_history`, `lab_sequences`
- Función: `next_case_number()`
- App: `cases-db.ts`, `cases-cache.ts`, `case-builder.ts`

## Fase 5 — Archivos (hecho)

- Migración: `supabase/migrations/20260528160000_case_files_storage.sql`
- Buckets privados: `case-scans`, `case-designs`
- Tabla: `case_files` + políticas RLS en Storage
- App: `case-files-db.ts`, subida en `createCase`, descarga en `attachments.ts`

## Fase 6 — Facturas (hecho)

- Migración: `supabase/migrations/20260528170000_invoices.sql`
- Tablas: `invoices`, `invoice_lines`
- Función: `next_invoice_number()`
- App: `invoices-db.ts`, `invoices-cache.ts`, hidratación con `hydrateLabDataOnce()`

## Próximos pasos opcionales

Ver `docs/PENDIENTES.md` (settings, migración legacy base64, pruebas E2E en producción).

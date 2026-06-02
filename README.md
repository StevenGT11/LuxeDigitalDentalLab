# Luxe Digital Dental Lab

Panel de laboratorio dental (admin) y portal para clínicas (cliente). SvelteKit 5, Supabase (Auth, Postgres, Storage).

## Inicio rápido

```bash
npm install
cp .env.example .env   # PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Documentación Supabase: [`docs/supabase.md`](docs/supabase.md) · Pendientes: [`docs/PENDIENTES.md`](docs/PENDIENTES.md)

## Esquema Postgres (resumen)

Migraciones en `supabase/migrations/`:

| Área | Tablas / recursos |
|------|-------------------|
| Auth | `profiles` (rol `admin` \| `client`) |
| Clientes | `clients`, `doctors` |
| Catálogo | `treatments`, `restoration_prices`, `surgical_guide_prices`, `pricing_addons` |
| Casos | `cases`, `case_items`, `case_item_teeth`, `case_status_history`, `lab_sequences` |
| Archivos | `case_files` + buckets `case-scans`, `case-designs` |
| Facturación | `invoices`, `invoice_lines` |

Funciones: `next_case_number()`, `next_invoice_number()`.

## App (rutas principales)

- `/` — login (Supabase Auth)
- `/admin` — dashboard, casos, clientes, facturas, tratamientos, calendario, estadísticas
- `/client` — casos del cliente, nuevo caso, perfil

Datos de casos/facturas/catálogo se hidratan al iniciar sesión (`hydrateLabDataOnce`, `hydrateTreatmentsCatalogOnce`).

## Primer administrador

1. Crear usuario en Supabase → Authentication.
2. SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin', nombre = 'Administrador'
   where email = 'tu-correo@ejemplo.com';
   ```

## Tecnologías

- **Frontend:** SvelteKit, Svelte 5, Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL, Storage, Auth)
- **UI:** shadcn-svelte, bits-ui

## Notas

- Sin Supabase configurado, la app puede usar datos demo en `localStorage` (solo desarrollo).
- Con Supabase, tras la primera hidratación se eliminan claves locales de casos/facturas demo.

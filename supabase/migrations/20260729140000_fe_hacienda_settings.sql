-- Ambiente activo para emitir comprobantes (admin UI toggle; fallback: FE_HACIENDA_AMBIENTE en .env)

create table if not exists public.fe_hacienda_settings (
	id smallint primary key default 1 check (id = 1),
	emit_ambiente text not null default 'staging'::text
		check (emit_ambiente = any (array ['staging'::text, 'production'::text])),
	updated_at timestamptz not null default now()
);

insert into public.fe_hacienda_settings (id, emit_ambiente)
values (1, 'staging')
on conflict (id) do nothing;

create trigger fe_hacienda_settings_set_updated_at
before update on public.fe_hacienda_settings
for each row
execute function public.set_updated_at();

alter table public.fe_hacienda_settings enable row level security;

grant select on public.fe_hacienda_settings to authenticated;
grant all on public.fe_hacienda_settings to service_role;

create policy "fe_hacienda_settings_select_admin"
on public.fe_hacienda_settings for select to authenticated
using (public.is_admin());

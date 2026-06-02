-- Fase 3: catálogo de tratamientos, precios restauración, guías y add-ons

create type public.treatment_category as enum ('diseno', 'restauracion', 'guias', 'otros');
create type public.restoration_material as enum ('zirconio', 'disilicato', 'impreso');

create table public.treatments (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique,
	label text not null,
	categoria public.treatment_category not null,
	sort_order int not null default 0,
	precio_diseno numeric(12, 2) not null default 0,
	precio_fresado numeric(12, 2) not null default 0,
	precio_crc_diseno numeric(12, 2) not null default 0,
	precio_crc_fresado numeric(12, 2) not null default 0,
	activo boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index treatments_categoria_idx on public.treatments (categoria);
create index treatments_activo_idx on public.treatments (activo);

create table public.restoration_prices (
	id uuid primary key default gen_random_uuid(),
	treatment_id uuid not null references public.treatments (id) on delete cascade,
	material public.restoration_material not null,
	precio_diseno numeric(12, 2) not null default 0,
	precio_fresado numeric(12, 2) not null default 0,
	precio_crc_diseno numeric(12, 2) not null default 0,
	precio_crc_fresado numeric(12, 2) not null default 0,
	unique (treatment_id, material)
);

create table public.surgical_guide_prices (
	implantes int primary key check (implantes between 1 and 6),
	precio_usd numeric(12, 2) not null,
	precio_crc numeric(12, 2) not null
);

create table public.pricing_addons (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	label text not null,
	treatment_slug text references public.treatments (slug) on delete set null,
	precio_diseno_usd numeric(12, 2) not null default 0,
	precio_fresado_usd numeric(12, 2) not null default 0,
	precio_diseno_crc numeric(12, 2) not null default 0,
	precio_fresado_crc numeric(12, 2) not null default 0
);

create trigger treatments_set_updated_at
before update on public.treatments
for each row
execute function public.set_updated_at();

-- ——— Tratamientos ———
insert into public.treatments (slug, label, categoria, sort_order, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado) values
('ferula_diseno', 'Férula', 'diseno', 0, 30, 0, 15000, 0),
('modelos_fundas_blanqueamiento', 'Modelos para fundas de blanqueamiento (2)', 'diseno', 1, 20, 0, 10000, 0),
('carga_inmediata', 'Carga inmediata', 'diseno', 2, 200, 0, 100000, 0),
('diseno_arcada_completa', 'Diseño de arcada completa', 'diseno', 3, 100, 0, 50000, 0),
('rest_corona', 'Corona', 'restauracion', 0, 8, 90, 4000, 45000),
('rest_carilla', 'Carilla', 'restauracion', 1, 8, 90, 4000, 45000),
('rest_puente', 'Puente', 'restauracion', 2, 8, 90, 4000, 45000),
('rest_inlay', 'Inlay', 'restauracion', 3, 8, 90, 4000, 45000),
('rest_onlay', 'Onlay', 'restauracion', 4, 8, 90, 4000, 45000),
('rest_pilar', 'Pilar personalizado', 'restauracion', 5, 8, 90, 4000, 45000),
('rest_estructura_zirconio', 'Estructura de zirconio (sin tibases)', 'restauracion', 6, 0, 1800, 0, 900000),
('rest_modelo_resina', 'Modelo de resina', 'restauracion', 7, 0, 10, 0, 5000),
('rest_ferula_impresa', 'Férula impresa', 'restauracion', 8, 0, 100, 0, 50000),
('rest_completo_arc', 'Completo arc (prótesis implantada de larga duración)', 'restauracion', 9, 0, 500, 0, 250000),
('rest_resina_larga_duracion', 'Restauración resina de larga duración (unidad)', 'restauracion', 10, 0, 50, 0, 20000),
('rest_resina_provisional', 'Restauración resina provisional', 'restauracion', 11, 0, 30, 0, 10000),
('rest_provisional_aletas', 'Provisional con aletas (unidad)', 'restauracion', 12, 0, 50, 0, 25000),
('rest_mockup_arcada', 'Arcada completa (mock up)', 'restauracion', 13, 0, 100, 0, 50000),
('guia_quirurgica', 'Guía quirúrgica', 'guias', 0, 0, 0, 0, 0),
('fundas_blanqueamiento', 'Fundas de blanqueamiento', 'otros', 0, 40, 0, 20000, 0),
('retenedores_ortodoncia', 'Retenedores de ortodoncia (ambas arcadas)', 'otros', 1, 60, 0, 30000, 0);

-- ——— Precios restauración (tipo × material) ———
insert into public.restoration_prices (treatment_id, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
select t.id, m.material, m.precio_diseno, m.precio_fresado, m.precio_crc_diseno, m.precio_crc_fresado
from public.treatments t
join (
	values
		('rest_corona', 'zirconio'::public.restoration_material, 8, 90, 4000, 45000),
		('rest_corona', 'disilicato', 8, 90, 4000, 45000),
		('rest_inlay', 'zirconio', 8, 90, 4000, 45000),
		('rest_inlay', 'disilicato', 8, 90, 4000, 45000),
		('rest_onlay', 'zirconio', 8, 90, 4000, 45000),
		('rest_onlay', 'disilicato', 8, 90, 4000, 45000),
		('rest_carilla', 'zirconio', 8, 90, 4000, 45000),
		('rest_carilla', 'disilicato', 8, 90, 4000, 45000),
		('rest_puente', 'zirconio', 8, 90, 4000, 45000),
		('rest_puente', 'disilicato', 8, 90, 4000, 45000),
		('rest_pilar', 'zirconio', 8, 90, 4000, 45000),
		('rest_pilar', 'disilicato', 8, 90, 4000, 45000),
		('rest_estructura_zirconio', 'zirconio', 0, 1800, 0, 900000),
		('rest_modelo_resina', 'impreso', 0, 10, 0, 5000),
		('rest_ferula_impresa', 'impreso', 0, 100, 0, 50000),
		('rest_completo_arc', 'impreso', 0, 500, 0, 250000),
		('rest_resina_larga_duracion', 'impreso', 0, 50, 0, 20000),
		('rest_resina_provisional', 'impreso', 0, 30, 0, 10000),
		('rest_provisional_aletas', 'impreso', 0, 50, 0, 25000),
		('rest_mockup_arcada', 'impreso', 0, 100, 0, 50000)
) as m(slug, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
	on t.slug = m.slug;

-- ——— Guías quirúrgicas ———
insert into public.surgical_guide_prices (implantes, precio_usd, precio_crc) values
(1, 240, 120000),
(2, 280, 140000),
(3, 320, 160000),
(4, 350, 175000),
(5, 380, 190000),
(6, 400, 200000);

-- ——— Add-ons ———
insert into public.pricing_addons (code, label, treatment_slug, precio_diseno_usd, precio_fresado_usd, precio_diseno_crc, precio_fresado_crc)
values (
	'corona_sobre_implante',
	'Corona sobre implante',
	'rest_corona',
	15,
	15,
	7500,
	7500
);

alter table public.treatments enable row level security;
alter table public.restoration_prices enable row level security;
alter table public.surgical_guide_prices enable row level security;
alter table public.pricing_addons enable row level security;

create policy "treatments_select_authenticated"
on public.treatments for select to authenticated using (true);

create policy "treatments_admin_write"
on public.treatments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "restoration_prices_select_authenticated"
on public.restoration_prices for select to authenticated using (true);

create policy "restoration_prices_admin_write"
on public.restoration_prices for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "surgical_guide_prices_select_authenticated"
on public.surgical_guide_prices for select to authenticated using (true);

create policy "surgical_guide_prices_admin_write"
on public.surgical_guide_prices for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "pricing_addons_select_authenticated"
on public.pricing_addons for select to authenticated using (true);

create policy "pricing_addons_admin_write"
on public.pricing_addons for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.treatments to authenticated;
grant select on public.restoration_prices to authenticated;
grant select on public.surgical_guide_prices to authenticated;
grant select on public.pricing_addons to authenticated;
grant insert, update, delete on public.treatments to authenticated;
grant insert, update, delete on public.restoration_prices to authenticated;
grant insert, update, delete on public.surgical_guide_prices to authenticated;
grant insert, update, delete on public.pricing_addons to authenticated;

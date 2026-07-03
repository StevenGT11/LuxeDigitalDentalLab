-- Materiales por tratamiento: clave libre + etiqueta visible (personalizados)

alter table public.restoration_prices
add column if not exists material_label text;

alter table public.restoration_prices
alter column material type text using material::text;

update public.restoration_prices
set material_label = case material
	when 'zirconio' then 'Zirconio'
	when 'disilicato' then 'Disilicato (silicato / vioclear)'
	when 'impreso' then 'Impreso (resina)'
	when 'resina_larga_duracion' then 'Resina de larga duración'
	when 'resina_provisional' then 'Resina provisional'
	else initcap(replace(material, '_', ' '))
end
where material_label is null or material_label = '';

alter table public.restoration_prices
alter column material_label set not null;

comment on column public.restoration_prices.material is 'Clave interna (slug) del material';
comment on column public.restoration_prices.material_label is 'Nombre visible al cliente';

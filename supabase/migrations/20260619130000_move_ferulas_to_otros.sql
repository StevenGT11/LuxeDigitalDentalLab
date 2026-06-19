-- Mover férulas a la categoría Otros

update public.treatments
set categoria = 'otros', sort_order = 2
where slug = 'ferula_diseno';

update public.treatments
set activo = false
where slug = 'rest_ferula_impresa';

delete from public.restoration_prices
where treatment_id = (select id from public.treatments where slug = 'rest_ferula_impresa');

insert into public.treatments (
	slug,
	label,
	categoria,
	sort_order,
	precio_diseno,
	precio_fresado,
	precio_crc_diseno,
	precio_crc_fresado
)
values ('ferula_impresa', 'Férula impresa', 'otros', 3, 0, 100, 0, 50000)
on conflict (slug) do update set
	label = excluded.label,
	categoria = excluded.categoria,
	sort_order = excluded.sort_order,
	precio_diseno = excluded.precio_diseno,
	precio_fresado = excluded.precio_fresado,
	precio_crc_diseno = excluded.precio_crc_diseno,
	precio_crc_fresado = excluded.precio_crc_fresado,
	activo = true;

update public.treatments set sort_order = 0 where slug = 'fundas_blanqueamiento';
update public.treatments set sort_order = 1 where slug = 'retenedores_ortodoncia';

-- Resina larga duración y resina provisional pasan a ser materiales de corona/carilla/inlay/onlay/puente

update public.treatments
set activo = false
where slug in ('rest_resina_larga_duracion', 'rest_resina_provisional');

delete from public.restoration_prices
where treatment_id in (
	select id from public.treatments where slug in ('rest_resina_larga_duracion', 'rest_resina_provisional')
);

insert into public.restoration_prices (treatment_id, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
select t.id, m.material, m.precio_diseno, m.precio_fresado, m.precio_crc_diseno, m.precio_crc_fresado
from public.treatments t
join (
	values
		('rest_corona', 'resina_larga_duracion'::public.restoration_material, 0, 50, 0, 20000),
		('rest_corona', 'resina_provisional', 0, 30, 0, 10000),
		('rest_carilla', 'resina_larga_duracion', 0, 50, 0, 20000),
		('rest_carilla', 'resina_provisional', 0, 30, 0, 10000),
		('rest_inlay', 'resina_larga_duracion', 0, 50, 0, 20000),
		('rest_inlay', 'resina_provisional', 0, 30, 0, 10000),
		('rest_onlay', 'resina_larga_duracion', 0, 50, 0, 20000),
		('rest_onlay', 'resina_provisional', 0, 30, 0, 10000),
		('rest_puente', 'resina_larga_duracion', 0, 50, 0, 20000),
		('rest_puente', 'resina_provisional', 0, 30, 0, 10000)
) as m(slug, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
	on t.slug = m.slug
on conflict (treatment_id, material) do update set
	precio_diseno = excluded.precio_diseno,
	precio_fresado = excluded.precio_fresado,
	precio_crc_diseno = excluded.precio_crc_diseno,
	precio_crc_fresado = excluded.precio_crc_fresado;

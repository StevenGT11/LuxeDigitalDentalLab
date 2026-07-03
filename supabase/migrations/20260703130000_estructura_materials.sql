-- Estructura: zirconio o resina de larga duración (sin tibases)

update public.treatments
set slug = 'rest_estructura'
where slug = 'rest_estructura_zirconio';

update public.case_items
set tipo_trabajo = 'rest_estructura'
where tipo_trabajo in ('rest_estructura_zirconio', 'zirconio_estructura_sin_tibases');

insert into public.restoration_prices (treatment_id, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
select t.id, m.material, m.precio_diseno, m.precio_fresado, m.precio_crc_diseno, m.precio_crc_fresado
from public.treatments t
join (
	values
		('rest_estructura', 'zirconio'::public.restoration_material, 0, 1800, 0, 900000),
		('rest_estructura', 'resina_larga_duracion', 0, 500, 0, 250000)
) as m(slug, material, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado)
	on t.slug = m.slug
on conflict (treatment_id, material) do update set
	precio_diseno = excluded.precio_diseno,
	precio_fresado = excluded.precio_fresado,
	precio_crc_diseno = excluded.precio_crc_diseno,
	precio_crc_fresado = excluded.precio_crc_fresado;

update public.treatments
set precio_diseno = 0,
	precio_fresado = 1800,
	precio_crc_diseno = 0,
	precio_crc_fresado = 900000
where slug = 'rest_estructura';

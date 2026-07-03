-- Restauración: precio único por pieza (diseño incluido en el fresado)

update public.restoration_prices rp
set
	precio_fresado = rp.precio_diseno + rp.precio_fresado,
	precio_crc_fresado = rp.precio_crc_diseno + rp.precio_crc_fresado,
	precio_diseno = 0,
	precio_crc_diseno = 0
from public.treatments t
where rp.treatment_id = t.id
	and t.categoria = 'restauracion'
	and (rp.precio_diseno > 0 or rp.precio_crc_diseno > 0);

update public.treatments
set
	precio_fresado = precio_diseno + precio_fresado,
	precio_crc_fresado = precio_crc_diseno + precio_crc_fresado,
	precio_diseno = 0,
	precio_crc_diseno = 0
where categoria = 'restauracion'
	and (precio_diseno > 0 or precio_crc_diseno > 0);

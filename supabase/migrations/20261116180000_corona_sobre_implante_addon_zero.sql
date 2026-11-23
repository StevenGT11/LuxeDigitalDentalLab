-- El precio de corona ya incluye sobre implante; el extra es opcional (0 = sin recargo).
update public.pricing_addons
set
	precio_diseno_usd = 0,
	precio_fresado_usd = 0,
	precio_diseno_crc = 0,
	precio_fresado_crc = 0
where code = 'corona_sobre_implante';

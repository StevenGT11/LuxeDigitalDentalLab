-- Tarifas de fresado por material: zirconio 90, disilicato 100, resina larga 40, provisional 30

update public.restoration_prices rp
set
	precio_fresado = case rp.material
		when 'zirconio' then 90
		when 'disilicato' then 100
		when 'resina_larga_duracion' then 40
		when 'resina_provisional' then 30
		else rp.precio_fresado
	end,
	precio_crc_fresado = case rp.material
		when 'zirconio' then 45000
		when 'disilicato' then 50000
		when 'resina_larga_duracion' then 20000
		when 'resina_provisional' then 10000
		else rp.precio_crc_fresado
	end
where rp.material in ('zirconio', 'disilicato', 'resina_larga_duracion', 'resina_provisional');

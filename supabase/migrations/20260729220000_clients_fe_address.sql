-- Dirección fiscal del receptor (Hacienda v4.4: provincia 1-7, cantón/distrito 2 dígitos).
alter table public.clients
	add column if not exists fe_provincia smallint
		check (fe_provincia is null or (fe_provincia >= 1 and fe_provincia <= 7)),
	add column if not exists fe_canton text,
	add column if not exists fe_distrito text,
	add column if not exists fe_otras_senas text;

comment on column public.clients.fe_provincia is 'Provincia Hacienda (1-7).';
comment on column public.clients.fe_canton is 'Cantón Hacienda (2 dígitos, ej. 01).';
comment on column public.clients.fe_distrito is 'Distrito Hacienda (2 dígitos, ej. 01).';
comment on column public.clients.fe_otras_senas is 'Otras señas de la dirección fiscal del receptor.';

-- Datos de implante para coronas sobre implante (marca y plataforma)

alter table public.case_items
	add column if not exists implante_marca text,
	add column if not exists implante_plataforma text;

comment on column public.case_items.implante_marca is 'Marca del implante cuando corona_sobre_implante = true';
comment on column public.case_items.implante_plataforma is 'Tamaño de plataforma del implante (NP, RP, mm, etc.)';

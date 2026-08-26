-- IVA tarifa por tratamiento (copiada a invoice_lines al facturar; CABYS sugiere el valor)

alter table public.treatments
	add column if not exists impuesto_tarifa numeric(5, 2) not null default 13;

comment on column public.treatments.impuesto_tarifa is
	'Tarifa IVA Hacienda (impuesto_tarifa en líneas FE). Suele coincidir con el CABYS.';

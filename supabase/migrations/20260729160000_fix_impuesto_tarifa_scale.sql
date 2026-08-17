-- Corrige tarifas IVA guardadas como decimal CABYS (0.13) o confundidas con codigo Hacienda 08 (8).

update public.treatments
set impuesto_tarifa = round(impuesto_tarifa * 100, 2)
where impuesto_tarifa > 0 and impuesto_tarifa < 1;

update public.invoice_lines
set impuesto_tarifa = round(impuesto_tarifa * 100, 2)
where impuesto_tarifa > 0 and impuesto_tarifa < 1;

update public.treatments
set impuesto_tarifa = 13
where impuesto_tarifa = 8;

update public.invoice_lines
set impuesto_tarifa = 13
where impuesto_tarifa = 8;

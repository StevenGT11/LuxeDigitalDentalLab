-- Normalize legacy unidad medida codes for Hacienda FE v4.4.
update public.treatments
set fe_unidad_medida = 'OS'
where lower(fe_unidad_medida) = 'os';

update public.invoice_lines
set fe_unidad_medida = 'OS'
where lower(fe_unidad_medida) = 'os';

-- Permite varias facturas internas por caso (p. ej. factura corregida tras NC).
alter table public.invoices drop constraint if exists invoices_case_id_key;

alter table public.invoices
	add column if not exists source_invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists invoices_source_invoice_id_idx
	on public.invoices (source_invoice_id)
	where source_invoice_id is not null;

comment on column public.invoices.source_invoice_id is
	'Factura origen cuando esta es una copia para re-facturar tras NC/ND.';

-- Motivo NC/ND guardado al crear borrador (re-envío sin volver a capturar).
alter table public.fe_comprobantes
	add column if not exists referencia_codigo text,
	add column if not exists referencia_razon text;

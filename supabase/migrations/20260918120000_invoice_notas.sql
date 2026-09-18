-- Notas libres de la factura interna (PDF y revisión al emitir FE).
alter table public.invoices
	add column if not exists notas text;

comment on column public.invoices.notas is 'Observaciones de la factura (representación gráfica y revisión antes de emitir FE).';

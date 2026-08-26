-- Cobro: pendiente → facturado (FE emitida) → pagado

alter type public.invoice_estado add value if not exists 'facturado' after 'pendiente';
alter type public.invoice_estado add value if not exists 'pagado' after 'facturado';

update public.invoices
set estado = 'pagado'::public.invoice_estado
where estado = 'pagada'::public.invoice_estado;

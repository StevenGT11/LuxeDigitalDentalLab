-- 1) Primero corre SOLO este SELECT en el SQL Editor.
-- Debes ver invoice_lines (y ojalá treatments).
-- Proyecto correcto: tsngtzlwychbpagdinwj
-- https://supabase.com/dashboard/project/tsngtzlwychbpagdinwj/sql
select table_schema, table_name
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
	and (
		table_name ilike '%invoice%'
		or table_name ilike '%factura%'
		or table_name ilike '%treatment%'
		or table_name ilike '%cabys%'
	)
order by 1, 2;

-- 2) Si ya viste invoice_lines, corre el bloque de abajo (sin el SELECT de arriba).

do $$
declare
	v_cabys text := '4817106030500';
	v_iva numeric := 0;
	v_lines integer;
	v_treatments integer := 0;
	v_invoices integer;
	v_tablas text;
begin
	if v_cabys !~ '^\d{13}$' then
		raise exception 'CABYS inválido: %', v_cabys;
	end if;

	if to_regclass('public.invoice_lines') is null then
		select string_agg(table_schema || '.' || table_name, ', ' order by table_schema, table_name)
		into v_tablas
		from information_schema.tables
		where table_schema not in ('pg_catalog', 'information_schema')
			and table_type = 'BASE TABLE';

		raise exception
			'Este proyecto no tiene public.invoice_lines. Abrí el SQL Editor de Luxe (tsngtzlwychbpagdinwj). Tablas aquí: %',
			coalesce(v_tablas, '(ninguna)');
	end if;

	if to_regclass('public.treatments') is not null then
		update public.treatments
		set
			fe_cabys = v_cabys,
			impuesto_tarifa = v_iva
		where coalesce(fe_cabys, '') is distinct from v_cabys
			or impuesto_tarifa is distinct from v_iva;
		get diagnostics v_treatments = row_count;
	end if;

	update public.invoice_lines
	set
		fe_cabys = v_cabys,
		impuesto_tarifa = v_iva
	where coalesce(fe_cabys, '') is distinct from v_cabys
		or impuesto_tarifa is distinct from v_iva;
	get diagnostics v_lines = row_count;

	with line_tax as (
		select
			invoice_id,
			round(sum(subtotal)::numeric, 2) as subtotal,
			round(sum(subtotal * (impuesto_tarifa / 100.0))::numeric, 2) as impuesto
		from public.invoice_lines
		group by invoice_id
	)
	update public.invoices i
	set
		subtotal = lt.subtotal,
		impuesto = lt.impuesto,
		total = round((lt.subtotal + lt.impuesto)::numeric, 2)
	from line_tax lt
	where i.id = lt.invoice_id
		and (
			i.subtotal is distinct from lt.subtotal
			or i.impuesto is distinct from lt.impuesto
			or i.total is distinct from round((lt.subtotal + lt.impuesto)::numeric, 2)
		);
	get diagnostics v_invoices = row_count;

	raise notice 'treatments=% invoice_lines=% invoices=% cabys=% iva=%',
		v_treatments, v_lines, v_invoices, v_cabys, v_iva;
end $$;

select fe_cabys, impuesto_tarifa, count(*) as lineas
from public.invoice_lines
group by 1, 2
order by lineas desc;

-- Consecutivos Hacienda separados por ambiente (staging / production).

drop function if exists public.next_fe_consecutivo_num(text);

insert into public.lab_sequences (name, value)
select
	'fe_consecutivo_' || t.tipo || '_' || a.ambiente,
	coalesce(
		(select ls.value from public.lab_sequences ls where ls.name = 'fe_consecutivo_' || t.tipo),
		0
	)
from (values ('01'), ('02'), ('03'), ('04'), ('08')) as t(tipo)
cross join (values ('staging'), ('production')) as a(ambiente)
on conflict (name) do nothing;

alter table public.fe_comprobantes
	add column if not exists ambiente text
		check (ambiente is null or ambiente in ('staging', 'production'));

comment on column public.fe_comprobantes.ambiente is
	'Ambiente Hacienda usado al emitir (staging o production).';

create or replace function public.next_fe_consecutivo_num(
	p_tipo_documento text,
	p_ambiente text default 'staging'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
	seq_name text;
	n bigint;
begin
	if p_tipo_documento not in ('01', '02', '03', '04', '08') then
		raise exception 'tipo_documento inválido: %', p_tipo_documento;
	end if;
	if p_ambiente not in ('staging', 'production') then
		raise exception 'ambiente inválido: %', p_ambiente;
	end if;

	seq_name := 'fe_consecutivo_' || p_tipo_documento || '_' || p_ambiente;

	update public.lab_sequences
	set value = value + 1
	where name = seq_name
	returning value into n;

	if n is null then
		raise exception 'secuencia no encontrada: %', seq_name;
	end if;

	return n;
end;
$$;

revoke all on function public.next_fe_consecutivo_num(text, text) from public;
grant execute on function public.next_fe_consecutivo_num(text, text) to service_role;

comment on function public.next_fe_consecutivo_num(text, text) is
	'Incrementa y devuelve el siguiente consecutivo_num por tipo documento y ambiente Hacienda.';

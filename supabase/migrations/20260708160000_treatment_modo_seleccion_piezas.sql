-- Modo de selección de piezas: arcadas | odontograma | ninguno

alter table public.treatments
add column if not exists modo_seleccion_piezas text;

update public.treatments
set modo_seleccion_piezas = case
	when por_arcadas = true then 'arcadas'
	when categoria = 'restauracion' then 'odontograma'
	else 'ninguno'
end
where modo_seleccion_piezas is null;

alter table public.treatments
alter column modo_seleccion_piezas set default 'ninguno';

update public.treatments
set modo_seleccion_piezas = 'ninguno'
where modo_seleccion_piezas is null;

alter table public.treatments
alter column modo_seleccion_piezas set not null;

alter table public.treatments drop constraint if exists treatments_modo_seleccion_piezas_check;

alter table public.treatments
add constraint treatments_modo_seleccion_piezas_check
check (modo_seleccion_piezas in ('arcadas', 'odontograma', 'ninguno'));

comment on column public.treatments.modo_seleccion_piezas is
	'Cómo el cliente indica alcance: arcadas (superior/inferior/ambas), odontograma (piezas FDI) o ninguno';

alter table public.treatments drop column if exists por_arcadas;

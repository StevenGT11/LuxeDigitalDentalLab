-- Tratamientos por arcadas: sin odontograma; el cliente elige superior, inferior o ambas

alter table public.treatments
add column if not exists por_arcadas boolean not null default false;

comment on column public.treatments.por_arcadas is 'Si true, el caso pide arcada superior/inferior/ambas en lugar del odontograma';

update public.treatments
set por_arcadas = true
where slug in (
	'ferula_diseno',
	'ferula_impresa',
	'fundas_blanqueamiento',
	'retenedores_ortodoncia'
);

alter table public.case_items drop constraint if exists case_items_alcance_arcada_check;

alter table public.case_items
add constraint case_items_alcance_arcada_check
check (
	alcance_arcada is null
	or alcance_arcada in ('superior', 'inferior', 'ambas', 'una')
);

comment on column public.case_items.alcance_arcada is 'superior | inferior | ambas (una = legado, 1 arcada)';

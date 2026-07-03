-- Tratamientos compatibles con corona/restauración sobre implante

alter table public.treatments
add column if not exists sobre_implante boolean not null default false;

comment on column public.treatments.sobre_implante is 'Si true, el cliente puede marcar «sobre implante» y capturar datos del implante';

update public.treatments
set sobre_implante = true
where slug = 'rest_corona';

-- Alcance de arcada para fundas de blanqueamiento y retenedores de ortodoncia

alter table public.case_items
add column if not exists alcance_arcada text
check (alcance_arcada is null or alcance_arcada in ('una', 'ambas'));

comment on column public.case_items.alcance_arcada is 'una | ambas — fundas de blanqueamiento y retenedores de ortodoncia';

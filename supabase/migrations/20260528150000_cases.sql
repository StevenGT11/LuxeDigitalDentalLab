-- Fase 4: casos, ítems, dientes y historial de estado

create type public.case_estado as enum (
	'pendiente',
	'en_diseño',
	'diseñado',
	'fresado',
	'horneando',
	'maquillando',
	'finalizado'
);

create table public.lab_sequences (
	name text primary key,
	value bigint not null default 0
);

insert into public.lab_sequences (name, value) values ('case_number', 0);

create or replace function public.next_case_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
	update public.lab_sequences
	set value = value + 1
	where name = 'case_number'
	returning value into n;
	return 'LAB-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_case_number() from public;
grant execute on function public.next_case_number() to authenticated;

create table public.cases (
	id uuid primary key default gen_random_uuid(),
	case_number text not null unique,
	client_id uuid not null references public.clients (id) on delete restrict,
	doctor_id uuid references public.doctors (id) on delete set null,
	doctor_name text not null default '',
	paciente_name text not null,
	client_name text not null default '',
	client_clinica text not null default '',
	tipo_trabajo text not null default '',
	material text,
	color text,
	piezas int not null default 1,
	costo numeric(12, 2) not null default 0,
	fecha_creacion timestamptz not null default now(),
	fecha_entrega timestamptz not null,
	estado public.case_estado not null default 'pendiente',
	notas text,
	archivos jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index cases_client_id_idx on public.cases (client_id);
create index cases_estado_idx on public.cases (estado);
create index cases_fecha_entrega_idx on public.cases (fecha_entrega);
create index cases_fecha_creacion_idx on public.cases (fecha_creacion desc);

create table public.case_items (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.cases (id) on delete cascade,
	sort_order int not null default 0,
	numero_pieza text,
	tipo_trabajo text not null,
	material text,
	color text,
	piezas int not null default 1,
	incluye_diseno boolean not null default true,
	incluye_fresado boolean not null default false,
	implantes_guia int check (implantes_guia is null or (implantes_guia >= 1 and implantes_guia <= 6)),
	corona_sobre_implante boolean not null default false,
	descripcion text,
	tipo_pieza jsonb,
	unit_price numeric(12, 2) not null default 0,
	subtotal numeric(12, 2) not null default 0,
	created_at timestamptz not null default now()
);

create index case_items_case_id_idx on public.case_items (case_id);

create table public.case_item_teeth (
	id uuid primary key default gen_random_uuid(),
	case_item_id uuid not null references public.case_items (id) on delete cascade,
	tooth_fdi text not null
);

create index case_item_teeth_item_idx on public.case_item_teeth (case_item_id);

create table public.case_status_history (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.cases (id) on delete cascade,
	estado public.case_estado not null,
	changed_at timestamptz not null default now(),
	changed_by uuid references public.profiles (id) on delete set null
);

create index case_status_history_case_idx on public.case_status_history (case_id, changed_at desc);

create trigger cases_set_updated_at
before update on public.cases
for each row
execute function public.set_updated_at();

create or replace function public.log_case_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		insert into public.case_status_history (case_id, estado, changed_by)
		values (new.id, new.estado, auth.uid());
	elsif tg_op = 'UPDATE' and old.estado is distinct from new.estado then
		insert into public.case_status_history (case_id, estado, changed_by)
		values (new.id, new.estado, auth.uid());
	end if;
	return new;
end;
$$;

create trigger cases_log_status
after insert or update of estado on public.cases
for each row
execute function public.log_case_status_change();

alter table public.cases enable row level security;
alter table public.case_items enable row level security;
alter table public.case_item_teeth enable row level security;
alter table public.case_status_history enable row level security;

-- cases
create policy "cases_select_admin"
on public.cases for select to authenticated
using (public.is_admin());

create policy "cases_select_own_client"
on public.cases for select to authenticated
using (client_id = public.current_client_id());

create policy "cases_insert_own_client"
on public.cases for insert to authenticated
with check (client_id = public.current_client_id());

create policy "cases_update_admin"
on public.cases for update to authenticated
using (public.is_admin());

-- case_items (via case ownership)
create policy "case_items_select_admin"
on public.case_items for select to authenticated
using (
	exists (select 1 from public.cases c where c.id = case_id and public.is_admin())
);

create policy "case_items_select_own"
on public.case_items for select to authenticated
using (
	exists (
		select 1 from public.cases c
		where c.id = case_id and c.client_id = public.current_client_id()
	)
);

create policy "case_items_insert_own"
on public.case_items for insert to authenticated
with check (
	exists (
		select 1 from public.cases c
		where c.id = case_id and c.client_id = public.current_client_id()
	)
);

create policy "case_items_update_admin"
on public.case_items for update to authenticated
using (public.is_admin());

-- case_item_teeth
create policy "case_item_teeth_select_admin"
on public.case_item_teeth for select to authenticated
using (
	exists (
		select 1
		from public.case_items ci
		join public.cases c on c.id = ci.case_id
		where ci.id = case_item_id and public.is_admin()
	)
);

create policy "case_item_teeth_select_own"
on public.case_item_teeth for select to authenticated
using (
	exists (
		select 1
		from public.case_items ci
		join public.cases c on c.id = ci.case_id
		where ci.id = case_item_id and c.client_id = public.current_client_id()
	)
);

create policy "case_item_teeth_insert_own"
on public.case_item_teeth for insert to authenticated
with check (
	exists (
		select 1
		from public.case_items ci
		join public.cases c on c.id = ci.case_id
		where ci.id = case_item_id and c.client_id = public.current_client_id()
	)
);

-- status history
create policy "case_status_history_select_admin"
on public.case_status_history for select to authenticated
using (public.is_admin());

create policy "case_status_history_select_own"
on public.case_status_history for select to authenticated
using (
	exists (
		select 1 from public.cases c
		where c.id = case_id and c.client_id = public.current_client_id()
	)
);

grant select, insert, update on public.cases to authenticated;
grant select, insert, update on public.case_items to authenticated;
grant select, insert on public.case_item_teeth to authenticated;
grant select on public.case_status_history to authenticated;

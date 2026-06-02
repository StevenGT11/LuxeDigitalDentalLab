-- Fase 2: clientes del laboratorio y doctores por clínica

create table public.clients (
	id uuid primary key default gen_random_uuid(),
	profile_id uuid unique references public.profiles (id) on delete set null,
	nombre text not null,
	clinica text not null default '',
	email text not null default '',
	telefono text not null default '',
	activo boolean not null default true,
	fecha_registro timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index clients_profile_id_idx on public.clients (profile_id);
create index clients_nombre_idx on public.clients (nombre);
create index clients_email_idx on public.clients (email);

comment on table public.clients is 'Clínicas / cuentas del laboratorio; profile_id enlaza al usuario del portal';

create table public.doctors (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references public.clients (id) on delete cascade,
	nombre text not null,
	activo boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index doctors_client_id_idx on public.doctors (client_id);
create index doctors_nombre_idx on public.doctors (nombre);

comment on table public.doctors is 'Doctores asociados a una clínica cliente';

create trigger clients_set_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

create trigger doctors_set_updated_at
before update on public.doctors
for each row
execute function public.set_updated_at();

-- Fila en clients al crear perfil de portal (rol client)
create or replace function public.ensure_client_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.role = 'client' then
		insert into public.clients (profile_id, nombre, email, clinica, telefono)
		values (
			new.id,
			coalesce(nullif(trim(new.nombre), ''), 'Cliente'),
			coalesce(new.email, ''),
			coalesce(new.clinica, ''),
			coalesce(new.telefono, '')
		)
		on conflict (profile_id) do nothing;
	end if;
	return new;
end;
$$;

create trigger profiles_ensure_client
after insert on public.profiles
for each row
execute function public.ensure_client_for_profile();

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
	select c.id
	from public.clients c
	where c.profile_id = auth.uid()
		and c.activo = true
	limit 1;
$$;

revoke all on function public.current_client_id() from public;
grant execute on function public.current_client_id() to authenticated;

-- Backfill: perfiles client existentes sin fila en clients
insert into public.clients (profile_id, nombre, email, clinica, telefono)
select
	p.id,
	coalesce(nullif(trim(p.nombre), ''), 'Cliente'),
	coalesce(p.email, ''),
	coalesce(p.clinica, ''),
	coalesce(p.telefono, '')
from public.profiles p
where p.role = 'client'
on conflict (profile_id) do nothing;

alter table public.clients enable row level security;
alter table public.doctors enable row level security;

-- clients
create policy "clients_select_admin"
on public.clients
for select
to authenticated
using (public.is_admin());

create policy "clients_insert_admin"
on public.clients
for insert
to authenticated
with check (public.is_admin());

create policy "clients_update_admin"
on public.clients
for update
to authenticated
using (public.is_admin());

create policy "clients_delete_admin"
on public.clients
for delete
to authenticated
using (public.is_admin());

create policy "clients_select_own"
on public.clients
for select
to authenticated
using (profile_id = auth.uid());

create policy "clients_update_own"
on public.clients
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- doctors
create policy "doctors_select_admin"
on public.doctors
for select
to authenticated
using (public.is_admin());

create policy "doctors_insert_admin"
on public.doctors
for insert
to authenticated
with check (public.is_admin());

create policy "doctors_update_admin"
on public.doctors
for update
to authenticated
using (public.is_admin());

create policy "doctors_delete_admin"
on public.doctors
for delete
to authenticated
using (public.is_admin());

create policy "doctors_select_own"
on public.doctors
for select
to authenticated
using (client_id = public.current_client_id());

create policy "doctors_insert_own"
on public.doctors
for insert
to authenticated
with check (client_id = public.current_client_id());

create policy "doctors_update_own"
on public.doctors
for update
to authenticated
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "doctors_delete_own"
on public.doctors
for delete
to authenticated
using (client_id = public.current_client_id());

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.doctors to authenticated;

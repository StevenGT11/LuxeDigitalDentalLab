-- Fase 1: perfiles de usuario vinculados a Supabase Auth

create type public.user_role as enum ('admin', 'client');

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	role public.user_role not null default 'client',
	nombre text not null default '',
	email text not null,
	telefono text,
	clinica text,
	activo boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (email);

comment on table public.profiles is 'Perfil extendido de auth.users (rol admin/cliente del laboratorio)';

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Perfil al registrarse (rol siempre client; admin se asigna manualmente en SQL)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (id, email, nombre, role)
	values (
		new.id,
		coalesce(new.email, ''),
		coalesce(
			nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
			split_part(coalesce(new.email, 'usuario'), '@', 1)
		),
		'client'
	);
	return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Solo admins (lectura desde profiles con privilegios elevados)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
	select exists (
		select 1
		from public.profiles
		where id = auth.uid()
			and role = 'admin'
			and activo = true
	);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Impedir que usuarios cambien su propio rol
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if old.role is distinct from new.role and not public.is_admin() then
		new.role := old.role;
	end if;
	return new;
end;
$$;

create trigger profiles_guard_role
before update on public.profiles
for each row
execute function public.profiles_guard_role();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin());

grant select, update on public.profiles to authenticated;

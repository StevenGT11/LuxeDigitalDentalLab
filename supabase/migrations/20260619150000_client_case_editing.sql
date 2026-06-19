-- Clientes pueden editar casos pendientes; auditoría de última edición

alter table public.cases
	add column if not exists last_edited_at timestamptz,
	add column if not exists last_edited_by uuid references public.profiles (id) on delete set null,
	add column if not exists last_edited_by_name text;

comment on column public.cases.last_edited_at is 'Última edición de contenido por el cliente';
comment on column public.cases.last_edited_by is 'Perfil que editó por última vez';
comment on column public.cases.last_edited_by_name is 'Nombre visible del editor (desnormalizado)';

create or replace function public.cases_guard_client_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	editor_name text;
begin
	if public.is_staff() then
		return new;
	end if;

	if auth.uid() is null then
		return new;
	end if;

	if exists (
		select 1
		from public.clients cl
		where cl.id = old.client_id
			and cl.profile_id = auth.uid()
	) then
		new.estado := old.estado;
		new.case_number := old.case_number;
		new.client_id := old.client_id;
		new.client_name := old.client_name;
		new.client_clinica := old.client_clinica;
		new.fecha_creacion := old.fecha_creacion;

		select nullif(trim(p.nombre), '')
		into editor_name
		from public.profiles p
		where p.id = auth.uid();

		new.last_edited_at := now();
		new.last_edited_by := auth.uid();
		new.last_edited_by_name := coalesce(editor_name, 'Cliente');
	end if;

	return new;
end;
$$;

drop trigger if exists cases_guard_client_edit on public.cases;
create trigger cases_guard_client_edit
before update on public.cases
for each row
execute function public.cases_guard_client_edit();

create policy "cases_update_own_client"
on public.cases for update to authenticated
using (
	not public.is_staff()
	and client_id = public.current_client_id()
	and estado = 'pendiente'::public.case_estado
)
with check (
	not public.is_staff()
	and client_id = public.current_client_id()
	and estado = 'pendiente'::public.case_estado
);

create policy "case_items_delete_own_pending"
on public.case_items for delete to authenticated
using (
	not public.is_staff()
	and exists (
		select 1
		from public.cases c
		where c.id = case_id
			and c.client_id = public.current_client_id()
			and c.estado = 'pendiente'::public.case_estado
	)
);

grant delete on public.case_items to authenticated;

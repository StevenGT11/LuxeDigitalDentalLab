-- Rol técnico (empleado del laboratorio): acceso operativo sin datos financieros

alter type public.user_role add value if not exists 'technician';

create or replace function public.is_technician()
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
			and role = 'technician'
			and activo = true
	);
$$;

revoke all on function public.is_technician() from public;
grant execute on function public.is_technician() to authenticated;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
	select public.is_admin() or public.is_technician();
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- Impide que técnicos modifiquen montos en casos
create or replace function public.cases_guard_technician_financial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if public.is_technician() and old.costo is distinct from new.costo then
		new.costo := old.costo;
	end if;
	return new;
end;
$$;

drop trigger if exists cases_guard_technician_financial on public.cases;
create trigger cases_guard_technician_financial
before update on public.cases
for each row
execute function public.cases_guard_technician_financial();

-- Impide que técnicos modifiquen precios en ítems
create or replace function public.case_items_guard_technician_financial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if public.is_technician() then
		new.unit_price := old.unit_price;
		new.subtotal := old.subtotal;
	end if;
	return new;
end;
$$;

drop trigger if exists case_items_guard_technician_financial on public.case_items;
create trigger case_items_guard_technician_financial
before update on public.case_items
for each row
execute function public.case_items_guard_technician_financial();

-- Casos: lectura y cambio de estado para staff
create policy "cases_select_staff"
on public.cases for select to authenticated
using (public.is_technician());

create policy "cases_update_technician"
on public.cases for update to authenticated
using (public.is_technician());

-- Ítems de caso: lectura para técnicos
create policy "case_items_select_staff"
on public.case_items for select to authenticated
using (
	exists (
		select 1 from public.cases c
		where c.id = case_id and public.is_technician()
	)
);

-- Historial de estado: lectura para técnicos
create policy "case_status_history_select_staff"
on public.case_status_history for select to authenticated
using (public.is_technician());

-- Clientes y doctores: solo lectura para técnicos (contacto)
create policy "clients_select_technician"
on public.clients for select to authenticated
using (public.is_technician());

create policy "doctors_select_technician"
on public.doctors for select to authenticated
using (public.is_technician());

-- Archivos de caso: lectura para técnicos
create policy "case_files_select_technician"
on public.case_files for select to authenticated
using (public.is_technician());

-- Storage: lectura de escaneos y diseños para técnicos
create policy "storage_case_scans_select_technician"
on storage.objects for select to authenticated
using (
	bucket_id = 'case-scans'
	and public.is_technician()
);

create policy "storage_case_designs_select_technician"
on storage.objects for select to authenticated
using (
	bucket_id = 'case-designs'
	and public.is_technician()
);

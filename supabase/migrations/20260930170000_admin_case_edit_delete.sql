-- El administrador edita y elimina casos. El técnico solo puede cambiar el estado.

create or replace function public.cases_guard_technician_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if public.is_technician() then
		new.case_number := old.case_number;
		new.client_id := old.client_id;
		new.client_name := old.client_name;
		new.client_clinica := old.client_clinica;
		new.doctor_id := old.doctor_id;
		new.doctor_name := old.doctor_name;
		new.paciente_name := old.paciente_name;
		new.tipo_trabajo := old.tipo_trabajo;
		new.material := old.material;
		new.color := old.color;
		new.piezas := old.piezas;
		new.fecha_entrega := old.fecha_entrega;
		new.fecha_creacion := old.fecha_creacion;
		new.notas := old.notas;
		new.last_edited_at := old.last_edited_at;
		new.last_edited_by := old.last_edited_by;
		new.last_edited_by_name := old.last_edited_by_name;
	end if;
	return new;
end;
$$;

drop trigger if exists cases_guard_technician_content on public.cases;
create trigger cases_guard_technician_content
before update on public.cases
for each row
execute function public.cases_guard_technician_content();

create policy "cases_delete_admin"
on public.cases for delete to authenticated
using (public.is_admin());

grant delete on public.cases to authenticated;

create policy "case_items_insert_admin"
on public.case_items for insert to authenticated
with check (
	exists (
		select 1 from public.cases c
		where c.id = case_id and public.is_admin()
	)
);

create policy "case_items_delete_admin"
on public.case_items for delete to authenticated
using (
	exists (
		select 1 from public.cases c
		where c.id = case_id and public.is_admin()
	)
);

create policy "case_item_teeth_insert_admin"
on public.case_item_teeth for insert to authenticated
with check (
	exists (
		select 1
		from public.case_items ci
		join public.cases c on c.id = ci.case_id
		where ci.id = case_item_id and public.is_admin()
	)
);

create policy "case_files_insert_admin"
on public.case_files for insert to authenticated
with check (
	exists (
		select 1 from public.cases c
		where c.id = case_id and public.is_admin()
	)
);

create policy "storage_case_scans_insert_admin"
on storage.objects for insert to authenticated
with check (bucket_id = 'case-scans' and public.is_admin());

create policy "storage_case_designs_insert_admin"
on storage.objects for insert to authenticated
with check (bucket_id = 'case-designs' and public.is_admin());

create policy "storage_case_scans_delete_admin"
on storage.objects for delete to authenticated
using (bucket_id = 'case-scans' and public.is_admin());

create policy "storage_case_designs_delete_admin"
on storage.objects for delete to authenticated
using (bucket_id = 'case-designs' and public.is_admin());

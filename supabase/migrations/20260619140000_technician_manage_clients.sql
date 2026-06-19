-- Técnicos: registrar y actualizar clínicas y doctores (sin eliminar clientes)

create policy "clients_insert_technician"
on public.clients
for insert
to authenticated
with check (public.is_technician());

create policy "clients_update_technician"
on public.clients
for update
to authenticated
using (public.is_technician());

create policy "doctors_insert_technician"
on public.doctors
for insert
to authenticated
with check (public.is_technician());

create policy "doctors_update_technician"
on public.doctors
for update
to authenticated
using (public.is_technician());

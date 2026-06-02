-- Fase 6: facturación

create type public.invoice_estado as enum ('pendiente', 'pagada', 'cancelada');

insert into public.lab_sequences (name, value) values ('invoice_number', 0)
on conflict (name) do nothing;

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
	update public.lab_sequences
	set value = value + 1
	where name = 'invoice_number'
	returning value into n;
	return 'FAC-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated;

create table public.invoices (
	id uuid primary key default gen_random_uuid(),
	invoice_number text not null unique,
	client_id uuid not null references public.clients (id) on delete restrict,
	case_id uuid not null unique references public.cases (id) on delete restrict,
	client_name text not null default '',
	client_clinica text not null default '',
	case_number text not null default '',
	paciente_name text not null default '',
	subtotal numeric(12, 2) not null default 0,
	impuesto numeric(12, 2) not null default 0,
	total numeric(12, 2) not null default 0,
	fecha_emision timestamptz not null default now(),
	fecha_vencimiento timestamptz not null,
	estado public.invoice_estado not null default 'pendiente',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_estado_idx on public.invoices (estado);
create index invoices_fecha_emision_idx on public.invoices (fecha_emision desc);

create table public.invoice_lines (
	id uuid primary key default gen_random_uuid(),
	invoice_id uuid not null references public.invoices (id) on delete cascade,
	sort_order int not null default 0,
	descripcion text not null,
	cantidad int not null default 1,
	precio_unitario numeric(12, 2) not null default 0,
	subtotal numeric(12, 2) not null default 0
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "invoices_select_admin"
on public.invoices for select to authenticated
using (public.is_admin());

create policy "invoices_select_own"
on public.invoices for select to authenticated
using (client_id = public.current_client_id());

create policy "invoices_update_admin"
on public.invoices for update to authenticated
using (public.is_admin());

create policy "invoice_lines_select_admin"
on public.invoice_lines for select to authenticated
using (
	exists (select 1 from public.invoices i where i.id = invoice_id and public.is_admin())
);

create policy "invoice_lines_select_own"
on public.invoice_lines for select to authenticated
using (
	exists (
		select 1 from public.invoices i
		where i.id = invoice_id and i.client_id = public.current_client_id()
	)
);

create policy "invoices_insert_system"
on public.invoices for insert to authenticated
with check (
	case_id in (
		select c.id from public.cases c
		where c.client_id = public.current_client_id() or public.is_admin()
	)
);

create policy "invoice_lines_insert_system"
on public.invoice_lines for insert to authenticated
with check (
	exists (
		select 1 from public.invoices i
		where i.id = invoice_id
			and (
				i.client_id = public.current_client_id()
				or public.is_admin()
			)
	)
);

grant select, insert, update on public.invoices to authenticated;
grant select, insert on public.invoice_lines to authenticated;

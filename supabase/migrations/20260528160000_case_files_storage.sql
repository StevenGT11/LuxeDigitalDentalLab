-- Fase 5: archivos de caso en Storage

create type public.case_file_category as enum ('escaneo', 'diseno');

create table public.case_files (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.cases (id) on delete cascade,
	category public.case_file_category not null,
	file_name text not null,
	storage_path text not null,
	mime_type text not null default 'application/octet-stream',
	size_bytes bigint not null default 0,
	uploaded_at timestamptz not null default now()
);

create index case_files_case_id_idx on public.case_files (case_id);
create unique index case_files_storage_path_idx on public.case_files (storage_path);

-- Buckets (privados)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
	(
		'case-scans',
		'case-scans',
		false,
		52428800,
		array['application/octet-stream', 'application/zip', 'application/pdf', 'model/stl', 'image/jpeg', 'image/png']
	),
	(
		'case-designs',
		'case-designs',
		false,
		52428800,
		array['application/octet-stream', 'application/zip', 'application/pdf', 'model/stl', 'image/jpeg', 'image/png']
	)
on conflict (id) do nothing;

alter table public.case_files enable row level security;

create policy "case_files_select_admin"
on public.case_files for select to authenticated
using (public.is_admin());

create policy "case_files_select_own"
on public.case_files for select to authenticated
using (
	exists (
		select 1 from public.cases c
		where c.id = case_id and c.client_id = public.current_client_id()
	)
);

create policy "case_files_insert_own"
on public.case_files for insert to authenticated
with check (
	exists (
		select 1 from public.cases c
		where c.id = case_id and c.client_id = public.current_client_id()
	)
);

create policy "case_files_delete_admin"
on public.case_files for delete to authenticated
using (public.is_admin());

grant select, insert, delete on public.case_files to authenticated;

-- Storage: lectura
create policy "storage_case_scans_select"
on storage.objects for select to authenticated
using (
	bucket_id = 'case-scans'
	and (
		public.is_admin()
		or exists (
			select 1 from public.cases c
			where c.id::text = (storage.foldername(name))[1]
				and c.client_id = public.current_client_id()
		)
	)
);

create policy "storage_case_designs_select"
on storage.objects for select to authenticated
using (
	bucket_id = 'case-designs'
	and (
		public.is_admin()
		or exists (
			select 1 from public.cases c
			where c.id::text = (storage.foldername(name))[1]
				and c.client_id = public.current_client_id()
		)
	)
);

-- Storage: subida (cliente dueño del caso)
create policy "storage_case_scans_insert"
on storage.objects for insert to authenticated
with check (
	bucket_id = 'case-scans'
	and exists (
		select 1 from public.cases c
		where c.id::text = (storage.foldername(name))[1]
			and c.client_id = public.current_client_id()
	)
);

create policy "storage_case_designs_insert"
on storage.objects for insert to authenticated
with check (
	bucket_id = 'case-designs'
	and exists (
		select 1 from public.cases c
		where c.id::text = (storage.foldername(name))[1]
			and c.client_id = public.current_client_id()
	)
);

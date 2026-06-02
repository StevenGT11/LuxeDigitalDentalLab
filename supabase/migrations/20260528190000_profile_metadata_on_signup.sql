-- Perfil enriquecido al crear usuario Auth (admin → createUser con user_metadata)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (id, email, nombre, role, clinica, telefono)
	values (
		new.id,
		coalesce(new.email, ''),
		coalesce(
			nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
			split_part(coalesce(new.email, 'usuario'), '@', 1)
		),
		'client',
		coalesce(nullif(trim(new.raw_user_meta_data ->> 'clinica'), ''), ''),
		coalesce(nullif(trim(new.raw_user_meta_data ->> 'telefono'), ''), '')
	);
	return new;
end;
$$;

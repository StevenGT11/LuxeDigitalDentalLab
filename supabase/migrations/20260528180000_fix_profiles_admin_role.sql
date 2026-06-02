-- Permite asignar rol admin desde SQL Editor / service role (auth.uid() es null).
-- Sin esto, profiles_guard_role revierte el UPDATE aunque lo ejecute el dashboard.

create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if old.role is distinct from new.role then
		-- SQL Editor, migraciones y service role no tienen JWT de usuario
		if auth.uid() is null then
			return new;
		end if;
		if not public.is_admin() then
			new.role := old.role;
		end if;
	end if;
	return new;
end;
$$;

-- Facturas electrónicas recibidas de proveedores + Mensaje Receptor (tipo 05).
-- Flujo: registrar XML del proveedor → revisar → enviar confirmación a Hacienda → consultar.
-- Requiere: fe_emisor_config, lab_sequences, set_updated_at, is_admin().
-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.fe_recibido_estado as enum (
	'pendiente_aceptacion',
	-- XML registrado; falta enviar mensaje receptor
	'mensaje_enviado',
	-- mensaje 05 enviado; consultando Hacienda
	'aceptado',
	-- mensaje receptor aceptado por Hacienda (total o parcial)
	'rechazado',
	-- rechazo confirmado por Hacienda, o mensaje rechazado
	'vencido' -- plazo DGT vencido sin respuesta válida
);
create type public.fe_mensaje_receptor_tipo as enum (
	'aceptado',
	-- 1
	'aceptado_parcial',
	-- 2
	'rechazado' -- 3
);
-- ---------------------------------------------------------------------------
-- Comprobantes recibidos (XML subido; emisor parseado del XML, sin catálogo)
-- ---------------------------------------------------------------------------
create table public.fe_recibidos (
	id uuid primary key default gen_random_uuid(),
	-- Clave del comprobante emitido por el proveedor (50 dígitos)
	clave text not null unique,
	tipo_documento text not null check (tipo_documento in ('01', '02', '03', '04', '09')),
	emisor_tipo_identificacion text not null check (
		emisor_tipo_identificacion in ('01', '02', '03', '04')
	),
	emisor_numero_identificacion text not null,
	emisor_nombre text not null default '',
	fecha_emision timestamptz not null,
	subtotal numeric(12, 2) not null default 0,
	impuesto numeric(12, 2) not null default 0,
	total numeric(12, 2) not null default 0,
	moneda text not null default 'CRC',
	xml_recibido text not null,
	estado public.fe_recibido_estado not null default 'pendiente_aceptacion',
	-- Plazo DGT: 8 días hábiles (calculado al registrar; la app puede ajustarlo)
	plazo_limite date,
	notas text,
	ambiente text not null default 'staging' check (ambiente in ('staging', 'production')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index fe_recibidos_estado_idx on public.fe_recibidos (estado);
create index fe_recibidos_plazo_limite_idx on public.fe_recibidos (plazo_limite)
where estado = 'pendiente_aceptacion';
create index fe_recibidos_emisor_idx on public.fe_recibidos (emisor_numero_identificacion);
create trigger fe_recibidos_set_updated_at before
update on public.fe_recibidos for each row execute function public.set_updated_at();
alter table public.fe_recibidos enable row level security;
create policy "fe_recibidos_select_admin" on public.fe_recibidos for
select to authenticated using (public.is_admin());
grant select on public.fe_recibidos to authenticated;
grant all on public.fe_recibidos to service_role;
-- ---------------------------------------------------------------------------
-- Mensajes Receptor (tipo 05) que el laboratorio envía a Hacienda
-- ---------------------------------------------------------------------------
create table public.fe_mensajes_receptor (
	id uuid primary key default gen_random_uuid(),
	fe_recibido_id uuid not null references public.fe_recibidos (id) on delete restrict,
	mensaje public.fe_mensaje_receptor_tipo not null,
	detalle_mensaje text not null default '',
	consecutivo_num bigint not null,
	clave text unique,
	consecutivo text,
	estado public.fe_comprobante_estado not null default 'pendiente_envio',
	hacienda_status integer,
	xml_firmado text,
	respuesta_xml text,
	rechazo jsonb,
	ultimo_error text,
	enviado_at timestamptz,
	resuelto_at timestamptz,
	ambiente text not null default 'staging' check (ambiente in ('staging', 'production')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index fe_mensajes_receptor_fe_recibido_id_idx on public.fe_mensajes_receptor (fe_recibido_id);
create index fe_mensajes_receptor_estado_idx on public.fe_mensajes_receptor (estado);
create index fe_mensajes_receptor_clave_idx on public.fe_mensajes_receptor (clave)
where clave is not null;
comment on table public.fe_mensajes_receptor is 'Mensaje Receptor (tipo 05) firmado y enviado por el laboratorio como receptor del comprobante.';
create trigger fe_mensajes_receptor_set_updated_at before
update on public.fe_mensajes_receptor for each row execute function public.set_updated_at();
alter table public.fe_mensajes_receptor enable row level security;
create policy "fe_mensajes_receptor_select_admin" on public.fe_mensajes_receptor for
select to authenticated using (public.is_admin());
grant select on public.fe_mensajes_receptor to authenticated;
grant all on public.fe_mensajes_receptor to service_role;
-- ---------------------------------------------------------------------------
-- Consecutivo tipo 05 (Mensaje Receptor) por ambiente
-- ---------------------------------------------------------------------------
insert into public.lab_sequences (name, value)
select 'fe_consecutivo_05_' || a.ambiente,
	0
from (
		values ('staging'),
			('production')
	) as a(ambiente) on conflict (name) do nothing;
create or replace function public.next_fe_consecutivo_num(
		p_tipo_documento text,
		p_ambiente text default 'staging'
	) returns bigint language plpgsql security definer
set search_path = public as $$
declare seq_name text;
n bigint;
begin if p_tipo_documento not in ('01', '02', '03', '04', '05', '08') then raise exception 'tipo_documento inválido: %',
p_tipo_documento;
end if;
if p_ambiente not in ('staging', 'production') then raise exception 'ambiente inválido: %',
p_ambiente;
end if;
seq_name := 'fe_consecutivo_' || p_tipo_documento || '_' || p_ambiente;
update public.lab_sequences
set value = value + 1
where name = seq_name
returning value into n;
if n is null then raise exception 'secuencia no encontrada: %',
seq_name;
end if;
return n;
end;
$$;
revoke all on function public.next_fe_consecutivo_num(text, text)
from public;
grant execute on function public.next_fe_consecutivo_num(text, text) to service_role;
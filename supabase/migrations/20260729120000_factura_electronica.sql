-- Factura electrónica (Hacienda v4.4)
-- Ejecutar una vez: Supabase Dashboard → SQL → New query → pegar y Run
--   o: supabase migration up / db push desde el repo
--
-- Requiere migraciones previas del proyecto (profiles, clients, invoices, lab_sequences, set_updated_at).
-- Seguridad: fe_emisor_config tiene P12, PIN y contraseña Hacienda — solo service_role (servidor).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.fe_comprobante_estado as enum (
	'pendiente_envio', -- factura interna lista; aún no enviada a Hacienda
	'enviado', -- recepción respondió (p. ej. HTTP 202)
	'procesando', -- consultar aún no encuentra resultado final
	'aceptado',
	'rechazado',
	'error' -- fallo de red, validación post-envío, etc.
);

comment on type public.fe_comprobante_estado is
	'Estado del comprobante ante Hacienda; independiente de invoice_estado (cobro).';

-- ---------------------------------------------------------------------------
-- Emisor (laboratorio) — una fila activa por ambiente
-- ---------------------------------------------------------------------------

create table public.fe_emisor_config (
	id uuid primary key default gen_random_uuid(),
	ambiente text not null check (ambiente in ('staging', 'production')),
	activo boolean not null default false,
	-- Identificación emisor (Facturador config.*)
	tipo_identificacion text not null default '02'
		check (tipo_identificacion in ('01', '02', '03', '04')),
	numero_identificacion text not null,
	razon_social text not null,
	nombre_comercial text,
	codigo_actividad text not null,
	casa_matriz text not null default '001',
	terminal text not null default '00001',
	provincia smallint not null default 1,
	canton text not null default '01',
	distrito text not null default '01',
	otras_senas text not null default '',
	telefono text not null default '',
	correo_electronico text not null default '',
	-- Hacienda API (usuario ATV / comprobantes electrónicos)
	hacienda_usuario text not null,
	hacienda_password text not null,
	-- Firma XAdES (certificado .p12 en base64 + PIN)
	certificado_p12 text not null,
	pin_certificado text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Solo una configuración activa por ambiente
create unique index fe_emisor_config_one_active_idx
	on public.fe_emisor_config (ambiente)
	where activo = true;

comment on table public.fe_emisor_config is
	'Datos del emisor para Facturador. Acceso solo service_role desde el servidor.';

create trigger fe_emisor_config_set_updated_at
before update on public.fe_emisor_config
for each row
execute function public.set_updated_at();

alter table public.fe_emisor_config enable row level security;
-- Sin policies: authenticated no lee secretos; service_role bypass RLS.

grant all on public.fe_emisor_config to service_role;

-- ---------------------------------------------------------------------------
-- Consecutivos Hacienda (por tipo documento + sucursal/terminal en config)
-- ---------------------------------------------------------------------------

insert into public.lab_sequences (name, value)
values
	('fe_consecutivo_01', 0),
	('fe_consecutivo_02', 0),
	('fe_consecutivo_03', 0),
	('fe_consecutivo_04', 0),
	('fe_consecutivo_08', 0)
on conflict (name) do nothing;

create or replace function public.next_fe_consecutivo_num(p_tipo_documento text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
	seq_name text;
	n bigint;
begin
	seq_name := 'fe_consecutivo_' || p_tipo_documento;
	if p_tipo_documento not in ('01', '02', '03', '04', '08') then
		raise exception 'tipo_documento inválido: %', p_tipo_documento;
	end if;
	update public.lab_sequences
	set value = value + 1
	where name = seq_name
	returning value into n;
	if n is null then
		raise exception 'secuencia no encontrada: %', seq_name;
	end if;
	return n;
end;
$$;

revoke all on function public.next_fe_consecutivo_num(text) from public;
grant execute on function public.next_fe_consecutivo_num(text) to service_role;

comment on function public.next_fe_consecutivo_num is
	'Incrementa y devuelve el siguiente consecutivo_num para Facturador. Solo servidor (service_role).';

-- ---------------------------------------------------------------------------
-- Receptor fiscal en clientes (clínica facturada)
-- ---------------------------------------------------------------------------

alter table public.clients
	add column if not exists fe_tipo_identificacion text
		check (fe_tipo_identificacion is null or fe_tipo_identificacion in ('01', '02', '03', '04')),
	add column if not exists fe_numero_identificacion text,
	add column if not exists fe_codigo_actividad text,
	add column if not exists fe_correo_facturacion text;

comment on column public.clients.fe_numero_identificacion is
	'Cédula jurídica/física del receptor para FE (cliente.cedula en Facturador).';
comment on column public.clients.fe_codigo_actividad is
	'CodigoActividadReceptor v4.4; opcional hasta obligatorio DGT.';

create index if not exists clients_fe_numero_identificacion_idx
	on public.clients (fe_numero_identificacion)
	where fe_numero_identificacion is not null;

-- ---------------------------------------------------------------------------
-- Líneas: datos exigidos por Hacienda en el XML
-- ---------------------------------------------------------------------------

alter table public.invoice_lines
	add column if not exists fe_cabys text
		check (fe_cabys is null or fe_cabys ~ '^\d{13}$'),
	add column if not exists fe_unidad_medida text not null default 'Sp',
	add column if not exists impuesto_tarifa numeric(5, 2) not null default 13;

comment on column public.invoice_lines.fe_cabys is 'Código CABYS 13 dígitos.';
comment on column public.invoice_lines.fe_unidad_medida is
	'Unidad Medida; Sp/Spe/OS para servicios (ver INTEGRATION_GUIDE).';
comment on column public.invoice_lines.impuesto_tarifa is
	'Tarifa IVA % (13, 4, 2, 1, 0). Montos en invoice_lines siguen siendo subtotal línea sin IVA.';

-- ---------------------------------------------------------------------------
-- Catálogo: CABYS por defecto por tratamiento (opcional)
-- ---------------------------------------------------------------------------

alter table public.treatments
	add column if not exists fe_cabys text
		check (fe_cabys is null or fe_cabys ~ '^\d{13}$'),
	add column if not exists fe_unidad_medida text default 'Sp';

-- ---------------------------------------------------------------------------
-- Comprobante electrónico (1 FE principal por factura interna; NC/ND futuras)
-- ---------------------------------------------------------------------------

create table public.fe_comprobantes (
	id uuid primary key default gen_random_uuid(),
	invoice_id uuid references public.invoices (id) on delete restrict,
	-- comprobante que referencia NC/ND (clave del FE original)
	referencia_comprobante_id uuid references public.fe_comprobantes (id) on delete restrict,
	tipo_documento text not null default '01'
		check (tipo_documento in ('01', '02', '03', '04', '08')),
	consecutivo_num bigint not null,
	clave text unique,
	consecutivo text,
	estado public.fe_comprobante_estado not null default 'pendiente_envio',
	hacienda_status integer,
	moneda text not null default 'CRC',
	tipo_cambio numeric(12, 5) not null default 1,
	condicion_venta text not null default '01',
	medio_pago text not null default '01',
	subtotal numeric(12, 2) not null default 0,
	impuesto numeric(12, 2) not null default 0,
	total numeric(12, 2) not null default 0,
	fecha_emision timestamptz,
	-- XML firmado enviado / respuesta Hacienda (texto; o migrar a Storage si crece mucho)
	xml_firmado text,
	respuesta_xml text,
	rechazo jsonb,
	ultimo_error text,
	enviado_at timestamptz,
	resuelto_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Una factura electrónica (01) activa por factura interna
create unique index fe_comprobantes_one_fe_per_invoice_idx
	on public.fe_comprobantes (invoice_id)
	where tipo_documento = '01' and invoice_id is not null;

create index fe_comprobantes_estado_idx on public.fe_comprobantes (estado);
create index fe_comprobantes_clave_idx on public.fe_comprobantes (clave) where clave is not null;
create index fe_comprobantes_invoice_id_idx on public.fe_comprobantes (invoice_id);


create trigger fe_comprobantes_set_updated_at
before update on public.fe_comprobantes
for each row
execute function public.set_updated_at();

alter table public.fe_comprobantes enable row level security;

create policy "fe_comprobantes_select_admin"
on public.fe_comprobantes for select to authenticated
using (public.is_admin());

-- Insert/update solo vía service_role (servidor) — sin policy para authenticated

grant select on public.fe_comprobantes to authenticated;
grant all on public.fe_comprobantes to service_role;

-- ---------------------------------------------------------------------------
-- Vista opcional: factura interna + estado FE (solo admin)
-- ---------------------------------------------------------------------------

create or replace view public.invoices_with_fe as
select
	i.*,
	fe.id as fe_id,
	fe.tipo_documento as fe_tipo_documento,
	fe.clave as fe_clave,
	fe.consecutivo as fe_consecutivo,
	fe.estado as fe_estado,
	fe.hacienda_status as fe_hacienda_status,
	fe.enviado_at as fe_enviado_at,
	fe.resuelto_at as fe_resuelto_at
from public.invoices i
left join public.fe_comprobantes fe
	on fe.invoice_id = i.id and fe.tipo_documento = '01';


grant select on public.invoices_with_fe to authenticated;

-- ---------------------------------------------------------------------------
-- Después de migrar: insertar emisor (service_role o SQL Editor como postgres)
-- ---------------------------------------------------------------------------
/*
insert into public.fe_emisor_config (
	ambiente,
	activo,
	tipo_identificacion,
	numero_identificacion,
	razon_social,
	nombre_comercial,
	codigo_actividad,
	casa_matriz,
	terminal,
	provincia,
	canton,
	distrito,
	otras_senas,
	telefono,
	correo_electronico,
	hacienda_usuario,
	hacienda_password,
	certificado_p12,
	pin_certificado
) values (
	'staging',
	true,
	'02',
	'310123456789',
	'LUXE DIGITAL DENTAL LAB S.A.',
	'Luxe Digital Dental Lab',
	'6201.0',
	'001',
	'00001',
	1,
	'01',
	'01',
	'Dirección fiscal completa',
	'22223333',
	'info@luxedigitaldentallab.com',
	'usuario@stag.comprobanteselectronicos.go.cr',
	'tu-password-hacienda',
	'BASE64_DEL_P12_AQUI',
	'pin-del-certificado'
);
*/

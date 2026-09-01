-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role USER - DEFINED NOT NULL DEFAULT 'client'::user_role,
    nombre text NOT NULL DEFAULT ''::text,
    email text NOT NULL,
    telefono text,
    clinica text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.clients (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    profile_id uuid UNIQUE,
    nombre text NOT NULL,
    clinica text NOT NULL DEFAULT ''::text,
    email text NOT NULL DEFAULT ''::text,
    telefono text NOT NULL DEFAULT ''::text,
    activo boolean NOT NULL DEFAULT true,
    fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    fe_tipo_identificacion text CHECK (
        fe_tipo_identificacion IS NULL
        OR (
            fe_tipo_identificacion = ANY (
                ARRAY ['01'::text, '02'::text, '03'::text, '04'::text]
            )
        )
    ),
    fe_numero_identificacion text,
    fe_codigo_actividad text,
    fe_correo_facturacion text,
    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.doctors (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT doctors_pkey PRIMARY KEY (id),
    CONSTRAINT doctors_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.treatments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    label text NOT NULL,
    categoria USER - DEFINED NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    precio_diseno numeric NOT NULL DEFAULT 0,
    precio_fresado numeric NOT NULL DEFAULT 0,
    precio_crc_diseno numeric NOT NULL DEFAULT 0,
    precio_crc_fresado numeric NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sobre_implante boolean NOT NULL DEFAULT false,
    modo_seleccion_piezas text NOT NULL DEFAULT 'ninguno'::text CHECK (
        modo_seleccion_piezas = ANY (
            ARRAY ['arcadas'::text, 'odontograma'::text, 'ninguno'::text]
        )
    ),
    fe_cabys text CHECK (
        fe_cabys IS NULL
        OR fe_cabys ~ '^\d{13}$'::text
    ),
    fe_unidad_medida text DEFAULT 'Sp'::text,
    impuesto_tarifa numeric NOT NULL DEFAULT 13,
    CONSTRAINT treatments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.restoration_prices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    treatment_id uuid NOT NULL,
    material text NOT NULL,
    precio_diseno numeric NOT NULL DEFAULT 0,
    precio_fresado numeric NOT NULL DEFAULT 0,
    precio_crc_diseno numeric NOT NULL DEFAULT 0,
    precio_crc_fresado numeric NOT NULL DEFAULT 0,
    material_label text NOT NULL,
    CONSTRAINT restoration_prices_pkey PRIMARY KEY (id),
    CONSTRAINT restoration_prices_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id)
);
CREATE TABLE public.surgical_guide_prices (
    implantes integer NOT NULL CHECK (
        implantes >= 1
        AND implantes <= 6
    ),
    precio_usd numeric NOT NULL,
    precio_crc numeric NOT NULL,
    CONSTRAINT surgical_guide_prices_pkey PRIMARY KEY (implantes)
);
CREATE TABLE public.pricing_addons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    label text NOT NULL,
    treatment_slug text,
    precio_diseno_usd numeric NOT NULL DEFAULT 0,
    precio_fresado_usd numeric NOT NULL DEFAULT 0,
    precio_diseno_crc numeric NOT NULL DEFAULT 0,
    precio_fresado_crc numeric NOT NULL DEFAULT 0,
    CONSTRAINT pricing_addons_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_addons_treatment_slug_fkey FOREIGN KEY (treatment_slug) REFERENCES public.treatments(slug)
);
CREATE TABLE public.lab_sequences (
    name text NOT NULL,
    value bigint NOT NULL DEFAULT 0,
    CONSTRAINT lab_sequences_pkey PRIMARY KEY (name)
);
CREATE TABLE public.cases (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    case_number text NOT NULL UNIQUE,
    client_id uuid NOT NULL,
    doctor_id uuid,
    doctor_name text NOT NULL DEFAULT ''::text,
    paciente_name text NOT NULL,
    client_name text NOT NULL DEFAULT ''::text,
    client_clinica text NOT NULL DEFAULT ''::text,
    tipo_trabajo text NOT NULL DEFAULT ''::text,
    material text,
    color text,
    piezas integer NOT NULL DEFAULT 1,
    costo numeric NOT NULL DEFAULT 0,
    fecha_creacion timestamp with time zone NOT NULL DEFAULT now(),
    fecha_entrega timestamp with time zone NOT NULL,
    estado USER - DEFINED NOT NULL DEFAULT 'pendiente'::case_estado,
    notas text,
    archivos jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    last_edited_at timestamp with time zone,
    last_edited_by uuid,
    last_edited_by_name text,
    CONSTRAINT cases_pkey PRIMARY KEY (id),
    CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT cases_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id),
    CONSTRAINT cases_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.case_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    numero_pieza text,
    tipo_trabajo text NOT NULL,
    material text,
    color text,
    piezas integer NOT NULL DEFAULT 1,
    incluye_diseno boolean NOT NULL DEFAULT true,
    incluye_fresado boolean NOT NULL DEFAULT false,
    implantes_guia integer CHECK (
        implantes_guia IS NULL
        OR implantes_guia >= 1
        AND implantes_guia <= 6
    ),
    corona_sobre_implante boolean NOT NULL DEFAULT false,
    descripcion text,
    tipo_pieza jsonb,
    unit_price numeric NOT NULL DEFAULT 0,
    subtotal numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    implante_marca text,
    implante_plataforma text,
    alcance_arcada text CHECK (
        alcance_arcada IS NULL
        OR (
            alcance_arcada = ANY (
                ARRAY ['superior'::text, 'inferior'::text, 'ambas'::text, 'una'::text]
            )
        )
    ),
    CONSTRAINT case_items_pkey PRIMARY KEY (id),
    CONSTRAINT case_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id)
);
CREATE TABLE public.case_item_teeth (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    case_item_id uuid NOT NULL,
    tooth_fdi text NOT NULL,
    CONSTRAINT case_item_teeth_pkey PRIMARY KEY (id),
    CONSTRAINT case_item_teeth_case_item_id_fkey FOREIGN KEY (case_item_id) REFERENCES public.case_items(id)
);
CREATE TABLE public.case_status_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL,
    estado USER - DEFINED NOT NULL,
    changed_at timestamp with time zone NOT NULL DEFAULT now(),
    changed_by uuid,
    CONSTRAINT case_status_history_pkey PRIMARY KEY (id),
    CONSTRAINT case_status_history_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id),
    CONSTRAINT case_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.case_files (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL,
    category USER - DEFINED NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL DEFAULT 'application/octet-stream'::text,
    size_bytes bigint NOT NULL DEFAULT 0,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT case_files_pkey PRIMARY KEY (id),
    CONSTRAINT case_files_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id)
);
CREATE TABLE public.invoices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_number text NOT NULL UNIQUE,
    client_id uuid NOT NULL,
    case_id uuid NOT NULL UNIQUE,
    client_name text NOT NULL DEFAULT ''::text,
    client_clinica text NOT NULL DEFAULT ''::text,
    case_number text NOT NULL DEFAULT ''::text,
    paciente_name text NOT NULL DEFAULT ''::text,
    subtotal numeric NOT NULL DEFAULT 0,
    impuesto numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    fecha_emision timestamp with time zone NOT NULL DEFAULT now(),
    fecha_vencimiento timestamp with time zone NOT NULL,
    estado USER - DEFINED NOT NULL DEFAULT 'pendiente'::invoice_estado,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT invoices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id)
);
CREATE TABLE public.invoice_lines (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    descripcion text NOT NULL,
    cantidad integer NOT NULL DEFAULT 1,
    precio_unitario numeric NOT NULL DEFAULT 0,
    subtotal numeric NOT NULL DEFAULT 0,
    fe_cabys text CHECK (
        fe_cabys IS NULL
        OR fe_cabys ~ '^\d{13}$'::text
    ),
    fe_unidad_medida text NOT NULL DEFAULT 'Sp'::text,
    impuesto_tarifa numeric NOT NULL DEFAULT 13,
    CONSTRAINT invoice_lines_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.fe_emisor_config (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ambiente text NOT NULL CHECK (
        ambiente = ANY (ARRAY ['staging'::text, 'production'::text])
    ),
    activo boolean NOT NULL DEFAULT false,
    tipo_identificacion text NOT NULL DEFAULT '02'::text CHECK (
        tipo_identificacion = ANY (
            ARRAY ['01'::text, '02'::text, '03'::text, '04'::text]
        )
    ),
    numero_identificacion text NOT NULL,
    razon_social text NOT NULL,
    nombre_comercial text,
    codigo_actividad text NOT NULL,
    casa_matriz text NOT NULL DEFAULT '001'::text,
    terminal text NOT NULL DEFAULT '00001'::text,
    provincia smallint NOT NULL DEFAULT 1,
    canton text NOT NULL DEFAULT '01'::text,
    distrito text NOT NULL DEFAULT '01'::text,
    otras_senas text NOT NULL DEFAULT ''::text,
    telefono text NOT NULL DEFAULT ''::text,
    correo_electronico text NOT NULL DEFAULT ''::text,
    hacienda_usuario text NOT NULL,
    hacienda_password text NOT NULL,
    certificado_p12 text NOT NULL,
    pin_certificado text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT fe_emisor_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fe_comprobantes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_id uuid,
    referencia_comprobante_id uuid,
    tipo_documento text NOT NULL DEFAULT '01'::text CHECK (
        tipo_documento = ANY (
            ARRAY ['01'::text, '02'::text, '03'::text, '04'::text, '08'::text]
        )
    ),
    consecutivo_num bigint NOT NULL,
    clave text UNIQUE,
    consecutivo text,
    estado USER - DEFINED NOT NULL DEFAULT 'pendiente_envio'::fe_comprobante_estado,
    hacienda_status integer,
    moneda text NOT NULL DEFAULT 'CRC'::text,
    tipo_cambio numeric NOT NULL DEFAULT 1,
    condicion_venta text NOT NULL DEFAULT '01'::text,
    medio_pago text NOT NULL DEFAULT '01'::text,
    subtotal numeric NOT NULL DEFAULT 0,
    impuesto numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    fecha_emision timestamp with time zone,
    xml_firmado text,
    respuesta_xml text,
    rechazo jsonb,
    ultimo_error text,
    enviado_at timestamp with time zone,
    resuelto_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    ambiente text CHECK (
        ambiente IS NULL
        OR (
            ambiente = ANY (ARRAY ['staging'::text, 'production'::text])
        )
    ),
    CONSTRAINT fe_comprobantes_pkey PRIMARY KEY (id),
    CONSTRAINT fe_comprobantes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
    CONSTRAINT fe_comprobantes_referencia_comprobante_id_fkey FOREIGN KEY (referencia_comprobante_id) REFERENCES public.fe_comprobantes(id)
);
CREATE TABLE public.fe_hacienda_settings (
    id smallint NOT NULL DEFAULT 1 CHECK (id = 1),
    emit_ambiente text NOT NULL DEFAULT 'staging'::text CHECK (
        emit_ambiente = ANY (ARRAY ['staging'::text, 'production'::text])
    ),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT fe_hacienda_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fe_recibidos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    clave text NOT NULL UNIQUE,
    tipo_documento text NOT NULL CHECK (
        tipo_documento = ANY (
            ARRAY ['01'::text, '02'::text, '03'::text, '04'::text, '09'::text]
        )
    ),
    emisor_tipo_identificacion text NOT NULL CHECK (
        emisor_tipo_identificacion = ANY (
            ARRAY ['01'::text, '02'::text, '03'::text, '04'::text]
        )
    ),
    emisor_numero_identificacion text NOT NULL,
    emisor_nombre text NOT NULL DEFAULT ''::text,
    fecha_emision timestamp with time zone NOT NULL,
    subtotal numeric NOT NULL DEFAULT 0,
    impuesto numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    moneda text NOT NULL DEFAULT 'CRC'::text,
    xml_recibido text NOT NULL,
    estado USER - DEFINED NOT NULL DEFAULT 'pendiente_aceptacion'::fe_recibido_estado,
    plazo_limite date,
    notas text,
    ambiente text NOT NULL DEFAULT 'staging'::text CHECK (
        ambiente = ANY (ARRAY ['staging'::text, 'production'::text])
    ),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT fe_recibidos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fe_mensajes_receptor (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    fe_recibido_id uuid NOT NULL,
    mensaje USER - DEFINED NOT NULL,
    detalle_mensaje text NOT NULL DEFAULT ''::text,
    consecutivo_num bigint NOT NULL,
    clave text UNIQUE,
    consecutivo text,
    estado USER - DEFINED NOT NULL DEFAULT 'pendiente_envio'::fe_comprobante_estado,
    hacienda_status integer,
    xml_firmado text,
    respuesta_xml text,
    rechazo jsonb,
    ultimo_error text,
    enviado_at timestamp with time zone,
    resuelto_at timestamp with time zone,
    ambiente text NOT NULL DEFAULT 'staging'::text CHECK (
        ambiente = ANY (ARRAY ['staging'::text, 'production'::text])
    ),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT fe_mensajes_receptor_pkey PRIMARY KEY (id),
    CONSTRAINT fe_mensajes_receptor_fe_recibido_id_fkey FOREIGN KEY (fe_recibido_id) REFERENCES public.fe_recibidos(id)
);
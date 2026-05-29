# America Dental - Sistema de Gestión Dental

Sistema de gestión integral para clínicas dentales desarrollado con SvelteKit y Supabase.

## 🗄️ Estructura de Base de Datos - Laboratorio

### Tablas Principales

#### `lab_cases` - Casos de Laboratorio
Tabla principal que almacena los casos de laboratorio dental.

**Campos:**
- `id` (UUID): Identificador único del caso
- `case_number` (VARCHAR): Número único del caso (ej: LAB-000001) - Generado automáticamente
- `paciente_id` (UUID): Referencia al paciente (tabla `patient`)
- `doctor_id` (UUID): Referencia al doctor (tabla `doctor`)
- `fecha_creacion` (TIMESTAMP): Fecha y hora de creación del caso
- `fecha_entrega` (TIMESTAMP): Fecha y hora de entrega programada
- `estado` (VARCHAR): Estado del caso
  - Valores permitidos: `pendiente`, `en_diseño`, `fresado`, `horneando`, `maquillando`
  - Valor por defecto: `pendiente`
- `notas` (TEXT): Notas adicionales sobre el caso
- `dientes` (INTEGER[]): Array de números de dientes seleccionados (notación FDI)
- `created_at` (TIMESTAMP): Fecha de creación del registro
- `updated_at` (TIMESTAMP): Fecha de última actualización

#### `lab_case_treatments` - Tratamientos del Caso
Almacena los tratamientos específicos aplicados a cada diente.

**Campos:**
- `id` (UUID): Identificador único del tratamiento
- `case_id` (UUID): Referencia al caso (tabla `lab_cases`)
- `tooth_number` (INTEGER): Número del diente según notación FDI (11-48)
- `treatment_type` (VARCHAR): Tipo de tratamiento
  - Valores permitidos: `inlay`, `onlay`, `crown`, `veneer`, `denture`
- `color` (VARCHAR): Color de la guía Vita (ej: A1, A2, B1, etc.)
- `created_at` (TIMESTAMP): Fecha de creación del registro

**Restricciones:**
- Un diente no puede tener el mismo tratamiento duplicado en un caso (UNIQUE constraint)

#### `lab_case_files` - Archivos del Caso
Almacena los archivos asociados a cada caso (impresiones, fotos, modelos, etc.).

**Campos:**
- `id` (UUID): Identificador único del archivo
- `case_id` (UUID): Referencia al caso (tabla `lab_cases`)
- `file_name` (VARCHAR): Nombre del archivo
- `file_url` (TEXT): URL del archivo en Supabase Storage
- `file_size` (BIGINT): Tamaño del archivo en bytes
- `file_type` (VARCHAR): Tipo MIME del archivo (ej: application/octet-stream, image/jpeg)
- `uploaded_by` (UUID): Usuario que subió el archivo (tabla `profiles`)
- `uploaded_at` (TIMESTAMP): Fecha y hora de subida

### Funcionalidades Automáticas

1. **Generación automática de número de caso**: 
   - El trigger `trigger_generate_lab_case_number` genera automáticamente el número de caso en formato `LAB-000001`, `LAB-000002`, etc.

2. **Actualización automática de `updated_at`**:
   - El trigger `trigger_update_lab_cases_updated_at` actualiza automáticamente el campo `updated_at` cuando se modifica un caso.

### Índices

Se han creado índices para optimizar las consultas más comunes:
- `idx_lab_cases_paciente`: Búsqueda por paciente
- `idx_lab_cases_doctor`: Búsqueda por doctor
- `idx_lab_cases_estado`: Filtrado por estado
- `idx_lab_cases_fecha_entrega`: Ordenamiento por fecha de entrega
- `idx_lab_case_treatments_case`: Búsqueda de tratamientos por caso
- `idx_lab_case_treatments_tooth`: Búsqueda de tratamientos por diente
- `idx_lab_case_files_case`: Búsqueda de archivos por caso

### Seguridad (RLS)

Se han configurado políticas de Row Level Security (RLS) que permiten:
- **Lectura**: Usuarios con roles `control` o `core`
- **Escritura**: Usuarios con roles `control` o `core`
- **Actualización**: Usuarios con roles `control` o `core`

### Relaciones con Otras Tablas

#### Conexión con `patient`
- `lab_cases.paciente_id` → `patient.id`
- Relación: **Muchos a Uno** (muchos casos pueden pertenecer a un paciente)
- Restricción: `ON DELETE RESTRICT` (no se puede eliminar un paciente si tiene casos asociados)

#### Conexión con `doctor`
- `lab_cases.doctor_id` → `doctor.id`
- Relación: **Muchos a Uno** (muchos casos pueden pertenecer a un doctor)
- Restricción: `ON DELETE RESTRICT` (no se puede eliminar un doctor si tiene casos asociados)

### Vistas y Funciones Útiles

#### Vistas Creadas

1. **`lab_cases_with_details`**: Vista que incluye información completa del caso con datos del paciente y doctor
   ```sql
   SELECT * FROM lab_cases_with_details;
   ```
   Incluye:
   - Todos los campos del caso
   - `paciente_name`, `paciente_phone`, `paciente_email`
   - `doctor_name`
   - `tratamientos_count`: Cantidad de tratamientos
   - `archivos_count`: Cantidad de archivos

2. **`lab_case_treatments_with_case`**: Vista de tratamientos con información del caso relacionado
   ```sql
   SELECT * FROM lab_case_treatments_with_case;
   ```

3. **`lab_case_files_with_case`**: Vista de archivos con información del caso relacionado
   ```sql
   SELECT * FROM lab_case_files_with_case;
   ```

#### Funciones Útiles

1. **`get_lab_case_full(case_uuid)`**: Obtiene un caso completo con todos sus tratamientos y archivos
   ```sql
   SELECT * FROM get_lab_case_full('uuid-del-caso');
   ```
   Retorna:
   - `case_data`: JSONB con datos del caso, paciente y doctor
   - `treatments`: JSONB array con todos los tratamientos
   - `files`: JSONB array con todos los archivos

2. **`get_lab_cases_by_patient(patient_uuid)`**: Obtiene todos los casos de un paciente
   ```sql
   SELECT * FROM get_lab_cases_by_patient('uuid-del-paciente');
   ```

3. **`get_lab_cases_by_doctor(doctor_uuid)`**: Obtiene todos los casos de un doctor
   ```sql
   SELECT * FROM get_lab_cases_by_doctor('uuid-del-doctor');
   ```

### Ejemplos de Consultas SQL

#### Consulta básica con JOINs
```sql
SELECT 
  lc.case_number,
  lc.estado,
  lc.fecha_entrega,
  p.name AS paciente_name,
  p.phone AS paciente_phone,
  d.name AS doctor_name
FROM lab_cases lc
INNER JOIN patient p ON lc.paciente_id = p.id
INNER JOIN doctor d ON lc.doctor_id = d.id
WHERE lc.estado = 'pendiente'
ORDER BY lc.fecha_entrega ASC;
```

#### Consulta con tratamientos
```sql
SELECT 
  lc.case_number,
  p.name AS paciente_name,
  t.tooth_number,
  t.treatment_type,
  t.color
FROM lab_cases lc
INNER JOIN patient p ON lc.paciente_id = p.id
LEFT JOIN lab_case_treatments t ON lc.id = t.case_id
WHERE lc.id = 'uuid-del-caso';
```

#### Consulta con archivos
```sql
SELECT 
  lc.case_number,
  p.name AS paciente_name,
  f.file_name,
  f.file_size,
  f.uploaded_at
FROM lab_cases lc
INNER JOIN patient p ON lc.paciente_id = p.id
LEFT JOIN lab_case_files f ON lc.id = f.case_id
WHERE lc.id = 'uuid-del-caso'
ORDER BY f.uploaded_at DESC;
```

#### Consulta usando la vista
```sql
-- Obtener todos los casos pendientes con información completa
SELECT 
  case_number,
  paciente_name,
  paciente_phone,
  doctor_name,
  fecha_entrega,
  tratamientos_count,
  archivos_count
FROM lab_cases_with_details
WHERE estado = 'pendiente'
ORDER BY fecha_entrega ASC;
```

#### Consulta de casos por paciente con agregaciones
```sql
SELECT 
  p.name AS paciente_name,
  COUNT(lc.id) AS total_casos,
  COUNT(CASE WHEN lc.estado = 'pendiente' THEN 1 END) AS casos_pendientes,
  COUNT(CASE WHEN lc.estado = 'en_diseño' THEN 1 END) AS casos_en_diseño
FROM patient p
LEFT JOIN lab_cases lc ON p.id = lc.paciente_id
GROUP BY p.id, p.name
HAVING COUNT(lc.id) > 0
ORDER BY total_casos DESC;
```

#### Consulta de casos por doctor con agregaciones
```sql
SELECT 
  d.name AS doctor_name,
  COUNT(lc.id) AS total_casos,
  COUNT(CASE WHEN lc.estado = 'pendiente' THEN 1 END) AS casos_pendientes
FROM doctor d
LEFT JOIN lab_cases lc ON d.id = lc.doctor_id
GROUP BY d.id, d.name
HAVING COUNT(lc.id) > 0
ORDER BY total_casos DESC;
```

### Instalación

1. Ejecutar el script SQL en tu base de datos Supabase:
   ```sql
   -- Ejecutar el contenido de: src/lib/supabase/lab_cases/create_lab_cases_tables.sql
   ```

2. Verificar que las tablas `patient` y `doctor` existan en tu base de datos antes de ejecutar el script.

3. Configurar las políticas de seguridad según tus necesidades específicas.

### Notación FDI (Fédération Dentaire Internationale)

Los números de dientes siguen la notación FDI:
- **Cuadrante 1** (Superior Derecho): 11-18
- **Cuadrante 2** (Superior Izquierdo): 21-28
- **Cuadrante 3** (Inferior Izquierdo): 31-38
- **Cuadrante 4** (Inferior Derecho): 41-48

### Guía de Colores Vita

Los colores disponibles para los tratamientos incluyen:
- **Serie A** (Marrón): A1, A2, A3, A3.5, A4
- **Serie B** (Amarillento): B1, B2, B3, B4
- **Serie C** (Grisáceo): C1, C2, C3, C4
- **Serie D** (Rojizo-grisáceo): D2, D3, D4

## 📝 Notas de Desarrollo

- El sistema utiliza Svelte 5 con runes mode
- Los componentes UI están basados en shadcn-svelte
- La autenticación y base de datos se gestionan con Supabase
- Los archivos se almacenan en Supabase Storage

## 🔧 Tecnologías

- **Frontend**: SvelteKit 2.x, Svelte 5
- **Backend**: Supabase (PostgreSQL, Storage, Auth)
- **Estilos**: Tailwind CSS 4.x
- **UI Components**: shadcn-svelte, bits-ui

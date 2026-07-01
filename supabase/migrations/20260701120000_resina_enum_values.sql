-- Nuevos materiales de restauración (deben commitearse antes de usarse en inserts)

alter type public.restoration_material add value if not exists 'resina_larga_duracion';
alter type public.restoration_material add value if not exists 'resina_provisional';

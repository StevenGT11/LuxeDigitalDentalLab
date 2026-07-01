-- Estado intermedio antes de finalizado: prueba en boca / ajuste

alter type public.case_estado add value if not exists 'en_prueba' before 'finalizado';

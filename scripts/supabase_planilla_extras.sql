-- Extras por fila en planilla (nómina del evento, gasoil, parking).
-- Ejecutar en Supabase SQL Editor si aún no existen las columnas.

alter table public.rocio_horario_planilla
  add column if not exists nomina_event_euros numeric,
  add column if not exists gasoil_euros numeric,
  add column if not exists parking_euros numeric;

notify pgrst, 'reload schema';

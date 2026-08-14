-- Tarifas por trabajador (Vie–Dom 10/12, miércoles 12/15).
-- Ejecutar en Supabase SQL Editor y luego recargar la app.

alter table public.rocio_horario_planilla
  add column if not exists tarifa_finde numeric,
  add column if not exists tarifa_miercoles numeric;

notify pgrst, 'reload schema';

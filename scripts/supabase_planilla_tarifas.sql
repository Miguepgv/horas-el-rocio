-- Tarifas fijas del evento (vie–mar 12 €/h, mié 15 €/h).
-- Ejecutar en Supabase SQL Editor y luego recargar la app.

alter table public.rocio_horario_planilla
  add column if not exists tarifa_finde numeric,
  add column if not exists tarifa_miercoles numeric;

-- Poner 12/15 a todos (turnos ya guardados se recalculan en la app con estas tarifas).
update public.rocio_horario_planilla
set tarifa_finde = 12,
    tarifa_miercoles = 15
where tarifa_finde is distinct from 12
   or tarifa_miercoles is distinct from 15;

notify pgrst, 'reload schema';

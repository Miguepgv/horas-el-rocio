-- Ejecutar UNA VEZ en Supabase: Dashboard → SQL → New query → Run
-- Crea las tablas que usa la app (Admin planilla, avisos, pantalla Inicio).
-- Después: NOTIFY pgrst (al final de este archivo) y recarga la app.

-- ---------- rocio_horario_planilla ----------
CREATE TABLE IF NOT EXISTS public.rocio_horario_planilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT '',
  correo text,
  d01_a text NOT NULL DEFAULT '',
  d01_b text NOT NULL DEFAULT '',
  d02_a text NOT NULL DEFAULT '',
  d02_b text NOT NULL DEFAULT '',
  d03_a text NOT NULL DEFAULT '',
  d03_b text NOT NULL DEFAULT '',
  d04_a text NOT NULL DEFAULT '',
  d04_b text NOT NULL DEFAULT '',
  d05_a text NOT NULL DEFAULT '',
  d05_b text NOT NULL DEFAULT '',
  d06_a text NOT NULL DEFAULT '',
  d06_b text NOT NULL DEFAULT '',
  d07_a text NOT NULL DEFAULT '',
  d07_b text NOT NULL DEFAULT '',
  d08_a text NOT NULL DEFAULT '',
  d08_b text NOT NULL DEFAULT '',
  d09_a text NOT NULL DEFAULT '',
  d09_b text NOT NULL DEFAULT '',
  d10_a text NOT NULL DEFAULT '',
  d10_b text NOT NULL DEFAULT '',
  d11_a text NOT NULL DEFAULT '',
  d11_b text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS rocio_horario_planilla_correo_lower_idx
  ON public.rocio_horario_planilla (lower(trim(correo)));

CREATE INDEX IF NOT EXISTS rocio_horario_planilla_nombre_trim_idx
  ON public.rocio_horario_planilla (trim(nombre));

ALTER TABLE public.rocio_horario_planilla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rocio_horario_planilla_auth_rw" ON public.rocio_horario_planilla;
CREATE POLICY "rocio_horario_planilla_auth_rw"
  ON public.rocio_horario_planilla
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.rocio_horario_planilla TO authenticated, service_role;

-- Extras € por fila (nómina evento, gasoil, parking). Idempotente si ya existían.
ALTER TABLE public.rocio_horario_planilla
  ADD COLUMN IF NOT EXISTS nomina_event_euros numeric,
  ADD COLUMN IF NOT EXISTS gasoil_euros numeric,
  ADD COLUMN IF NOT EXISTS parking_euros numeric;

-- ---------- horario_avisos ----------
CREATE TABLE IF NOT EXISTS public.horario_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje text NOT NULL,
  para_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS horario_avisos_created_at_idx
  ON public.horario_avisos (created_at DESC);

ALTER TABLE public.horario_avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horario_avisos_auth_select" ON public.horario_avisos;
CREATE POLICY "horario_avisos_auth_select"
  ON public.horario_avisos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "horario_avisos_auth_insert" ON public.horario_avisos;
CREATE POLICY "horario_avisos_auth_insert"
  ON public.horario_avisos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT ALL ON TABLE public.horario_avisos TO authenticated, service_role;

-- Refrescar caché de PostgREST (API)
NOTIFY pgrst, 'reload schema';

-- Ejecutar UNA VEZ en Supabase: Dashboard → SQL → New query → Run
-- Lista de espera (hostess) — Administración → pestaña Lista de espera

CREATE TABLE IF NOT EXISTS public.rocio_lista_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT '',
  num_personas integer NOT NULL DEFAULT 1 CHECK (num_personas > 0 AND num_personas <= 99),
  telefono text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rocio_lista_espera_created_at_idx
  ON public.rocio_lista_espera (created_at ASC);

ALTER TABLE public.rocio_lista_espera ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rocio_lista_espera_auth_rw" ON public.rocio_lista_espera;
CREATE POLICY "rocio_lista_espera_auth_rw"
  ON public.rocio_lista_espera
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.rocio_lista_espera TO authenticated, service_role;

-- Login solo-correo (VITE_INSECURE_EMAIL_LOGIN=true): la app usa clave anon sin sesión Auth.
ALTER TABLE public.rocio_lista_espera DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rocio_lista_espera TO anon;

NOTIFY pgrst, 'reload schema';

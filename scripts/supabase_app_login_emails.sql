-- Los correos se listan en Administración → Planilla horario (desplegable "Correo").
-- Ejecutar en Supabase → SQL Editor. Luego recarga la app (o NOTIFY pgrst abajo).
-- Requiere la tabla public.app_admins (ya usada por la app). El superadmin solo por
-- VITE_SUPER_ADMIN_EMAIL debe tener también una fila en app_admins para ver esta lista.

CREATE TABLE IF NOT EXISTS public.app_login_emails (
  email TEXT PRIMARY KEY,
  auth_user_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_login_emails_email_lower CHECK (email = lower(trim(email)))
);

CREATE INDEX IF NOT EXISTS app_login_emails_last_seen_idx
  ON public.app_login_emails (last_seen_at DESC);

ALTER TABLE public.app_login_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_login_emails_insert_own" ON public.app_login_emails;
CREATE POLICY "app_login_emails_insert_own"
  ON public.app_login_emails FOR INSERT TO authenticated
  WITH CHECK (lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "app_login_emails_update_own" ON public.app_login_emails;
CREATE POLICY "app_login_emails_update_own"
  ON public.app_login_emails FOR UPDATE TO authenticated
  USING (lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
  WITH CHECK (lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')));

-- Solo quien está en app_admins ve la lista (mismo criterio que el panel de administración).
DROP POLICY IF EXISTS "app_login_emails_select_admin" ON public.app_login_emails;
CREATE POLICY "app_login_emails_select_admin"
  ON public.app_login_emails FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_admins a
      WHERE lower(trim(a.email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  );

GRANT ALL ON TABLE public.app_login_emails TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

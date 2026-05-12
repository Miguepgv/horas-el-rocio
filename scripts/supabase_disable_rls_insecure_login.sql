-- SOLO si activas VITE_INSECURE_EMAIL_LOGIN=true en la app (login solo con correo, sin Supabase Auth).
-- Desactiva RLS en tablas que la app usa con la clave ANÓNIMA, para que no haga falta auth.uid().
-- Cualquiera con la URL del proyecto y la anon key podría leer/modificar datos: uso interno bajo tu responsabilidad.
-- Ejecutar en SQL Editor del mismo proyecto. Luego recarga la app o NOTIFY pgrst.

ALTER TABLE IF EXISTS public.punches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.worker_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rocio_horario_planilla DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horario_avisos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_login_emails DISABLE ROW LEVEL SECURITY;

-- Permisos para la clave anónima (sin sesión Supabase Auth)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_workers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_schedule_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rocio_horario_planilla TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horario_avisos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_admins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_login_emails TO anon;

-- Login solo-correo: la app guarda fichajes con un UUID sintético por correo, que NO existe en auth.users.
-- Sin esto, INSERT en punches falla con: violates foreign key constraint "punches_user_id_fkey".
ALTER TABLE public.punches DROP CONSTRAINT IF EXISTS punches_user_id_fkey;

-- Misma razón si worker_profiles apuntaba a auth.users (el alta automática se omite en modo inseguro, pero por si acaso).
ALTER TABLE public.worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_user_id_fkey;

NOTIFY pgrst, 'reload schema';

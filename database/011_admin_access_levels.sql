ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_access_level TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_admin_access_level_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_admin_access_level_check
      CHECK (admin_access_level IN ('none', 'read', 'write', 'owner'));
  END IF;
END
$$;

UPDATE public.users
SET admin_access_level = 'owner'
WHERE role = 'admin'
  AND COALESCE(admin_access_level, 'none') = 'none';

CREATE INDEX IF NOT EXISTS idx_users_admin_access_level
  ON public.users(admin_access_level);

COMMENT ON COLUMN public.users.admin_access_level IS 'Nivel de acceso al panel admin: none, read, write u owner.';

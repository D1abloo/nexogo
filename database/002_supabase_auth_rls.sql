CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
  END IF;
END
$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.is_admin(check_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = check_user
      AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  INSERT INTO public.users (
    id,
    name,
    email,
    first_name,
    last_name,
    username,
    phone,
    address,
    district,
    city,
    postal_code,
    country,
    photo_url,
    birth_date,
    bio,
    emergency_contact,
    role,
    verified
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(meta ->> 'name'), ''), NULLIF(trim((COALESCE(meta ->> 'first_name', '') || ' ' || COALESCE(meta ->> 'last_name', ''))), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(trim(meta ->> 'first_name'), ''),
    NULLIF(trim(meta ->> 'last_name'), ''),
    NULLIF(trim(meta ->> 'username'), ''),
    NULLIF(trim(meta ->> 'phone'), ''),
    NULLIF(trim(meta ->> 'address'), ''),
    NULLIF(trim(meta ->> 'district'), ''),
    NULLIF(trim(meta ->> 'city'), ''),
    NULLIF(trim(meta ->> 'postal_code'), ''),
    NULLIF(trim(meta ->> 'country'), ''),
    NULLIF(trim(meta ->> 'photo'), ''),
    NULLIF(meta ->> 'birth_date', '')::date,
    NULLIF(trim(meta ->> 'bio'), ''),
    NULLIF(trim(meta ->> 'emergency_contact'), ''),
    CASE WHEN meta ->> 'role' = 'admin' THEN 'admin'::user_role ELSE 'user'::user_role END,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false)
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
    username = COALESCE(EXCLUDED.username, public.users.username),
    phone = COALESCE(EXCLUDED.phone, public.users.phone),
    address = COALESCE(EXCLUDED.address, public.users.address),
    district = COALESCE(EXCLUDED.district, public.users.district),
    city = COALESCE(EXCLUDED.city, public.users.city),
    postal_code = COALESCE(EXCLUDED.postal_code, public.users.postal_code),
    country = COALESCE(EXCLUDED.country, public.users.country),
    photo_url = COALESCE(EXCLUDED.photo_url, public.users.photo_url),
    birth_date = COALESCE(EXCLUDED.birth_date, public.users.birth_date),
    bio = COALESCE(EXCLUDED.bio, public.users.bio),
    emergency_contact = COALESCE(EXCLUDED.emergency_contact, public.users.emergency_contact),
    verified = COALESCE(NEW.email_confirmed_at IS NOT NULL, public.users.verified),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_auth_user ON auth.users;
CREATE TRIGGER trg_handle_auth_user
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user();

INSERT INTO public.users (id, name, email, verified)
SELECT
  au.id,
  COALESCE(split_part(au.email, '@', 1), 'usuario'),
  au.email,
  COALESCE(au.email_confirmed_at IS NOT NULL, false)
FROM auth.users au
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE VIEW public.public_profile_cards AS
SELECT
  id,
  name,
  username,
  city,
  country,
  photo_url,
  bio,
  rating_avg,
  rating_count,
  verified,
  created_at
FROM public.users
WHERE is_banned = false;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_policy ON public.users;
CREATE POLICY users_select_policy
ON public.users
FOR SELECT
USING (auth.uid() = id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS users_update_policy ON public.users;
CREATE POLICY users_update_policy
ON public.users
FOR UPDATE
USING (auth.uid() = id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS users_insert_policy ON public.users;
CREATE POLICY users_insert_policy
ON public.users
FOR INSERT
WITH CHECK (auth.uid() = id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS interests_owner_policy ON public.user_interests;
CREATE POLICY interests_owner_policy
ON public.user_interests
FOR ALL
USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS plans_read_policy ON public.plans;
CREATE POLICY plans_read_policy
ON public.plans
FOR SELECT
USING (
  visibility = 'public'
  OR creator_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.plan_participants pp
    WHERE pp.plan_id = plans.id
      AND pp.user_id = auth.uid()
      AND pp.status IN ('pending', 'accepted', 'attended')
  )
);

DROP POLICY IF EXISTS plans_insert_policy ON public.plans;
CREATE POLICY plans_insert_policy
ON public.plans
FOR INSERT
WITH CHECK (creator_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS plans_update_policy ON public.plans;
CREATE POLICY plans_update_policy
ON public.plans
FOR UPDATE
USING (creator_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (creator_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS plans_delete_policy ON public.plans;
CREATE POLICY plans_delete_policy
ON public.plans
FOR DELETE
USING (creator_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS participants_read_policy ON public.plan_participants;
CREATE POLICY participants_read_policy
ON public.plan_participants
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = plan_participants.plan_id
      AND p.creator_id = auth.uid()
  )
);

DROP POLICY IF EXISTS participants_insert_policy ON public.plan_participants;
CREATE POLICY participants_insert_policy
ON public.plan_participants
FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS participants_update_policy ON public.plan_participants;
CREATE POLICY participants_update_policy
ON public.plan_participants
FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = plan_participants.plan_id
      AND p.creator_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = plan_participants.plan_id
      AND p.creator_id = auth.uid()
  )
);

DROP POLICY IF EXISTS messages_read_policy ON public.messages;
CREATE POLICY messages_read_policy
ON public.messages
FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = messages.plan_id
      AND p.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.plan_participants pp
    WHERE pp.plan_id = messages.plan_id
      AND pp.user_id = auth.uid()
      AND pp.status IN ('accepted', 'attended')
  )
);

DROP POLICY IF EXISTS messages_insert_policy ON public.messages;
CREATE POLICY messages_insert_policy
ON public.messages
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.plans p
      WHERE p.id = messages.plan_id
        AND p.creator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.plan_participants pp
      WHERE pp.plan_id = messages.plan_id
        AND pp.user_id = auth.uid()
        AND pp.status IN ('accepted', 'attended')
    )
  )
);

DROP POLICY IF EXISTS reviews_read_policy ON public.reviews;
CREATE POLICY reviews_read_policy
ON public.reviews
FOR SELECT
USING (
  reviewer_id = auth.uid()
  OR reviewed_user_id = auth.uid()
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS reviews_insert_policy ON public.reviews;
CREATE POLICY reviews_insert_policy
ON public.reviews
FOR INSERT
WITH CHECK (
  reviewer_id = auth.uid()
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS reports_owner_policy ON public.reports;
CREATE POLICY reports_owner_policy
ON public.reports
FOR SELECT
USING (
  reporter_id = auth.uid()
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS reports_insert_policy ON public.reports;
CREATE POLICY reports_insert_policy
ON public.reports
FOR INSERT
WITH CHECK (reporter_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS reports_update_policy ON public.reports;
CREATE POLICY reports_update_policy
ON public.reports
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS notifications_owner_policy ON public.notifications;
CREATE POLICY notifications_owner_policy
ON public.notifications
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
CREATE POLICY notifications_update_policy
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS devices_owner_policy ON public.user_devices;
CREATE POLICY devices_owner_policy
ON public.user_devices
FOR ALL
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

COMMENT ON FUNCTION public.handle_auth_user() IS 'Sincroniza auth.users con public.users para Supabase Auth.';
COMMENT ON FUNCTION public.is_admin(uuid) IS 'Devuelve true si el usuario tiene rol admin en public.users.';

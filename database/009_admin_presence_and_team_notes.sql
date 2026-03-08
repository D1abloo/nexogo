CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_team_notes (
  id BIGSERIAL PRIMARY KEY,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON public.user_presence(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_admin_team_notes_updated_at ON public.admin_team_notes(updated_at DESC);

COMMENT ON TABLE public.user_presence IS 'Presencia reciente de usuarios autenticados para actividad cercana a tiempo real.';
COMMENT ON TABLE public.admin_team_notes IS 'Notas internas compartidas entre administradores para coordinación operativa.';

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_team_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presence_owner_select_policy ON public.user_presence;
CREATE POLICY user_presence_owner_select_policy
ON public.user_presence
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS user_presence_owner_upsert_policy ON public.user_presence;
CREATE POLICY user_presence_owner_upsert_policy
ON public.user_presence
FOR ALL
USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_team_notes_admin_select_policy ON public.admin_team_notes;
CREATE POLICY admin_team_notes_admin_select_policy
ON public.admin_team_notes
FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_team_notes_admin_insert_policy ON public.admin_team_notes;
CREATE POLICY admin_team_notes_admin_insert_policy
ON public.admin_team_notes
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_team_notes_admin_update_policy ON public.admin_team_notes;
CREATE POLICY admin_team_notes_admin_update_policy
ON public.admin_team_notes
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_team_notes_admin_delete_policy ON public.admin_team_notes;
CREATE POLICY admin_team_notes_admin_delete_policy
ON public.admin_team_notes
FOR DELETE
USING (public.is_admin(auth.uid()));

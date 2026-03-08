CREATE TABLE IF NOT EXISTS public.site_virtual_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  author_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'guest',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_virtual_chat_messages_created_at
  ON public.site_virtual_chat_messages(created_at DESC);

ALTER TABLE public.site_virtual_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_virtual_chat_messages_admin_select_policy ON public.site_virtual_chat_messages;
CREATE POLICY site_virtual_chat_messages_admin_select_policy
ON public.site_virtual_chat_messages
FOR SELECT
USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.site_virtual_chat_messages IS 'Chat virtual global de la plataforma, separado de los chats de sala.';

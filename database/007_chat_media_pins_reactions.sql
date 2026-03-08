ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_messages_pinned_plan
  ON public.messages(plan_id, is_pinned, pinned_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions(message_id);

COMMENT ON COLUMN public.messages.image_url IS 'Adjunto de imagen del mensaje, pensado para demo/local o URL remota.';
COMMENT ON COLUMN public.messages.is_pinned IS 'Indica si el mensaje está fijado en la parte superior del chat.';
COMMENT ON COLUMN public.messages.pinned_at IS 'Fecha en la que el mensaje fue fijado.';
COMMENT ON COLUMN public.messages.pinned_by IS 'Usuario que fijó el mensaje.';
COMMENT ON TABLE public.message_reactions IS 'Reacciones emoji aplicadas por los usuarios a mensajes del chat.';

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS private_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS private_chat_code_hash TEXT;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS idx_messages_plan_channel_created
  ON public.messages(plan_id, channel, created_at);

COMMENT ON COLUMN public.plans.private_chat_enabled IS 'Activa un canal privado adicional dentro del chat de la sala.';
COMMENT ON COLUMN public.plans.private_chat_code_hash IS 'Hash SHA-256 del codigo privado del canal de chat.';
COMMENT ON COLUMN public.messages.channel IS 'Canal del mensaje: main o private.';

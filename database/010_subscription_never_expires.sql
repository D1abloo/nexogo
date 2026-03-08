ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS never_expires BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_never_expires
  ON public.user_subscriptions(never_expires);

COMMENT ON COLUMN public.user_subscriptions.never_expires IS 'Indica si la suscripción premium queda activa sin fecha de expiración mientras administración no la revoque.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
    CREATE TYPE subscription_tier AS ENUM ('free', 'plus', 'pro');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('inactive', 'trial', 'active', 'past_due', 'cancelled');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, blocked_user_id),
  CONSTRAINT user_blocks_self_chk CHECK (owner_user_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier subscription_tier NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'inactive',
  price_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  provider TEXT,
  provider_subscription_id TEXT,
  started_at TIMESTAMPTZ,
  renewal_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_owner ON public.user_blocks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);

COMMENT ON TABLE public.user_blocks IS 'Bloqueos entre usuarios para impedir interacciones no deseadas.';
COMMENT ON TABLE public.user_subscriptions IS 'Suscripciones premium del usuario para planes de monetización.';

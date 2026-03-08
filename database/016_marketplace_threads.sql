CREATE TABLE IF NOT EXISTS public.marketplace_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, seller_user_id, buyer_user_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_thread_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.marketplace_threads(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_threads_item ON public.marketplace_threads(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_threads_seller ON public.marketplace_threads(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_threads_buyer ON public.marketplace_threads(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_thread_messages_thread_created ON public.marketplace_thread_messages(thread_id, created_at);

ALTER TABLE public.marketplace_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_threads_select_policy ON public.marketplace_threads;
CREATE POLICY marketplace_threads_select_policy
ON public.marketplace_threads
FOR SELECT
USING (
  seller_user_id = auth.uid() OR buyer_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_threads_insert_policy ON public.marketplace_threads;
CREATE POLICY marketplace_threads_insert_policy
ON public.marketplace_threads
FOR INSERT
WITH CHECK (
  seller_user_id = auth.uid() OR buyer_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_threads_update_policy ON public.marketplace_threads;
CREATE POLICY marketplace_threads_update_policy
ON public.marketplace_threads
FOR UPDATE
USING (
  seller_user_id = auth.uid() OR buyer_user_id = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  seller_user_id = auth.uid() OR buyer_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_thread_messages_select_policy ON public.marketplace_thread_messages;
CREATE POLICY marketplace_thread_messages_select_policy
ON public.marketplace_thread_messages
FOR SELECT
USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.marketplace_threads t
    WHERE t.id = marketplace_thread_messages.thread_id
      AND (t.seller_user_id = auth.uid() OR t.buyer_user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS marketplace_thread_messages_insert_policy ON public.marketplace_thread_messages;
CREATE POLICY marketplace_thread_messages_insert_policy
ON public.marketplace_thread_messages
FOR INSERT
WITH CHECK (
  author_user_id = auth.uid() AND (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.marketplace_threads t
      WHERE t.id = marketplace_thread_messages.thread_id
        AND (t.seller_user_id = auth.uid() OR t.buyer_user_id = auth.uid())
    )
  )
);

COMMENT ON TABLE public.marketplace_threads IS 'Conversaciones directas entre comprador y vendedor para un anuncio del mercado.';
COMMENT ON TABLE public.marketplace_thread_messages IS 'Mensajes del chat privado asociado a un anuncio de marketplace.';

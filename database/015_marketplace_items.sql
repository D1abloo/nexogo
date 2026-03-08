CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('sell', 'buy', 'swap')),
  category TEXT NOT NULL DEFAULT 'general',
  condition TEXT NOT NULL DEFAULT 'good',
  price_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  city TEXT,
  country TEXT,
  district TEXT,
  image_url TEXT,
  allow_offers BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_created_at ON public.marketplace_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON public.marketplace_items(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_city ON public.marketplace_items(city);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_category ON public.marketplace_items(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller ON public.marketplace_items(seller_user_id);

ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_items_select_policy ON public.marketplace_items;
CREATE POLICY marketplace_items_select_policy
ON public.marketplace_items
FOR SELECT
USING (status = 'active' OR seller_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS marketplace_items_insert_policy ON public.marketplace_items;
CREATE POLICY marketplace_items_insert_policy
ON public.marketplace_items
FOR INSERT
WITH CHECK (seller_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS marketplace_items_update_policy ON public.marketplace_items;
CREATE POLICY marketplace_items_update_policy
ON public.marketplace_items
FOR UPDATE
USING (seller_user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (seller_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS marketplace_items_delete_policy ON public.marketplace_items;
CREATE POLICY marketplace_items_delete_policy
ON public.marketplace_items
FOR DELETE
USING (seller_user_id = auth.uid() OR public.is_admin(auth.uid()));

COMMENT ON TABLE public.marketplace_items IS 'Mercado social para anuncios de compra, venta o intercambio publicados por usuarios.';
COMMENT ON COLUMN public.marketplace_items.trade_type IS 'Tipo de anuncio: venta, compra o intercambio.';
COMMENT ON COLUMN public.marketplace_items.allow_offers IS 'Permite negociación dentro del mercado social.';
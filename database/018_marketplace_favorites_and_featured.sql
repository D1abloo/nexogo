ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.marketplace_favorites (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_featured
  ON public.marketplace_items(featured, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_user
  ON public.marketplace_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_item
  ON public.marketplace_favorites(item_id, created_at DESC);

ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_favorites_select_policy ON public.marketplace_favorites;
CREATE POLICY marketplace_favorites_select_policy
ON public.marketplace_favorites
FOR SELECT
USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_favorites_insert_policy ON public.marketplace_favorites;
CREATE POLICY marketplace_favorites_insert_policy
ON public.marketplace_favorites
FOR INSERT
WITH CHECK (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_favorites_delete_policy ON public.marketplace_favorites;
CREATE POLICY marketplace_favorites_delete_policy
ON public.marketplace_favorites
FOR DELETE
USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);

COMMENT ON COLUMN public.marketplace_items.featured IS 'Marca interna para destacar un anuncio dentro del mercado.';
COMMENT ON TABLE public.marketplace_favorites IS 'Favoritos guardados por cada usuario para seguir anuncios del mercado.';

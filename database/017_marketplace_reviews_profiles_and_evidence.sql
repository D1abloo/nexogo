ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS sold_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.marketplace_item_images (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 90),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, seller_user_id, buyer_user_id)
);

CREATE TABLE IF NOT EXISTS public.report_evidence (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_sold_to_user_id
  ON public.marketplace_items(sold_to_user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_item_images_item
  ON public.marketplace_item_images(item_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_seller
  ON public.marketplace_reviews(seller_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_item
  ON public.marketplace_reviews(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_evidence_report
  ON public.report_evidence(report_id, created_at DESC);

ALTER TABLE public.marketplace_item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_item_images_select_policy ON public.marketplace_item_images;
CREATE POLICY marketplace_item_images_select_policy
ON public.marketplace_item_images
FOR SELECT
USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1
    FROM public.marketplace_items i
    WHERE i.id = marketplace_item_images.item_id
      AND (i.status = 'active' OR i.seller_user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS marketplace_item_images_insert_policy ON public.marketplace_item_images;
CREATE POLICY marketplace_item_images_insert_policy
ON public.marketplace_item_images
FOR INSERT
WITH CHECK (
  owner_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_item_images_update_policy ON public.marketplace_item_images;
CREATE POLICY marketplace_item_images_update_policy
ON public.marketplace_item_images
FOR UPDATE
USING (
  owner_user_id = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  owner_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_item_images_delete_policy ON public.marketplace_item_images;
CREATE POLICY marketplace_item_images_delete_policy
ON public.marketplace_item_images
FOR DELETE
USING (
  owner_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS marketplace_reviews_select_policy ON public.marketplace_reviews;
CREATE POLICY marketplace_reviews_select_policy
ON public.marketplace_reviews
FOR SELECT
USING (true);

DROP POLICY IF EXISTS marketplace_reviews_insert_policy ON public.marketplace_reviews;
CREATE POLICY marketplace_reviews_insert_policy
ON public.marketplace_reviews
FOR INSERT
WITH CHECK (
  seller_user_id = auth.uid() OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS report_evidence_select_policy ON public.report_evidence;
CREATE POLICY report_evidence_select_policy
ON public.report_evidence
FOR SELECT
USING (
  uploader_user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.id = report_evidence.report_id
      AND r.reporter_id = auth.uid()
  )
);

DROP POLICY IF EXISTS report_evidence_insert_policy ON public.report_evidence;
CREATE POLICY report_evidence_insert_policy
ON public.report_evidence
FOR INSERT
WITH CHECK (
  uploader_user_id = auth.uid() OR public.is_admin(auth.uid())
);

COMMENT ON COLUMN public.marketplace_items.sold_to_user_id IS 'Usuario comprador al que finalmente se le vende el anuncio.';
COMMENT ON COLUMN public.marketplace_items.sold_at IS 'Fecha de cierre de venta del anuncio.';
COMMENT ON TABLE public.marketplace_item_images IS 'Galería de imágenes y descripciones asociadas a cada anuncio del mercado.';
COMMENT ON TABLE public.marketplace_reviews IS 'Valoraciones emitidas por el vendedor una vez se cierra una venta.';
COMMENT ON TABLE public.report_evidence IS 'Pruebas o adjuntos aportados por el usuario en una investigación o incidencia.';
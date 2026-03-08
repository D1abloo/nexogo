ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS premium_room BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_room BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS advanced_analytics BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.plans.premium_room IS 'Indica si la sala se publica como premium.';
COMMENT ON COLUMN public.plans.featured_room IS 'Indica si la sala aparece destacada en el feed y mapa.';
COMMENT ON COLUMN public.plans.advanced_analytics IS 'Activa analítica avanzada para la sala.';

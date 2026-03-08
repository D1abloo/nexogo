ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS room_level TEXT NOT NULL DEFAULT 'abierto',
  ADD COLUMN IF NOT EXISTS age_range TEXT NOT NULL DEFAULT '18+',
  ADD COLUMN IF NOT EXISTS allow_chat_gpt BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS access_password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_city ON public.plans(city);
CREATE INDEX IF NOT EXISTS idx_plans_country ON public.plans(country);

COMMENT ON COLUMN public.plans.city IS 'Ciudad de la sala o plan.';
COMMENT ON COLUMN public.plans.country IS 'Pais de la sala o plan.';
COMMENT ON COLUMN public.plans.district IS 'Distrito o zona de la sala o plan.';
COMMENT ON COLUMN public.plans.address IS 'Direccion completa o punto de encuentro del plan.';
COMMENT ON COLUMN public.plans.duration_minutes IS 'Duracion estimada del plan en minutos.';
COMMENT ON COLUMN public.plans.language IS 'Idioma principal de la sala.';
COMMENT ON COLUMN public.plans.room_level IS 'Nivel o tono social esperado.';
COMMENT ON COLUMN public.plans.age_range IS 'Rango de edad recomendado.';
COMMENT ON COLUMN public.plans.allow_chat_gpt IS 'Permite ayudas del asistente dentro de la sala.';
COMMENT ON COLUMN public.plans.access_password_hash IS 'Hash SHA-256 de la contraseña de acceso a la sala si aplica.';

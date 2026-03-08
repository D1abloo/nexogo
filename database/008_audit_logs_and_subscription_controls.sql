ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS managed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renew ON public.user_subscriptions(auto_renew);

COMMENT ON COLUMN public.user_subscriptions.auto_renew IS 'Si la suscripción se renueva automáticamente mientras siga activa.';
COMMENT ON COLUMN public.user_subscriptions.cancel_at_period_end IS 'Marca si el usuario canceló para el final del periodo actual.';
COMMENT ON COLUMN public.user_subscriptions.payment_method IS 'Método de pago preferido o aplicado a la suscripción.';
COMMENT ON COLUMN public.user_subscriptions.admin_notes IS 'Notas administrativas internas sobre la suscripción.';
COMMENT ON COLUMN public.user_subscriptions.managed_by IS 'Administrador que realizó el último cambio manual en la suscripción.';
COMMENT ON TABLE public.audit_logs IS 'Log de auditoría interno para cambios sensibles: moderación, suscripciones y seguridad.';

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_select_policy ON public.audit_logs;
CREATE POLICY audit_logs_admin_select_policy
ON public.audit_logs
FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS audit_logs_admin_insert_policy ON public.audit_logs;
CREATE POLICY audit_logs_admin_insert_policy
ON public.audit_logs
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.guest_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approval_token_hash TEXT,
  approval_expires_at TIMESTAMPTZ,
  approval_sent_at TIMESTAMPTZ,
  email_verification_required BOOLEAN NOT NULL DEFAULT TRUE,
  used_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_access_requests_status_requested_at
  ON public.guest_access_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_access_requests_email
  ON public.guest_access_requests(LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_access_requests_token_hash
  ON public.guest_access_requests(approval_token_hash)
  WHERE approval_token_hash IS NOT NULL;

ALTER TABLE public.guest_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_access_requests_admin_select_policy ON public.guest_access_requests;
CREATE POLICY guest_access_requests_admin_select_policy
ON public.guest_access_requests
FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS guest_access_requests_admin_update_policy ON public.guest_access_requests;
CREATE POLICY guest_access_requests_admin_update_policy
ON public.guest_access_requests
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.guest_access_requests IS 'Solicitudes de acceso invitado revisadas manualmente por administración.';
COMMENT ON COLUMN public.guest_access_requests.status IS 'Estado: pending, approved, rejected o consumed.';
COMMENT ON COLUMN public.guest_access_requests.approval_token_hash IS 'Hash SHA-256 del enlace temporal de aprobación.';
COMMENT ON COLUMN public.guest_access_requests.approval_expires_at IS 'Caducidad del enlace temporal de acceso invitado.';

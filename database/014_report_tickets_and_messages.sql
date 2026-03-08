ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS resolution_text TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.reports
SET ticket_number = 'TCK-' || LPAD(id::text, 6, '0')
WHERE ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_ticket_number_unique
  ON public.reports(ticket_number)
  WHERE ticket_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.report_messages (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL DEFAULT 'user',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_messages_report_id_created_at
  ON public.report_messages(report_id, created_at);

ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_messages_select_policy ON public.report_messages;
CREATE POLICY report_messages_select_policy
ON public.report_messages
FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.id = report_messages.report_id
      AND r.reporter_id = auth.uid()
  )
);

DROP POLICY IF EXISTS report_messages_insert_policy ON public.report_messages;
CREATE POLICY report_messages_insert_policy
ON public.report_messages
FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.id = report_messages.report_id
      AND r.reporter_id = auth.uid()
  )
);

COMMENT ON COLUMN public.reports.ticket_number IS 'Numero de ticket visible para seguimiento por usuario y administracion.';
COMMENT ON COLUMN public.reports.resolution_text IS 'Texto final de resolucion comunicado al usuario.';
COMMENT ON COLUMN public.reports.resolved_at IS 'Momento en el que el ticket fue cerrado o resuelto.';
COMMENT ON COLUMN public.reports.closed_by IS 'Administrador que cerro o resolvio el ticket.';
COMMENT ON TABLE public.report_messages IS 'Canal de conversacion entre usuario reportante y administracion para seguimiento del ticket.';

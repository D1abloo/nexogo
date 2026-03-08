import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@nexogo.local';
const REPORT_ALERT_EMAIL = process.env.REPORT_ALERT_EMAIL || 'info@estructuraweb.es';

function formalSignatureLines() {
  return [
    '',
    'Atentamente,',
    'Equipo de Acceso, Cumplimiento y Soporte',
    'NexoGo',
    'info@estructuraweb.es',
    'https://nexogo.local',
  ];
}

function getTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export async function sendReportAlertEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Nuevo reporte ${payload.ticket_number ? `#${payload.ticket_number}` : ''}: ${payload.reason || 'incidencia'}`;
  const text = [
    'Se ha recibido un nuevo reporte en NexoGo.',
    '',
    `Ticket: ${payload.ticket_number || 'pendiente de numeracion'}`,
    `Motivo: ${payload.reason || 'sin motivo'}`,
    `Descripción: ${payload.description || 'sin descripción'}`,
    `Reportado por: ${payload.reporter_email || 'desconocido'}`,
    `Usuario reportado: ${payload.reported_user_email || 'N/A'}`,
    `Sala reportada: ${payload.reported_plan_title || 'N/A'}`,
    '',
    'Revisa el panel /admin para moderar la incidencia.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: REPORT_ALERT_EMAIL,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendReportResolutionEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Actualización de ticket ${payload.ticket_number || ''} · ${payload.status || 'resuelto'}`;
  const text = [
    `Hola ${payload.name || 'usuario'},`,
    '',
    'Tu incidencia ha sido revisada por el equipo de administración.',
    '',
    `Ticket: ${payload.ticket_number || 'sin numeración'}`,
    `Estado: ${payload.status || 'resolved'}`,
    `Resolución: ${payload.resolution_text || 'Sin detalle adicional.'}`,
    `Cerrado el: ${payload.resolved_at || 'sin fecha'}`,
    '',
    'Puedes revisar el histórico, el estado y la conversación del ticket dentro de tu panel de cuenta.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendPremiumConditionsEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Condiciones de tu plan ${String(payload.tier || 'premium').toUpperCase()}`;
  const text = [
    `Hola ${payload.name || 'usuario'},`,
    '',
    `Has activado el plan ${String(payload.tier || 'premium').toUpperCase()} en NexoGo.`,
    '',
    'Condiciones principales:',
    '- Renovación mensual automática salvo cancelación previa.',
    '- Puedes cancelar antes del siguiente ciclo desde tu cuenta.',
    '- Las ventajas premium afectan a visibilidad, analítica y priorización de salas.',
    '- El uso indebido, spam o amenazas puede implicar suspensión del plan y de la cuenta.',
    '- Los cobros reales se conectarán con la pasarela final en producción.',
    '',
    'Consulta el detalle completo en la sección Premium de la plataforma.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendProfileChangeAlertEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Cambio de perfil: ${payload.email}`;
  const text = [
    'Un usuario ha actualizado su perfil en NexoGo.',
    '',
    `Email: ${payload.email}`,
    `Nombre: ${payload.name || 'sin nombre'}`,
    `Ciudad: ${payload.city || 'sin ciudad'}`,
    `País: ${payload.country || 'sin país'}`,
    '',
    'Revisa el panel admin si quieres validar el cambio.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: REPORT_ALERT_EMAIL,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendPlanClosedEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Sala cerrada: ${payload.plan_title || 'Sala sin título'}`;
  const text = [
    `Hola ${payload.name || 'usuario'},`,
    '',
    'Tu sala ha quedado cerrada y ya no aceptará nuevos accesos.',
    '',
    `Sala: ${payload.plan_title || 'Sin título'}`,
    `Inicio previsto: ${payload.start_at || 'Sin fecha'}`,
    `Ciudad: ${payload.city || 'Sin ciudad'}`,
    `Cerrada por: ${payload.closed_by || 'anfitrión'}`,
    '',
    'Los asistentes serán avisados dentro de la plataforma si estaban aceptados o pendientes.',
    'Si no reconoces este cambio, revisa tu cuenta o contacta con administración.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendSubscriptionStatusEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Actualización de suscripción ${String(payload.tier || 'free').toUpperCase()}`;
  const text = [
    `Hola ${payload.name || 'usuario'},`,
    '',
    'Se ha actualizado el estado de tu suscripción en NexoGo.',
    '',
    `Plan: ${String(payload.tier || 'free').toUpperCase()}`,
    `Estado: ${payload.status || 'inactive'}`,
    `Renovación automática: ${payload.auto_renew ? 'Sí' : 'No'}`,
    `Cancelación al final del periodo: ${payload.cancel_at_period_end ? 'Sí' : 'No'}`,
    `Próxima renovación: ${payload.renewal_at || 'No definida'}`,
    `Proveedor: ${payload.provider || 'manual'}`,
    '',
    payload.admin_notes ? `Notas administrativas: ${payload.admin_notes}` : 'Sin notas administrativas adicionales.',
    '',
    'Puedes revisar, reactivar o cancelar tu suscripción desde tu panel de cuenta.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendGuestAccessRequestAdminEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = `[NexoGo] Nueva solicitud de acceso invitado: ${payload.email}`;
  const text = [
    'Se ha recibido una nueva solicitud de acceso invitado en NexoGo.',
    '',
    `Nombre: ${payload.full_name || 'sin nombre'}`,
    `Correo: ${payload.email || 'sin correo'}`,
    `Teléfono: ${payload.phone || 'sin teléfono'}`,
    `Ciudad: ${payload.city || 'sin ciudad'}`,
    `Motivo: ${payload.reason || 'sin motivo'}`,
    '',
    `Panel de revisión: ${payload.admin_panel_url || 'panel no disponible'}`,
    '',
    'La solicitud quedará pendiente hasta revisión administrativa.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: REPORT_ALERT_EMAIL,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendGuestAccessApprovedEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = '[NexoGo] Acceso invitado aprobado';
  const text = [
    `Hola ${payload.full_name || 'usuario'},`,
    '',
    'Tu solicitud de acceso invitado ha sido aprobada.',
    '',
    'Condiciones de acceso:',
    '- El enlace es personal y temporal.',
    '- Tendrás 24 horas para completar el acceso.',
    '- Deberás finalizar el registro con ese mismo correo y validar la cuenta mediante el email de confirmación.',
    '',
    `Enlace de acceso: ${payload.approval_url || 'no disponible'}`,
    `Válido hasta: ${payload.expires_at || 'sin fecha'}`,
    '',
    'Si no reconoces esta aprobación, ignora este mensaje y contacta con soporte.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

export async function sendGuestAccessRejectedEmail(payload) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const subject = '[NexoGo] Solicitud de acceso invitado revisada';
  const text = [
    `Hola ${payload.full_name || 'usuario'},`,
    '',
    'Tu solicitud de acceso invitado ha sido revisada y no ha sido aprobada en este momento.',
    '',
    payload.admin_notes ? `Observación administrativa: ${payload.admin_notes}` : 'Si lo necesitas, puedes volver a solicitar acceso más adelante.',
    ...formalSignatureLines(),
  ].join('\n');

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.email,
    subject,
    text,
  });

  return { ok: true, skipped: false };
}

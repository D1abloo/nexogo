import { authSupabase, serverSupabase } from '../../../../lib/server-supabase';
import { sendReportAlertEmail } from '../../../../lib/mailer';

function getToken(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

async function getContext(req) {
  const token = getToken(req);
  if (!token || !authSupabase || !serverSupabase) return { authUser: null, profile: null };
  const { data } = await authSupabase.auth.getUser(token);
  const authUser = data?.user || null;
  if (!authUser) return { authUser: null, profile: null };
  const { data: profile } = await serverSupabase
    .from('users')
    .select('id, email, name, is_banned')
    .eq('id', authUser.id)
    .maybeSingle();
  return { authUser, profile };
}

function createTicketNumber() {
  const chunk = String(Date.now()).slice(-6);
  const random = Math.floor(Math.random() * 900 + 100);
  return `MKT-${chunk}${random}`;
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión para abrir una investigación.' });
      return;
    }
    if (profile.is_banned) {
      res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con administración.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const itemId = String(body.item_id || '').trim() || null;
    const reason = String(body.reason || '').trim() || 'revisión de vendedor';
    const description = String(body.description || '').trim();
    const reportedUserId = String(body.reported_user_id || '').trim() || null;
    const evidence = Array.isArray(body.evidence) ? body.evidence : [];

    if (!description) {
      res.status(400).json({ error: 'Debes describir el caso para poder investigarlo.' });
      return;
    }

    let item = null;
    if (itemId) {
      const { data } = await serverSupabase
        .from('marketplace_items')
        .select('id, title')
        .eq('id', itemId)
        .maybeSingle();
      item = data || null;
    }

    const ticketNumber = createTicketNumber();
    const descriptionBlock = [
      item ? `Anuncio del mercado: ${item.title} (${item.id})` : null,
      description,
    ].filter(Boolean).join('\n');

    const { data: report, error } = await serverSupabase
      .from('reports')
      .insert({
        reporter_id: authUser.id,
        reported_user_id: reportedUserId,
        ticket_number: ticketNumber,
        reason,
        description: descriptionBlock,
      })
      .select('id, status, ticket_number')
      .single();
    if (error) throw error;

    await serverSupabase
      .from('report_messages')
      .insert({
        report_id: Number(report.id),
        author_user_id: authUser.id,
        author_role: 'user',
        message: descriptionBlock,
      })
      .then((result) => result)
      .catch(() => ({ data: null }));

    const validEvidence = evidence
      .map((entry) => ({
        file_url: String(entry?.file_url || '').trim(),
        description: String(entry?.description || '').trim() || null,
      }))
      .filter((entry) => entry.file_url);

    if (validEvidence.length > 0) {
      await serverSupabase
        .from('report_evidence')
        .insert(validEvidence.map((entry) => ({
          report_id: Number(report.id),
          uploader_user_id: authUser.id,
          file_url: entry.file_url,
          description: entry.description,
        })))
        .then((result) => result)
        .catch(() => ({ data: null }));
    }

    const { data: reportedUser } = reportedUserId
      ? await serverSupabase.from('users').select('id, email').eq('id', reportedUserId).maybeSingle()
      : { data: null };

    await sendReportAlertEmail({
      ticket_number: report.ticket_number,
      reason,
      description: `${descriptionBlock}${validEvidence.length ? `\nPruebas adjuntas: ${validEvidence.length}` : ''}`,
      reporter_email: profile.email || '',
      reported_user_email: reportedUser?.email || '',
      reported_plan_title: item?.title || '',
    }).catch(() => null);

    res.status(201).json({
      ok: true,
      report,
      evidence_count: validEvidence.length,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo registrar la investigación.' });
  }
}

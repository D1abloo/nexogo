import { ADMIN_EMAILS, authSupabase, serverSupabase } from '../../../../../lib/server-supabase';

const MIN_CHAT_AGE = 18;

function getAgeFromBirthDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

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
    .select('id, email, name, photo_url, city, birth_date, role, is_banned')
    .eq('id', authUser.id)
    .maybeSingle();
  return { authUser, profile };
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }
  try {
    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión para usar el chat del mercado.' });
      return;
    }
    if (profile.is_banned) {
      res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con administración.' });
      return;
    }
    const age = getAgeFromBirthDate(profile.birth_date);
    if (!ADMIN_EMAILS.includes(String(profile.email || '').toLowerCase()) && (age === null || age < MIN_CHAT_AGE)) {
      res.status(403).json({ error: 'Debes tener al menos 18 años para usar el chat del mercado.' });
      return;
    }

    const threadId = String(req.query.threadId || '').trim();
    const { data: thread, error: threadError } = await serverSupabase
      .from('marketplace_threads')
      .select('id, item_id, seller_user_id, buyer_user_id, status')
      .eq('id', threadId)
      .maybeSingle();
    if (threadError) throw threadError;
    if (!thread) {
      res.status(404).json({ error: 'Conversación no encontrada.' });
      return;
    }
    const allowed = [thread.seller_user_id, thread.buyer_user_id].includes(authUser.id) || String(profile.role || '') === 'admin';
    if (!allowed) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }

    if (req.method === 'GET') {
      const { data, error } = await serverSupabase
        .from('marketplace_thread_messages')
        .select('id, thread_id, author_user_id, message, created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const userIds = [...new Set((data || []).map((row) => row.author_user_id).filter(Boolean))];
      const { data: users } = userIds.length
        ? await serverSupabase.from('users').select('id, name, photo_url').in('id', userIds)
        : { data: [] };
      const userMap = new Map((users || []).map((entry) => [String(entry.id), entry]));
      res.status(200).json((data || []).map((row) => ({
        ...row,
        author_name: userMap.get(String(row.author_user_id))?.name || 'Usuario',
        author_photo: userMap.get(String(row.author_user_id))?.photo_url || '',
      })));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const message = String(body.message || '').trim();
      if (!message) {
        res.status(400).json({ error: 'El mensaje no puede quedar vacío.' });
        return;
      }
      const { data, error } = await serverSupabase
        .from('marketplace_thread_messages')
        .insert({ thread_id: thread.id, author_user_id: authUser.id, message })
        .select('id, thread_id, author_user_id, message, created_at')
        .single();
      if (error) throw error;
      await serverSupabase.from('marketplace_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);
      res.status(201).json({
        ...data,
        author_name: profile.name || 'Usuario',
        author_photo: profile.photo_url || '',
      });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo procesar la conversación.' });
  }
}

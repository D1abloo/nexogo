import { ADMIN_EMAILS, authSupabase, serverSupabase } from '../../../../../lib/server-supabase';

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
    .select('id, email, role')
    .eq('id', authUser.id)
    .maybeSingle();
  return { authUser, profile };
}

function canManage(profile, item, userId) {
  return String(item?.seller_user_id || '') === String(userId || '') || String(profile?.role || '') === 'admin' || ADMIN_EMAILS.includes(String(profile?.email || '').toLowerCase());
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const itemId = String(req.query.id || '').trim();
  if (!itemId) {
    res.status(400).json({ error: 'Anuncio no válido.' });
    return;
  }

  try {
    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión.' });
      return;
    }

    const { data: item, error: itemError } = await serverSupabase
      .from('marketplace_items')
      .select('id, seller_user_id')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ error: 'Anuncio no encontrado.' });
      return;
    }
    if (!canManage(profile, item, authUser.id)) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }

    const { data: threads, error: threadError } = await serverSupabase
      .from('marketplace_threads')
      .select('id, item_id, seller_user_id, buyer_user_id, status, created_at, updated_at')
      .eq('item_id', itemId)
      .order('updated_at', { ascending: false });
    if (threadError) throw threadError;

    const buyerIds = [...new Set((threads || []).map((entry) => entry.buyer_user_id).filter(Boolean))];
    const threadIds = [...new Set((threads || []).map((entry) => entry.id).filter(Boolean))];
    const [buyersResult, messagesResult] = await Promise.all([
      buyerIds.length
        ? serverSupabase.from('users').select('id, name, photo_url, city').in('id', buyerIds)
        : Promise.resolve({ data: [] }),
      threadIds.length
        ? serverSupabase.from('marketplace_thread_messages').select('id, thread_id, message, created_at').in('thread_id', threadIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const buyerMap = new Map((buyersResult.data || []).map((entry) => [String(entry.id), entry]));
    const lastMessageMap = new Map();
    (messagesResult.data || []).forEach((entry) => {
      if (!lastMessageMap.has(String(entry.thread_id))) lastMessageMap.set(String(entry.thread_id), entry);
    });

    res.status(200).json((threads || []).map((entry) => ({
      ...entry,
      buyer: buyerMap.get(String(entry.buyer_user_id)) || null,
      last_message: lastMessageMap.get(String(entry.id)) || null,
    })));
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudieron cargar las conversaciones del anuncio.' });
  }
}


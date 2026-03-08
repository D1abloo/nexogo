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
    const age = getAgeFromBirthDate(profile.birth_date);
    if (!ADMIN_EMAILS.includes(String(profile.email || '').toLowerCase()) && (age === null || age < MIN_CHAT_AGE)) {
      res.status(403).json({ error: 'Debes tener al menos 18 años para usar el chat del mercado.' });
      return;
    }

    const threadId = String(req.query.threadId || '').trim();
    const { data: thread, error } = await serverSupabase
      .from('marketplace_threads')
      .select('id, item_id, seller_user_id, buyer_user_id, status, created_at, updated_at')
      .eq('id', threadId)
      .maybeSingle();
    if (error) throw error;
    if (!thread) {
      res.status(404).json({ error: 'Conversación no encontrada.' });
      return;
    }
    const allowed = [thread.seller_user_id, thread.buyer_user_id].includes(authUser.id) || String(profile.role || '') === 'admin';
    if (!allowed) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }

    const [{ data: item }, { data: users }] = await Promise.all([
      serverSupabase.from('marketplace_items').select('id, title, image_url, price_amount, currency, city, status').eq('id', thread.item_id).maybeSingle(),
      serverSupabase.from('users').select('id, name, photo_url, city').in('id', [thread.seller_user_id, thread.buyer_user_id]),
    ]);
    const userMap = new Map((users || []).map((entry) => [String(entry.id), entry]));

    res.status(200).json({
      ...thread,
      item: item || null,
      seller: userMap.get(String(thread.seller_user_id)) || null,
      buyer: userMap.get(String(thread.buyer_user_id)) || null,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo cargar la conversación.' });
  }
}

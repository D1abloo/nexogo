import { ADMIN_EMAILS, authSupabase, serverSupabase } from '../../../../lib/server-supabase';

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

function enrichThreads(rows, itemMap, userMap) {
  return (rows || []).map((thread) => ({
    ...thread,
    item: itemMap.get(String(thread.item_id)) || null,
    seller: userMap.get(String(thread.seller_user_id)) || null,
    buyer: userMap.get(String(thread.buyer_user_id)) || null,
  }));
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

    if (req.method === 'GET') {
      const { data, error } = await serverSupabase
        .from('marketplace_threads')
        .select('id, item_id, seller_user_id, buyer_user_id, status, created_at, updated_at')
        .or(`seller_user_id.eq.${authUser.id},buyer_user_id.eq.${authUser.id}`)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const itemIds = [...new Set((data || []).map((row) => row.item_id).filter(Boolean))];
      const userIds = [...new Set((data || []).flatMap((row) => [row.seller_user_id, row.buyer_user_id]).filter(Boolean))];
      const [{ data: items }, { data: users }] = await Promise.all([
        itemIds.length
          ? serverSupabase.from('marketplace_items').select('id, title, image_url, price_amount, currency, city, status').in('id', itemIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? serverSupabase.from('users').select('id, name, photo_url, city').in('id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const itemMap = new Map((items || []).map((entry) => [String(entry.id), entry]));
      const userMap = new Map((users || []).map((entry) => [String(entry.id), entry]));
      res.status(200).json(enrichThreads(data, itemMap, userMap));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const itemId = String(body.item_id || '').trim();
      if (!itemId) {
        res.status(400).json({ error: 'Debes indicar el anuncio.' });
        return;
      }

      const { data: item, error: itemError } = await serverSupabase
        .from('marketplace_items')
        .select('id, seller_user_id, title, image_url, price_amount, currency, city, status')
        .eq('id', itemId)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) {
        res.status(404).json({ error: 'Anuncio no encontrado.' });
        return;
      }
      if (String(item.seller_user_id) === String(authUser.id)) {
        res.status(400).json({ error: 'El vendedor no necesita abrir chat consigo mismo.' });
        return;
      }

      const { data: existing } = await serverSupabase
        .from('marketplace_threads')
        .select('id, item_id, seller_user_id, buyer_user_id, status, created_at, updated_at')
        .eq('item_id', item.id)
        .eq('seller_user_id', item.seller_user_id)
        .eq('buyer_user_id', authUser.id)
        .maybeSingle();

      let thread = existing;
      if (!thread) {
        const { data: created, error: createError } = await serverSupabase
          .from('marketplace_threads')
          .insert({
            item_id: item.id,
            seller_user_id: item.seller_user_id,
            buyer_user_id: authUser.id,
            status: 'active',
          })
          .select('id, item_id, seller_user_id, buyer_user_id, status, created_at, updated_at')
          .single();
        if (createError) throw createError;
        thread = created;
      }

      const { data: users } = await serverSupabase
        .from('users')
        .select('id, name, photo_url, city')
        .in('id', [thread.seller_user_id, thread.buyer_user_id]);
      const userMap = new Map((users || []).map((entry) => [String(entry.id), entry]));
      const itemMap = new Map([[String(item.id), item]]);
      res.status(200).json(enrichThreads([thread], itemMap, userMap)[0]);
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo procesar el chat del mercado.' });
  }
}

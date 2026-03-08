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

function isPrivileged(profile) {
  return String(profile?.role || '') === 'admin' || ADMIN_EMAILS.includes(String(profile?.email || '').toLowerCase());
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }

  const itemId = String(req.query.id || '').trim();
  if (!itemId) {
    res.status(400).json({ error: 'Anuncio no válido.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await serverSupabase
        .from('marketplace_reviews')
        .select('id, item_id, seller_user_id, buyer_user_id, rating, comment, created_at')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const buyerIds = [...new Set((data || []).map((entry) => entry.buyer_user_id).filter(Boolean))];
      const { data: buyers } = buyerIds.length
        ? await serverSupabase.from('users').select('id, name, photo_url, city').in('id', buyerIds)
        : { data: [] };
      const buyerMap = new Map((buyers || []).map((entry) => [String(entry.id), entry]));
      res.status(200).json((data || []).map((entry) => ({ ...entry, buyer: buyerMap.get(String(entry.buyer_user_id)) || null })));
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido' });
      return;
    }

    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión para valorar una venta.' });
      return;
    }

    const { data: item, error: itemError } = await serverSupabase
      .from('marketplace_items')
      .select('id, seller_user_id, sold_to_user_id, status')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ error: 'Anuncio no encontrado.' });
      return;
    }

    const canReview = String(item.seller_user_id) === String(authUser.id) || isPrivileged(profile);
    if (!canReview) {
      res.status(403).json({ error: 'Solo el vendedor puede cerrar y valorar la operación.' });
      return;
    }
    if (String(item.status) !== 'sold' || !item.sold_to_user_id) {
      res.status(400).json({ error: 'Primero debes marcar el artículo como vendido a un comprador concreto.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rating = Math.max(1, Math.min(5, Number(body.rating || 0)));
    const comment = String(body.comment || '').trim().slice(0, 90);
    if (!rating) {
      res.status(400).json({ error: 'La valoración con estrellas es obligatoria.' });
      return;
    }

    const { data, error } = await serverSupabase
      .from('marketplace_reviews')
      .upsert({
        item_id: item.id,
        seller_user_id: item.seller_user_id,
        buyer_user_id: item.sold_to_user_id,
        rating,
        comment,
      }, { onConflict: 'item_id,seller_user_id,buyer_user_id' })
      .select('id, item_id, seller_user_id, buyer_user_id, rating, comment, created_at')
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo guardar la valoración.' });
  }
}


import { serverSupabase } from '../../../../lib/server-supabase';

function withSummary(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  const total = list.length;
  const average = total ? list.reduce((sum, item) => sum + Number(item.rating || 0), 0) / total : 0;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  list.forEach((item) => {
    const value = Number(item.rating || 0);
    if (counts[value] !== undefined) counts[value] += 1;
  });
  return { total, average, counts };
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

  const sellerId = String(req.query.sellerId || '').trim();
  if (!sellerId) {
    res.status(400).json({ error: 'Vendedor no válido.' });
    return;
  }

  try {
    const [{ data: seller, error: sellerError }, { data: items, error: itemsError }, { data: reviews, error: reviewsError }] = await Promise.all([
      serverSupabase
        .from('users')
        .select('id, name, username, photo_url, city, country, bio, verified, created_at')
        .eq('id', sellerId)
        .maybeSingle(),
      serverSupabase
        .from('marketplace_items')
        .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, status, featured, sold_to_user_id, sold_at, created_at, updated_at')
        .eq('seller_user_id', sellerId)
        .neq('status', 'archived')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false }),
      serverSupabase
        .from('marketplace_reviews')
        .select('id, item_id, seller_user_id, buyer_user_id, rating, comment, created_at')
        .eq('seller_user_id', sellerId)
        .order('created_at', { ascending: false }),
    ]);

    if (sellerError) throw sellerError;
    if (itemsError) throw itemsError;
    if (reviewsError) throw reviewsError;
    if (!seller) {
      res.status(404).json({ error: 'Perfil de vendedor no encontrado.' });
      return;
    }

    const buyerIds = [...new Set((reviews || []).map((entry) => entry.buyer_user_id).filter(Boolean))];
    const itemIds = [...new Set((reviews || []).map((entry) => entry.item_id).filter(Boolean))];
    const [buyersResult, reviewItemsResult, favoritesResult] = await Promise.all([
      buyerIds.length
        ? serverSupabase.from('users').select('id, name, photo_url, city').in('id', buyerIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? serverSupabase.from('marketplace_items').select('id, title').in('id', itemIds)
        : Promise.resolve({ data: [] }),
      serverSupabase
        .from('marketplace_favorites')
        .select('item_id')
        .in('item_id', (items || []).map((entry) => entry.id)),
    ]);

    const buyerMap = new Map((buyersResult.data || []).map((entry) => [String(entry.id), entry]));
    const itemMap = new Map((reviewItemsResult.data || []).map((entry) => [String(entry.id), entry]));
    const favoriteCounts = new Map();
    (favoritesResult.data || []).forEach((entry) => {
      const key = String(entry.item_id || '');
      favoriteCounts.set(key, (favoriteCounts.get(key) || 0) + 1);
    });

    const reviewRows = (reviews || []).map((entry) => ({
      ...entry,
      buyer: buyerMap.get(String(entry.buyer_user_id)) || null,
      item: itemMap.get(String(entry.item_id)) || null,
    }));

    res.status(200).json({
      seller,
      items: (items || []).map((entry) => ({
        ...entry,
        favorites_count: favoriteCounts.get(String(entry.id)) || 0,
      })),
      reviews: reviewRows,
      summary: withSummary(reviewRows),
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo cargar el perfil del vendedor.' });
  }
}


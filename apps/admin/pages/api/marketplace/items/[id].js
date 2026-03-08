import { ADMIN_EMAILS, authSupabase, serverSupabase } from '../../../../lib/server-supabase';

const MIN_CHAT_AGE = 18;
const STATUS_OPTIONS = new Set(['active', 'reserved', 'sold', 'archived']);

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
    .select('id, email, name, photo_url, city, country, rating_avg, rating_count, bio, birth_date, role, is_banned')
    .eq('id', authUser.id)
    .maybeSingle();
  return { authUser, profile };
}

function isPrivileged(profile) {
  return String(profile?.role || '') === 'admin' || ADMIN_EMAILS.includes(String(profile?.email || '').toLowerCase());
}

function normalizeItemPayload(body, current, profile) {
  const merged = { ...(current || {}), ...(body || {}) };
  const nextStatus = STATUS_OPTIONS.has(String(merged.status || current?.status || 'active'))
    ? String(merged.status || current?.status || 'active')
    : 'active';
  const soldToUserId = Object.prototype.hasOwnProperty.call(merged, 'sold_to_user_id')
    ? String(merged.sold_to_user_id || '').trim() || null
    : current?.sold_to_user_id || null;

  return {
    title: String(merged.title || '').trim(),
    description: String(merged.description || '').trim(),
    trade_type: ['sell', 'buy', 'swap'].includes(String(merged.trade_type || 'sell')) ? String(merged.trade_type) : 'sell',
    category: String(merged.category || 'general').trim().toLowerCase() || 'general',
    condition: String(merged.condition || 'good').trim().toLowerCase() || 'good',
    price_amount: Number(merged.price_amount || 0),
    currency: String(merged.currency || 'EUR').trim().toUpperCase() || 'EUR',
    city: String(merged.city || profile?.city || '').trim() || null,
    country: String(merged.country || profile?.country || '').trim() || null,
    district: String(merged.district || '').trim() || null,
    image_url: String(merged.image_url || '').trim() || null,
    allow_offers: merged.allow_offers !== false,
    featured: merged.featured === true && isPrivileged(profile),
    status: nextStatus,
    sold_to_user_id: nextStatus === 'sold' ? soldToUserId : null,
    sold_at:
      nextStatus === 'sold'
        ? String(merged.sold_at || current?.sold_at || new Date().toISOString())
        : null,
    updated_at: new Date().toISOString(),
  };
}

function average(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + Number(value || 0), 0) / list.length;
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }

  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'Identificador no válido.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await serverSupabase
        .from('marketplace_items')
        .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, featured, status, sold_to_user_id, sold_at, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: 'Anuncio no encontrado.' });
        return;
      }

      const { authUser } = await getContext(req);
      const [sellerResult, relatedResult, imagesResult, reviewResult, sellerReviewsResult, soldBuyerResult] = await Promise.all([
        serverSupabase.from('users').select('id, name, photo_url, city, country, rating_avg, rating_count, bio').eq('id', data.seller_user_id).maybeSingle(),
        serverSupabase
          .from('marketplace_items')
          .select('id, seller_user_id, title, trade_type, category, price_amount, currency, city, image_url, featured, status, created_at')
          .eq('status', 'active')
          .eq('category', data.category)
          .neq('id', data.id)
          .limit(4),
        serverSupabase
          .from('marketplace_item_images')
          .select('id, item_id, image_url, description, sort_order, created_at')
          .eq('item_id', data.id)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true }),
        serverSupabase
          .from('marketplace_reviews')
          .select('id, item_id, seller_user_id, buyer_user_id, rating, comment, created_at')
          .eq('item_id', data.id)
          .order('created_at', { ascending: false }),
        serverSupabase
          .from('marketplace_reviews')
          .select('rating')
          .eq('seller_user_id', data.seller_user_id),
        data.sold_to_user_id
          ? serverSupabase.from('users').select('id, name, photo_url, city').eq('id', data.sold_to_user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (sellerResult.error) throw sellerResult.error;
      if (relatedResult.error) throw relatedResult.error;
      if (imagesResult.error) throw imagesResult.error;
      if (reviewResult.error) throw reviewResult.error;
      if (sellerReviewsResult.error) throw sellerReviewsResult.error;
      if (soldBuyerResult.error) throw soldBuyerResult.error;

      const reviewRows = reviewResult.data || [];
      const buyerIds = [...new Set(reviewRows.map((entry) => entry.buyer_user_id).filter(Boolean))];
      const { data: buyers } = buyerIds.length
        ? await serverSupabase.from('users').select('id, name, photo_url, city').in('id', buyerIds)
        : { data: [] };
      const buyerMap = new Map((buyers || []).map((entry) => [String(entry.id), entry]));

      const images = (imagesResult.data && imagesResult.data.length)
        ? imagesResult.data
        : (data.image_url ? [{ id: `cover-${data.id}`, item_id: data.id, image_url: data.image_url, description: 'Imagen principal', sort_order: 0 }] : []);

      const sellerRatings = sellerReviewsResult.data || [];
      const favoriteItemIds = [data.id, ...((relatedResult.data || []).map((entry) => entry.id))];
      const [favoritesResult, favoriteCurrentResult] = await Promise.all([
        serverSupabase.from('marketplace_favorites').select('item_id, user_id').in('item_id', favoriteItemIds),
        authUser
          ? serverSupabase.from('marketplace_favorites').select('id').eq('item_id', data.id).eq('user_id', authUser.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const favoriteCounts = new Map();
      (favoritesResult.data || []).forEach((entry) => {
        const key = String(entry.item_id || '');
        favoriteCounts.set(key, (favoriteCounts.get(key) || 0) + 1);
      });
      res.status(200).json({
        ...data,
        seller_name: sellerResult.data?.name || 'Usuario',
        seller_photo: sellerResult.data?.photo_url || '',
        seller_city: sellerResult.data?.city || '',
        seller_country: sellerResult.data?.country || '',
        seller_rating: Number(average(sellerRatings.map((entry) => entry.rating)).toFixed(1)) || null,
        seller_rating_count: sellerRatings.length,
        seller_bio: sellerResult.data?.bio || '',
        related: relatedResult.data || [],
        share_url: `/mercado/${data.id}`,
        seller_profile_url: `/mercado/perfil/${data.seller_user_id}`,
        sold_buyer: soldBuyerResult.data || null,
        images,
        favorites_count: favoriteCounts.get(String(data.id)) || 0,
        is_favorite: Boolean(favoriteCurrentResult?.data),
        reviews: reviewRows.map((entry) => ({
          ...entry,
          buyer: buyerMap.get(String(entry.buyer_user_id)) || null,
        })),
      });
      return;
    }

    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión para gestionar este anuncio.' });
      return;
    }
    if (profile.is_banned) {
      res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con administración.' });
      return;
    }
    const age = getAgeFromBirthDate(profile.birth_date);
    if (!isPrivileged(profile) && (age === null || age < MIN_CHAT_AGE)) {
      res.status(403).json({ error: 'Debes tener al menos 18 años para gestionar anuncios del mercado.' });
      return;
    }

    const { data: current, error: currentError } = await serverSupabase
      .from('marketplace_items')
      .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, featured, status, sold_to_user_id, sold_at, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      res.status(404).json({ error: 'Anuncio no encontrado.' });
      return;
    }

    const canManage = String(current.seller_user_id) === String(authUser.id) || isPrivileged(profile);
    if (!canManage) {
      res.status(403).json({ error: 'No autorizado para modificar este anuncio.' });
      return;
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const payload = normalizeItemPayload(body, current, profile);
      if (!payload.title || !payload.description) {
        res.status(400).json({ error: 'Título y descripción son obligatorios.' });
        return;
      }
      if (payload.status === 'sold' && !payload.sold_to_user_id && !isPrivileged(profile)) {
        res.status(400).json({ error: 'Debes indicar a qué comprador le has vendido el artículo.' });
        return;
      }
      const { data, error } = await serverSupabase
        .from('marketplace_items')
        .update(payload)
        .eq('id', id)
        .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, featured, status, sold_to_user_id, sold_at, created_at, updated_at')
        .single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'DELETE') {
      const { error } = await serverSupabase.from('marketplace_items').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo cargar el anuncio.' });
  }
}

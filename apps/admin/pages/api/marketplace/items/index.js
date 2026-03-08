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
    .select('id, email, name, photo_url, city, country, district, role, is_banned, birth_date')
    .eq('id', authUser.id)
    .maybeSingle();
  return { authUser, profile };
}

function mapItem(item, sellerMap, favoriteCounts, favoriteSet) {
  const seller = sellerMap.get(String(item.seller_user_id || '')) || null;
  return {
    ...item,
    seller_name: seller?.name || 'Usuario',
    seller_photo: seller?.photo_url || '',
    seller_city: seller?.city || item.city || '',
    seller_profile_url: `/mercado/perfil/${item.seller_user_id}`,
    favorites_count: favoriteCounts.get(String(item.id)) || 0,
    is_favorite: favoriteSet.has(String(item.id)),
  };
}

export default async function handler(req, res) {
  if (!serverSupabase) {
    res.status(500).json({ error: 'Supabase no configurado' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { authUser } = await getContext(req);
      const q = String(req.query.q || '').trim().toLowerCase();
      const category = String(req.query.category || 'all').trim().toLowerCase();
      const tradeType = String(req.query.trade_type || 'all').trim().toLowerCase();
      let query = serverSupabase
        .from('marketplace_items')
        .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, featured, status, created_at, updated_at')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (category !== 'all') query = query.eq('category', category);
      if (tradeType !== 'all') query = query.eq('trade_type', tradeType);

      const { data, error } = await query;
      if (error) throw error;

      const filtered = (data || []).filter((item) => {
        if (!q) return true;
        const haystack = [item.title, item.description, item.city, item.country, item.district, item.category, item.trade_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });

      const sellerIds = [...new Set(filtered.map((item) => item.seller_user_id).filter(Boolean))];
      const itemIds = [...new Set(filtered.map((item) => item.id).filter(Boolean))];
      let sellerMap = new Map();
      let favoriteCounts = new Map();
      let favoriteSet = new Set();

      if (sellerIds.length > 0) {
        const { data: sellers } = await serverSupabase
          .from('users')
          .select('id, name, photo_url, city')
          .in('id', sellerIds);
        sellerMap = new Map((sellers || []).map((entry) => [String(entry.id), entry]));
      }

      if (itemIds.length > 0) {
        const { data: favorites } = await serverSupabase
          .from('marketplace_favorites')
          .select('item_id, user_id')
          .in('item_id', itemIds);
        (favorites || []).forEach((entry) => {
          const key = String(entry.item_id || '');
          favoriteCounts.set(key, (favoriteCounts.get(key) || 0) + 1);
          if (authUser && String(entry.user_id || '') === String(authUser.id)) favoriteSet.add(key);
        });
      }

      res.status(200).json(filtered.map((item) => mapItem(item, sellerMap, favoriteCounts, favoriteSet)));
      return;
    }

    if (req.method === 'POST') {
      const { authUser, profile } = await getContext(req);
      if (!authUser || !profile) {
        res.status(401).json({ error: 'Debes iniciar sesión para publicar en el mercado.' });
        return;
      }
      if (profile.is_banned) {
        res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con administración.' });
        return;
      }
      const age = getAgeFromBirthDate(profile.birth_date);
      if (!ADMIN_EMAILS.includes(String(profile.email || '').toLowerCase()) && (age === null || age < MIN_CHAT_AGE)) {
        res.status(403).json({ error: 'Debes tener al menos 18 años para publicar en el mercado.' });
        return;
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      if (!title || !description) {
        res.status(400).json({ error: 'Título y descripción son obligatorios.' });
        return;
      }

      const payload = {
        seller_user_id: authUser.id,
        title,
        description,
        trade_type: ['sell', 'buy', 'swap'].includes(String(body.trade_type || 'sell')) ? String(body.trade_type) : 'sell',
        category: String(body.category || 'general').trim().toLowerCase() || 'general',
        condition: String(body.condition || 'good').trim().toLowerCase() || 'good',
        price_amount: Number(body.price_amount || 0),
        currency: String(body.currency || 'EUR').trim().toUpperCase() || 'EUR',
        city: String(body.city || profile.city || '').trim() || null,
        country: String(body.country || profile.country || '').trim() || null,
        district: String(body.district || profile.district || '').trim() || null,
        image_url: String(body.image_url || '').trim() || null,
        allow_offers: body.allow_offers !== false,
        featured: body.featured === true && (String(profile.role || '') === 'admin' || ADMIN_EMAILS.includes(String(profile.email || '').toLowerCase())),
        status: 'active',
      };

      const { data, error } = await serverSupabase
        .from('marketplace_items')
        .insert(payload)
        .select('id, seller_user_id, title, description, trade_type, category, condition, price_amount, currency, city, country, district, image_url, allow_offers, featured, status, created_at, updated_at')
        .single();
      if (error) throw error;

      res.status(201).json({
        ...data,
        seller_name: profile.name || 'Usuario',
        seller_photo: profile.photo_url || '',
        seller_city: profile.city || payload.city || '',
        seller_profile_url: `/mercado/perfil/${authUser.id}`,
        favorites_count: 0,
        is_favorite: false,
        share_url: `/mercado/${data.id}`,
        published_notice: `Anuncio publicado. Enlace directo: /mercado/${data.id}`,
      });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo procesar el mercado.' });
  }
}

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
      const [{ data: item, error: itemError }, { data: images, error: imagesError }] = await Promise.all([
        serverSupabase.from('marketplace_items').select('id, image_url, status, seller_user_id').eq('id', itemId).maybeSingle(),
        serverSupabase.from('marketplace_item_images').select('id, item_id, image_url, description, sort_order, created_at').eq('item_id', itemId).order('sort_order', { ascending: true }).order('id', { ascending: true }),
      ]);
      if (itemError) throw itemError;
      if (imagesError) throw imagesError;
      if (!item) {
        res.status(404).json({ error: 'Anuncio no encontrado.' });
        return;
      }
      const rows = images || [];
      if (!rows.length && item.image_url) {
        res.status(200).json([{ id: `cover-${item.id}`, item_id: item.id, image_url: item.image_url, description: 'Imagen principal', sort_order: 0 }]);
        return;
      }
      res.status(200).json(rows);
      return;
    }

    const { authUser, profile } = await getContext(req);
    if (!authUser || !profile) {
      res.status(401).json({ error: 'Debes iniciar sesión para subir imágenes.' });
      return;
    }

    const { data: item, error: itemError } = await serverSupabase
      .from('marketplace_items')
      .select('id, seller_user_id, image_url')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ error: 'Anuncio no encontrado.' });
      return;
    }

    const canManage = String(item.seller_user_id) === String(authUser.id) || isPrivileged(profile);
    if (!canManage) {
      res.status(403).json({ error: 'No autorizado para subir imágenes.' });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const incoming = Array.isArray(body.images) ? body.images : [body];
      const validImages = incoming
        .map((entry, index) => ({
          image_url: String(entry?.image_url || '').trim(),
          description: String(entry?.description || '').trim() || null,
          sort_order: Number(entry?.sort_order ?? index),
        }))
        .filter((entry) => entry.image_url);

      if (!validImages.length) {
        res.status(400).json({ error: 'Debes indicar al menos una imagen válida.' });
        return;
      }

      const { data: currentImages } = await serverSupabase
        .from('marketplace_item_images')
        .select('id')
        .eq('item_id', itemId);

      const offset = Array.isArray(currentImages) ? currentImages.length : 0;
      const payload = validImages.map((entry, index) => ({
        item_id: itemId,
        owner_user_id: item.seller_user_id,
        image_url: entry.image_url,
        description: entry.description,
        sort_order: offset + index,
      }));

      const { data, error } = await serverSupabase
        .from('marketplace_item_images')
        .insert(payload)
        .select('id, item_id, image_url, description, sort_order, created_at');
      if (error) throw error;

      if (!item.image_url && payload[0]?.image_url) {
        await serverSupabase.from('marketplace_items').update({ image_url: payload[0].image_url }).eq('id', itemId);
      }

      res.status(201).json(data || []);
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudieron gestionar las imágenes.' });
  }
}


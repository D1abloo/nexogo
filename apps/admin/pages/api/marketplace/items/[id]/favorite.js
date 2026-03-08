import { authSupabase, serverSupabase } from '../../../../../lib/server-supabase';

function getToken(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

async function getContext(req) {
  const token = getToken(req);
  if (!token || !authSupabase || !serverSupabase) return { authUser: null };
  const { data } = await authSupabase.auth.getUser(token);
  return { authUser: data?.user || null };
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
    const { authUser } = await getContext(req);
    if (!authUser) {
      res.status(401).json({ error: 'Debes iniciar sesión para guardar favoritos.' });
      return;
    }

    if (req.method === 'GET') {
      const [{ data: favorite }, { count }] = await Promise.all([
        serverSupabase.from('marketplace_favorites').select('id').eq('item_id', itemId).eq('user_id', authUser.id).maybeSingle(),
        serverSupabase.from('marketplace_favorites').select('*', { count: 'exact', head: true }).eq('item_id', itemId),
      ]);
      res.status(200).json({ is_favorite: Boolean(favorite), favorites_count: Number(count || 0) });
      return;
    }

    if (req.method === 'POST') {
      const { error } = await serverSupabase.from('marketplace_favorites').upsert({ item_id: itemId, user_id: authUser.id }, { onConflict: 'item_id,user_id' });
      if (error) throw error;
      const { count } = await serverSupabase.from('marketplace_favorites').select('*', { count: 'exact', head: true }).eq('item_id', itemId);
      res.status(201).json({ ok: true, is_favorite: true, favorites_count: Number(count || 0) });
      return;
    }

    if (req.method === 'DELETE') {
      const { error } = await serverSupabase.from('marketplace_favorites').delete().eq('item_id', itemId).eq('user_id', authUser.id);
      if (error) throw error;
      const { count } = await serverSupabase.from('marketplace_favorites').select('*', { count: 'exact', head: true }).eq('item_id', itemId);
      res.status(200).json({ ok: true, is_favorite: false, favorites_count: Number(count || 0) });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'No se pudo actualizar favoritos.' });
  }
}

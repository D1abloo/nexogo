import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ensureLocalMarketItems, formatMoney, marketShareUrl, readLocalMarketItems, writeLocalMarketItems } from '../../lib/marketplace-demo';
import { ensureLocalThread, getLocalMarketThreads } from '../../lib/marketplace-chat-demo';

const MARKET_API = '/api/marketplace/items';
const THREAD_API = '/api/marketplace/threads';
const MARKET_CATEGORIES = ['all', 'eventos', 'deporte', 'tecnologia', 'lifestyle', 'general'];
const MARKET_TYPES = ['all', 'sell', 'buy', 'swap'];
const STATUS_OPTIONS = ['active', 'reserved', 'sold'];
const TRUST_POINTS = [
  'Cada anuncio tiene enlace directo y ficha propia.',
  'La conversación con comprador o vendedor se hace en un chat privado por anuncio.',
  'Puedes reservar, vender o archivar un artículo sin salir del panel.',
  'Las incidencias del mercado pueden escalarse a moderación como ticket.',
];
const MARKET_FEATURES = [
  { id: 'f1', title: 'Fichas listas para compartir', body: 'Cada publicación genera una URL individual del anuncio.' },
  { id: 'f2', title: 'Chat privado por anuncio', body: 'Comprador y vendedor hablan en un hilo dedicado al artículo.' },
  { id: 'f3', title: 'Compra, venta o intercambio', body: 'La plataforma cubre los tres flujos sin salir del mercado social.' },
  { id: 'f4', title: 'Investigación de incidencias', body: 'El comprador puede abrir ticket con pruebas para que el equipo lo revise.' },
];
const DEFAULT_FORM = {
  title: '',
  description: '',
  trade_type: 'sell',
  category: 'general',
  condition: 'muy bueno',
  price_amount: '',
  currency: 'EUR',
  city: 'Madrid',
  country: 'España',
  district: '',
  image_url: '',
  allow_offers: true,
  status: 'active',
  featured: false,
};

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexogo:loading:start'));
  try {
    const res = await fetch(path, { ...options, headers, cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
    return payload;
  } finally {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
  }
}

function readUserName(user) {
  return user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
}

function resetForm(setter) {
  setter(DEFAULT_FORM);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function goRegister(target) {
  if (typeof window === 'undefined') return;
  window.location.href = `/mercado/registro?next=${encodeURIComponent(target || '/mercado')}`;
}

export default function MercadoPage() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [threads, setThreads] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [tradeType, setTradeType] = useState('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [coverPreview, setCoverPreview] = useState('');

  useEffect(() => {
    ensureLocalMarketItems();
    const loadSession = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
    };
    loadSession();
  }, []);

  const loadItems = async () => {
    try {
      const rows = await api(`${MARKET_API}?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&trade_type=${encodeURIComponent(tradeType)}`);
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems(readLocalMarketItems());
    }
  };

  const loadThreads = async () => {
    if (!user) {
      setThreads([]);
      return;
    }
    try {
      const rows = await api(THREAD_API);
      setThreads(Array.isArray(rows) ? rows : []);
    } catch {
      const local = getLocalMarketThreads().filter((entry) => String(entry.seller_user_id) === String(user.id) || String(entry.buyer_user_id) === String(user.id));
      setThreads(local);
    }
  };

  useEffect(() => {
    loadItems();
  }, [search, category, tradeType]);

  useEffect(() => {
    loadThreads();
  }, [user]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'all' && String(item.category || '').toLowerCase() !== category) return false;
      if (tradeType !== 'all' && String(item.trade_type || '').toLowerCase() !== tradeType) return false;
      if (!q) return true;
      const haystack = [item.title, item.description, item.city, item.country, item.district, item.category, item.trade_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, category, tradeType]);

  const featuredItems = visibleItems.slice(0, 3);
  const restItems = visibleItems.slice(3);

  const myItems = useMemo(() => {
    if (!user) return [];
    return items.filter((item) => String(item.seller_user_id || '') === String(user.id));
  }, [items, user]);

  const applyLocalItemPatch = (itemId, patch) => {
    const next = readLocalMarketItems().map((entry) => (String(entry.id) === String(itemId) ? { ...entry, ...patch } : entry));
    writeLocalMarketItems(next);
    setItems(next);
  };

  const applyLocalDelete = (itemId) => {
    const next = readLocalMarketItems().filter((entry) => String(entry.id) !== String(itemId));
    writeLocalMarketItems(next);
    setItems(next);
  };

  const openComposerForItem = (item) => {
    setComposerOpen(true);
    setEditingId(String(item.id));
    setForm({
      title: item.title || '',
      description: item.description || '',
      trade_type: item.trade_type || 'sell',
      category: item.category || 'general',
      condition: item.condition || 'muy bueno',
      price_amount: String(item.price_amount || ''),
      currency: item.currency || 'EUR',
      city: item.city || 'Madrid',
      country: item.country || 'España',
      district: item.district || '',
      image_url: item.image_url || '',
      allow_offers: item.allow_offers !== false,
      status: item.status || 'active',
      featured: item.featured === true,
    });
    setCoverPreview(item.image_url || '');
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingId('');
    setCoverPreview('');
    resetForm(setForm);
  };

  const handleCoverFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setCoverPreview(dataUrl);
      setForm((current) => ({ ...current, image_url: dataUrl }));
    } catch {
      setError('No se pudo preparar la imagen principal.');
    }
  };

  const publish = async () => {
    if (!user) {
      goRegister('/mercado');
      return;
    }
    if (!form.title || !form.description) {
      setError('Título y descripción son obligatorios.');
      return;
    }

    const payload = {
      ...form,
      image_url: coverPreview || form.image_url,
      price_amount: Number(form.price_amount || 0),
    };

    try {
      if (editingId) {
        await api(`${MARKET_API}/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setNotice('Anuncio actualizado correctamente.');
        await loadItems();
      } else {
        const created = await api(MARKET_API, { method: 'POST', body: JSON.stringify(payload) });
        setNotice(created?.published_notice || 'Anuncio publicado correctamente.');
        window.location.href = marketShareUrl(created?.id || created?.share_url?.split('/').pop());
        return;
      }
      setError('');
      closeComposer();
    } catch {
      if (editingId) {
        applyLocalItemPatch(editingId, payload);
        setNotice('Anuncio actualizado en modo local.');
      } else {
        const localItem = {
          id: `local-market-${Date.now()}`,
          ...payload,
          seller_user_id: user.id,
          status: payload.status || 'active',
          seller_name: readUserName(user),
          seller_photo: '',
          created_at: new Date().toISOString(),
        };
        const next = [localItem, ...readLocalMarketItems()];
        writeLocalMarketItems(next);
        setItems(next);
        setNotice('Anuncio publicado en modo local.');
        window.location.href = marketShareUrl(localItem.id);
        return;
      }
      setError('');
      closeComposer();
    }
  };

  const updateStatus = async (item, status) => {
    try {
      await api(`${MARKET_API}/${encodeURIComponent(String(item.id))}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadItems();
      setNotice(`Anuncio marcado como ${status}.`);
    } catch {
      applyLocalItemPatch(item.id, { status });
      setNotice(`Anuncio marcado como ${status} en modo local.`);
    }
  };

  const deleteItem = async (item) => {
    try {
      await api(`${MARKET_API}/${encodeURIComponent(String(item.id))}`, { method: 'DELETE' });
      await loadItems();
      setNotice('Anuncio eliminado correctamente.');
    } catch {
      applyLocalDelete(item.id);
      setNotice('Anuncio eliminado en modo local.');
    }
  };

  const startConversation = async (item) => {
    if (!user) {
      goRegister(`/mercado/${item.id}`);
      return;
    }
    try {
      const thread = await api(THREAD_API, { method: 'POST', body: JSON.stringify({ item_id: item.id }) });
      window.location.href = `/mercado/chat/${thread.id}`;
    } catch {
      const localThread = ensureLocalThread(
        item,
        { id: item.seller_user_id || `seller-${item.id}`, name: item.seller_name || 'Vendedor' },
        { id: user.id, name: readUserName(user) },
      );
      setThreads((current) => [localThread, ...current.filter((entry) => String(entry.id) !== String(localThread.id))]);
      window.location.href = `/mercado/chat/${localThread.id}`;
    }
  };

  return (
    <main className="market-shell">
      <header className="market-page-topbar">
        <div className="market-page-brand">
          <button className="brand-mark" onClick={() => { window.location.href = '/'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div>
            <strong>Mercado NexoGo</strong>
            <p className="muted">Anuncios, perfil vendedor, enlace directo y chat privado por producto</p>
          </div>
        </div>
        <div className="pill-row">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/'; }}>Volver al inicio</button>
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/chat?space=market'; }}>Chat general</button>
          {!user && <Link href="/mercado/registro" className="btn btn-ghost">Acceder</Link>}
          <button className="btn btn-primary" onClick={() => { if (!user) { goRegister('/mercado'); return; } setComposerOpen((v) => !v); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{composerOpen ? 'Cerrar publicación' : 'Subir anuncio'}</button>
        </div>
      </header>

      <section className="market-hero market-hero-full">
        <div>
          <span className="chip chip-owner">Marketplace social</span>
          <h1>Publica, descubre y negocia artículos dentro de la comunidad</h1>
          <p className="muted">Cada anuncio tiene ficha propia, enlace directo, perfil público del vendedor, galería de imágenes y una conversación privada entre comprador y vendedor.</p>
          <div className="pill-row">
            <button className="btn btn-primary" onClick={() => { if (!user) { goRegister('/mercado'); return; } setComposerOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Publicar anuncio</button>
            <button className="btn btn-ghost" onClick={() => { window.location.href = '/chat?space=market'; }}>Abrir chat general</button>
            {!user && <Link href="/mercado/registro" className="btn btn-ghost">Crear cuenta</Link>}
          </div>
        </div>
        <div className="market-hero-panel">
          <article className="market-kpi-card"><strong>{visibleItems.length}</strong><span>Anuncios visibles</span></article>
          <article className="market-kpi-card"><strong>{visibleItems.filter((item) => item.trade_type === 'sell').length}</strong><span>Ventas activas</span></article>
          <article className="market-kpi-card"><strong>{visibleItems.filter((item) => item.trade_type === 'buy').length}</strong><span>Búsquedas activas</span></article>
          <article className="market-kpi-card"><strong>{threads.length}</strong><span>Chats privados</span></article>
        </div>
      </section>

      <section className="market-feature-grid">
        {MARKET_FEATURES.map((item) => (
          <article key={item.id} className="market-feature-card">
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      {composerOpen && (
        <section className="market-compose-card market-compose-card-strong">
          <div className="market-section-head">
            <div>
              <h2>{editingId ? 'Editar anuncio' : 'Publicar anuncio'}</h2>
              <p className="muted">Crea una ficha clara, con precio, zona, condiciones y una portada. Luego podrás añadir más imágenes dentro de la ficha.</p>
            </div>
            <div className="pill-row">
              {editingId && <span className="chip chip-owner">Editando</span>}
              <button className="btn btn-ghost" onClick={closeComposer}>Cerrar</button>
            </div>
          </div>
          <div className="market-compose-grid">
            <input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Título del anuncio" />
            <select value={form.trade_type} onChange={(e) => setForm((c) => ({ ...c, trade_type: e.target.value }))}>
              <option value="sell">Vendo</option>
              <option value="buy">Busco</option>
              <option value="swap">Intercambio</option>
            </select>
            <select value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}>
              <option value="general">General</option>
              <option value="eventos">Eventos</option>
              <option value="deporte">Deporte</option>
              <option value="tecnologia">Tecnología</option>
              <option value="lifestyle">Lifestyle</option>
            </select>
            <input value={form.condition} onChange={(e) => setForm((c) => ({ ...c, condition: e.target.value }))} placeholder="Estado del artículo" />
            <input value={form.price_amount} onChange={(e) => setForm((c) => ({ ...c, price_amount: e.target.value }))} placeholder="Precio" />
            <select value={form.currency} onChange={(e) => setForm((c) => ({ ...c, currency: e.target.value }))}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
            <input value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} placeholder="Ciudad" />
            <input value={form.country} onChange={(e) => setForm((c) => ({ ...c, country: e.target.value }))} placeholder="País" />
            <input value={form.district} onChange={(e) => setForm((c) => ({ ...c, district: e.target.value }))} placeholder="Barrio o zona" />
            <input value={form.image_url} onChange={(e) => setForm((c) => ({ ...c, image_url: e.target.value }))} placeholder="URL de portada" />
            <div className="market-upload-box">
              <label className="btn btn-ghost market-upload-label">
                <input type="file" accept="image/*" onChange={handleCoverFile} />
                Subir portada
              </label>
              {coverPreview && <img src={coverPreview} alt="Portada" className="market-upload-preview" />}
            </div>
            <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label className="adult-confirm-row market-offer-row">
              <input type="checkbox" checked={form.featured === true} onChange={(e) => setForm((c) => ({ ...c, featured: e.target.checked }))} />
              <span>Destacar anuncio en cabecera del mercado si tu cuenta tiene permiso.</span>
            </label>
            <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="Describe el artículo, el trato y las condiciones de entrega" />
            <label className="adult-confirm-row market-offer-row">
              <input type="checkbox" checked={form.allow_offers} onChange={(e) => setForm((c) => ({ ...c, allow_offers: e.target.checked }))} />
              <span>Acepto negociación dentro del chat del anuncio y mantendré el trato dentro del mercado social.</span>
            </label>
          </div>
          {error && <p className="error-message">{error}</p>}
          {notice && <p className="auth-notice">{notice}</p>}
          <div className="pill-row">
            <button className="btn btn-primary" onClick={publish}>{editingId ? 'Guardar cambios' : 'Publicar anuncio'}</button>
            <button className="btn btn-ghost" onClick={closeComposer}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="market-dashboard-grid">
        <section className="market-column-main">
          {featuredItems.length > 0 && (
            <section className="market-showcase-grid">
              {featuredItems.map((item) => (
                <article key={item.id} className="market-showcase-card">
                  <img src={item.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=900&q=80'} alt={item.title} />
                  <div className="market-showcase-copy">
                    <div className="market-card-page-head">
                      <span className="chip">{item.trade_type === 'sell' ? 'Vendo' : item.trade_type === 'buy' ? 'Busco' : 'Intercambio'}</span>
                      <span className="chip chip-pending">{item.category}</span>
                      {item.featured && <span className="chip chip-owner">Destacado</span>}
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                    <div className="market-card-seller-row">
                      <Link href={`/mercado/perfil/${item.seller_user_id}`} className="market-inline-link">{item.seller_name || 'Usuario'}</Link>
                      <span>{item.city || 'Sin ciudad'}</span>
                    </div>
                    <div className="market-card-page-meta">
                      <strong>{formatMoney(item)}</strong>
                      <span>{item.allow_offers ? 'Negociable' : 'Precio cerrado'} · {item.favorites_count || 0} guardados</span>
                    </div>
                    <div className="pill-row">
                      <Link href={marketShareUrl(item.id)} className="btn btn-primary">Ver anuncio</Link>
                      <button className="btn btn-ghost" onClick={() => startConversation(item)}>Hablar</button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="market-filter-bar">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar anuncios por título, ciudad o categoría" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>{MARKET_CATEGORIES.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas las categorías' : item}</option>)}</select>
            <select value={tradeType} onChange={(e) => setTradeType(e.target.value)}>{MARKET_TYPES.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todos los tipos' : item}</option>)}</select>
          </section>

          <section className="market-grid-page">
            {restItems.map((item) => (
              <article key={item.id} className="market-card-page">
                <img src={item.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=900&q=80'} alt={item.title} />
                <div className="market-card-page-body">
                  <div className="market-card-page-head">
                    <span className="chip">{item.trade_type === 'sell' ? 'Vendo' : item.trade_type === 'buy' ? 'Busco' : 'Intercambio'}</span>
                    <span className={`chip ${item.status === 'sold' ? 'chip-owner' : item.status === 'reserved' ? 'chip-pending' : ''}`}>{item.status || 'active'}</span>
                    {item.featured && <span className="chip chip-owner">Destacado</span>}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="market-card-seller-row">
                    <Link href={`/mercado/perfil/${item.seller_user_id}`} className="market-inline-link">{item.seller_name || 'Usuario'}</Link>
                    <span>{item.city || 'Sin ciudad'}{item.district ? ` · ${item.district}` : ''}</span>
                  </div>
                  <div className="market-card-page-meta">
                    <strong>{formatMoney(item)}</strong>
                    <span>{item.allow_offers ? 'Negociable' : 'Precio cerrado'} · {item.favorites_count || 0} guardados</span>
                  </div>
                  <div className="pill-row">
                    <Link href={marketShareUrl(item.id)} className="btn btn-primary">Ver anuncio</Link>
                    <button className="btn btn-ghost" onClick={() => startConversation(item)}>Contactar</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </section>

        <aside className="market-column-side">
          <section className="mini-card market-manage-card">
            <h3>Mi acceso al mercado</h3>
            {!user ? (
              <div className="market-empty-action">
                <p className="muted">Debes registrarte con el mismo perfil general de NexoGo para publicar, contactar, valorar y abrir investigaciones.</p>
                <Link href="/mercado/registro" className="btn btn-primary">Crear cuenta</Link>
              </div>
            ) : (
              <div className="market-empty-action">
                <p className="muted">Has iniciado sesión con el mismo usuario de la web principal. Todo lo que publiques y valores se guarda en la misma base.</p>
                <button className="btn btn-ghost" onClick={() => { setComposerOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Publicar ahora</button>
              </div>
            )}
          </section>

          <section className="mini-card market-manage-card">
            <h3>Mis anuncios</h3>
            {myItems.length === 0 ? (
              <p className="muted">Todavía no has publicado anuncios.</p>
            ) : (
              <div className="market-manage-list">
                {myItems.slice(0, 6).map((item) => (
                  <article key={item.id} className="market-manage-item">
                    <div>
                      <strong>{item.title}</strong>
                      <p className="muted">{formatMoney(item)} · {item.status || 'active'}</p>
                    </div>
                    <div className="market-manage-actions">
                      <button className="btn btn-ghost btn-inline" onClick={() => openComposerForItem(item)}>Editar</button>
                      <button className="btn btn-ghost btn-inline" onClick={() => updateStatus(item, 'reserved')}>Reservar</button>
                      <button className="btn btn-ghost btn-inline" onClick={() => updateStatus(item, 'sold')}>Vendido</button>
                      <button className="btn btn-danger btn-inline" onClick={() => deleteItem(item)}>Borrar</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mini-card">
            <h3>Conversaciones activas</h3>
            {threads.length === 0 ? (
              <p className="muted">Cuando abras o recibas conversaciones por anuncios, aparecerán aquí.</p>
            ) : (
              <div className="market-thread-list">
                {threads.slice(0, 6).map((thread) => (
                  <Link key={thread.id} href={`/mercado/chat/${thread.id}`} className="market-thread-card">
                    <strong>{thread.item?.title || thread.title || 'Anuncio del mercado'}</strong>
                    <span>{thread.item?.city || thread.city || 'Sin ciudad'}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mini-card">
            <h3>Reglas del mercado</h3>
            <ul className="policy-list market-policy-list compact-policy-list">
              {TRUST_POINTS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}

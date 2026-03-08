import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ensureLocalThread } from '../../lib/marketplace-chat-demo';
import { formatMoney, readLocalMarketItems, writeLocalMarketItems } from '../../lib/marketplace-demo';

const STATUS_OPTIONS = ['active', 'reserved', 'sold'];
const REPORT_REASONS = ['fraude', 'comportamiento agresivo', 'artículo engañoso', 'incumplimiento', 'otro'];

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function starLabel(value) {
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

export default function MercadoDetailPage() {
  const router = useRouter();
  const [item, setItem] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [threads, setThreads] = useState([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [galleryDrafts, setGalleryDrafts] = useState([]);
  const [reportForm, setReportForm] = useState({ reason: 'fraude', description: '', evidence: [] });
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [favoriteState, setFavoriteState] = useState({ is_favorite: false, favorites_count: 0 });

  useEffect(() => {
    const loadSession = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
    };
    loadSession();
  }, []);

  const loadItem = async () => {
    if (!router.query.id) return;
    try {
      const payload = await api(`/api/marketplace/items/${encodeURIComponent(String(router.query.id))}`);
      setItem(payload);
      setSelectedImage(payload.images?.[0]?.image_url || payload.image_url || '');
      setForm({
        title: payload.title || '',
        description: payload.description || '',
        trade_type: payload.trade_type || 'sell',
        category: payload.category || 'general',
        condition: payload.condition || 'muy bueno',
        price_amount: String(payload.price_amount || ''),
        currency: payload.currency || 'EUR',
        city: payload.city || 'Madrid',
        country: payload.country || 'España',
        district: payload.district || '',
        image_url: payload.image_url || '',
        allow_offers: payload.allow_offers !== false,
        status: payload.status || 'active',
        featured: payload.featured === true,
      });
      setFavoriteState({ is_favorite: Boolean(payload.is_favorite), favorites_count: Number(payload.favorites_count || 0) });
    } catch {
      const local = readLocalMarketItems().find((entry) => String(entry.id) === String(router.query.id));
      if (!local) {
        setError('No se encontró el anuncio.');
        return;
      }
      const localPayload = { ...local, related: readLocalMarketItems().filter((entry) => String(entry.id) !== String(local.id)).slice(0, 4), images: local.image_url ? [{ id: `cover-${local.id}`, image_url: local.image_url, description: 'Imagen principal' }] : [], reviews: [] };
      setItem(localPayload);
      setSelectedImage(localPayload.images?.[0]?.image_url || local.image_url || '');
      setForm({
        title: local.title || '',
        description: local.description || '',
        trade_type: local.trade_type || 'sell',
        category: local.category || 'general',
        condition: local.condition || 'muy bueno',
        price_amount: String(local.price_amount || ''),
        currency: local.currency || 'EUR',
        city: local.city || 'Madrid',
        country: local.country || 'España',
        district: local.district || '',
        image_url: local.image_url || '',
        allow_offers: local.allow_offers !== false,
        status: local.status || 'active',
        featured: local.featured === true,
      });
      setFavoriteState({ is_favorite: false, favorites_count: 0 });
    }
  };

  const loadThreads = async () => {
    if (!router.query.id || !user || !item) return;
    if (String(item.seller_user_id || '') !== String(user.id)) return;
    try {
      const payload = await api(`/api/marketplace/items/${encodeURIComponent(String(router.query.id))}/threads`);
      setThreads(Array.isArray(payload) ? payload : []);
    } catch {
      setThreads([]);
    }
  };

  useEffect(() => {
    if (!router.isReady || !router.query.id) return;
    loadItem();
  }, [router.isReady, router.query.id]);

  useEffect(() => {
    loadThreads();
  }, [item, user]);

  const shareLink = useMemo(() => {
    if (!item?.id) return '';
    if (typeof window === 'undefined') return `/mercado/${item.id}`;
    return `${window.location.origin}/mercado/${item.id}`;
  }, [item]);

  const galleryImages = useMemo(() => {
    if (!item) return [];
    if (Array.isArray(item.images) && item.images.length) return item.images;
    return item.image_url ? [{ id: `cover-${item.id}`, image_url: item.image_url, description: 'Imagen principal' }] : [];
  }, [item]);

  const isOwner = Boolean(user && item && String(item.seller_user_id || '') === String(user.id));
  const canReviewSale = Boolean(isOwner && item?.status === 'sold' && item?.sold_to_user_id);

  const toggleFavorite = async () => {
    if (!item) return;
    if (!user) {
      window.location.href = `/mercado/registro?next=${encodeURIComponent(`/mercado/${item.id}`)}`;
      return;
    }
    try {
      const next = favoriteState.is_favorite
        ? await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}/favorite`, { method: 'DELETE' })
        : await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}/favorite`, { method: 'POST' });
      setFavoriteState({
        is_favorite: Boolean(next?.is_favorite),
        favorites_count: Number(next?.favorites_count || 0),
      });
    } catch (toggleError) {
      setError(toggleError?.message || 'No se pudo actualizar favoritos.');
    }
  };

  const contactSeller = async () => {
    if (!user) {
      window.location.href = `/mercado/registro?next=${encodeURIComponent(`/mercado/${item.id}`)}`;
      return;
    }
    try {
      const thread = await api('/api/marketplace/threads', { method: 'POST', body: JSON.stringify({ item_id: item.id }) });
      window.location.href = `/mercado/chat/${thread.id}`;
    } catch {
      const localThread = ensureLocalThread(
        item,
        { id: item.seller_user_id || `seller-${item.id}`, name: item.seller_name || 'Vendedor' },
        { id: user.id, name: readUserName(user) },
      );
      setNotice('Chat de negociación abierto en modo local.');
      window.location.href = `/mercado/chat/${localThread.id}`;
    }
  };

  const saveChanges = async () => {
    if (!item || !form) return;
    const payload = { ...form, price_amount: Number(form.price_amount || 0) };
    try {
      await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setNotice('Anuncio actualizado correctamente.');
      setEditing(false);
      await loadItem();
    } catch {
      const next = readLocalMarketItems().map((entry) => (String(entry.id) === String(item.id) ? { ...entry, ...payload } : entry));
      writeLocalMarketItems(next);
      setItem((current) => ({ ...(current || {}), ...payload }));
      setNotice('Anuncio actualizado en modo local.');
      setEditing(false);
    }
  };

  const deleteItem = async () => {
    if (!item) return;
    try {
      await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}`, { method: 'DELETE' });
    } catch {
      const next = readLocalMarketItems().filter((entry) => String(entry.id) !== String(item.id));
      writeLocalMarketItems(next);
    }
    window.location.href = '/mercado';
  };

  const updateStatus = async (status, soldToUserId = null) => {
    if (!item) return;
    const payload = { status };
    if (status === 'sold' && soldToUserId) payload.sold_to_user_id = soldToUserId;
    try {
      await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setNotice(`Estado actualizado a ${status}.`);
      await loadItem();
    } catch {
      const next = readLocalMarketItems().map((entry) => (String(entry.id) === String(item.id) ? { ...entry, status, sold_to_user_id: soldToUserId || entry.sold_to_user_id } : entry));
      writeLocalMarketItems(next);
      setItem((current) => ({ ...(current || {}), status, sold_to_user_id: soldToUserId || current?.sold_to_user_id }));
      setNotice(`Estado actualizado a ${status} en modo local.`);
    }
  };

  const handleGalleryFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const converted = await Promise.all(files.map(async (file) => ({ image_url: await fileToDataUrl(file), description: file.name })));
      setGalleryDrafts((current) => [...current, ...converted]);
      setNotice('Imágenes preparadas para subir a la ficha.');
    } catch {
      setError('No se pudieron preparar las imágenes.');
    }
  };

  const uploadGallery = async () => {
    if (!item || !galleryDrafts.length) return;
    try {
      await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}/images`, { method: 'POST', body: JSON.stringify({ images: galleryDrafts }) });
      setGalleryDrafts([]);
      setNotice('Galería actualizada correctamente.');
      await loadItem();
    } catch {
      setNotice('La galería no se pudo guardar en remoto.');
    }
  };

  const submitReview = async () => {
    if (!item) return;
    try {
      await api(`/api/marketplace/items/${encodeURIComponent(String(item.id))}/reviews`, { method: 'POST', body: JSON.stringify({ rating: reviewForm.rating, comment: reviewForm.comment }) });
      setNotice('Valoración de venta guardada.');
      await loadItem();
    } catch (submissionError) {
      setError(submissionError?.message || 'No se pudo guardar la valoración.');
    }
  };

  const handleEvidenceFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const converted = await Promise.all(files.map(async (file) => ({ file_url: await fileToDataUrl(file), description: file.name })));
      setReportForm((current) => ({ ...current, evidence: [...current.evidence, ...converted] }));
      setNotice('Pruebas adjuntas al formulario de investigación.');
    } catch {
      setError('No se pudieron adjuntar las pruebas.');
    }
  };

  const submitReport = async () => {
    if (!item) return;
    if (!user) {
      window.location.href = `/mercado/registro?next=${encodeURIComponent(`/mercado/${item.id}`)}`;
      return;
    }
    try {
      const result = await api('/api/marketplace/reports', {
        method: 'POST',
        body: JSON.stringify({
          item_id: item.id,
          reported_user_id: item.seller_user_id,
          reason: reportForm.reason,
          description: reportForm.description,
          evidence: reportForm.evidence,
        }),
      });
      setReportForm({ reason: 'fraude', description: '', evidence: [] });
      setNotice(`Investigación abierta. Ticket ${result?.report?.ticket_number || 'creado'}.`);
    } catch (submissionError) {
      setError(submissionError?.message || 'No se pudo abrir la investigación.');
    }
  };

  if (error) {
    return <main className="market-shell"><section className="market-compose-card"><h1>Error</h1><p>{error}</p></section></main>;
  }

  if (!item || !form) {
    return <main className="market-shell"><section className="brand-panel-loader brand-panel-loader-chat"><div className="brand-loader-mark">NG</div></section></main>;
  }

  return (
    <main className="market-shell">
      <header className="market-page-topbar">
        <div className="market-page-brand">
          <button className="brand-mark" onClick={() => { window.location.href = '/mercado'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div>
            <strong>Ficha del anuncio</strong>
            <p className="muted">Vista completa del artículo, galería, vendedor y reclamaciones</p>
          </div>
        </div>
        <div className="pill-row">
          <button className="btn btn-ghost" onClick={() => router.back()}>Volver atrás</button>
          <Link href="/mercado" className="btn btn-ghost">Ver mercado</Link>
          <button className="btn btn-primary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Subir</button>
        </div>
      </header>

      <section className="market-detail-hero">
        <div className="market-detail-media">
          <img src={selectedImage || item.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=1200&q=80'} alt={item.title} onClick={() => setViewerOpen(true)} />
          {galleryImages.length > 0 && (
            <div className="market-gallery-strip">
              {galleryImages.map((image) => (
                <button key={image.id} className={`market-gallery-thumb ${selectedImage === image.image_url ? 'market-gallery-thumb-active' : ''}`} onClick={() => setSelectedImage(image.image_url)}>
                  <img src={image.image_url} alt={image.description || item.title} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="market-detail-copy">
          <div className="pill-row">
            <span className="chip">{item.trade_type === 'sell' ? 'Vendo' : item.trade_type === 'buy' ? 'Busco' : 'Intercambio'}</span>
            <span className="chip chip-pending">{item.category}</span>
            <span className={`chip ${item.status === 'sold' ? 'chip-owner' : item.status === 'reserved' ? 'chip-pending' : ''}`}>{item.status || 'active'}</span>
            {item.featured && <span className="chip chip-owner">Destacado</span>}
          </div>
          <h1>{item.title}</h1>
          <p className="muted">{item.description}</p>
          <div className="market-detail-price">{formatMoney(item)}</div>
          <div className="post-meta-grid">
            <span>📍 {item.city || 'Sin ciudad'}{item.district ? ` · ${item.district}` : ''}</span>
            <span>🌍 {item.country || 'Sin país'}</span>
            <span>🧾 {item.condition || 'Sin estado'}</span>
            <span>💬 {item.allow_offers ? 'Acepta ofertas' : 'Precio cerrado'}</span>
          </div>
          {notice && <p className="auth-notice">{notice}</p>}
          <div className="pill-row">
            {!isOwner && <button className="btn btn-primary" onClick={contactSeller}>Hablar con vendedor</button>}
            {!isOwner && <button className="btn btn-danger" onClick={() => document.getElementById('market-report-card')?.scrollIntoView({ behavior: 'smooth' })}>Abrir investigación</button>}
            <button className={`btn ${favoriteState.is_favorite ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleFavorite}>{favoriteState.is_favorite ? 'Guardado' : 'Guardar'} · {favoriteState.favorites_count}</button>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(shareLink)}>Copiar enlace</button>
            <Link href="/mercado" className="btn btn-ghost">Ver todos los anuncios</Link>
          </div>
        </div>
      </section>

      <section className="market-detail-grid">
        <section className="market-compose-card">
          <div className="market-section-head">
            <div>
              <h2>{editing ? 'Editar anuncio' : 'Ficha del anuncio'}</h2>
              <p className="muted">Gestiona el estado del anuncio, revisa la galería, marca comprador y deja la valoración final cuando la venta se cierre.</p>
            </div>
            {isOwner && (
              <div className="pill-row">
                <button className="btn btn-ghost" onClick={() => setEditing((current) => !current)}>{editing ? 'Cerrar edición' : 'Editar'}</button>
                <button className="btn btn-danger" onClick={deleteItem}>Borrar</button>
              </div>
            )}
          </div>

          {editing ? (
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
              <input value={form.image_url} onChange={(e) => setForm((c) => ({ ...c, image_url: e.target.value }))} placeholder="URL de imagen" />
              <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <label className="adult-confirm-row market-offer-row">
                <input type="checkbox" checked={form.featured === true} onChange={(e) => setForm((c) => ({ ...c, featured: e.target.checked }))} />
                <span>Marcar como destacado si tu cuenta tiene permiso.</span>
              </label>
              <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="Describe el artículo" />
              <label className="adult-confirm-row market-offer-row">
                <input type="checkbox" checked={form.allow_offers} onChange={(e) => setForm((c) => ({ ...c, allow_offers: e.target.checked }))} />
                <span>Mantener abierta la negociación dentro del chat del anuncio.</span>
              </label>
              <div className="pill-row">
                <button className="btn btn-primary" onClick={saveChanges}>Guardar</button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div className="market-detail-info-grid">
                <article className="market-detail-info-card"><strong>Tipo</strong><span>{item.trade_type}</span></article>
                <article className="market-detail-info-card"><strong>Categoría</strong><span>{item.category}</span></article>
                <article className="market-detail-info-card"><strong>Ciudad</strong><span>{item.city || 'Sin ciudad'}</span></article>
                <article className="market-detail-info-card"><strong>Zona</strong><span>{item.district || 'Sin zona'}</span></article>
              </div>
              {isOwner && (
                <div className="pill-row market-owner-status-row">
                  <button className="btn btn-ghost" onClick={() => updateStatus('active')}>Activo</button>
                  <button className="btn btn-ghost" onClick={() => updateStatus('reserved')}>Reservado</button>
                  <button className="btn btn-ghost" onClick={() => updateStatus('sold', item.sold_to_user_id || null)}>Vendido</button>
                </div>
              )}
              <ul className="policy-list market-policy-list">
                <li>El anuncio tiene enlace directo y puede compartirse dentro o fuera de la plataforma.</li>
                <li>La negociación debe hacerse desde el chat privado del artículo para dejar trazabilidad.</li>
                <li>Si detectas fraude, amenaza o comportamiento irregular, abre una investigación desde la ficha del anuncio.</li>
              </ul>
            </>
          )}

          {isOwner && (
            <section className="market-inline-section">
              <div className="market-section-head">
                <div>
                  <h3>Galería del anuncio</h3>
                  <p className="muted">Sube más imágenes y una descripción corta para que el comprador vea el artículo completo.</p>
                </div>
              </div>
              <div className="market-upload-row">
                <label className="btn btn-ghost market-upload-label">
                  <input type="file" accept="image/*" multiple onChange={handleGalleryFiles} />
                  Añadir imágenes
                </label>
                <button className="btn btn-primary" onClick={uploadGallery} disabled={!galleryDrafts.length}>Guardar galería</button>
              </div>
              {galleryDrafts.length > 0 && (
                <div className="market-draft-grid">
                  {galleryDrafts.map((draft, index) => (
                    <article key={`${draft.description}-${index}`} className="market-draft-card">
                      <img src={draft.image_url} alt={draft.description || 'Imagen'} />
                      <input value={draft.description || ''} onChange={(e) => setGalleryDrafts((current) => current.map((entry, innerIndex) => (innerIndex === index ? { ...entry, description: e.target.value } : entry)))} placeholder="Descripción corta" />
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {isOwner && threads.length > 0 && (
            <section className="market-inline-section">
              <div className="market-section-head">
                <div>
                  <h3>Compradores interesados</h3>
                  <p className="muted">Marca a qué usuario le vendiste el artículo y deja la valoración final de la operación.</p>
                </div>
              </div>
              <div className="market-interest-grid">
                {threads.map((thread) => (
                  <article key={thread.id} className="market-interest-card">
                    <div className="chat-profile-head">
                      <img src={thread.buyer?.photo_url || 'https://ui-avatars.com/api/?name=Comprador&background=1d4ed8&color=ffffff&bold=true'} alt={thread.buyer?.name || 'Comprador'} />
                      <div>
                        <h4>{thread.buyer?.name || 'Comprador'}</h4>
                        <p className="muted">{thread.buyer?.city || 'Sin ciudad'}</p>
                      </div>
                    </div>
                    <p className="muted market-last-message">{thread.last_message?.message || 'Sin mensajes recientes en este hilo.'}</p>
                    <div className="pill-row">
                      <Link href={`/mercado/chat/${thread.id}`} className="btn btn-ghost">Abrir chat</Link>
                      <button className="btn btn-primary" onClick={() => updateStatus('sold', thread.buyer_user_id)}>Vendido a este comprador</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {canReviewSale && (
            <section className="market-inline-section">
              <div className="market-section-head">
                <div>
                  <h3>Valora la operación</h3>
                  <p className="muted">El vendedor puntúa al comprador con estrellas y un comentario máximo de 90 caracteres.</p>
                </div>
              </div>
              <div className="market-review-form">
                <div className="market-stars-row">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button key={value} className={`market-star-button ${reviewForm.rating >= value ? 'market-star-button-active' : ''}`} onClick={() => setReviewForm((current) => ({ ...current, rating: value }))}>
                      {value}★
                    </button>
                  ))}
                </div>
                <textarea value={reviewForm.comment} maxLength={90} onChange={(e) => setReviewForm((current) => ({ ...current, comment: e.target.value.slice(0, 90) }))} placeholder="Comentario breve sobre el trato y la fiabilidad del comprador" />
                <div className="market-review-form-foot">
                  <span className="muted">{reviewForm.comment.length}/90 caracteres</span>
                  <button className="btn btn-primary" onClick={submitReview}>Guardar valoración</button>
                </div>
              </div>
            </section>
          )}

          {!isOwner && (
            <section id="market-report-card" className="market-inline-section market-report-card">
              <div className="market-section-head">
                <div>
                  <h3>Investigar al vendedor</h3>
                  <p className="muted">Si necesitas que revisemos el caso, abre un ticket con pruebas. El ticket aparecerá en tu cuenta y en el panel de administración.</p>
                </div>
              </div>
              <div className="market-report-grid">
                <select value={reportForm.reason} onChange={(e) => setReportForm((current) => ({ ...current, reason: e.target.value }))}>
                  {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
                <textarea value={reportForm.description} onChange={(e) => setReportForm((current) => ({ ...current, description: e.target.value }))} placeholder="Cuenta qué ha pasado, qué te preocupa y qué revisión necesitas." />
                <div className="market-upload-row">
                  <label className="btn btn-ghost market-upload-label">
                    <input type="file" accept="image/*" multiple onChange={handleEvidenceFiles} />
                    Adjuntar pruebas
                  </label>
                  <button className="btn btn-primary" onClick={submitReport}>Abrir investigación</button>
                </div>
                {reportForm.evidence.length > 0 && (
                  <div className="market-evidence-list">
                    {reportForm.evidence.map((entry, index) => (
                      <article key={`${entry.description}-${index}`} className="market-evidence-card">
                        <img src={entry.file_url} alt={entry.description || 'Prueba'} />
                        <span>{entry.description || `Prueba ${index + 1}`}</span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </section>

        <aside className="market-side-stack">
          <section className="mini-card">
            <h3>Vendedor</h3>
            <div className="chat-profile-head">
              <img src={item.seller_photo || 'https://ui-avatars.com/api/?name=Usuario&background=1d4ed8&color=ffffff&bold=true'} alt={item.seller_name || 'Usuario'} />
              <div>
                <h4>{item.seller_name || 'Usuario'}</h4>
                <p className="muted">{item.seller_city || item.city || 'Sin ciudad'}</p>
              </div>
            </div>
            {item.seller_bio && <p className="muted">{item.seller_bio}</p>}
            <p className="muted">Reputación mercado: {item.seller_rating || 0} ⭐ · {item.seller_rating_count || 0} valoraciones</p>
            <Link href={item.seller_profile_url || `/mercado/perfil/${item.seller_user_id}`} className="btn btn-ghost btn-block">Ver perfil vendedor</Link>
          </section>
          <section className="mini-card">
            <h3>Estado de venta</h3>
            <div className="market-sale-state">
              <strong>{item.status === 'sold' ? 'Venta cerrada' : item.status === 'reserved' ? 'Reservado' : 'Disponible'}</strong>
              {item.sold_buyer && <span className="muted">Comprador final: {item.sold_buyer.name}</span>}
            </div>
          </section>
          <section className="mini-card">
            <h3>Enlace directo</h3>
            <p className="muted direct-link-box">{shareLink}</p>
          </section>
          <section className="mini-card">
            <h3>Últimas valoraciones</h3>
            {Array.isArray(item.reviews) && item.reviews.length > 0 ? (
              <div className="market-mini-review-list">
                {item.reviews.slice(0, 4).map((review) => (
                  <article key={review.id} className="market-mini-review-card">
                    <strong>{review.buyer?.name || 'Comprador'}</strong>
                    <span>{starLabel(Number(review.rating || 0))}</span>
                    <p>{review.comment || 'Sin comentario.'}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">Todavía no hay valoraciones de venta en este anuncio.</p>
            )}
          </section>
        </aside>
      </section>

      {Array.isArray(item.related) && item.related.length > 0 && (
        <section className="market-related-grid market-compose-card">
          <h2>Otros anuncios relacionados</h2>
          <div className="market-grid-page">
            {item.related.map((entry) => (
              <article key={entry.id} className="market-card-page compact-market-card">
                <div className="market-card-page-body">
                  <div className="market-card-page-head">
                    <span className="chip">{entry.trade_type}</span>
                    <span className="chip chip-pending">{entry.category}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <div className="market-card-page-meta">
                    <strong>{formatMoney(entry)}</strong>
                    <span>{entry.city || 'Sin ciudad'}</span>
                  </div>
                  <Link href={`/mercado/${entry.id}`} className="btn btn-primary">Abrir</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {viewerOpen && (
        <div className="market-image-viewer" onClick={() => setViewerOpen(false)}>
          <div className="market-image-viewer-card" onClick={(event) => event.stopPropagation()}>
            <button className="btn btn-ghost" onClick={() => setViewerOpen(false)}>Cerrar</button>
            <img src={selectedImage || galleryImages[0]?.image_url || item.image_url} alt={item.title} />
            <p className="muted">{galleryImages.find((entry) => entry.image_url === selectedImage)?.description || item.title}</p>
          </div>
        </div>
      )}
    </main>
  );
}

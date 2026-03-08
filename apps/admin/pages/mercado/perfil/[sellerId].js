import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../../lib/marketplace-demo';

async function api(path) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexogo:loading:start'));
  try {
    const res = await fetch(path, { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
    return payload;
  } finally {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
  }
}

function starRow(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export default function MarketplaceSellerProfilePage() {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady || !router.query.sellerId) return;
    const load = async () => {
      try {
        const result = await api(`/api/marketplace/sellers/${encodeURIComponent(String(router.query.sellerId))}`);
        setPayload(result);
      } catch (loadError) {
        setError(loadError?.message || 'No se pudo cargar el perfil del vendedor.');
      }
    };
    load();
  }, [router.isReady, router.query.sellerId]);

  const activeItems = useMemo(() => (payload?.items || []).filter((item) => item.status !== 'sold'), [payload]);
  const soldItems = useMemo(() => (payload?.items || []).filter((item) => item.status === 'sold'), [payload]);

  if (error) {
    return <main className="market-shell"><section className="market-compose-card"><h1>Error</h1><p>{error}</p></section></main>;
  }

  if (!payload) {
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
            <strong>Perfil vendedor</strong>
            <p className="muted">Productos en venta, historial y valoraciones del mercado</p>
          </div>
        </div>
        <div className="pill-row">
          <button className="btn btn-ghost" onClick={() => router.back()}>Volver</button>
          <Link href="/mercado" className="btn btn-ghost">Mercado</Link>
        </div>
      </header>

      <section className="market-seller-hero">
        <div className="chat-profile-head market-seller-head">
          <img src={payload.seller.photo_url || 'https://ui-avatars.com/api/?name=Vendedor&background=1d4ed8&color=ffffff&bold=true'} alt={payload.seller.name || 'Vendedor'} />
          <div>
            <h1>{payload.seller.name || 'Vendedor'}</h1>
            <p className="muted">{payload.seller.city || 'Sin ciudad'}{payload.seller.country ? ` · ${payload.seller.country}` : ''}</p>
            <p className="muted">{payload.seller.bio || 'Sin biografía pública todavía.'}</p>
          </div>
        </div>
        <div className="market-seller-kpis">
          <article className="market-kpi-card"><strong>{activeItems.length}</strong><span>Activos</span></article>
          <article className="market-kpi-card"><strong>{soldItems.length}</strong><span>Vendidos</span></article>
          <article className="market-kpi-card"><strong>{payload.summary.total}</strong><span>Valoraciones</span></article>
          <article className="market-kpi-card"><strong>{payload.summary.average ? payload.summary.average.toFixed(1) : '0.0'}</strong><span>Media</span></article>
        </div>
      </section>

      <section className="market-dashboard-grid">
        <section className="market-column-main">
          <section className="market-compose-card">
            <div className="market-section-head">
              <div>
                <h2>Productos publicados</h2>
                <p className="muted">Anuncios visibles y estado operativo del vendedor.</p>
              </div>
            </div>
            <div className="market-grid-page">
              {(payload.items || []).map((item) => (
                <article key={item.id} className="market-card-page compact-market-card">
                  <img src={item.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=900&q=80'} alt={item.title} />
                  <div className="market-card-page-body">
                    <div className="market-card-page-head">
                      <span className="chip">{item.trade_type}</span>
                      <span className={`chip ${item.status === 'sold' ? 'chip-owner' : item.status === 'reserved' ? 'chip-pending' : ''}`}>{item.status}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <div className="market-card-page-meta">
                      <strong>{formatMoney(item)}</strong>
                      <span>{item.city || 'Sin ciudad'}</span>
                    </div>
                    <Link href={`/mercado/${item.id}`} className="btn btn-primary">Ver ficha</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="market-column-side">
          <section className="mini-card">
            <h3>Resumen de reputación</h3>
            <div className="market-score-block">
              <strong>{payload.summary.average ? payload.summary.average.toFixed(1) : '0.0'} · {starRow(payload.summary.average)}</strong>
              <span className="muted">{payload.summary.total} valoraciones en el mercado</span>
            </div>
            <div className="market-score-grid">
              {[5, 4, 3, 2, 1].map((value) => (
                <article key={value} className="market-score-card">
                  <strong>{value}★</strong>
                  <span>{payload.summary.counts[value] || 0}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="mini-card">
            <h3>Últimas valoraciones</h3>
            {payload.reviews.length === 0 ? (
              <p className="muted">Este vendedor aún no tiene valoraciones de mercado.</p>
            ) : (
              <div className="market-mini-review-list">
                {payload.reviews.slice(0, 8).map((review) => (
                  <article key={review.id} className="market-mini-review-card">
                    <strong>{review.buyer?.name || 'Comprador'}</strong>
                    <span>{starRow(review.rating)}</span>
                    <p>{review.comment || 'Sin comentario.'}</p>
                    <small>{review.item?.title || 'Artículo'}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

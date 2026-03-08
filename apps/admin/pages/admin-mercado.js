import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAILS = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'admin@nexogo.local')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

async function marketApi(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const showLoader = options.showLoader ?? !['GET', 'HEAD'].includes(method);
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (showLoader && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexogo:loading:start'));
  }
  try {
    const res = await fetch(path, { ...options, headers, cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
    return payload;
  } finally {
    if (showLoader && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
    }
  }
}

async function adminApi(path) {
  const headers = { 'content-type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api/backend${path}`, { headers, cache: 'no-store' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
  return payload;
}

function getMarketImage(item) {
  return item?.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=900&q=80';
}

export default function AdminMercadoPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const isAdmin = ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase()) || String(user?.role || '') === 'admin';
  const adminAccessLevel = String(user?.admin_access_level || (isAdmin ? 'owner' : 'none'));
  const canWriteAdmin = ['write', 'owner'].includes(adminAccessLevel);

  const loadAll = async () => {
    const [me, marketItems] = await Promise.all([
      adminApi('/users/me'),
      marketApi('/api/marketplace/items').catch(() => []),
    ]);
    setUser(me || null);
    const adminFlag = ADMIN_EMAILS.includes(String(me?.email || '').toLowerCase()) || String(me?.role || '') === 'admin';
    const accessLevel = String(me?.admin_access_level || (adminFlag ? 'owner' : 'none'));
    setAllowed(adminFlag && accessLevel !== 'none');
    setItems(Array.isArray(marketItems) ? marketItems : []);
  };

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) {
          if (mounted) setReady(true);
          return;
        }
        await loadAll();
      } catch (err) {
        if (mounted) setError(err?.message || 'No se pudo cargar el control del marketplace');
      } finally {
        if (mounted) setReady(true);
      }
    };
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    return items.filter((item) => {
      if (status !== 'all' && String(item.status || '') !== status) return false;
      if (!term) return true;
      return [item.title, item.description, item.category, item.city, item.seller_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [items, search, status]);

  const stats = useMemo(() => {
    const active = items.filter((item) => String(item.status || '') === 'active').length;
    const reserved = items.filter((item) => String(item.status || '') === 'reserved').length;
    const sold = items.filter((item) => String(item.status || '') === 'sold').length;
    const featured = items.filter((item) => Boolean(item.featured)).length;
    const saved = items.reduce((acc, item) => acc + Number(item.favorites_count || 0), 0);
    return { active, reserved, sold, featured, saved };
  }, [items]);

  const updateItem = async (item, payload) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`market:${item.id}`);
      await marketApi(`/api/marketplace/items/${encodeURIComponent(String(item.id))}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el anuncio');
    } finally {
      setBusyKey('');
    }
  };

  if (!ready) {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state brand-panel-loader">
          <div className="brand-loader-mark">NG</div>
          <div className="brand-loader-orbit"><span /><span /><span /></div>
        </section>
      </main>
    );
  }

  if (!allowed || !isAdmin || adminAccessLevel === 'none') {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state">
          <h2>Acceso restringido</h2>
          <p>Este panel solo está disponible para administración.</p>
          <button className="btn btn-primary" onClick={() => { window.location.href = '/'; }}>Ir al inicio</button>
        </section>
      </main>
    );
  }

  return (
    <main className="social-shell admin-shell">
      <header className="topbar admin-topbar">
        <div className="brand brand-hero" role="button" tabIndex={0} onClick={() => { window.location.href = '/admin'; }}>
          <button className="brand-mark"><span className="brand-icon">NG</span></button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>Control de marketplace</h1>
              <div className="brand-live-pills">
                <span className="status-pill status-ok">{items.length} anuncios</span>
                <span className="status-pill status-warning">{stats.featured} destacados</span>
                <span className="status-pill status-go">{stats.active} activos</span>
                <span className="status-pill status-offline">Acceso {adminAccessLevel}</span>
              </div>
            </div>
            <p className="muted">Moderación operativa del mercado: estados, visibilidad destacada, vendedores, guardados y acceso directo a cada ficha.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/admin'; }}>Volver al admin</button>
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/mercado'; }}>Abrir mercado</button>
        </div>
      </header>

      {error && <section className="mini-card"><p className="muted">{error}</p></section>}

      <section className="admin-command-grid admin-market-command-grid">
        <article className="admin-command-card">
          <span>Anuncios activos</span>
          <strong>{stats.active}</strong>
          <p className="muted">{stats.reserved} reservados · {stats.sold} vendidos</p>
        </article>
        <article className="admin-command-card">
          <span>Destacados</span>
          <strong>{stats.featured}</strong>
          <p className="muted">visibles en la cabecera del mercado</p>
        </article>
        <article className="admin-command-card">
          <span>Guardados</span>
          <strong>{stats.saved}</strong>
          <p className="muted">favoritos acumulados en anuncios</p>
        </article>
        <article className="admin-command-card">
          <span>Filtrados</span>
          <strong>{filteredItems.length}</strong>
          <p className="muted">resultado actual del panel</p>
        </article>
      </section>

      <section className="mini-card admin-surface admin-market-surface">
        <div className="admin-section-head">
          <div>
            <h3>Operación del mercado</h3>
            <p className="muted">Busca, prioriza y cambia estado a cualquier anuncio del marketplace desde una sola vista.</p>
          </div>
        </div>
        <div className="admin-log-filters admin-market-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar anuncio, vendedor, ciudad o categoría" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="reserved">Reservados</option>
            <option value="sold">Vendidos</option>
          </select>
        </div>
        <div className="admin-market-grid admin-market-grid-full">
          {filteredItems.map((item) => (
            <article key={item.id} className="admin-market-card admin-market-card-rich">
              <div className="admin-market-cover">
                <img src={getMarketImage(item)} alt={item.title} />
              </div>
              <div className="admin-market-body">
                <div className="admin-room-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p className="muted">{item.seller_name || 'Usuario'} · {item.city || 'Sin ciudad'} · {item.category || 'general'}</p>
                  </div>
                  <div className="pill-row">
                    {item.featured && <span className="chip chip-owner">Destacado</span>}
                    <span className={`chip ${item.status === 'sold' ? 'chip-owner' : item.status === 'reserved' ? 'chip-pending' : ''}`}>{item.status || 'active'}</span>
                  </div>
                </div>
                <p className="admin-market-excerpt">{item.description || 'Sin descripción adicional.'}</p>
                <div className="admin-market-meta">
                  <span><strong>{item.price_amount || 0}</strong> {item.currency || 'EUR'}</span>
                  <span>{item.favorites_count || 0} guardados</span>
                  <span>{item.trade_type || 'sell'}</span>
                </div>
                <div className="pill-row">
                  <button className="btn btn-ghost" onClick={() => { window.location.href = `/mercado/${item.id}`; }}>Ver ficha</button>
                  <button className="btn btn-ghost" onClick={() => { window.location.href = `/mercado/perfil/${item.seller_user_id}`; }}>Ver vendedor</button>
                  <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === `market:${item.id}`} onClick={() => updateItem(item, { featured: !item.featured })}>
                    {item.featured ? 'Quitar destaque' : 'Destacar'}
                  </button>
                  <button className="btn btn-ghost" disabled={!canWriteAdmin || busyKey === `market:${item.id}`} onClick={() => updateItem(item, { status: 'active' })}>Activo</button>
                  <button className="btn btn-ghost" disabled={!canWriteAdmin || busyKey === `market:${item.id}`} onClick={() => updateItem(item, { status: 'reserved' })}>Reservar</button>
                  <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `market:${item.id}`} onClick={() => updateItem(item, { status: 'sold' })}>Vendido</button>
                </div>
              </div>
            </article>
          ))}
          {filteredItems.length === 0 && <p className="muted">No hay anuncios para esos filtros.</p>}
        </div>
      </section>
    </main>
  );
}

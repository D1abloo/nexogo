import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';
const ADMIN_EMAILS = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'admin@nexogo.local')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function fmtDate(iso) {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleString(DATE_LOCALE, {
    timeZone: DATE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function api(path, options = {}) {
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
    const res = await fetch(`${API_URL}${path}`, { ...options, cache: 'no-store', headers });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((payload && (payload.error || payload.message)) || `Error ${res.status}`);
    }
    return payload;
  } finally {
    if (showLoader && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
    }
  }
}

export default function AdminRoomsPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        const [{ data }, me] = await Promise.all([
          supabase.auth.getSession(),
          api('/users/me', {}, false),
        ]);
        const sessionUser = data?.session?.user || null;
        const resolvedUser = me || sessionUser || null;
        const isAdmin = ADMIN_EMAILS.includes(String(resolvedUser?.email || '').toLowerCase()) || String(resolvedUser?.role || '') === 'admin';

        if (!mounted) return;

        setUser(resolvedUser);
        setAllowed(isAdmin);

        if (!isAdmin) return;

        const rows = await api('/plans?radius=500000&hours=720&category=all', {}, false);
        if (!mounted) return;
        setPlans(Array.isArray(rows) ? rows.filter((plan) => ['active', 'in_progress', 'full'].includes(String(plan.status || ''))) : []);
      } catch (err) {
        if (mounted) setError(err?.message || 'No se pudieron cargar las salas activas.');
      } finally {
        if (mounted) setReady(true);
      }
    };

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPlans = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    if (!term) return plans;
    return plans.filter((plan) =>
      String(plan.title || '').toLowerCase().includes(term)
      || String(plan.creator_name || '').toLowerCase().includes(term)
      || String(plan.city || '').toLowerCase().includes(term)
      || String(plan.place_name || '').toLowerCase().includes(term)
      || String(plan.category_code || '').toLowerCase().includes(term),
    );
  }, [plans, search]);

  if (!ready) {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state brand-panel-loader">
          <div className="brand-loader-mark">NG</div>
          <div className="brand-loader-orbit">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state">
          <h2>Acceso restringido</h2>
          <p>Esta vista solo está disponible para administración.</p>
          <button className="btn btn-primary" onClick={() => { window.location.href = '/'; }}>
            Ir al inicio
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="social-shell admin-shell admin-rooms-shell">
      <header className="topbar admin-topbar">
        <div className="brand brand-hero" role="button" tabIndex={0} onClick={() => { window.location.href = '/admin'; }}>
          <button className="brand-mark">
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>Salas activas</h1>
              <div className="brand-live-pills">
                <span className="status-pill status-go">{filteredPlans.length} visibles</span>
                <span className="status-pill status-ok">{plans.filter((plan) => String(plan.visibility) === 'private').length} privadas</span>
                <span className="status-pill status-warning">{plans.filter((plan) => plan.premium_room).length} premium</span>
              </div>
            </div>
            <p className="muted">Vista completa para administración con todas las salas activas cargadas en el sistema.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/admin'; }}>
            Volver al panel
          </button>
        </div>
      </header>

      <section className="mini-card admin-surface">
        <div className="admin-section-head">
          <div>
            <h3>Buscador de salas activas</h3>
            <p className="muted">Filtra por nombre, anfitrión, ciudad, lugar o categoría.</p>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sala activa..." />
        </div>
        {error && <p className="muted">{error}</p>}
        <div className="admin-room-list admin-room-list-full">
          {filteredPlans.map((plan) => (
            <article key={plan.plan_id || plan.id} className="admin-room-card">
              <div className="admin-room-head">
                <div>
                  <h3>{plan.title}</h3>
                  <p className="muted">{plan.creator_name || 'Anfitrión'} · {plan.visibility === 'private' ? 'Privada' : 'Pública'} · {plan.premium_room ? 'Premium' : 'Free'}</p>
                </div>
                <span className="tag">{plan.category_code || 'general'}</span>
              </div>
              <div className="post-meta-grid">
                <span>📍 {plan.place_name || 'Sin lugar'}</span>
                <span>🕒 {fmtDate(plan.start_at)}</span>
                <span>👥 {plan.participants_count || 0}/{plan.max_people || 0}</span>
                <span>🌍 {plan.city || 'Sin ciudad'}</span>
              </div>
              <div className="pill-row">
                <button className="btn btn-ghost" onClick={() => { window.location.href = `/?plan=${plan.plan_id || plan.id}`; }}>
                  Abrir sala
                </button>
                <button className="btn btn-ghost" onClick={() => { window.location.href = `/chat?plan=${plan.plan_id || plan.id}&admin_view=1`; }}>
                  Supervisar chat
                </button>
              </div>
            </article>
          ))}
          {filteredPlans.length === 0 && <p className="muted">No hay salas activas con esos filtros.</p>}
        </div>
      </section>
    </main>
  );
}

AdminRoomsPage.hideFooter = true;

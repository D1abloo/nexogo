import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PLAN_STORAGE_KEY = 'nexogo_plans';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';

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

function readPlans() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadRemotePlans() {
  const headers = { 'content-type': 'application/json' };

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_URL}/plans`, { cache: 'no-store', headers });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const payload = await res.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

export default function SalaPage() {
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRemotePlans()
      .then((remotePlans) => {
        if (remotePlans.length > 0) {
          setPlans(remotePlans);
          return;
        }
        setPlans(readPlans());
      })
      .catch(() => {
        setPlans(readPlans());
      });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadRemotePlans()
        .then((remotePlans) => {
          if (remotePlans.length > 0) {
            setPlans(remotePlans);
            return;
          }
          setPlans(readPlans());
        })
        .catch(() => {
          setPlans(readPlans());
        });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return plans;
    return plans.filter((plan) => {
      return (
        String(plan.title || '').toLowerCase().includes(term) ||
        String(plan.description || '').toLowerCase().includes(term) ||
        String(plan.place_name || '').toLowerCase().includes(term) ||
        String(plan.city || '').toLowerCase().includes(term) ||
        String(plan.country || '').toLowerCase().includes(term)
      );
    });
  }, [plans, search]);

  return (
    <main className="social-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">NG</span>
          <div>
            <h1>Todas las salas</h1>
            <p className="muted">Listado completo de salas publicadas y creadas</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/'; }}>
            Volver al inicio
          </button>
        </div>
      </header>

      <section className="mini-card">
        <h3>Explorador de salas</h3>
        <p className="muted">{filtered.length} salas visibles actualmente</p>
        <input
          className="search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por titulo, ciudad o pais..."
        />
      </section>

      {filtered.length === 0 && (
        <section className="empty-state">
          <h2>No hay salas guardadas</h2>
          <p>Crea una sala desde la portada y aparecerá aquí.</p>
        </section>
      )}

      {filtered.length > 0 && (
        <section className="plan-grid">
          {filtered.map((plan) => (
            <article key={plan.plan_id || plan.id} className="post-card">
              <div className="post-head">
                <div>
                  <h3>{plan.creator_name || 'Anfitrion'}</h3>
                  <p className="muted">{plan.visibility === 'private' ? 'Sala privada' : 'Sala publica'}</p>
                </div>
                <span className="tag">{plan.category_code || plan.category || 'general'}</span>
              </div>
              <h2 className="post-title">{plan.title}</h2>
              <p className="post-desc">{plan.description || 'Sin descripcion'}</p>
              <div className="post-meta-grid">
                <span>Ubicacion: {plan.place_name || 'Sin lugar'}</span>
                <span>Ciudad: {plan.city || 'Madrid'}</span>
                <span>Pais: {plan.country || 'España'}</span>
                <span>Inicio: {fmtDate(plan.start_at)}</span>
              </div>
              <div className="post-actions">
                <button className="btn btn-primary" onClick={() => { window.location.href = '/'; }}>
                  Ver en portada
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

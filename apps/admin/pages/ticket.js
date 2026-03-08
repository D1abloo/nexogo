import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

function getUserAvatar(seed = 'Usuario') {
  const label = encodeURIComponent(String(seed || 'Usuario'));
  return `https://ui-avatars.com/api/?name=${label}&background=1d4ed8&color=ffffff&bold=true`;
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
    if (!res.ok) throw new Error((payload && (payload.error || payload.message)) || `Error ${res.status}`);
    return payload;
  } finally {
    if (showLoader && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
    }
  }
}

export default function TicketPage() {
  const router = useRouter();
  const threadRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [resolution, setResolution] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const ticketId = router.isReady && router.query.id ? String(router.query.id) : '';
  const isAdmin = ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase()) || String(user?.role || '') === 'admin';

  const loadTicket = async () => {
    if (!ticketId) return;
    const { data } = await supabase.auth.getSession();
    const sessionUser = data?.session?.user || null;
    const me = await api('/users/me');
    const canReadAdmin = ADMIN_EMAILS.includes(String(me?.email || sessionUser?.email || '').toLowerCase()) || String(me?.role || '') === 'admin';
    const [reportList, thread] = await Promise.all([
      canReadAdmin ? api('/admin/reports') : api('/reports'),
      api(`/reports/${ticketId}/messages`).catch(() => []),
    ]);
    const currentTicket = Array.isArray(reportList) ? reportList.find((entry) => String(entry.id) === String(ticketId)) : null;
    setUser(me || null);
    setTicket(currentTicket || null);
    setResolution(String(currentTicket?.resolution_text || ''));
    setMessages(Array.isArray(thread) ? thread : []);
  };

  useEffect(() => {
    if (!router.isReady) return;
    let mounted = true;
    const boot = async () => {
      try {
        await loadTicket();
      } catch (err) {
        if (mounted) setError(err?.message || 'No se pudo cargar el ticket.');
      } finally {
        if (mounted) setReady(true);
      }
    };
    boot();
    return () => {
      mounted = false;
    };
  }, [router.isReady, ticketId]);

  useEffect(() => {
    if (!ready || !ticketId) return undefined;
    const timer = setInterval(() => {
      loadTicket().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [ready, ticketId, isAdmin]);

  useEffect(() => {
    if (!threadRef.current) return;
    requestAnimationFrame(() => {
      const node = threadRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length]);

  const sendMessage = async () => {
    const message = String(text || '').trim();
    if (!message || !ticketId) return;
    try {
      await api(`/reports/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setText('');
      setError('');
      await loadTicket();
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el mensaje del ticket.');
    }
  };

  const closeTicket = async (status) => {
    if (!ticketId || !isAdmin) return;
    try {
      await api(`/admin/reports/${ticketId}/${status}`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: String(resolution || '').trim() || 'Ticket revisado por administración.',
        }),
      });
      setNotice('El ticket se ha actualizado y el usuario recibirá el correo de resolución.');
      setError('');
      await loadTicket();
    } catch (err) {
      setError(err?.message || 'No se pudo cerrar el ticket.');
    }
  };

  const statusPill = useMemo(() => String(ticket?.status || 'open'), [ticket]);

  if (!ready) {
    return (
      <main className="social-shell account-shell">
        <section className="empty-state">
          <h2>Cargando ticket</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-page-shell ticket-page-shell">
      <section className="chat-page-header">
        <div className="brand">
          <button className="brand-mark" onClick={() => { window.location.href = isAdmin ? '/admin' : '/cuenta'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>{ticket?.ticket_number || `TCK-${ticketId}`}</h1>
              <span className={`status-pill ${statusPill === 'resolved' ? 'status-ok' : statusPill === 'dismissed' ? 'status-warning' : 'status-go'}`}>
                {statusPill}
              </span>
            </div>
            <p className="muted">{ticket?.reason || 'Incidencia'} · {ticket?.reported_plan?.title || 'Sin sala asociada'}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = isAdmin ? '/admin' : '/cuenta'; }}>
            Salir
          </button>
        </div>
      </section>

      <section className="chat-page-grid ticket-page-grid">
        <section className="chat-page-main ticket-main">
          <article className="chat-safety-banner chat-page-banner ticket-intro-card">
            <strong>Seguimiento del ticket</strong>
            <p>
              Este canal queda asociado al ticket y se conserva para revisión administrativa. No compartas datos sensibles innecesarios. Si existe riesgo inmediato, contacta con las autoridades competentes.
            </p>
          </article>

          <section className="chat-page-thread ticket-thread">
            <div className="chat-user-summary-grid">
              <article className="chat-user-summary-card">
                <strong>Ticket</strong>
                <span>{ticket?.ticket_number || `TCK-${ticketId}`}</span>
              </article>
              <article className="chat-user-summary-card">
                <strong>Estado</strong>
                <span>{ticket?.status || 'open'}</span>
              </article>
              <article className="chat-user-summary-card">
                <strong>Apertura</strong>
                <span>{fmtDate(ticket?.created_at)}</span>
              </article>
            </div>

            <div ref={threadRef} className="chat-page-messages ticket-thread-messages">
              {messages.length === 0 && (
                <article className="chat-empty-state">
                  <h3>Sin mensajes todavía</h3>
                  <p className="muted">El primer mensaje de seguimiento aparecerá aquí en cuanto alguna de las partes escriba.</p>
                </article>
              )}
              {messages.map((message) => (
                <div key={message.id} className="chat-message-row">
                  <img
                    className="chat-message-avatar"
                    src={getUserAvatar(message.author_role === 'admin' ? 'Admin' : user?.name || 'Usuario')}
                    alt={message.author_role === 'admin' ? 'Administrador' : 'Usuario'}
                  />
                  <article className="chat-bubble">
                    <div className="chat-bubble-head">
                      <strong>{message.author_role === 'admin' ? 'Administración' : 'Usuario reportante'}</strong>
                      <span className="chip">{message.author_role}</span>
                    </div>
                    <p>{message.message}</p>
                    <small>{fmtDate(message.created_at)}</small>
                  </article>
                </div>
              ))}
            </div>

            <div className="chat-page-compose chat-page-compose-sticky ticket-compose">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Escribe una actualización o una respuesta sobre el ticket..."
              />
              <button className="btn btn-primary" onClick={sendMessage}>
                Enviar
              </button>
            </div>

            {error && <p className="error-message">{error}</p>}
            {notice && <p className="auth-notice">{notice}</p>}
          </section>
        </section>

        <aside className="chat-page-side ticket-side">
          <section className="mini-card ticket-side-card">
            <h3>Estado y resolución</h3>
            <p className="muted">{ticket?.description || 'Sin descripción adicional.'}</p>
            <div className="post-meta-grid">
              <span>🎫 {ticket?.ticket_number || `TCK-${ticketId}`}</span>
              <span>🕒 {fmtDate(ticket?.created_at)}</span>
              <span>👤 {ticket?.reporter?.email || 'reportante'}</span>
              <span>📌 {ticket?.status || 'open'}</span>
            </div>
          </section>

          <section className="mini-card ticket-side-card">
            <h3>Resolución actual</h3>
            {isAdmin ? (
              <>
                <textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder="Escribe la resolución final que se enviará al usuario por correo al cerrar el ticket"
                />
                <div className="pill-row">
                  <button className="btn btn-primary" onClick={() => closeTicket('resolve')}>
                    Resolver
                  </button>
                  <button className="btn btn-ghost" onClick={() => closeTicket('dismiss')}>
                    Descartar
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">{ticket?.resolution_text || 'Todavía no hay resolución final publicada.'}</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

TicketPage.hideFooter = true;

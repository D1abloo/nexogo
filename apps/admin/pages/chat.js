import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const APP_NAME = 'NexoGo';
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';
const MIN_CHAT_AGE = 18;
const ADMIN_EMAILS = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'admin@nexogo.local')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const SITE_CHAT_STORAGE_PREFIX = 'nexogo_chat_space_';
const THREAT_NOTICE =
  'El uso de los chats está prohibido a menores de 18 años. No compartas datos sensibles ni contenido privado. Si detectas amenazas, coacciones o riesgo real, usa el aviso a moderación y contacta con las autoridades competentes de tu ciudad.';
const MARKET_SPOTLIGHT = [
  { id: 'm1', title: 'Entrada doble festival', detail: 'Entrega en mano, revisión del QR y cierre seguro en la ciudad.', tag: 'Eventos', price: '65 EUR', area: 'Centro' },
  { id: 'm2', title: 'Raqueta de pádel', detail: 'Estado muy bueno, prueba breve antes de pagar y entrega local.', tag: 'Deporte', price: '48 EUR', area: 'Norte' },
  { id: 'm3', title: 'Auriculares inalámbricos', detail: 'Se comprueban batería y sonido en el punto de encuentro.', tag: 'Tech', price: '39 EUR', area: 'Sur' },
  { id: 'm4', title: 'Chaqueta edición limitada', detail: 'Negociación abierta, fotos y talla verificadas por chat.', tag: 'Moda', price: '54 EUR', area: 'Centro' },
];
const MARKET_LANES = [
  { id: 'buy', title: 'Busco', detail: 'Publica qué necesitas, rango de precio y zona preferida.' },
  { id: 'sell', title: 'Vendo', detail: 'Aclara estado, precio, forma de entrega y si admites negociación.' },
  { id: 'swap', title: 'Intercambio', detail: 'Explica qué ofreces y qué aceptarías a cambio sin rodeos.' },
];
const MARKET_RULES = [
  'Describe estado, precio, entrega y método de pago antes de cerrar trato.',
  'No cierres operaciones bajo presión ni salgas del chat sin verificar a la otra parte.',
  'Si detectas fraude, acoso o insistencia indebida, reporta y corta la conversación.',
];
const THREAT_KEYWORDS = ['amenaza', 'matar', 'pegar', 'extorsion', 'coaccion', 'acoso', 'violencia', 'denuncia', 'riesgo'];
const QUICK_ROOM_PROMPTS = ['👋 Hola a todos', '📍 Ya voy', '⏰ Llego en 10 min', '🙌 Dentro', '🔥 Me apunto'];
const QUICK_GLOBAL_PROMPTS = ['👋 Hola, soy nuevo', '📌 ¿Qué planes hay hoy?', '☕ Busco café', '🏃 Me apunto a running', '💬 ¿Alguien disponible?'];
const QUICK_MARKET_PROMPTS = ['🛒 Busco entradas', '💼 Vendo artículo', '💰 Precio negociable', '📦 Entrega en mano', '✅ Producto disponible'];

function fmtDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString(DATE_LOCALE, {
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

function getProfileKey(entry) {
  return String(entry?.user_id || entry?.id || entry?.email || entry?.name || '')
    .trim()
    .toLowerCase();
}

function getStoredSpaceMessages(space) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${SITE_CHAT_STORAGE_PREFIX}${space}`);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function saveStoredSpaceMessages(space, entries) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${SITE_CHAT_STORAGE_PREFIX}${space}`, JSON.stringify(entries.slice(-120)));
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

export default function ChatPage() {
  const router = useRouter();
  const threadRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantText, setAssistantText] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [channel, setChannel] = useState('main');
  const [privateCode, setPrivateCode] = useState('');
  const [activeProfileId, setActiveProfileId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const planId = router.isReady && router.query.plan ? String(router.query.plan) : '';
  const space = router.isReady && String(router.query.space || '').toLowerCase() === 'market' ? 'market' : 'global';
  const requestedAdminView = router.isReady && String(router.query.admin_view || '') === '1';
  const isRegistered = Boolean(user?.id);
  const isAdmin = ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase()) || String(user?.role || '') === 'admin';
  const adminView = requestedAdminView && isAdmin;
  const userAge = getAgeFromBirthDate(user?.birth_date);
  const ageBlocked = !adminView && userAge !== null && userAge < MIN_CHAT_AGE;
  const isRoomChat = Boolean(planId);
  const pageTitle = isRoomChat ? (plan?.title || 'Sala') : space === 'market' ? 'Mercado social' : 'Chat virtual global';
  const quickPrompts = isRoomChat ? QUICK_ROOM_PROMPTS : space === 'market' ? QUICK_MARKET_PROMPTS : QUICK_GLOBAL_PROMPTS;
  const assistantSuggestions = isRoomChat
    ? ['¿Cómo entro?', '¿Qué normas tiene?', '¿Cuándo empieza?', '¿Cómo reporto una amenaza?']
    : space === 'market'
      ? ['¿Cómo vender seguro?', '¿Cómo reporto fraude?', '¿Qué puedo publicar aquí?', '¿Cómo evitar estafas?']
      : ['¿Cómo encontrar sala?', '¿Qué puedo preguntar aquí?', '¿Cómo funciona premium?', '¿Cómo reporto un problema?'];

  const loadSession = async () => {
    if (!supabase) {
      setUser(null);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const sessionUser = data?.session?.user || null;
    if (!sessionUser) {
      setUser(null);
      return;
    }
    try {
      const me = await api('/users/me');
      setUser({ ...sessionUser, ...(me || {}) });
    } catch {
      setUser(sessionUser);
    }
  };

  const loadPlanChat = async () => {
    if (!planId) return;
    const query = channel === 'private' ? `?channel=private&code=${encodeURIComponent(privateCode || '')}` : '';
    const [detail, reviewRows, messageRows] = await Promise.all([
      api(`/plans/${planId}`),
      api(`/plans/${planId}/reviews`).catch(() => []),
      api(`/plans/${planId}/messages${query}`),
    ]);
    setPlan(detail || null);
    const mergedParticipants = Array.isArray(detail?.participants) ? detail.participants : [];
    setParticipants(mergedParticipants);
    setReviews(Array.isArray(reviewRows) ? reviewRows : []);
    setMessages(Array.isArray(messageRows) ? messageRows : []);
    if (!activeProfileId) {
      setActiveProfileId(String(detail?.creator_id || mergedParticipants?.[0]?.user_id || ''));
    }
  };

  const loadSpaceChat = async () => {
    try {
      const list = await api(`/site-chat/messages?space=${encodeURIComponent(space)}`);
      const normalized = Array.isArray(list) ? list : [];
      setMessages(normalized);
      saveStoredSpaceMessages(space, normalized);
    } catch {
      setMessages(getStoredSpaceMessages(space));
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    let mounted = true;
    const boot = async () => {
      try {
        await loadSession();
      } finally {
        if (!mounted) return;
        setReady(true);
      }
    };
    boot();
    return () => {
      mounted = false;
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!ready) return;
    if (isRoomChat && !isRegistered && !adminView) return;
    const run = async () => {
      try {
        setError('');
        if (isRoomChat) {
          await loadPlanChat();
        } else {
          await loadSpaceChat();
        }
      } catch (err) {
        setError(err?.message || 'No se pudo abrir el chat.');
      }
    };
    run();
  }, [ready, isRoomChat, isRegistered, adminView, planId, channel, privateCode, space]);

  useEffect(() => {
    if (!ready) return undefined;
    if (isRoomChat && !isRegistered && !adminView) return undefined;
    const timer = setInterval(() => {
      if (isRoomChat) {
        loadPlanChat().catch(() => {});
      } else {
        loadSpaceChat().catch(() => {});
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [ready, isRoomChat, isRegistered, adminView, planId, channel, privateCode, space]);

  useEffect(() => {
    if (!threadRef.current) return;
    requestAnimationFrame(() => {
      const node = threadRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length]);

  useEffect(() => {
    const intro = isRoomChat
      ? 'Puedo ayudarte con acceso a la sala, normas, seguridad, horarios, premium y reportes.'
      : space === 'market'
        ? 'Puedo ayudarte con uso del mercado, seguridad, fraude, acceso y normas del chat.'
        : 'Puedo ayudarte con funcionamiento del chat, salas, premium, seguridad y reportes.';
    setAssistantMessages([
      {
        role: 'assistant',
        body: intro,
        created_at: new Date().toISOString(),
      },
    ]);
    setAssistantText('');
  }, [isRoomChat, planId, space]);

  const reviewMap = useMemo(() => {
    const map = new Map();
    for (const row of reviews) {
      const key = String(row.reviewed_user_id || '');
      if (!key) continue;
      const current = map.get(key) || { total: 0, sum: 0, positive: 0, neutral: 0, negative: 0, comments: [] };
      const rating = Number(row.rating || 0);
      current.total += 1;
      current.sum += rating;
      if (rating >= 4) current.positive += 1;
      else if (rating <= 2) current.negative += 1;
      else current.neutral += 1;
      if (row.comment) current.comments.push(row.comment);
      map.set(key, current);
    }
    return map;
  }, [reviews]);

  const visibleParticipants = useMemo(() => {
    const base = Array.isArray(participants) ? participants : [];
    if (!adminView) return base;
    return base.filter((entry) => String(entry.user_id || entry.id) !== String(user?.id || ''));
  }, [participants, adminView, user]);

  const visibleParticipantsCount = visibleParticipants.length;

  const profileCards = useMemo(() => {
    const hostCard =
      plan && plan.creator_id
        ? {
            user_id: plan.creator_id,
            name: plan.creator_name || 'Anfitrión',
            photo_url: plan.creator_photo || null,
            role: 'host',
          }
        : null;
    const base = hostCard ? [hostCard, ...visibleParticipants.filter((entry) => String(entry.user_id || '') !== String(hostCard.user_id))] : visibleParticipants;
    const unique = [];
    const seen = new Set();
    for (const item of base) {
      const key = getProfileKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [plan, visibleParticipants]);

  const visibleProfileCount = profileCards.length;

  const selectedProfile = useMemo(() => {
    const fallback = profileCards[0] || null;
    return profileCards.find((entry) => String(entry.user_id || entry.id) === String(activeProfileId || '')) || fallback;
  }, [profileCards, activeProfileId]);

  const selectedProfileStats = useMemo(() => {
    if (!selectedProfile) return null;
    const summary = reviewMap.get(String(selectedProfile.user_id || selectedProfile.id || '')) || {
      total: 0,
      sum: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      comments: [],
    };
    const avg = summary.total ? (summary.sum / summary.total).toFixed(1) : 'Sin valorar';
    return { ...summary, avg };
  }, [selectedProfile, reviewMap]);

  const adminStats = useMemo(() => {
    if (!adminView) return null;
    let privateCount = 0;
    let flaggedCount = 0;
    let imageCount = 0;
    const authors = new Set();
    for (const row of messages) {
      if (String(row.channel || 'main') === 'private') privateCount += 1;
      if (row.image_url) imageCount += 1;
      if (row.user_id || row.author_name) authors.add(String(row.user_id || row.author_name));
      const text = String(row.message || '').toLowerCase();
      if (THREAT_KEYWORDS.some((word) => text.includes(word))) flaggedCount += 1;
    }
    return {
      total: messages.length,
      privateCount,
      imageCount,
      flaggedCount,
      authors: authors.size,
      lastMessageAt: messages.length ? messages[messages.length - 1]?.created_at : null,
    };
  }, [adminView, messages]);

  const sendMessage = async () => {
    const text = String(messageText || '').trim();
    if (!text || adminView) return;

    if (isRoomChat) {
      try {
        const query = channel === 'private' ? `?channel=private&code=${encodeURIComponent(privateCode || '')}` : '';
        await api(`/plans/${planId}/messages${query}`, {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            code: privateCode || '',
          }),
        });
        setMessageText('');
        setError('');
        await loadPlanChat();
      } catch (err) {
        setError(err?.message || 'No se pudo enviar el mensaje.');
      }
      return;
    }

    const fallbackEntry = {
      id: `space-${Date.now()}`,
      author_name: user?.name || 'Invitado',
      author_role: isRegistered ? 'user' : 'guest',
      message: text,
      created_at: new Date().toISOString(),
      space,
    };

    try {
      const payload = await api(`/site-chat/messages?space=${encodeURIComponent(space)}`, {
        method: 'POST',
        body: JSON.stringify({
          author_name: fallbackEntry.author_name,
          message: text,
          space,
        }),
      });
      const next = [...messages, payload?.message || fallbackEntry].slice(-120);
      setMessages(next);
      saveStoredSpaceMessages(space, next);
      setMessageText('');
      setError('');
    } catch {
      const next = [...getStoredSpaceMessages(space), fallbackEntry].slice(-120);
      setMessages(next);
      saveStoredSpaceMessages(space, next);
      setMessageText('');
    }
  };

  const sendThreatReport = async () => {
    if (!isRegistered) {
      setNotice('Debes registrarte para enviar incidencias al equipo de moderación.');
      return;
    }
    const payload = isRoomChat
      ? {
          reported_plan_id: planId,
          reported_user_id: plan?.creator_id || null,
          reason: 'amenazas',
          description: 'Incidencia enviada desde el acceso rápido del chat.',
        }
      : {
          reason: space === 'market' ? 'incidencia mercado' : 'incidencia chat virtual',
          description:
            space === 'market'
              ? 'Incidencia enviada desde el mercado social para revisión administrativa.'
              : 'Incidencia enviada desde el chat virtual global para revisión administrativa.',
        };
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNotice('La incidencia se ha enviado al equipo de moderación y ha quedado registrada como ticket.');
      setError('');
    } catch (err) {
      setError(err?.message || 'No se pudo enviar la alerta de moderación.');
    }
  };

  const sendAssistantQuestion = async (preset = '') => {
    const question = String(preset || assistantText || '').trim();
    if (!question) return;

    const nextMessages = [
      ...assistantMessages,
      {
        role: 'user',
        body: question,
        created_at: new Date().toISOString(),
      },
    ];

    setAssistantMessages(nextMessages);
    setAssistantText('');
    setAssistantLoading(true);

    try {
      const response = await api('/assistant/chat', {
        method: 'POST',
        showLoader: false,
        body: JSON.stringify({
          message: question,
          space,
          room: isRoomChat
            ? {
                id: plan?.id || planId,
                title: plan?.title,
                city: plan?.city,
                place_name: plan?.place_name,
                visibility: plan?.visibility,
                premium_room: plan?.premium_room,
                rules: plan?.rules,
                start_at: plan?.start_at,
                max_people: plan?.max_people,
                participants_count: adminView ? visibleProfileCount : visibleParticipantsCount,
              }
            : null,
          history: nextMessages.slice(-8),
        }),
      });

      setAssistantMessages([
        ...nextMessages,
        {
          role: 'assistant',
          body: String(response?.reply || 'No tengo una respuesta útil para ese contexto ahora mismo.'),
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setAssistantMessages([
        ...nextMessages,
        {
          role: 'assistant',
          body: err?.message || 'No pude responder ahora mismo. Prueba con una pregunta sobre acceso, normas, seguridad, premium o salas.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push('/');
  };

  const gateBlocked = ready && isRoomChat && !isRegistered && !adminView;

  if (!ready) {
    return (
      <main className="chat-page-shell">
        <section className="empty-state brand-panel-loader brand-panel-loader-chat">
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

  return (
    <main className="chat-page-shell">
      <section className="chat-page-header">
        <div className="brand">
          <button className="brand-mark" onClick={goBack}>
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>{pageTitle}</h1>
              {isRoomChat && plan?.premium_room && <span className="premium-badge premium-badge-inline">P</span>}
            </div>
            <p className="muted">
              {isRoomChat
                ? `${plan?.place_name || 'Sala'} · ${plan?.city || 'Ciudad'} · ${adminView ? 'supervisión oculta' : 'acceso en vivo'}`
                : space === 'market'
                  ? 'Canal abierto para compra, venta y búsqueda de artículos.'
                  : 'Espacio general abierto para invitados y usuarios registrados.'}
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          {!isRoomChat && (
            <button
              className="btn btn-ghost"
              onClick={() => router.push(space === 'market' ? '/mercado' : '/chat?space=market')}
            >
              {space === 'market' ? 'Ver anuncios' : 'Ir al mercado'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={goBack}>
            Volver
          </button>
        </div>
      </section>

      {gateBlocked || ageBlocked ? (
        <section className="chat-gate-card">
          <h2>{ageBlocked ? 'Acceso restringido' : 'Debes registrarte para entrar en esta sala'}</h2>
          <p className="muted">
            {ageBlocked
              ? 'Los chats y el mercado social están reservados a personas mayores de 18 años.'
              : 'El acceso al chat de salas requiere cuenta registrada. El chat virtual general y el mercado siguen abiertos fuera de las salas privadas.'}
          </p>
          <div className="pill-row">
            <button className="btn btn-primary" onClick={() => router.push('/')}>{ageBlocked ? 'Volver al inicio' : 'Ir al registro'}</button>
            {!ageBlocked && <button className="btn btn-ghost" onClick={() => router.push('/chat?space=global')}>Abrir chat virtual</button>}
          </div>
        </section>
      ) : (
        <section className="chat-page-grid">
          <section className="chat-page-main">
            <section className="chat-page-thread">
              <article className="chat-safety-banner chat-thread-alert">
                <div className="chat-thread-alert-copy">
                  <strong>Seguridad y convivencia</strong>
                  <p>{THREAT_NOTICE}</p>
                </div>
                <div className="chat-safety-actions">
                  {(isRoomChat || space === 'global' || space === 'market') && (
                    <button className="btn btn-danger btn-inline" onClick={sendThreatReport}>
                      {isRoomChat ? 'Avisar moderación' : 'Reportar incidencia'}
                    </button>
                  )}
                  <span className="muted">
                    {adminView
                      ? 'Modo supervisor oculto activo. Los participantes no ven esta revisión.'
                      : 'Usa el chat con criterio y no compartas datos personales por impulso.'}
                  </span>
                </div>
              </article>

              <div className="chat-page-strip">
                <span className="chip">{messages.length} mensajes</span>
                {isRoomChat && <span className="chip">{adminView ? visibleProfileCount : visibleParticipantsCount} participantes visibles</span>}
                {isRoomChat && plan?.visibility === 'private' && <span className="chip chip-private">🔒 Privada</span>}
                {isRoomChat && plan?.premium_room && <span className="chip chip-pending">👑 Premium</span>}
                {channel === 'private' && <span className="chip chip-owner">Canal privado</span>}
              </div>

              {!adminView && (
                <section className="chat-user-summary-grid">
                  <article className="chat-user-summary-card">
                    <strong>{isRoomChat ? 'Sala activa' : space === 'market' ? 'Canal de compra/venta' : 'Canal abierto'}</strong>
                    <span>
                      {isRoomChat
                        ? `${plan?.place_name || 'Encuentro social'} · ${plan?.city || 'Sin ciudad'}`
                        : space === 'market'
                          ? 'Compra, venta y búsqueda de artículos con aviso de seguridad.'
                          : 'Presentaciones, coordinación rápida y dudas generales.'}
                    </span>
                  </article>
                  <article className="chat-user-summary-card">
                    <strong>{isRoomChat ? 'Acceso' : 'Estado'}</strong>
                    <span>
                      {isRoomChat
                        ? `${plan?.visibility === 'private' ? 'Privado' : 'Público'}${plan?.premium_room ? ' · premium' : ''}`
                        : space === 'market'
                          ? 'Mercado moderado'
                          : 'Chat general moderado'}
                    </span>
                  </article>
                  <article className="chat-user-summary-card">
                    <strong>{isRoomChat ? 'Participación' : 'Actividad'}</strong>
                    <span>
                      {isRoomChat
                        ? `${visibleParticipantsCount} visibles · ${channel === 'private' ? 'canal privado' : 'canal general'}`
                        : space === 'market'
                          ? 'Compra, venta e intercambio moderados'
                          : `${messages.length} mensajes visibles`}
                    </span>
                  </article>
                </section>
              )}

              {adminView && adminStats && (
                <section className="chat-admin-summary-grid">
                  <article className="chat-admin-summary-card">
                    <strong>{adminStats.total}</strong>
                    <span>Mensajes revisables</span>
                  </article>
                  <article className="chat-admin-summary-card">
                    <strong>{adminStats.privateCount}</strong>
                    <span>Mensajes privados</span>
                  </article>
                  <article className="chat-admin-summary-card">
                    <strong>{adminStats.imageCount}</strong>
                    <span>Adjuntos</span>
                  </article>
                  <article className="chat-admin-summary-card">
                    <strong>{adminStats.flaggedCount}</strong>
                    <span>Alertas por palabras sensibles</span>
                  </article>
                </section>
              )}

              {isRoomChat && plan?.private_chat_enabled && (
                <div className="chat-page-controls">
                  <div className="pill-row">
                    <button className={`btn ${channel === 'main' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChannel('main')}>
                      General
                    </button>
                    <button className={`btn ${channel === 'private' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setChannel('private')}>
                      Privado
                    </button>
                  </div>
                  {channel === 'private' && !adminView && (
                    <input
                      value={privateCode}
                      onChange={(event) => setPrivateCode(event.target.value)}
                      placeholder="Código del canal privado"
                    />
                  )}
                </div>
              )}

              <div ref={threadRef} className="chat-page-messages">
                {messages.length === 0 && (
                  <article className="chat-empty-state">
                    <h3>{adminView ? 'Sin conversación registrada' : 'Todavía no hay mensajes en este canal'}</h3>
                    <p className="muted">
                      {adminView
                        ? 'La supervisión queda lista. En cuanto entren mensajes, aparecerán aquí sin mostrar al administrador.'
                        : 'El canal está preparado para coordinar y conversar sin salir de la plataforma.'}
                    </p>
                  </article>
                )}
                {messages.map((message) => {
                  const mine = isRoomChat ? String(message.user_id || '') === String(user?.id || '') : false;
                  return (
                    <div key={message.id || `${message.author_name}-${message.created_at}`} className={`chat-message-row ${mine ? 'chat-message-row-mine' : ''}`}>
                      {!mine && (
                        <img
                          className="chat-message-avatar"
                          src={getUserAvatar(message.user_name || message.author_name || 'Usuario')}
                          alt={message.user_name || message.author_name || 'Usuario'}
                        />
                      )}
                      <article className={`chat-bubble ${mine ? 'chat-mine' : ''}`}>
                        <div className="chat-bubble-head">
                          <strong>{message.user_name || message.author_name || 'Usuario'}</strong>
                          <span className="chip">
                            {isRoomChat ? (String(message.channel || 'main') === 'private' ? 'Privado' : 'General') : space === 'market' ? 'Mercado' : 'Global'}
                          </span>
                        </div>
                        <p>{message.message}</p>
                        {message.image_url && <img className="chat-image" src={message.image_url} alt="Adjunto del chat" />}
                        <small>{fmtDate(message.created_at)}</small>
                      </article>
                    </div>
                  );
                })}
              </div>

              {adminView ? (
                <div className="chat-admin-actions">
                  <button className="btn btn-danger" onClick={sendThreatReport}>
                    Escalar alerta
                  </button>
                  <button className="btn btn-ghost" onClick={() => loadPlanChat()}>
                    Actualizar
                  </button>
                  <div className="chat-admin-actions-copy">
                    <strong>Supervisor oculto activo</strong>
                    <span>Sin presencia visible, sin escritura y sin alterar el recuento público.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="chat-quick-prompts">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        className="chip chip-action"
                        onClick={() => setMessageText((current) => `${current}${current ? ' ' : ''}${prompt}`)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="chat-page-compose chat-page-compose-sticky">
                    <textarea
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      placeholder={
                        isRoomChat
                          ? 'Escribe en la sala...'
                          : space === 'market'
                            ? 'Publica lo que buscas o vendes...'
                            : 'Escribe en el chat general...'
                      }
                    />
                    <button className="btn btn-primary" onClick={sendMessage}>
                      Enviar
                    </button>
                  </div>
                </>
              )}

              {error && <p className="error-message">{error}</p>}
              {notice && <p className="auth-notice">{notice}</p>}
            </section>
          </section>

          <aside className="chat-page-side">
            {isRoomChat ? (
              <>
                <section className="mini-card">
                  <h3>Información de la sala</h3>
                  <p className="muted">{plan?.description || 'Sin descripción adicional.'}</p>
                  <div className="post-meta-grid">
                    <span>📍 {plan?.place_name || 'Sin lugar'}</span>
                    <span>🕒 {fmtDate(plan?.start_at)}</span>
                    <span>👥 {adminView ? visibleProfileCount : visibleParticipantsCount}/{plan?.max_people || 0}</span>
                    <span>🌍 {plan?.city || 'Sin ciudad'}</span>
                  </div>
                </section>

                {adminView && adminStats && (
                  <section className="mini-card">
                    <h3>Control de supervisión</h3>
                    <div className="chat-admin-side-grid">
                      <div>
                        <strong>{adminStats.authors}</strong>
                        <span>Autores detectados</span>
                      </div>
                      <div>
                        <strong>{adminStats.lastMessageAt ? fmtDate(adminStats.lastMessageAt) : 'Sin actividad'}</strong>
                        <span>Último movimiento</span>
                      </div>
                      <div>
                        <strong>{plan?.visibility === 'private' ? 'Privada' : 'Pública'}</strong>
                        <span>Visibilidad</span>
                      </div>
                      <div>
                        <strong>{plan?.premium_room ? 'Premium' : 'Free'}</strong>
                        <span>Acceso comercial</span>
                      </div>
                    </div>
                    <ul className="policy-list">
                      <li>Supervisión invisible durante todo el análisis.</li>
                      <li>Escala primero si hay amenaza, coacción o fraude.</li>
                      <li>Conserva el hilo antes de cerrar la sala o bloquear.</li>
                    </ul>
                  </section>
                )}

                <section className="mini-card">
                  <h3>Asistente del chat</h3>
                  <p className="muted">Responde solo sobre salas, acceso, seguridad, premium, reportes y uso del chat.</p>
                  <div className="chat-assistant-history">
                    {assistantMessages.map((entry, index) => (
                      <article
                        key={`${entry.role}-${entry.created_at || index}`}
                        className={`chat-assistant-entry ${entry.role === 'user' ? 'chat-assistant-entry-user' : ''}`}
                      >
                        <strong>{entry.role === 'user' ? 'Tú' : 'Asistente'}</strong>
                        <p>{entry.body}</p>
                      </article>
                    ))}
                    {assistantLoading && (
                      <article className="chat-assistant-entry">
                        <strong>Asistente</strong>
                        <p>Preparando una respuesta útil para este chat...</p>
                      </article>
                    )}
                  </div>
                  <div className="chat-assistant-shortcuts">
                    {assistantSuggestions.map((item) => (
                      <button key={item} className="chip chip-action" onClick={() => sendAssistantQuestion(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="chat-assistant-compose">
                    <textarea
                      value={assistantText}
                      onChange={(event) => setAssistantText(event.target.value)}
                      placeholder="Pregunta algo sobre acceso, normas, seguridad, premium o funcionamiento..."
                    />
                    <button className="btn btn-secondary" onClick={() => sendAssistantQuestion()} disabled={assistantLoading}>
                      Preguntar
                    </button>
                  </div>
                </section>

                <section className="mini-card">
                  <h3>Perfiles y reseñas</h3>
                  <div className="chat-profile-list">
                    {profileCards.map((entry) => (
                      <button
                        key={entry.user_id || entry.id}
                        className={`chat-profile-chip ${String(activeProfileId || '') === String(entry.user_id || entry.id) ? 'chat-profile-chip-active' : ''}`}
                        onClick={() => setActiveProfileId(String(entry.user_id || entry.id || ''))}
                      >
                        <img src={getUserAvatar(entry.photo_url || entry.name)} alt={entry.name || 'Usuario'} />
                        <span>{entry.name || 'Usuario'}</span>
                      </button>
                    ))}
                  </div>
                  {selectedProfile && selectedProfileStats && (
                    <article className="chat-profile-card">
                      <div className="chat-profile-head">
                        <img src={getUserAvatar(selectedProfile.photo_url || selectedProfile.name)} alt={selectedProfile.name || 'Usuario'} />
                        <div>
                          <h4>{selectedProfile.name || 'Usuario'}</h4>
                          <p className="muted">{selectedProfile.role || 'participant'} · {selectedProfileStats.avg} ⭐</p>
                        </div>
                      </div>
                      <div className="chat-review-grid">
                        <div><strong>{selectedProfileStats.positive}</strong><span>Buenas</span></div>
                        <div><strong>{selectedProfileStats.neutral}</strong><span>Neutras</span></div>
                        <div><strong>{selectedProfileStats.negative}</strong><span>Malas</span></div>
                        <div><strong>{selectedProfileStats.total}</strong><span>Total</span></div>
                      </div>
                      <div className="chat-review-comments">
                        {(selectedProfileStats.comments || []).slice(0, 3).map((comment, index) => (
                          <p key={`${selectedProfile.user_id}-${index}`}>{comment}</p>
                        ))}
                        {selectedProfileStats.comments.length === 0 && <p className="muted">Sin comentarios todavía.</p>}
                      </div>
                    </article>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="mini-card">
                  <h3>{space === 'market' ? 'Mercado social' : 'Chat virtual abierto'}</h3>
                  <p className="muted">
                    {space === 'market'
                      ? 'Negocia artículos, tickets y objetos locales con foco en trato claro, revisión previa y cierre seguro.'
                      : 'Espacio abierto para saludar, resolver dudas y moverte luego a salas concretas.'}
                  </p>
                </section>
                <section className="mini-card">
                  <h3>{space === 'market' ? 'Tablón de negociación' : 'Normas rápidas'}</h3>
                  {space === 'market' ? (
                    <>
                      <div className="market-lane-grid">
                        {MARKET_LANES.map((item) => (
                          <article key={item.id} className="market-lane-card">
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </article>
                        ))}
                      </div>
                      <div className="chat-market-grid">
                        {MARKET_SPOTLIGHT.map((item) => (
                          <article key={item.id} className="chat-market-card">
                            <div className="chat-market-card-head">
                              <strong>{item.title}</strong>
                              <span className="chip">{item.tag}</span>
                            </div>
                            <p>{item.detail}</p>
                            <div className="chat-market-card-meta">
                              <span>{item.price}</span>
                              <span>{item.area}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                      <ul className="policy-list market-policy-list">
                        {MARKET_RULES.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <ul className="policy-list">
                      <li>El uso del chat está reservado a mayores de 18 años.</li>
                      <li>No compartas datos privados ni contactos externos sin consentimiento.</li>
                      <li>Las amenazas, coacciones o estafas deben reportarse de inmediato.</li>
                      <li>Las temáticas sensibles solo pueden moverse a espacios premium y moderados.</li>
                    </ul>
                  )}
                </section>
              </>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}

ChatPage.hideFooter = true;

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { appendLocalThreadMessage, getLocalMessagesByThread, getLocalThreadById } from '../../../lib/marketplace-chat-demo';
import { formatMoney } from '../../../lib/marketplace-demo';

const SAFETY_NOTE = 'Chat privado de negociación. No compartas datos bancarios ni cierres tratos fuera de un entorno seguro. Si detectas fraude o presión, corta la conversación y reporta.';

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers, cache: 'no-store' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
  return payload;
}

export default function MercadoThreadPage() {
  const router = useRouter();
  const threadRef = useRef(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [user, setUser] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSession = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!router.isReady || !router.query.threadId) return;
    const load = async () => {
      try {
        const [threadPayload, messagePayload] = await Promise.all([
          api(`/api/marketplace/threads/${encodeURIComponent(String(router.query.threadId))}`),
          api(`/api/marketplace/threads/${encodeURIComponent(String(router.query.threadId))}/messages`),
        ]);
        setThread(threadPayload);
        setMessages(Array.isArray(messagePayload) ? messagePayload : []);
      } catch {
        const localThread = getLocalThreadById(router.query.threadId);
        if (!localThread) {
          setError('No se encontró la conversación.');
          return;
        }
        setThread({ ...localThread, item: { title: localThread.title, image_url: localThread.image_url, price_amount: localThread.price_amount, currency: localThread.currency, city: localThread.city } });
        setMessages(getLocalMessagesByThread(router.query.threadId));
      }
    };
    load();
  }, [router.isReady, router.query.threadId]);

  useEffect(() => {
    if (!router.isReady || !router.query.threadId) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api(`/api/marketplace/threads/${encodeURIComponent(String(router.query.threadId))}/messages`);
        setMessages(Array.isArray(next) ? next : []);
      } catch {
        setMessages(getLocalMessagesByThread(router.query.threadId));
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [router.isReady, router.query.threadId]);

  useEffect(() => {
    if (!threadRef.current) return;
    requestAnimationFrame(() => {
      threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length]);

  const send = async () => {
    const body = String(text || '').trim();
    if (!body || !thread) return;
    try {
      const payload = await api(`/api/marketplace/threads/${encodeURIComponent(String(thread.id))}/messages`, { method: 'POST', body: JSON.stringify({ message: body }) });
      setMessages((current) => [...current, payload]);
      setText('');
      setError('');
    } catch {
      const localMessage = {
        id: `local-msg-${Date.now()}`,
        thread_id: thread.id,
        author_user_id: user?.id || 'local-user',
        author_name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario',
        message: body,
        created_at: new Date().toISOString(),
      };
      setMessages(appendLocalThreadMessage(thread.id, localMessage));
      setText('');
    }
  };

  const counterpart = useMemo(() => {
    if (!thread || !user) return null;
    if (String(thread.seller_user_id) === String(user.id)) return thread.buyer || null;
    return thread.seller || null;
  }, [thread, user]);

  if (error) {
    return <main className="market-shell"><section className="market-compose-card"><h1>Error</h1><p>{error}</p></section></main>;
  }

  if (!thread) {
    return <main className="market-shell"><section className="brand-panel-loader brand-panel-loader-chat"><div className="brand-loader-mark">NG</div></section></main>;
  }

  return (
    <main className="market-shell">
      <section className="market-thread-hero">
        <div>
          <span className="chip chip-owner">Chat del anuncio</span>
          <h1>{thread.item?.title || thread.title || 'Conversación de mercado'}</h1>
          <p className="muted">{SAFETY_NOTE}</p>
        </div>
        <div className="pill-row">
          <Link href={`/mercado/${thread.item_id || thread.item?.id || ''}`} className="btn btn-ghost">Ver anuncio</Link>
          {thread.seller_user_id && <Link href={`/mercado/perfil/${thread.seller_user_id}`} className="btn btn-ghost">Ver vendedor</Link>}
          <Link href={`/mercado/${thread.item_id || thread.item?.id || ''}#market-report-card`} className="btn btn-danger">Reportar</Link>
        </div>
      </section>

      <section className="market-thread-grid">
        <section className="market-thread-main">
          <article className="chat-safety-banner compact-market-banner">
            <strong>Negociación protegida</strong>
            <p>{SAFETY_NOTE}</p>
          </article>
          <div ref={threadRef} className="market-thread-messages">
            {messages.length === 0 && (
              <article className="chat-empty-state">
                <h3>Empieza la conversación</h3>
                <p className="muted">Aclara precio, estado, entrega y condiciones antes de seguir fuera del chat.</p>
              </article>
            )}
            {messages.map((message) => {
              const mine = String(message.author_user_id || '') === String(user?.id || '');
              return (
                <div key={message.id} className={`chat-message-row ${mine ? 'chat-message-row-mine' : ''}`}>
                  {!mine && <img className="chat-message-avatar" src={message.author_photo || 'https://ui-avatars.com/api/?name=Usuario&background=1d4ed8&color=ffffff&bold=true'} alt={message.author_name || 'Usuario'} />}
                  <article className={`chat-bubble ${mine ? 'chat-mine' : ''}`}>
                    <div className="chat-bubble-head">
                      <strong>{message.author_name || 'Usuario'}</strong>
                      <span className="chip">Negociación</span>
                    </div>
                    <p>{message.message}</p>
                    <small>{new Date(message.created_at).toLocaleString('es-ES')}</small>
                  </article>
                </div>
              );
            })}
          </div>
          <div className="chat-quick-prompts">
            {['¿Sigue disponible?', '¿Aceptas oferta?', '¿Dónde entregas?', '¿Puedes enviar más fotos?'].map((prompt) => (
              <button key={prompt} className="chip chip-action" onClick={() => setText((current) => `${current}${current ? ' ' : ''}${prompt}`)}>{prompt}</button>
            ))}
          </div>
          <div className="chat-page-compose chat-page-compose-sticky">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe al comprador o vendedor..." />
            <button className="btn btn-primary" onClick={send}>Enviar</button>
          </div>
        </section>

        <aside className="market-thread-side">
          <section className="mini-card">
            <h3>Artículo</h3>
            <div className="market-thread-item-card">
              <img src={thread.item?.image_url || 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=900&q=80'} alt={thread.item?.title || thread.title} />
              <div>
                <strong>{thread.item?.title || thread.title}</strong>
                <p className="muted">{formatMoney(thread.item || thread)}</p>
                <span className="chip chip-pending">{thread.item?.city || thread.city || 'Sin ciudad'}</span>
              </div>
            </div>
          </section>
          <section className="mini-card">
            <h3>Interlocutor</h3>
            <div className="chat-profile-head">
              <img src={counterpart?.photo_url || counterpart?.seller_photo || 'https://ui-avatars.com/api/?name=Usuario&background=1d4ed8&color=ffffff&bold=true'} alt={counterpart?.name || 'Usuario'} />
              <div>
                <h4>{counterpart?.name || 'Usuario'}</h4>
                <p className="muted">{counterpart?.city || 'Sin ciudad'}</p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

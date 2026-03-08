import crypto from 'crypto';
import Stripe from 'stripe';
import { ADMIN_EMAILS, serverSupabase } from '../../../lib/server-supabase';
import {
  sendGuestAccessApprovedEmail,
  sendGuestAccessRejectedEmail,
  sendGuestAccessRequestAdminEmail,
  sendPlanClosedEmail,
  sendPremiumConditionsEmail,
  sendProfileChangeAlertEmail,
  sendReportAlertEmail,
  sendReportResolutionEmail,
  sendSubscriptionStatusEmail,
} from '../../../lib/mailer';
import { getPremiumPlanQuote } from '../../../lib/premium';

const DEFAULT_COORDS = { lat: 40.4168, lng: -3.7038 };
const DEFAULT_CITY = 'Madrid';
const DEFAULT_COUNTRY = 'España';
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_CHAT_ASSISTANT_MODEL = process.env.OPENAI_CHAT_ASSISTANT_MODEL || 'gpt-4.1-mini';
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const TURNSTILE_SECRET_KEY =
  process.env.TURNSTILE_SECRET_KEY || (process.env.NODE_ENV !== 'production' ? TURNSTILE_TEST_SECRET : '');
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ACTIVE_PLAN_STATUSES = new Set(['active', 'full', 'in_progress']);
const VISIBLE_PARTICIPANT_STATUSES = new Set(['pending', 'accepted', 'attended']);
const CHAT_PARTICIPANT_STATUSES = new Set(['accepted', 'attended']);
const COUNTED_PARTICIPANT_STATUSES = new Set(['accepted', 'attended']);
const CATEGORY_ALIASES = {
  cafe: 'cafe',
  paseo: 'walk',
  walk: 'walk',
  terraceo: 'terrace',
  terrace: 'terrace',
  running: 'running',
  futbol: 'sports',
  paddle: 'sports',
  sports: 'sports',
  estudiar: 'study',
  study: 'study',
  coworking: 'coworking',
  gaming: 'gaming',
  idiomas: 'languages',
  languages: 'languages',
  fiesta: 'music_event',
  concierto: 'music_event',
  cultural: 'music_event',
  music_event: 'music_event',
};

function normalizeCategoryKey(value) {
  return CATEGORY_ALIASES[String(value || '').trim().toLowerCase()] || 'cafe';
}

function isAdultRoomLevel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['sexo-adulto', 'adultos-18'].includes(normalized) || normalized.includes('adult') || normalized.includes('sexo') || normalized.includes('18+');
}

const ADULT_ROOM_NOTICE = 'Solo adultos, consentimiento expreso y cero tolerancia a presión, coacción o actividad ilegal.';
const SITE_CHAT_SPACE_PREFIX = {
  market: '[market]',
};

function normalizeSiteChatSpace(value) {
  return String(value || '').trim().toLowerCase() === 'market' ? 'market' : 'global';
}

const CHAT_ASSISTANT_RELEVANT_TERMS = [
  'chat', 'sala', 'plan', 'grupo', 'mensaje', 'mensajes', 'privado', 'privada', 'codigo', 'código',
  'premium', 'acceso', 'entrar', 'unirme', 'unir', 'aforo', 'plazas', 'hora', 'cuando', 'cuándo',
  'ubicacion', 'ubicación', 'direccion', 'dirección', 'mapa', 'lugar', 'norma', 'regla', 'seguridad',
  'amenaza', 'denuncia', 'reporte', 'reportar', 'moderacion', 'moderación', 'perfil', 'reseña', 'resena',
  'valoracion', 'valoración', 'host', 'anfitrion', 'anfitrión', 'mercado', 'comprar', 'vender',
  'articulo', 'artículo', 'suscripcion', 'suscripción', 'free', 'plus', 'pro',
];

function sanitizeAssistantText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isChatAssistantTopicRelevant(message) {
  const normalized = sanitizeAssistantText(message).toLowerCase();
  if (!normalized) return false;
  return CHAT_ASSISTANT_RELEVANT_TERMS.some((term) => normalized.includes(term));
}

function buildChatAssistantReply(body) {
  const message = sanitizeAssistantText(body.message).toLowerCase();
  const room = body.room && typeof body.room === 'object' ? body.room : {};
  const space = normalizeSiteChatSpace(body.space || body.room?.space || 'global');
  const roomName = String(room.title || room.name || 'la sala');
  const roomCity = String(room.city || DEFAULT_CITY);
  const roomPlace = String(room.place_name || room.place || 'el punto indicado');
  const roomRules = String(room.rules || 'Respeta a los participantes, evita datos sensibles y mantén la coordinación dentro del chat.');
  const roomVisibility = String(room.visibility || 'public');
  const roomPremium = Boolean(room.premium_room);
  const roomStart = room.start_at ? new Date(room.start_at).toLocaleString('es-ES', {
    timeZone: DATE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) : null;
  const roomCapacity = room.max_people ? Number(room.max_people) : null;
  const roomParticipants = room.participants_count ? Number(room.participants_count) : null;

  if (['hola', 'buenas', 'hello', 'hi'].includes(message)) {
    return {
      reply:
        'Hola. Puedo ayudarte con acceso a salas, normas, seguridad, premium, reportes, mercado y funcionamiento del chat. Dime qué necesitas dentro de ese contexto.',
    };
  }

  if (!isChatAssistantTopicRelevant(message)) {
    return {
      reply:
        'Solo puedo ayudarte con temas del chat, acceso a salas, normas, seguridad, perfiles, premium, mercado y funcionamiento de la plataforma.',
    };
  }

  if (message.includes('amenaza') || message.includes('denuncia') || message.includes('reporte') || message.includes('reportar') || message.includes('moderacion') || message.includes('moderación')) {
    return {
      reply:
        'Si detectas amenaza, coacción, fraude o acoso, usa el aviso a moderación dentro del chat o crea un ticket. Evita seguir conversando fuera de la plataforma y, si hay riesgo real, contacta con las autoridades competentes.',
    };
  }

  if (message.includes('hora') || message.includes('cuando') || message.includes('cuándo') || message.includes('empieza')) {
    return {
      reply: roomStart
        ? `${roomName} está programada para ${roomStart}. Si vas justo, avisa en el chat antes de llegar.`
        : 'No tengo una hora confirmada en este contexto. Revisa la ficha de la sala o pregunta al anfitrión dentro del chat.',
    };
  }

  if (message.includes('ubicacion') || message.includes('ubicación') || message.includes('direccion') || message.includes('dirección') || message.includes('mapa') || message.includes('lugar')) {
    return {
      reply: `${roomName} tiene como referencia ${roomPlace}, ${roomCity}. Si necesitas más detalle, confirma el punto exacto dentro del chat antes de desplazarte.`,
    };
  }

  if (message.includes('norma') || message.includes('regla') || message.includes('seguridad')) {
    return {
      reply: `Normas recomendadas para ${roomName}: ${roomRules}`,
    };
  }

  if (message.includes('aforo') || message.includes('plazas') || message.includes('grupo') || message.includes('participantes')) {
    return {
      reply:
        roomCapacity !== null
          ? `${roomName} lleva ${roomParticipants || 0}/${roomCapacity} plazas ocupadas.`
          : 'No tengo un aforo cerrado en este contexto. Revisa la ficha de la sala para ver la ocupación actual.',
    };
  }

  if (message.includes('privado') || message.includes('privada') || message.includes('codigo') || message.includes('código') || message.includes('acceso') || message.includes('entrar') || message.includes('unirme')) {
    const privateReply = roomVisibility === 'private'
      ? 'Es una sala privada. Necesitas aprobación del anfitrión y, si tiene código, introducirlo antes de acceder.'
      : 'Es una sala pública. Si además es premium, debes tener plan activo; si tiene código o revisión manual, la entrada puede requerir un paso extra.';
    const premiumReply = roomPremium
      ? ' Además, esta sala está marcada como premium y solo la pueden ver o usar cuentas con suscripción operativa.'
      : '';
    return { reply: `${privateReply}${premiumReply}` };
  }

  if (message.includes('premium') || message.includes('free') || message.includes('plus') || message.includes('pro') || message.includes('suscripcion') || message.includes('suscripción')) {
    return {
      reply:
        'Las salas premium requieren una suscripción activa. Free permite uso básico; Plus y Pro desbloquean salas premium, mayor visibilidad y funciones adicionales según el plan configurado por administración.',
    };
  }

  if (message.includes('perfil') || message.includes('reseña') || message.includes('resena') || message.includes('valoracion') || message.includes('valoración') || message.includes('host') || message.includes('anfitrion') || message.includes('anfitrión')) {
    return {
      reply:
        'Desde la ficha del chat puedes revisar perfiles, reputación y reseñas visibles. Si un anfitrión o participante genera desconfianza, reporta antes de compartir datos externos o aceptar un cambio de condiciones.',
    };
  }

  if (space === 'market' || message.includes('mercado') || message.includes('comprar') || message.includes('vender') || message.includes('articulo') || message.includes('artículo')) {
    return {
      reply:
        'En mercado usa descripciones claras, confirma estado y precio dentro del chat, y evita pagos o entregas fuera de un entorno seguro. Si algo parece fraude, corta la conversación y reporta.',
    };
  }

  return {
    reply:
      'Puedo ayudarte con acceso a salas, normas, seguridad, tickets, reputación, premium, mercado y uso del chat. Si me dices qué necesitas exactamente dentro de esos temas, te respondo de forma directa.',
  };
}

async function getOpenAIChatAssistantReply(body) {
  if (!OPENAI_API_KEY) return null;

  const message = sanitizeAssistantText(body.message);
  const room = body.room && typeof body.room === 'object' ? body.room : {};
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const scope = room?.id
    ? `Sala actual:
- titulo: ${room.title || 'Sin título'}
- ciudad: ${room.city || DEFAULT_CITY}
- lugar: ${room.place_name || room.place || 'Sin lugar'}
- visibilidad: ${room.visibility || 'public'}
- premium: ${room.premium_room ? 'sí' : 'no'}
- inicio: ${room.start_at || 'sin fecha'}
- reglas: ${room.rules || 'Sin reglas adicionales'}
- aforo: ${room.max_people || 'sin límite'}
- participantes visibles: ${room.participants_count || 0}`
    : `Espacio actual: ${normalizeSiteChatSpace(body.space || 'global')}`;

  const historyBlock = history
    .map((entry) => `${entry.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${sanitizeAssistantText(entry.body || entry.message || '')}`)
    .filter(Boolean)
    .join('\n');

  const systemPrompt = [
    'Eres el asistente oficial del chat de NexoGo.',
    'Solo puedes responder sobre: salas, acceso, premium, normas, seguridad, tickets, reputación, uso del chat y mercado.',
    'Si la pregunta está fuera de ese contexto, debes rechazarla de forma breve.',
    'No inventes políticas, horarios ni ubicaciones que no estén en el contexto.',
    'Da respuestas cortas, operativas y seguras.',
    'Si detectas amenazas, fraude, coacción o riesgo, prioriza reportar y contactar autoridades competentes si aplica.',
  ].join(' ');

  const userPrompt = [
    scope,
    historyBlock ? `Historial reciente:\n${historyBlock}` : 'Sin historial previo relevante.',
    `Pregunta del usuario:\n${message}`,
  ].join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_ASSISTANT_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload && payload.error && payload.error.message) || 'No se pudo consultar el asistente AI.');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  return null;
}

async function handleChatAssistant(req, res) {
  const body = getRequestBody(req);
  let reply = buildChatAssistantReply(body);
  try {
    const aiReply = await getOpenAIChatAssistantReply(body);
    if (aiReply) {
      reply = { reply: aiReply };
    }
  } catch {
    // fallback local
  }
  res.status(200).json({
    ok: true,
    reply: reply.reply,
    restricted_to_chat_context: true,
  });
}

function encodeSiteChatMessage(space, message) {
  const clean = String(message || '').trim();
  if (!clean) return '';
  if (space === 'market') return `${SITE_CHAT_SPACE_PREFIX.market} ${clean}`;
  return clean;
}

function decodeSiteChatMessage(message) {
  const raw = String(message || '');
  if (raw.startsWith(`${SITE_CHAT_SPACE_PREFIX.market} `)) {
    return {
      space: 'market',
      message: raw.slice(SITE_CHAT_SPACE_PREFIX.market.length + 1),
    };
  }
  return { space: 'global', message: raw };
}

function withAdultRoomNotice(value) {
  const base = String(value || '').trim() || 'Respeta al grupo y el lugar.';
  if (base.includes(ADULT_ROOM_NOTICE)) return base;
  return `${base} · ${ADULT_ROOM_NOTICE}`;
}

function hashAccessPassword(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function createGuestAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createReportTicketNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TCK-${stamp}-${random}`;
}

function hashGuestAccessToken(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function createCheckoutToken(userId, tier, method) {
  const secret = process.env.CHECKOUT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'nexogo-local';
  return crypto.createHmac('sha256', secret).update(`${userId}:${tier}:${method}`).digest('hex');
}

function nextRenewalAt(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function getRemoteIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0];
  return forwarded || req.socket?.remoteAddress || '';
}

function getBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : 'https://nexogo.local';
}

function normalizeSubscriptionTier(value) {
  return ['free', 'plus', 'pro'].includes(String(value || '').trim()) ? String(value).trim() : 'free';
}

function normalizeSubscriptionStatus(value, tier = 'free') {
  const normalized = String(value || '').trim();
  if (tier === 'free') return 'inactive';
  return ['inactive', 'trial', 'active', 'past_due', 'cancelled'].includes(normalized) ? normalized : 'active';
}

function normalizeAdminAccessLevel(value, role = 'user') {
  if (String(role || 'user') !== 'admin') return 'none';
  const normalized = String(value || '').trim().toLowerCase();
  if (['read', 'write', 'owner'].includes(normalized)) return normalized;
  return 'owner';
}

function getAdminAccessLevel(profile, authUser) {
  const role = profile?.role || authUser?.user_metadata?.role || (isAdminEmail(authUser?.email) ? 'admin' : 'user');
  if (String(role || 'user') !== 'admin' && !isAdminEmail(authUser?.email)) return 'none';
  return normalizeAdminAccessLevel(profile?.admin_access_level || authUser?.user_metadata?.admin_access_level, 'admin');
}

function canReadAdmin(ctx) {
  return ['read', 'write', 'owner'].includes(String(ctx?.adminAccessLevel || 'none'));
}

function canManageAdmin(ctx) {
  return ['write', 'owner'].includes(String(ctx?.adminAccessLevel || 'none'));
}

function isPrivilegedAdmin(profile, authUser) {
  return String(profile?.role || '') === 'admin' || isAdminEmail(authUser?.email);
}

async function verifyTurnstileToken(token, remoteIp, action = 'register') {
  if (!TURNSTILE_SECRET_KEY) {
    throw new Error('CAPTCHA no configurado en servidor.');
  }
  const params = new URLSearchParams();
  params.set('secret', TURNSTILE_SECRET_KEY);
  params.set('response', String(token || '').trim());
  if (remoteIp) params.set('remoteip', remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    return { success: false, payload };
  }
  if (action && payload.action && payload.action !== action) {
    return { success: false, payload };
  }
  return { success: true, payload };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLon = toRadians(Number(lon2) - Number(lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase());
}

async function ensureProfile(authUser) {
  if (!serverSupabase || !authUser?.id) return null;

  const meta = authUser.user_metadata || {};
  const firstName = String(meta.first_name || '').trim();
  const lastName = String(meta.last_name || '').trim();
  const fallbackName = `${firstName} ${lastName}`.trim() || authUser.email?.split('@')[0] || 'Usuario';

  const payload = {
    id: authUser.id,
    name: String(meta.name || '').trim() || fallbackName,
    email: authUser.email,
    photo_url: String(meta.photo || '').trim() || null,
    birth_date: meta.birth_date || null,
    city: String(meta.city || '').trim() || DEFAULT_CITY,
    bio: String(meta.bio || '').trim() || null,
    verified: Boolean(authUser.email_confirmed_at),
    first_name: firstName || null,
    last_name: lastName || null,
    username: String(meta.username || '').trim() || null,
    phone: String(meta.phone || '').trim() || null,
    address: String(meta.address || '').trim() || null,
    district: String(meta.district || '').trim() || null,
    postal_code: String(meta.postal_code || '').trim() || null,
    country: String(meta.country || '').trim() || DEFAULT_COUNTRY,
    emergency_contact: String(meta.emergency_contact || '').trim() || null,
    role: meta.role === 'admin' || isAdminEmail(authUser.email) ? 'admin' : 'user',
  };

  const { data, error } = await serverSupabase
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getSubscriptionRecord(userId) {
  if (!serverSupabase || !userId) return null;
  const { data } = await serverSupabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
    .then((result) => result)
    .catch(() => ({ data: null }));
  return data || null;
}

function attachSubscriptionState(base, authUser, subscription) {
  const privilegedAdmin = isPrivilegedAdmin(base, authUser);
  if (privilegedAdmin) {
    return {
      ...base,
      subscription_tier: 'pro',
      subscription_status: 'active',
      subscription_provider: 'admin_override',
      payment_method: 'internal',
      auto_renew: true,
      cancel_at_period_end: false,
      renewal_at: nextRenewalAt(),
      canceled_at: null,
      subscription_admin_notes: 'Cuenta administrativa con privilegios completos.',
      never_expires: true,
    };
  }
  const tier =
    subscription?.tier ||
    subscription?.subscription_tier ||
    authUser?.user_metadata?.subscription_tier ||
    'free';
  const status =
    subscription?.status ||
    subscription?.subscription_status ||
    authUser?.user_metadata?.subscription_status ||
    (tier === 'free' ? 'inactive' : 'active');
  return {
    ...base,
    subscription_tier: tier,
    subscription_status: status,
    subscription_provider: subscription?.provider || subscription?.subscription_provider || null,
    payment_method: subscription?.payment_method || null,
    auto_renew: subscription?.auto_renew ?? (tier !== 'free'),
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    renewal_at: subscription?.renewal_at || null,
    canceled_at: subscription?.cancelled_at || subscription?.canceled_at || null,
    subscription_admin_notes: subscription?.admin_notes || subscription?.subscription_admin_notes || null,
    never_expires: Boolean(subscription?.never_expires),
  };
}

async function touchUserPresence(userId) {
  if (!serverSupabase || !userId) return;
  await serverSupabase
    .from('user_presence')
    .upsert(
      {
        user_id: userId,
        status: 'online',
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .then(() => null)
    .catch(() => null);
}

async function createAuditLog({ actorUserId = null, targetUserId = null, action, entityType, entityId = null, details = {} }) {
  if (!serverSupabase || !action || !entityType) return;
  await serverSupabase
    .from('audit_logs')
    .insert({
      actor_user_id: actorUserId,
      target_user_id: targetUserId,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details,
    })
    .then(() => null)
    .catch(() => null);
}

async function persistSubscriptionState(targetUserId, payload, actorCtx, authUserOverride = null, profileOverride = null) {
  const currentSubscription = await getSubscriptionRecord(targetUserId);
  const authUser =
    authUserOverride
    || (await serverSupabase.auth.admin.getUserById(targetUserId).then((result) => result.data?.user || null).catch(() => null));
  const userProfile =
    profileOverride
    || (await serverSupabase.from('users').select('*').eq('id', targetUserId).maybeSingle().then((result) => result.data || null).catch(() => null));
  const privilegedAdmin = isPrivilegedAdmin(userProfile, authUser);
  const lockedLifetime = !actorCtx?.isAdmin && Boolean(currentSubscription?.never_expires);
  const neverExpires = privilegedAdmin
    ? true
    : lockedLifetime
      ? true
      : hasBodyKey(payload, 'never_expires')
        ? Boolean(payload.never_expires)
        : Boolean(currentSubscription?.never_expires);
  const tier = privilegedAdmin
    ? 'pro'
    : lockedLifetime
      ? normalizeSubscriptionTier(currentSubscription?.tier || authUser?.user_metadata?.subscription_tier || 'free')
      : normalizeSubscriptionTier(hasBodyKey(payload, 'tier') ? payload.tier : currentSubscription?.tier || 'free');
  const cancelNow = lockedLifetime ? false : Boolean(payload.cancel_now);
  const status = privilegedAdmin
    ? 'active'
    : lockedLifetime
    ? 'active'
    : cancelNow
    ? 'inactive'
    : normalizeSubscriptionStatus(
        hasBodyKey(payload, 'status') ? payload.status : currentSubscription?.status || (tier === 'free' ? 'inactive' : 'active'),
        tier,
      );
  const autoRenew = privilegedAdmin
    ? true
    : neverExpires
      ? true
    : tier === 'free'
      ? false
      : hasBodyKey(payload, 'auto_renew')
        ? Boolean(payload.auto_renew)
        : currentSubscription?.auto_renew ?? true;
  const cancelAtPeriodEnd =
    privilegedAdmin
      ? false
      : neverExpires
      ? false
      : tier === 'free'
      ? false
      : hasBodyKey(payload, 'cancel_at_period_end')
        ? Boolean(payload.cancel_at_period_end)
        : currentSubscription?.cancel_at_period_end ?? false;
  const provider = privilegedAdmin
    ? 'admin_override'
    : String(payload.provider || currentSubscription?.provider || (actorCtx?.isAdmin ? 'admin' : 'demo')).trim() || 'demo';
  const paymentMethod = privilegedAdmin
    ? 'internal'
    : String(payload.payment_method || currentSubscription?.payment_method || provider).trim() || provider;
  const adminNotes = privilegedAdmin
    ? 'Cuenta administrativa con privilegios completos.'
    : String(payload.admin_notes || currentSubscription?.admin_notes || '').trim() || null;
  const renewalAt =
    tier === 'free'
      ? null
      : neverExpires
        ? null
        : String(payload.renewal_at || currentSubscription?.renewal_at || nextRenewalAt()).trim();
  const startedAt = currentSubscription?.started_at || new Date().toISOString();
  const cancelledAt = privilegedAdmin ? null : cancelNow || tier === 'free' || status === 'cancelled' ? new Date().toISOString() : null;
  const priceEur = tier === 'plus' ? 9.99 : tier === 'pro' ? 19.99 : 0;
  const currentMetadata = authUser?.user_metadata || {};
  const { data: updatedAuth, error: authError } = await serverSupabase.auth.admin.updateUserById(targetUserId, {
    user_metadata: {
      ...currentMetadata,
      subscription_tier: tier,
      subscription_status: status,
      auto_renew: autoRenew,
      cancel_at_period_end: cancelAtPeriodEnd,
      never_expires: neverExpires,
    },
  });

  if (authError) throw authError;

  const { data: subscription, error: subscriptionError } = await serverSupabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: targetUserId,
        tier,
        status,
        price_eur: priceEur,
        provider,
        payment_method: paymentMethod,
        started_at: tier === 'free' ? null : startedAt,
        renewal_at: renewalAt,
        cancelled_at: cancelledAt,
        never_expires: neverExpires,
        auto_renew: autoRenew,
        cancel_at_period_end: cancelAtPeriodEnd,
        admin_notes: adminNotes,
        managed_by: actorCtx?.userId || null,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (subscriptionError) throw subscriptionError;

  if (privilegedAdmin) {
    return {
      subscription,
      authUser: updatedAuth.user,
      profile: userProfile,
      snapshot: attachSubscriptionState(userProfile || {}, updatedAuth.user, subscription),
    };
  }

  return {
    subscription,
    authUser: updatedAuth.user,
    profile: userProfile,
    snapshot: attachSubscriptionState({}, updatedAuth.user, subscription),
  };
}

async function getRequestContext(req) {
  if (!serverSupabase) {
    throw new Error('Supabase server no configurado');
  }

  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return {
      authUser: null,
      profile: null,
      userId: null,
      isAdmin: false,
      adminAccessLevel: 'none',
      canManageAdmin: false,
      subscriptionTier: 'free',
      subscriptionStatus: 'inactive',
    };
  }

  const {
    data: { user },
    error,
  } = await serverSupabase.auth.getUser(token);

  if (error || !user) {
    return {
      authUser: null,
      profile: null,
      userId: null,
      isAdmin: false,
      adminAccessLevel: 'none',
      canManageAdmin: false,
      subscriptionTier: 'free',
      subscriptionStatus: 'inactive',
    };
  }

  const profile = await ensureProfile(user);
  const subscription = await getSubscriptionRecord(user.id);
  await touchUserPresence(user.id);
  const adminAccessLevel = getAdminAccessLevel(profile, user);
  const isAdmin = adminAccessLevel !== 'none';
  const subscriptionState = attachSubscriptionState({}, user, subscription);
  return {
    authUser: user,
    profile,
    subscription,
    userId: user.id,
    isAdmin,
    adminAccessLevel,
    canManageAdmin: canManageAdmin({ adminAccessLevel }),
    subscriptionTier: String(subscriptionState.subscription_tier || 'free'),
    subscriptionStatus: String(subscriptionState.subscription_status || 'inactive'),
  };
}

function normalizeChatChannel(value) {
  return String(value || '').trim().toLowerCase() === 'private' ? 'private' : 'main';
}

function hasBodyKey(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function canAccessPrivateChat(plan, ctx, code) {
  if (!plan?.private_chat_enabled) return false;
  if (ctx.isAdmin) return true;
  if (String(plan.creator_id) === String(ctx.userId)) return true;
  return String(hashAccessPassword(code) || '') === String(plan.private_chat_code_hash || '');
}

function buildReactionSummary(rows, userId) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.emoji || '').trim();
    if (!key) continue;
    const current = map.get(key) || { emoji: key, count: 0, reacted_by_me: false };
    current.count += 1;
    if (String(row.user_id) === String(userId)) current.reacted_by_me = true;
    map.set(key, current);
  }
  return Array.from(map.values());
}

function formatParticipant(row) {
  const profile = row.users || {};
  return {
    user_id: row.user_id,
    name: profile.name || 'Usuario',
    photo_url: profile.photo_url || null,
    role: row.role,
    status: row.status,
    joined_at: row.joined_at,
    rating_avg: Number(profile.rating_avg || 0),
    rating_count: Number(profile.rating_count || 0),
  };
}

function canViewPlan(plan, participants, ctx) {
  if (ctx.isAdmin) return true;
  if (plan.premium_room && ctx.subscriptionTier === 'free' && String(plan.creator_id) !== String(ctx.userId)) return false;
  if (
    plan.premium_room
    && String(plan.visibility || 'public') === 'private'
    && String(ctx.subscriptionTier || 'free') !== 'free'
    && !['inactive', 'cancelled'].includes(String(ctx.subscriptionStatus || 'inactive'))
  ) return true;
  if (String(plan.visibility || 'public') === 'public') return true;
  if (!ctx.userId) return false;
  if (String(plan.creator_id) === String(ctx.userId)) return true;
  return participants.some(
    (participant) =>
      String(participant.user_id) === String(ctx.userId) &&
      VISIBLE_PARTICIPANT_STATUSES.has(String(participant.status || '')),
  );
}

function canUseChat(plan, participants, ctx) {
  if (!ctx.userId) return false;
  if (ctx.isAdmin) return true;
  if (String(plan.creator_id) === String(ctx.userId)) return true;
  return participants.some(
    (participant) =>
      String(participant.user_id) === String(ctx.userId) &&
      CHAT_PARTICIPANT_STATUSES.has(String(participant.status || '')),
  );
}

function buildFormattedPlan(plan, extras, ctx, coords) {
  const locationRow = extras.locations.get(plan.id) || {};
  const creator = extras.creators.get(plan.creator_id) || {};
  const participants = (extras.participants.get(plan.id) || []).map(formatParticipant);
  const myParticipant = participants.find((participant) => String(participant.user_id) === String(ctx.userId));
  const distanceMeters =
    Number.isFinite(Number(locationRow.latitude)) && Number.isFinite(Number(locationRow.longitude))
      ? Math.round(haversineDistance(coords.lat, coords.lng, Number(locationRow.latitude), Number(locationRow.longitude)))
      : 0;

  return {
    plan_id: plan.id,
    id: plan.id,
    creator_id: plan.creator_id,
    creator_name: creator.name || 'Anfitrión',
    creator_photo: creator.photo_url || null,
    category_code: normalizeCategoryKey(plan.category_code),
    category: normalizeCategoryKey(plan.category_code),
    title: plan.title,
    description: plan.description,
    place_name: plan.place_name || 'Lugar por definir',
    start_at: plan.start_at,
    max_people: Number(plan.max_people || 0),
    status: plan.status,
    visibility: plan.visibility,
    approval_required: Boolean(plan.approval_required),
    rules: plan.rules || 'Respeta al grupo y el punto de encuentro.',
    address: plan.address || plan.place_name || 'Ubicación por confirmar',
    district: plan.district || DEFAULT_CITY,
    city: plan.city || creator.city || DEFAULT_CITY,
    country: plan.country || creator.country || DEFAULT_COUNTRY,
    duration_minutes: Number(plan.duration_minutes || 90),
    language: plan.language || 'es',
    room_level: plan.room_level || (plan.approval_required ? 'moderado' : 'abierto'),
    age_range: plan.age_range || '18+',
    allow_chat_gpt: plan.allow_chat_gpt !== false,
    premium_room: Boolean(plan.premium_room),
    featured_room: Boolean(plan.featured_room),
    advanced_analytics: Boolean(plan.advanced_analytics),
    private_chat_enabled: Boolean(plan.private_chat_enabled),
    private_chat_configured: Boolean(plan.private_chat_code_hash),
    requires_password: Boolean(plan.access_password_hash),
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    latitude: Number(locationRow.latitude || coords.lat),
    longitude: Number(locationRow.longitude || coords.lng),
    distance_meters: distanceMeters,
    participants_count: participants.filter((participant) => COUNTED_PARTICIPANT_STATUSES.has(String(participant.status || ''))).length,
    participants,
    my_status: String(plan.creator_id) === String(ctx.userId) ? 'accepted' : myParticipant?.status || null,
    host_rating: Number(creator.rating_avg || 0),
    rating_count: Number(creator.rating_count || 0),
    host_about: creator.bio || 'Anfitrión activo de la comunidad',
    verified: Boolean(creator.verified),
    map_link: `https://www.google.com/maps/search/?api=1&query=${locationRow.latitude || coords.lat},${locationRow.longitude || coords.lng}`,
  };
}

async function fetchPlanBundle(ctx, options = {}) {
  const coords = {
    lat: Number(options.lat || DEFAULT_COORDS.lat),
    lng: Number(options.lng || DEFAULT_COORDS.lng),
  };
  const radius = Number(options.radius || 0);
  const maxHours = Number(options.maxHours || 0);
  const categoryFilter =
    options.category && String(options.category) !== 'all' ? normalizeCategoryKey(options.category) : null;

  const { data: planRows, error: plansError } = await serverSupabase
    .from('plans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (plansError) throw plansError;

  const activeRows = (planRows || []).filter((plan) => ACTIVE_PLAN_STATUSES.has(String(plan.status || '')));
  const planIds = activeRows.map((plan) => plan.id);
  if (planIds.length === 0) return [];

  const creatorIds = [...new Set(activeRows.map((plan) => plan.creator_id).filter(Boolean))];

  const [{ data: creatorRows, error: creatorError }, { data: locationRows, error: locationError }, { data: participantRows, error: participantError }] =
    await Promise.all([
      creatorIds.length
        ? serverSupabase
            .from('users')
            .select('id, name, photo_url, city, country, bio, rating_avg, rating_count, verified, address, district, role')
            .in('id', creatorIds)
        : Promise.resolve({ data: [], error: null }),
      serverSupabase
        .from('nearby_plans_view')
        .select('id, latitude, longitude, visibility, place_name, created_at, updated_at')
        .in('id', planIds),
      serverSupabase
        .from('plan_participants')
        .select('plan_id, user_id, role, status, joined_at, users!plan_participants_user_id_fkey(id, name, photo_url, rating_avg, rating_count)')
        .in('plan_id', planIds),
    ]);

  if (creatorError) throw creatorError;
  if (locationError) throw locationError;
  if (participantError) throw participantError;

  const creators = new Map((creatorRows || []).map((row) => [row.id, row]));
  const locations = new Map((locationRows || []).map((row) => [row.id, row]));
  const participants = new Map();

  for (const row of participantRows || []) {
    const list = participants.get(row.plan_id) || [];
    list.push(row);
    participants.set(row.plan_id, list);
  }

  return activeRows
    .map((plan) => buildFormattedPlan(plan, { creators, locations, participants }, ctx, coords))
    .filter((plan) => canViewPlan(plan, plan.participants, ctx))
    .filter((plan) => {
      if (categoryFilter && normalizeCategoryKey(plan.category_code) !== categoryFilter) return false;
      if (maxHours > 0) {
        const startAt = new Date(plan.start_at).getTime();
        if (Number.isFinite(startAt) && startAt > Date.now() + maxHours * 60 * 60 * 1000) return false;
      }
      if (radius > 0 && Number(plan.distance_meters || 0) > radius) return false;
      return true;
    })
    .sort((a, b) => Number(a.distance_meters || 0) - Number(b.distance_meters || 0));
}

async function fetchSinglePlan(planId, ctx, coords = DEFAULT_COORDS) {
  const plans = await fetchPlanBundle(ctx, { lat: coords.lat, lng: coords.lng, radius: 1000000, maxHours: 8760 });
  return plans.find((plan) => String(plan.plan_id) === String(planId)) || null;
}

async function handleHealth(res) {
  res.status(200).json({ ok: true });
}

async function handleCaptchaVerify(req, res) {
  const body = getRequestBody(req);
  const token = String(body.token || '').trim();
  if (!token) {
    res.status(400).json({ error: 'Token CAPTCHA obligatorio.' });
    return;
  }

  const verification = await verifyTurnstileToken(token, getRemoteIp(req), String(body.action || 'register'));
  if (!verification.success) {
    res.status(400).json({ error: 'No se pudo validar el CAPTCHA.' });
    return;
  }

  res.status(200).json({ ok: true });
}

async function handleGuestAccessRequest(req, res) {
  const body = getRequestBody(req);
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim() || null;
  const city = String(body.city || '').trim() || null;
  const reason = String(body.reason || '').trim();

  if (!fullName || !email || !reason) {
    res.status(400).json({ error: 'Nombre, correo y motivo son obligatorios.' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('guest_access_requests')
    .insert({
      full_name: fullName,
      email,
      phone,
      city,
      reason,
      status: 'pending',
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      email_verification_required: true,
    })
    .select('*')
    .single();

  if (error) throw error;

  await createAuditLog({
    action: 'guest_access_requested',
    entityType: 'guest_access_request',
    entityId: data.id,
    details: { email, city, phone },
  });

  await sendGuestAccessRequestAdminEmail({
    full_name: fullName,
    email,
    phone,
    city,
    reason,
    admin_panel_url: `${getBaseUrl(req)}/admin`,
  }).catch(() => null);

  res.status(201).json({ ok: true, request: data });
}

async function getGuestAccessRequestByToken(token) {
  const tokenHash = hashGuestAccessToken(token);
  if (!tokenHash) return null;
  const { data } = await serverSupabase
    .from('guest_access_requests')
    .select('*')
    .eq('approval_token_hash', tokenHash)
    .maybeSingle()
    .then((result) => result)
    .catch(() => ({ data: null }));
  return data || null;
}

async function handleGuestAccessValidate(req, res) {
  const token = String(req.query.token || '').trim();
  if (!token) {
    res.status(400).json({ error: 'Token no válido.' });
    return;
  }

  const request = await getGuestAccessRequestByToken(token);
  if (!request || String(request.status || '') !== 'approved') {
    res.status(404).json({ error: 'Invitación no disponible.' });
    return;
  }

  const expiresAt = request.approval_expires_at ? new Date(request.approval_expires_at).getTime() : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    res.status(410).json({ error: 'La invitación ha caducado.' });
    return;
  }

  if (request.used_at || String(request.status || '') === 'consumed') {
    res.status(410).json({ error: 'La invitación ya se ha utilizado.' });
    return;
  }

  res.status(200).json({
    ok: true,
    invitation: {
      id: request.id,
      full_name: request.full_name,
      email: request.email,
      city: request.city,
      expires_at: request.approval_expires_at,
      email_verification_required: request.email_verification_required !== false,
    },
  });
}

async function handleGuestAccessConsume(req, res) {
  const body = getRequestBody(req);
  const token = String(body.token || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (!token || !email) {
    res.status(400).json({ error: 'Solicitud incompleta.' });
    return;
  }

  const request = await getGuestAccessRequestByToken(token);
  if (!request || String(request.status || '') !== 'approved') {
    res.status(404).json({ error: 'Invitación no disponible.' });
    return;
  }

  const expiresAt = request.approval_expires_at ? new Date(request.approval_expires_at).getTime() : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    res.status(410).json({ error: 'La invitación ha caducado.' });
    return;
  }

  if (String(request.email || '').toLowerCase() !== email) {
    res.status(400).json({ error: 'El correo no coincide con la invitación aprobada.' });
    return;
  }

  const { error } = await serverSupabase
    .from('guest_access_requests')
    .update({
      status: 'consumed',
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id);

  if (error) throw error;

  await createAuditLog({
    action: 'guest_access_consumed',
    entityType: 'guest_access_request',
    entityId: request.id,
    details: { email },
  });

  res.status(200).json({ ok: true });
}

async function handleMe(req, res, ctx) {
  if (!ctx.authUser || !ctx.profile) {
    res.status(200).json({
      id: req.headers['x-user-id'] || 'guest',
      name: 'Invitado social',
      city: DEFAULT_CITY,
      registered: false,
      role: 'guest',
    });
    return;
  }

  res.status(200).json(attachSubscriptionState({
    ...ctx.profile,
    registered: true,
    role: ctx.isAdmin ? 'admin' : ctx.profile.role || 'user',
    admin_access_level: ctx.adminAccessLevel || ctx.profile.admin_access_level || 'none',
    photo: ctx.profile.photo_url || null,
  }, ctx.authUser, ctx.subscription));
}

async function handleProfileUpdate(req, res, ctx) {
  if (!ctx.userId || !ctx.authUser) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const nextMeta = {
    ...(ctx.authUser.user_metadata || {}),
    name: String(body.name || '').trim(),
    first_name: String(body.first_name || '').trim(),
    last_name: String(body.last_name || '').trim(),
    username: String(body.username || '').trim(),
    phone: String(body.phone || '').trim(),
    address: String(body.address || '').trim(),
    district: String(body.district || '').trim(),
    city: String(body.city || '').trim(),
    postal_code: String(body.postal_code || '').trim(),
    country: String(body.country || '').trim(),
    bio: String(body.bio || '').trim(),
    photo: String(body.photo || '').trim(),
    emergency_contact: String(body.emergency_contact || '').trim(),
    birth_date: String(body.birth_date || '').trim(),
  };

  const { data: updatedAuth, error: authError } = await serverSupabase.auth.admin.updateUserById(ctx.userId, {
    user_metadata: nextMeta,
  });
  if (authError) throw authError;

  const { data: updatedUser, error: userError } = await serverSupabase
    .from('users')
    .update({
      name: nextMeta.name || ctx.profile?.name || ctx.authUser.email,
      first_name: nextMeta.first_name || null,
      last_name: nextMeta.last_name || null,
      username: nextMeta.username || null,
      phone: nextMeta.phone || null,
      address: nextMeta.address || null,
      district: nextMeta.district || null,
      city: nextMeta.city || DEFAULT_CITY,
      postal_code: nextMeta.postal_code || null,
      country: nextMeta.country || DEFAULT_COUNTRY,
      bio: nextMeta.bio || null,
      photo_url: nextMeta.photo || null,
      emergency_contact: nextMeta.emergency_contact || null,
      birth_date: nextMeta.birth_date || null,
    })
    .eq('id', ctx.userId)
    .select('*')
    .single();
  if (userError) throw userError;

  await sendProfileChangeAlertEmail({
    email: updatedUser.email,
    name: updatedUser.name,
    city: updatedUser.city,
    country: updatedUser.country,
  }).catch(() => null);

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: ctx.userId,
    action: 'profile_updated',
    entityType: 'user',
    entityId: ctx.userId,
    details: {
      city: updatedUser.city,
      country: updatedUser.country,
      username: updatedUser.username || null,
    },
  });

  const subscription = await getSubscriptionRecord(ctx.userId);
  res.status(200).json({
    ok: true,
    user: attachSubscriptionState({
      ...updatedUser,
    }, updatedAuth.user, subscription),
  });
}

async function handleStats(res, ctx) {
  if (!ctx.userId) {
    res.status(200).json({ plans_created: 0, plans_joined: 0, reviews_received: 0, online_users: 0 });
    return;
  }

  const onlineSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [{ count: createdCount }, { count: joinedCount }, { count: reviewCount }, { count: onlineUsersCount }] = await Promise.all([
    serverSupabase.from('plans').select('*', { count: 'exact', head: true }).eq('creator_id', ctx.userId),
    serverSupabase
      .from('plan_participants')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .in('status', ['accepted', 'attended']),
    serverSupabase.from('reviews').select('*', { count: 'exact', head: true }).eq('reviewed_user_id', ctx.userId),
    serverSupabase
      .from('user_presence')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', onlineSince),
  ]);

  res.status(200).json({
    plans_created: Number(createdCount || 0),
    plans_joined: Number(joinedCount || 0),
    reviews_received: Number(reviewCount || 0),
    online_users: Number(onlineUsersCount || 0),
  });
}

async function handleNotifications(res, ctx) {
  if (!ctx.userId) {
    res.status(200).json([]);
    return;
  }

  const { data, error } = await serverSupabase
    .from('notifications')
    .select('id, type, title, body, created_at, read_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  res.status(200).json(data || []);
}

async function handleSiteChatList(req, res) {
  const space = normalizeSiteChatSpace(req.query.space);
  const { data, error } = await serverSupabase
    .from('site_virtual_chat_messages')
    .select('id, author_name, author_role, message, created_at')
    .order('created_at', { ascending: false })
    .limit(120)
    .then((result) => result)
    .catch(() => ({ data: [], error: null }));

  if (error) throw error;
  res.status(200).json(
    (data || [])
      .map((row) => {
        const decoded = decodeSiteChatMessage(row.message);
        return { ...row, space: decoded.space, message: decoded.message };
      })
      .filter((row) => row.space === space)
      .reverse(),
  );
}

async function handleSiteChatCreate(req, res, ctx) {
  const body = getRequestBody(req);
  const space = normalizeSiteChatSpace(req.query.space || body.space);
  const message = String(body.message || '').trim();
  if (!message) {
    res.status(400).json({ error: 'El mensaje es obligatorio.' });
    return;
  }

  const authorName =
    String(ctx.profile?.name || ctx.authUser?.user_metadata?.name || body.author_name || '').trim() || 'Invitado';
  const authorRole = ctx.isAdmin ? 'admin' : ctx.userId ? (String(ctx.subscriptionTier || 'free') !== 'free' ? 'premium' : 'user') : 'guest';

  const { data, error } = await serverSupabase
    .from('site_virtual_chat_messages')
    .insert({
      author_user_id: ctx.userId || null,
      author_name: authorName,
      author_role: authorRole,
      message: encodeSiteChatMessage(space, message).slice(0, 620),
    })
    .select('id, author_name, author_role, message, created_at')
    .single()
    .then((result) => result)
    .catch(() => ({ data: null, error: null }));

  if (error) throw error;
  const decoded = decodeSiteChatMessage(data?.message || message);
  res.status(201).json({ ok: true, message: data ? {
    ...data,
    space: decoded.space,
    message: decoded.message,
  } : {
    id: `fallback-${Date.now()}`,
    author_name: authorName,
    author_role: authorRole,
    message: message.slice(0, 600),
    created_at: new Date().toISOString(),
    space,
  } });
}

async function handleUserSubscriptionPreferences(req, res, ctx) {
  if (!ctx.userId || !ctx.authUser) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const persisted = await persistSubscriptionState(ctx.userId, body, ctx, ctx.authUser, ctx.profile);

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: ctx.userId,
    action: body.cancel_now ? 'subscription_cancelled_by_user' : 'subscription_preferences_updated',
    entityType: 'subscription',
    entityId: ctx.userId,
    details: persisted.snapshot,
  });

  await sendSubscriptionStatusEmail({
    email: ctx.profile?.email || ctx.authUser.email,
    name: ctx.profile?.name || ctx.authUser.user_metadata?.name || ctx.authUser.email,
    tier: persisted.snapshot.subscription_tier,
    status: persisted.snapshot.subscription_status,
    auto_renew: persisted.snapshot.auto_renew,
    cancel_at_period_end: persisted.snapshot.cancel_at_period_end,
    renewal_at: persisted.snapshot.renewal_at,
    provider: persisted.snapshot.subscription_provider,
    admin_notes: persisted.snapshot.subscription_admin_notes,
  }).catch(() => null);

  res.status(200).json({ ok: true, subscription: persisted.snapshot });
}

async function handlePlanList(req, res, ctx, isNearby) {
  const plans = await fetchPlanBundle(ctx, {
    lat: req.query.lat,
    lng: req.query.lng,
    radius: isNearby ? req.query.radius_meters : 1000000,
    maxHours: isNearby ? req.query.max_hours : 8760,
    category: req.query.category,
  });

  res.status(200).json(plans);
}

async function handleCreatePlan(req, res, ctx) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes registrarte para crear una sala.' });
    return;
  }
  if (ctx.profile?.is_banned) {
    res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con el administrador.' });
    return;
  }

  const body = getRequestBody(req);
  const categoryCode = normalizeCategoryKey(body.category_code || body.category || 'cafe');
  const latitude = Number(body.latitude || DEFAULT_COORDS.lat);
  const longitude = Number(body.longitude || DEFAULT_COORDS.lng);
  const canUsePremium = ctx.subscriptionTier === 'plus' || ctx.subscriptionTier === 'pro';
  const canUsePro = ctx.subscriptionTier === 'pro';
  const requestedRoomLevel = String(body.room_level || '').trim() || 'abierto';
  const isAdultRoom = isAdultRoomLevel(requestedRoomLevel);

  if (isAdultRoom && !canUsePremium && !ctx.isAdmin) {
    res.status(403).json({ error: 'Las salas adultas solo están disponibles para cuentas premium activas.' });
    return;
  }

  const insertPayload = {
    creator_id: ctx.userId,
    category_code: categoryCode,
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim() || 'Sin descripción',
    location: `POINT(${longitude} ${latitude})`,
    place_name: String(body.place_name || '').trim() || 'Lugar por definir',
    start_at: body.start_at,
    max_people: Math.max(2, Number(body.max_people || 2)),
    status: 'active',
    visibility: isAdultRoom ? 'private' : body.visibility === 'private' ? 'private' : 'public',
    approval_required: isAdultRoom ? true : Boolean(body.approval_required || body.visibility === 'private'),
    rules: isAdultRoom ? withAdultRoomNotice(body.rules) : String(body.rules || '').trim() || 'Respeta al grupo y el lugar.',
    city: String(body.city || '').trim() || ctx.profile?.city || DEFAULT_CITY,
    country: String(body.country || '').trim() || ctx.profile?.country || DEFAULT_COUNTRY,
    district: String(body.district || '').trim() || null,
    address: String(body.address || '').trim() || null,
    duration_minutes: Math.max(15, Number(body.duration_minutes || 90)),
    language: String(body.language || '').trim() || 'es',
    room_level: requestedRoomLevel,
    age_range: isAdultRoom ? '18+' : String(body.age_range || '').trim() || '18+',
    allow_chat_gpt: body.allow_chat_gpt !== false,
    premium_room: isAdultRoom ? true : canUsePremium && Boolean(body.premium_room),
    featured_room: canUsePremium && Boolean(body.featured_room),
    advanced_analytics: canUsePro && Boolean(body.advanced_analytics),
    access_password_hash: hashAccessPassword(body.access_password),
    ...(hasBodyKey(body, 'private_chat_enabled') || hasBodyKey(body, 'private_chat_code')
      ? {
          private_chat_enabled: Boolean(body.private_chat_enabled),
          private_chat_code_hash: hashAccessPassword(body.private_chat_code),
        }
      : {}),
  };

  const { data: plan, error: planError } = await serverSupabase
    .from('plans')
    .insert(insertPayload)
    .select('id')
    .single();

  if (planError) throw planError;

  const { error: participantError } = await serverSupabase.from('plan_participants').upsert(
    {
      plan_id: plan.id,
      user_id: ctx.userId,
      role: 'host',
      status: 'accepted',
    },
    { onConflict: 'plan_id,user_id' },
  );

  if (participantError) throw participantError;

  const detail = await fetchSinglePlan(plan.id, ctx, { lat: latitude, lng: longitude });
  res.status(201).json(detail || { id: plan.id, plan_id: plan.id });
}

async function handleUpdatePlan(req, res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data: currentPlan, error: planError } = await serverSupabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (planError) throw planError;
  if (!ctx.canManageAdmin && String(currentPlan.creator_id) !== String(ctx.userId)) {
    res.status(403).json({ error: 'Solo el creador o el admin pueden modificar la sala.' });
    return;
  }

  const body = getRequestBody(req);
  const categoryCode = normalizeCategoryKey(body.category_code || body.category || 'cafe');
  const latitude = Number(body.latitude || currentPlan.latitude || DEFAULT_COORDS.lat);
  const longitude = Number(body.longitude || currentPlan.longitude || DEFAULT_COORDS.lng);
  const canUsePremium = ctx.subscriptionTier === 'plus' || ctx.subscriptionTier === 'pro';
  const canUsePro = ctx.subscriptionTier === 'pro';
  const nextRoomLevel = String((body.room_level ?? currentPlan.room_level) || '').trim() || 'abierto';
  const isAdultRoom = isAdultRoomLevel(nextRoomLevel);
  if (isAdultRoom && !canUsePremium && !ctx.isAdmin) {
    res.status(403).json({ error: 'Las salas adultas solo están disponibles para cuentas premium activas.' });
    return;
  }
  const nextTitle = String((body.title ?? currentPlan.title) || '').trim();
  const nextDescription = String((body.description ?? currentPlan.description) || '').trim() || 'Sin descripción';
  const nextPlaceName = String((body.place_name ?? currentPlan.place_name) || '').trim() || 'Lugar por definir';
  const nextStartAt = body.start_at || currentPlan.start_at;
  const nextMaxPeople = Math.max(2, Number((body.max_people ?? currentPlan.max_people) || 2));
  const nextVisibility = isAdultRoom ? 'private' : (body.visibility ?? currentPlan.visibility) === 'private' ? 'private' : 'public';
  const nextApprovalRequired = isAdultRoom ? true : Boolean((body.approval_required ?? currentPlan.approval_required) || nextVisibility === 'private');
  const nextRules = isAdultRoom
    ? withAdultRoomNotice(body.rules ?? currentPlan.rules)
    : String((body.rules ?? currentPlan.rules) || '').trim() || 'Respeta al grupo y el lugar.';
  const nextCity = String((body.city ?? currentPlan.city) || '').trim() || ctx.profile?.city || DEFAULT_CITY;
  const nextCountry = String((body.country ?? currentPlan.country) || '').trim() || ctx.profile?.country || DEFAULT_COUNTRY;
  const nextDistrict = String((body.district ?? currentPlan.district) || '').trim() || null;
  const nextAddress = String((body.address ?? currentPlan.address) || '').trim() || null;
  const nextDurationMinutes = Math.max(15, Number((body.duration_minutes ?? currentPlan.duration_minutes) || 90));
  const nextLanguage = String((body.language ?? currentPlan.language) || '').trim() || 'es';
  const nextAgeRange = isAdultRoom ? '18+' : String((body.age_range ?? currentPlan.age_range) || '').trim() || '18+';
  const updatePayload = {
    category_code: categoryCode,
    title: nextTitle,
    description: nextDescription,
    place_name: nextPlaceName,
    location: `POINT(${longitude} ${latitude})`,
    start_at: nextStartAt,
    max_people: nextMaxPeople,
    visibility: nextVisibility,
    approval_required: nextApprovalRequired,
    rules: nextRules,
    city: nextCity,
    country: nextCountry,
    district: nextDistrict,
    address: nextAddress,
    duration_minutes: nextDurationMinutes,
    language: nextLanguage,
    room_level: nextRoomLevel,
    age_range: nextAgeRange,
    allow_chat_gpt: body.allow_chat_gpt !== undefined ? body.allow_chat_gpt !== false : currentPlan.allow_chat_gpt !== false,
    premium_room:
      hasBodyKey(body, 'premium_room')
        ? isAdultRoom ? true : canUsePremium && Boolean(body.premium_room)
        : Boolean(currentPlan.premium_room),
    featured_room:
      hasBodyKey(body, 'featured_room')
        ? canUsePremium && Boolean(body.featured_room)
        : Boolean(currentPlan.featured_room),
    advanced_analytics:
      hasBodyKey(body, 'advanced_analytics')
        ? canUsePro && Boolean(body.advanced_analytics)
        : Boolean(currentPlan.advanced_analytics),
    access_password_hash: hasBodyKey(body, 'access_password')
      ? hashAccessPassword(body.access_password)
      : currentPlan.access_password_hash || null,
  };

  if (hasBodyKey(body, 'private_chat_enabled') || hasBodyKey(body, 'private_chat_code')) {
    updatePayload.private_chat_enabled = Boolean(body.private_chat_enabled);
    updatePayload.private_chat_code_hash = hasBodyKey(body, 'private_chat_code')
      ? hashAccessPassword(body.private_chat_code)
      : currentPlan.private_chat_code_hash || null;
  }

  const { data, error } = await serverSupabase
    .from('plans')
    .update(updatePayload)
    .eq('id', planId)
    .select('id')
    .single();

  if (error) throw error;

  const detail = await fetchSinglePlan(data.id, { ...ctx, isAdmin: true }, { lat: latitude, lng: longitude });
  res.status(200).json(detail || { ok: true, id: data.id });
}

async function handleDeletePlan(res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data: plan, error: planError } = await serverSupabase
    .from('plans')
    .select('id, creator_id')
    .eq('id', planId)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }
  if (!ctx.canManageAdmin && String(plan.creator_id) !== String(ctx.userId)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase.from('plans').delete().eq('id', planId);
  if (error) throw error;
  res.status(200).json({ ok: true });
}

async function handleClosePlan(res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data: plan, error: planError } = await serverSupabase
    .from('plans')
    .select('id, creator_id, title, start_at, city, status')
    .eq('id', planId)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }
  if (!ctx.canManageAdmin && String(plan.creator_id) !== String(ctx.userId)) {
    res.status(403).json({ error: 'Solo el creador o el admin pueden cerrar la sala.' });
    return;
  }

  const { data: updatedPlan, error: closeError } = await serverSupabase
    .from('plans')
    .update({ status: 'cancelled' })
    .eq('id', planId)
    .select('id, creator_id, title, start_at, city, status, updated_at')
    .single();

  if (closeError) throw closeError;

  const { data: participants, error: participantsError } = await serverSupabase
    .from('plan_participants')
    .select('user_id, status')
    .eq('plan_id', planId)
    .neq('user_id', plan.creator_id)
    .in('status', ['pending', 'accepted', 'attended']);

  if (participantsError) throw participantsError;

  const notificationTargets = [...new Set((participants || []).map((row) => row.user_id).filter(Boolean))];
  if (notificationTargets.length > 0) {
    await serverSupabase.from('notifications').insert(
      notificationTargets.map((userId) => ({
        user_id: userId,
        type: 'plan_cancelled',
        title: 'Sala cerrada',
        body: `La sala "${updatedPlan.title}" ha sido cerrada y ya no aceptará accesos.`,
      })),
    ).then(() => null).catch(() => null);
  }

  const { data: creator } = await serverSupabase
    .from('users')
    .select('id, email, name')
    .eq('id', plan.creator_id)
    .maybeSingle();

  await sendPlanClosedEmail({
    email: creator?.email || ctx.profile?.email || ctx.authUser?.email || '',
    name: creator?.name || ctx.profile?.name || 'usuario',
    plan_title: updatedPlan.title,
    start_at: updatedPlan.start_at,
    city: updatedPlan.city,
    closed_by: ctx.canManageAdmin && String(plan.creator_id) !== String(ctx.userId) ? 'administración' : 'anfitrión',
  }).catch(() => null);

  res.status(200).json({ ok: true, plan: updatedPlan });
}

async function handlePlanDetail(req, res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes registrarte para acceder a una sala.' });
    return;
  }

  const detail = await fetchSinglePlan(planId, ctx, {
    lat: req.query.lat || DEFAULT_COORDS.lat,
    lng: req.query.lng || DEFAULT_COORDS.lng,
  });

  if (!detail) {
    res.status(404).json({ error: 'Sala no encontrada o no visible' });
    return;
  }

  res.status(200).json(detail);
}

async function handleJoinPlan(req, res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes registrarte para unirte.' });
    return;
  }
  if (ctx.profile?.is_banned) {
    res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con el administrador.' });
    return;
  }

  const detail = await fetchSinglePlan(planId, { ...ctx, isAdmin: true }, DEFAULT_COORDS);
  if (!detail) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }

  if (String(detail.creator_id) === String(ctx.userId)) {
    res.status(200).json({ ok: true, status: 'accepted' });
    return;
  }

  const body = getRequestBody(req);
  if (detail.requires_password) {
    const providedPasswordHash = hashAccessPassword(body.password);
    const { data: rawPlan, error: rawPlanError } = await serverSupabase
      .from('plans')
      .select('id, access_password_hash')
      .eq('id', planId)
      .single();

    if (rawPlanError) throw rawPlanError;
    if (!providedPasswordHash || String(rawPlan?.access_password_hash || '') !== String(providedPasswordHash)) {
      res.status(403).json({ error: 'Contraseña de acceso incorrecta' });
      return;
    }
  }

  const hasPremiumAccess =
    detail.premium_room
    && String(ctx.subscriptionTier || 'free') !== 'free'
    && !['inactive', 'cancelled'].includes(String(ctx.subscriptionStatus || 'inactive'));
  const isAdultRoom = isAdultRoomLevel(detail.room_level) || String(detail.age_range || '').includes('18');
  const nextStatus =
    isAdultRoom
      ? 'pending'
      : hasPremiumAccess && !detail.requires_password
      ? 'accepted'
      : detail.approval_required || detail.visibility === 'private'
        ? 'pending'
        : 'accepted';
  const { error } = await serverSupabase.from('plan_participants').upsert(
    {
      plan_id: planId,
      user_id: ctx.userId,
      role: 'participant',
      status: nextStatus,
      cancelled_at: null,
    },
    { onConflict: 'plan_id,user_id' },
  );

  if (error) throw error;

  if (String(detail.creator_id) !== String(ctx.userId)) {
    await serverSupabase.from('notifications').insert({
      user_id: detail.creator_id,
      type: 'new_participant',
      title: nextStatus === 'pending' ? 'Nueva solicitud de acceso' : 'Nuevo participante',
      body:
        nextStatus === 'pending'
          ? `${ctx.profile?.name || 'Un usuario'} ha solicitado entrar en tu sala.`
          : `${ctx.profile?.name || 'Un usuario'} se ha unido a tu sala.`,
    });
  }

  res.status(200).json({ ok: true, status: nextStatus });
}

async function handleLeavePlan(res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase
    .from('plan_participants')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('plan_id', planId)
    .eq('user_id', ctx.userId);

  if (error) throw error;
  res.status(200).json({ ok: true });
}

async function handleCreateReport(req, res, ctx) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes iniciar sesión para reportar.' });
    return;
  }

  const body = getRequestBody(req);
  const ticketNumber = createReportTicketNumber();
  const { data, error } = await serverSupabase
    .from('reports')
    .insert({
      reporter_id: ctx.userId,
      reported_user_id: body.reported_user_id || null,
      reported_plan_id: body.reported_plan_id || null,
      ticket_number: ticketNumber,
      reason: String(body.reason || '').trim() || 'conducta inapropiada',
      description: String(body.description || '').trim() || null,
    })
    .select('id, status, ticket_number')
    .single();

  if (error) throw error;

  await serverSupabase
    .from('report_messages')
    .insert({
      report_id: data.id,
      author_user_id: ctx.userId,
      author_role: 'user',
      message:
        String(body.description || '').trim() ||
        `Ticket ${ticketNumber} abierto por ${String(body.reason || 'incidencia').trim() || 'incidencia'}.`,
    })
    .then((result) => result)
    .catch(() => ({ data: null }));

  const [{ data: reporter }, { data: reportedUser }, { data: reportedPlan }] = await Promise.all([
    serverSupabase.from('users').select('id, email, name').eq('id', ctx.userId).maybeSingle(),
    body.reported_user_id
      ? serverSupabase.from('users').select('id, email, name').eq('id', body.reported_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    body.reported_plan_id
      ? serverSupabase.from('plans').select('id, title').eq('id', body.reported_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  await sendReportAlertEmail({
    ticket_number: data?.ticket_number || ticketNumber,
    reason: body.reason,
    description: body.description,
    reporter_email: reporter?.email || ctx.profile?.email || '',
    reported_user_email: reportedUser?.email || '',
    reported_plan_title: reportedPlan?.title || '',
  }).catch(() => null);

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: body.reported_user_id || null,
    action: 'report_created',
    entityType: body.reported_plan_id ? 'plan' : 'user',
    entityId: body.reported_plan_id || body.reported_user_id || data?.id,
    details: {
      reason: body.reason,
      description: body.description,
      report_id: data?.id || null,
      ticket_number: data?.ticket_number || ticketNumber,
    },
  });

  res.status(201).json({ ok: true, report: data });
}

async function handleReportsList(res, ctx) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('reports')
    .select('id, ticket_number, reporter_id, reported_user_id, reported_plan_id, reason, description, status, resolution_text, resolved_at, closed_by, created_at')
    .eq('reporter_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  const userIds = [
    ...new Set(
      (data || [])
        .flatMap((report) => [report.reporter_id, report.reported_user_id, report.closed_by])
        .filter(Boolean),
    ),
  ];
  const planIds = [...new Set((data || []).map((report) => report.reported_plan_id).filter(Boolean))];

  const [{ data: users }, { data: plans }] = await Promise.all([
    userIds.length
      ? serverSupabase.from('users').select('id, name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    planIds.length
      ? serverSupabase.from('plans').select('id, title').in('id', planIds)
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = new Map((users || []).map((row) => [row.id, row]));
  const planMap = new Map((plans || []).map((row) => [row.id, row]));

  res.status(200).json(
    (data || []).map((report) => ({
      ...report,
      reporter: userMap.get(report.reporter_id) || null,
      reported_user: userMap.get(report.reported_user_id) || null,
      reported_plan: planMap.get(report.reported_plan_id) || null,
      closed_by_user: userMap.get(report.closed_by) || null,
    })),
  );
}

async function handleUserBlocksList(res, ctx) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data: blocks, error } = await serverSupabase
    .from('user_blocks')
    .select('id, owner_user_id, blocked_user_id, reason, created_at')
    .eq('owner_user_id', ctx.userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const blockedIds = [...new Set((blocks || []).map((row) => row.blocked_user_id).filter(Boolean))];
  const { data: users, error: usersError } = blockedIds.length
    ? await serverSupabase.from('users').select('id, name, email, photo_url').in('id', blockedIds)
    : { data: [], error: null };

  if (usersError) throw usersError;

  const userMap = new Map((users || []).map((row) => [row.id, row]));
  res.status(200).json(
    (blocks || []).map((row) => ({
      ...row,
      blocked_user: userMap.get(row.blocked_user_id) || null,
    })),
  );
}

async function handleCreateUserBlock(req, res, ctx) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const blockedUserId = String(body.blocked_user_id || '').trim();
  if (!blockedUserId || String(blockedUserId) === String(ctx.userId)) {
    res.status(400).json({ error: 'Usuario a bloquear no válido.' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('user_blocks')
    .upsert(
      {
        owner_user_id: ctx.userId,
        blocked_user_id: blockedUserId,
        reason: String(body.reason || '').trim() || null,
      },
      { onConflict: 'owner_user_id,blocked_user_id' },
    )
    .select('id, owner_user_id, blocked_user_id, reason, created_at')
    .single();

  if (error) throw error;
  res.status(201).json({ ok: true, block: data });
}

async function handleDeleteUserBlock(res, ctx, blockedUserId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase
    .from('user_blocks')
    .delete()
    .eq('owner_user_id', ctx.userId)
    .eq('blocked_user_id', blockedUserId);

  if (error) throw error;
  res.status(200).json({ ok: true });
}

async function handleMessages(req, res, ctx, planId) {
  const detail = await fetchSinglePlan(planId, { ...ctx, isAdmin: ctx.isAdmin }, DEFAULT_COORDS);
  if (!detail) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }
  if (!canUseChat(detail, detail.participants || [], ctx)) {
    res.status(403).json({ error: 'No tienes acceso al chat' });
    return;
  }

  const channel = normalizeChatChannel(req.query.channel);
  const privateCode = String(req.query.code || getRequestBody(req).code || '').trim();

  if (channel === 'private') {
    if (!detail.private_chat_enabled) {
      res.status(403).json({ error: 'El chat privado no está habilitado en esta sala.' });
      return;
    }
    if (!canAccessPrivateChat(detail, ctx, privateCode)) {
      res.status(403).json({ error: 'Código de acceso al chat privado incorrecto.' });
      return;
    }
  }

  if (req.method === 'GET') {
    const { data, error } = await serverSupabase
      .from('messages')
      .select('*, users!messages_user_id_fkey(id, name, photo_url)')
      .eq('plan_id', planId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw error;
    const messageIds = (data || []).map((row) => row.id).filter(Boolean);
    const { data: reactionRows } = messageIds.length
      ? await serverSupabase
          .from('message_reactions')
          .select('message_id, user_id, emoji')
          .in('message_id', messageIds)
          .then((result) => result)
          .catch(() => ({ data: [] }))
      : { data: [] };
    const reactionMap = new Map();
    for (const row of reactionRows || []) {
      const list = reactionMap.get(row.message_id) || [];
      list.push(row);
      reactionMap.set(row.message_id, list);
    }

    res.status(200).json(
      (data || [])
        .filter((row) => {
          const rowChannel = normalizeChatChannel(row.channel);
          return channel === 'private' ? rowChannel === 'private' : rowChannel !== 'private';
        })
        .map((row) => ({
        id: row.id,
        user_id: row.user_id,
        user_name: row.users?.name || 'Usuario',
        user_photo: row.users?.photo_url || null,
        message: row.message,
        image_url: row.image_url || null,
        created_at: row.created_at,
        channel: normalizeChatChannel(row.channel),
        is_pinned: Boolean(row.is_pinned),
        pinned_at: row.pinned_at || null,
        pinned_by: row.pinned_by || null,
        reactions: buildReactionSummary(reactionMap.get(row.id) || [], ctx.userId),
      })),
    );
    return;
  }

  const body = getRequestBody(req);
  const text = String(body.message || '').trim();
  const imageUrl = String(body.image_url || '').trim();
  if (!text && !imageUrl) {
    res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    return;
  }

  const insertPayload = {
    plan_id: planId,
    user_id: ctx.userId,
    message: text || '[imagen]',
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(channel === 'private' ? { channel: 'private' } : {}),
  };

  const { data, error } = await serverSupabase.from('messages').insert(insertPayload).select('id, plan_id, user_id, message, created_at, channel, image_url, is_pinned, pinned_at, pinned_by').single();

  if (error) {
    if (imageUrl) {
      res.status(400).json({ error: 'Para adjuntar imágenes debes aplicar la migración 007 en Supabase.' });
      return;
    }
    if (channel === 'private') {
      res.status(400).json({ error: 'El chat privado requiere aplicar la migración 006 en Supabase.' });
      return;
    }
    throw error;
  }
  res.status(201).json(data);
}

async function handleMessagePin(req, res, ctx, planId, messageId) {
  const detail = await fetchSinglePlan(planId, { ...ctx, isAdmin: ctx.isAdmin }, DEFAULT_COORDS);
  if (!detail) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }
  if (!ctx.canManageAdmin && String(detail.creator_id) !== String(ctx.userId)) {
    res.status(403).json({ error: 'Solo el anfitrión o el admin pueden fijar mensajes.' });
    return;
  }

  const body = getRequestBody(req);
  const shouldPin = body.pinned !== false;
  const { data, error } = await serverSupabase
    .from('messages')
    .update({
      is_pinned: shouldPin,
      pinned_at: shouldPin ? new Date().toISOString() : null,
      pinned_by: shouldPin ? ctx.userId : null,
    })
    .eq('id', messageId)
    .eq('plan_id', planId)
    .select('id, is_pinned, pinned_at, pinned_by')
    .single();

  if (error) {
    res.status(400).json({ error: 'Para fijar mensajes debes aplicar la migración 007 en Supabase.' });
    return;
  }

  res.status(200).json({ ok: true, message: data });
}

async function handleMessageReaction(req, res, ctx, planId, messageId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const detail = await fetchSinglePlan(planId, { ...ctx, isAdmin: ctx.isAdmin }, DEFAULT_COORDS);
  if (!detail || !canUseChat(detail, detail.participants || [], ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const emoji = String(body.emoji || '').trim();
  if (!emoji) {
    res.status(400).json({ error: 'Emoji obligatorio.' });
    return;
  }

  const { data: existing } = await serverSupabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', ctx.userId)
    .eq('emoji', emoji)
    .maybeSingle()
    .then((result) => result)
    .catch(() => ({ data: null }));

  if (existing?.id) {
    const { error } = await serverSupabase
      .from('message_reactions')
      .delete()
      .eq('id', existing.id);
    if (error) {
      res.status(400).json({ error: 'No se pudo quitar la reacción. Aplica la migración 007.' });
      return;
    }
  } else {
    const { error } = await serverSupabase
      .from('message_reactions')
      .insert({
        message_id: Number(messageId),
        user_id: ctx.userId,
        emoji,
      });
    if (error) {
      res.status(400).json({ error: 'No se pudo guardar la reacción. Aplica la migración 007.' });
      return;
    }
  }

  const { data: reactionRows } = await serverSupabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('message_id', messageId)
    .then((result) => result)
    .catch(() => ({ data: [] }));

  res.status(200).json({
    ok: true,
    reactions: buildReactionSummary(reactionRows || [], ctx.userId),
  });
}

async function handleReviews(req, res, ctx, planId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes registrarte para acceder a esta sala.' });
    return;
  }

  const detail = await fetchSinglePlan(planId, { ...ctx, isAdmin: ctx.isAdmin }, DEFAULT_COORDS);
  if (!detail) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return;
  }
  if (!canViewPlan(detail, detail.participants || [], ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  if (req.method === 'GET') {
    const { data, error } = await serverSupabase
      .from('reviews')
      .select('id, plan_id, reviewer_id, reviewed_user_id, rating, comment, created_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data || []);
    return;
  }

  if (!ctx.userId) {
    res.status(401).json({ error: 'Debes iniciar sesión para valorar.' });
    return;
  }

  const body = getRequestBody(req);
  const { error } = await serverSupabase.from('reviews').insert({
    plan_id: planId,
    reviewer_id: ctx.userId,
    reviewed_user_id: body.reviewed_user_id,
    rating: Math.max(1, Math.min(5, Number(body.rating || 5))),
    comment: String(body.comment || '').trim() || null,
  });

  if (error) throw error;
  res.status(201).json({ ok: true });
}

async function handleParticipantDecision(res, ctx, planId, participantUserId, nextStatus) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data: row, error: participantError } = await serverSupabase
    .from('plan_participants')
    .update({
      status: nextStatus,
      cancelled_at: nextStatus === 'rejected' ? new Date().toISOString() : null,
    })
    .eq('plan_id', planId)
    .eq('user_id', participantUserId)
    .select('plan_id, user_id, status')
    .single();

  if (participantError) throw participantError;

  await serverSupabase.from('notifications').insert({
    user_id: participantUserId,
    type: 'plan_updated',
    title: nextStatus === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada',
    body:
      nextStatus === 'accepted'
        ? 'Tu acceso a la sala ha sido aprobado por el administrador.'
        : 'Tu solicitud de acceso a la sala ha sido rechazada.',
  });

  res.status(200).json({ ok: true, participant: row });
}

async function handleAdminUsers(res, ctx) {
  if (!canReadAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('users')
    .select('id, name, email, role, admin_access_level, verified, city, country, rating_avg, rating_count, is_banned, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
    .then((result) => result)
    .catch(() => ({ data: null, error: true }));

  const fallbackUsers = !data
    ? await serverSupabase
        .from('users')
        .select('id, name, email, role, verified, city, country, rating_avg, rating_count, is_banned, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
        .then((result) => result)
        .catch(() => ({ data: null, error: true }))
    : null;

  if ((error && !fallbackUsers) || (fallbackUsers && fallbackUsers.error)) {
    throw new Error('No se pudo cargar el listado administrativo de usuarios.');
  }
  const rows = (data || fallbackUsers?.data || []).map((row) => ({
    ...row,
    admin_access_level: row.admin_access_level || (String(row.role || '') === 'admin' ? 'owner' : 'none'),
  }));
  const userIds = rows.map((row) => row.id).filter(Boolean);
  let subscriptions = [];
  if (userIds.length) {
    const primary = await serverSupabase
      .from('user_subscriptions')
      .select('user_id, tier, status, provider, payment_method, auto_renew, cancel_at_period_end, renewal_at, cancelled_at, admin_notes, never_expires')
      .in('user_id', userIds)
      .then((result) => result)
      .catch(() => ({ data: null, error: true }));

    if (primary?.data) {
      subscriptions = primary.data;
    } else {
      const fallback = await serverSupabase
        .from('user_subscriptions')
        .select('user_id, tier, status, provider, payment_method, auto_renew, cancel_at_period_end, renewal_at, cancelled_at, admin_notes')
        .in('user_id', userIds)
        .then((result) => result)
        .catch(() => ({ data: [] }));
      subscriptions = fallback.data || [];
    }
  }
  const subscriptionMap = new Map((subscriptions || []).map((row) => [row.user_id, row]));
  res.status(200).json(
    rows.map((row) =>
      attachSubscriptionState(
        row,
        { user_metadata: { subscription_tier: 'free', subscription_status: 'inactive' } },
        subscriptionMap.get(row.id),
      ),
    ),
  );
}

async function handleAdminGuestAccessList(res, ctx) {
  if (!canReadAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('guest_access_requests')
    .select('id, full_name, email, phone, city, reason, status, requested_at, approved_at, approval_expires_at, used_at, admin_notes')
    .order('requested_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  res.status(200).json(data || []);
}

async function handleAdminGuestAccessDecision(req, res, ctx, requestId, decision) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const adminNotes = String(body.admin_notes || '').trim() || null;
  const { data: current, error: loadError } = await serverSupabase
    .from('guest_access_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (loadError) throw loadError;

  if (decision === 'approve') {
    const approvalToken = createGuestAccessToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const approvalUrl = `${getBaseUrl(req)}/?invite=${encodeURIComponent(approvalToken)}`;

    const { data, error } = await serverSupabase
      .from('guest_access_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: ctx.userId,
        rejected_at: null,
        rejected_by: null,
        approval_token_hash: hashGuestAccessToken(approvalToken),
        approval_expires_at: expiresAt,
        approval_sent_at: new Date().toISOString(),
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error) throw error;

    await createAuditLog({
      actorUserId: ctx.userId,
      action: 'guest_access_approved',
      entityType: 'guest_access_request',
      entityId: requestId,
      details: { email: current.email, expires_at: expiresAt },
    });

    await sendGuestAccessApprovedEmail({
      email: current.email,
      full_name: current.full_name,
      approval_url: approvalUrl,
      expires_at: expiresAt,
    }).catch(() => null);

    res.status(200).json({ ok: true, request: data });
    return;
  }

  const { data, error } = await serverSupabase
    .from('guest_access_requests')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: ctx.userId,
      approval_token_hash: null,
      approval_expires_at: null,
      approval_sent_at: null,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) throw error;

  await createAuditLog({
    actorUserId: ctx.userId,
    action: 'guest_access_rejected',
    entityType: 'guest_access_request',
    entityId: requestId,
    details: { email: current.email },
  });

  await sendGuestAccessRejectedEmail({
    email: current.email,
    full_name: current.full_name,
    admin_notes: adminNotes,
  }).catch(() => null);

  res.status(200).json({ ok: true, request: data });
}

async function handleAdminUserModeration(res, ctx, targetUserId, nextBanned) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('users')
    .update({ is_banned: nextBanned })
    .eq('id', targetUserId)
    .select('id, email, is_banned')
    .single();

  if (error) throw error;
  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId,
    action: nextBanned ? 'user_banned' : 'user_unbanned',
    entityType: 'user',
    entityId: targetUserId,
    details: { is_banned: nextBanned },
  });
  res.status(200).json({ ok: true, user: data });
}

async function handleAdminCreateUser(req, res, ctx) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  const role = body.role === 'admin' ? 'admin' : 'user';
  const adminAccessLevel = normalizeAdminAccessLevel(body.admin_access_level, role);
  if (!email || !password) {
    res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    return;
  }

  const { data: created, error: createError } = await serverSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: String(body.name || '').trim() || email.split('@')[0],
      role,
      admin_access_level: adminAccessLevel,
      city: String(body.city || '').trim() || DEFAULT_CITY,
      country: String(body.country || '').trim() || DEFAULT_COUNTRY,
    },
  });

  if (createError) throw createError;

  const userPayload = {
    id: created.user.id,
    email,
    name: String(body.name || '').trim() || email.split('@')[0],
    role,
    admin_access_level: adminAccessLevel,
    verified: true,
    city: String(body.city || '').trim() || DEFAULT_CITY,
    country: String(body.country || '').trim() || DEFAULT_COUNTRY,
  };

  let upsertResult = await serverSupabase
    .from('users')
    .upsert(userPayload, { onConflict: 'id' })
    .select('id, email, role, admin_access_level')
    .single()
    .then((result) => result)
    .catch(() => ({ data: null, error: true }));

  if (upsertResult.error) {
    upsertResult = await serverSupabase
      .from('users')
      .upsert(
        {
          id: created.user.id,
          email,
          name: String(body.name || '').trim() || email.split('@')[0],
          role,
          verified: true,
          city: String(body.city || '').trim() || DEFAULT_CITY,
          country: String(body.country || '').trim() || DEFAULT_COUNTRY,
        },
        { onConflict: 'id' },
      )
      .select('id, email, role')
      .single();
  }

  const { data, error } = upsertResult;
  if (error) throw error;
  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: created.user.id,
    action: 'user_created',
    entityType: 'user',
    entityId: created.user.id,
    details: { role: userPayload.role, admin_access_level: adminAccessLevel, email },
  });
  res.status(201).json({ ok: true, user: data });
}

async function handleAdminDeleteUser(res, ctx, targetUserId) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase.auth.admin.deleteUser(targetUserId);
  if (error) throw error;
  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId,
    action: 'user_deleted',
    entityType: 'user',
    entityId: targetUserId,
    details: {},
  });
  res.status(200).json({ ok: true });
}

async function handleAdminSetUserSubscription(req, res, ctx, targetUserId) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const targetProfile = await serverSupabase.from('users').select('*').eq('id', targetUserId).maybeSingle().then((result) => result.data || null);
  if (!targetProfile) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }

  const persisted = await persistSubscriptionState(targetUserId, body, ctx, null, targetProfile);
  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId,
    action: 'admin_subscription_updated',
    entityType: 'subscription',
    entityId: targetUserId,
    details: persisted.snapshot,
  });

  await sendSubscriptionStatusEmail({
    email: targetProfile.email,
    name: targetProfile.name || targetProfile.email,
    tier: persisted.snapshot.subscription_tier,
    status: persisted.snapshot.subscription_status,
    auto_renew: persisted.snapshot.auto_renew,
    cancel_at_period_end: persisted.snapshot.cancel_at_period_end,
    renewal_at: persisted.snapshot.renewal_at,
    provider: persisted.snapshot.subscription_provider,
    admin_notes: persisted.snapshot.subscription_admin_notes,
  }).catch(() => null);

  if (persisted.snapshot.subscription_tier !== 'free') {
    await sendPremiumConditionsEmail({
      email: targetProfile.email,
      name: targetProfile.name || targetProfile.email,
      tier: persisted.snapshot.subscription_tier,
    }).catch(() => null);
  }

  res.status(200).json({ ok: true, subscription: persisted.snapshot });
}

async function handleAdminLogs(res, ctx) {
  if (!canReadAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('audit_logs')
    .select('id, actor_user_id, target_user_id, action, entity_type, entity_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  const userIds = [...new Set((data || []).flatMap((row) => [row.actor_user_id, row.target_user_id]).filter(Boolean))];
  const { data: users } = userIds.length
    ? await serverSupabase.from('users').select('id, name, email').in('id', userIds).then((result) => result)
    : { data: [] };
  const userMap = new Map((users || []).map((row) => [row.id, row]));

  res.status(200).json(
    (data || []).map((row) => ({
      ...row,
      actor: userMap.get(row.actor_user_id) || null,
      target: userMap.get(row.target_user_id) || null,
    })),
  );
}

async function handleAdminTeamNotes(res, ctx) {
  if (!canReadAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('admin_team_notes')
    .select('id, author_user_id, note, pinned, created_at, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const userIds = [...new Set((data || []).map((row) => row.author_user_id).filter(Boolean))];
  const { data: authors } = userIds.length
    ? await serverSupabase.from('users').select('id, name, email, photo_url').in('id', userIds).then((result) => result)
    : { data: [] };
  const authorMap = new Map((authors || []).map((row) => [row.id, row]));

  res.status(200).json(
    (data || []).map((row) => ({
      ...row,
      author: authorMap.get(row.author_user_id) || null,
    })),
  );
}

async function handleAdminUpsertTeamNote(req, res, ctx) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const note = String(body.note || '').trim();
  if (!note) {
    res.status(400).json({ error: 'La nota no puede estar vacía.' });
    return;
  }

  const payload = {
    author_user_id: ctx.userId,
    note,
    pinned: Boolean(body.pinned),
    updated_at: new Date().toISOString(),
  };

  let result;
  if (body.id) {
    result = await serverSupabase
      .from('admin_team_notes')
      .update(payload)
      .eq('id', body.id)
      .select('id, author_user_id, note, pinned, created_at, updated_at')
      .single();
  } else {
    result = await serverSupabase
      .from('admin_team_notes')
      .insert(payload)
      .select('id, author_user_id, note, pinned, created_at, updated_at')
      .single();
  }

  if (result.error) throw result.error;

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: ctx.userId,
    action: body.id ? 'admin_team_note_updated' : 'admin_team_note_created',
    entityType: 'admin_note',
    entityId: String(result.data.id),
    details: { pinned: Boolean(result.data.pinned) },
  });

  res.status(200).json(result.data);
}

async function handleAdminDeleteTeamNote(res, ctx, noteId) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase.from('admin_team_notes').delete().eq('id', noteId);
  if (error) throw error;

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: ctx.userId,
    action: 'admin_team_note_deleted',
    entityType: 'admin_note',
    entityId: String(noteId),
    details: {},
  });

  res.status(200).json({ ok: true });
}

async function handlePremiumSubscribe(req, res, ctx) {
  if (!ctx.userId || !ctx.authUser) {
    res.status(401).json({ error: 'Debes iniciar sesión para suscribirte.' });
    return;
  }

  const body = getRequestBody(req);
  const tier = ['free', 'plus', 'pro'].includes(String(body.tier || '')) ? String(body.tier) : 'free';
  const method = ['paypal', 'stripe'].includes(String(body.method || '')) ? String(body.method) : 'paypal';
  const checkoutToken = String(body.checkout_token || '').trim();

  if (tier !== 'free') {
    const expectedToken = createCheckoutToken(ctx.userId, tier, method);
    if (!checkoutToken || checkoutToken !== expectedToken) {
      res.status(403).json({ error: 'Debes completar el checkout antes de activar un plan premium.' });
      return;
    }
  }

  const persisted = await persistSubscriptionState(
    ctx.userId,
    {
      tier,
      status: tier === 'free' ? 'inactive' : 'active',
      provider: method,
      payment_method: method,
      auto_renew: tier !== 'free',
      cancel_at_period_end: false,
      renewal_at: tier === 'free' ? null : nextRenewalAt(),
      admin_notes: tier === 'free' ? 'Suscripción revertida a free.' : `Activación desde checkout ${method}.`,
    },
    ctx,
    ctx.authUser,
    ctx.profile,
  );

  await createAuditLog({
    actorUserId: ctx.userId,
    targetUserId: ctx.userId,
    action: tier === 'free' ? 'subscription_downgraded' : 'subscription_activated',
    entityType: 'subscription',
    entityId: ctx.userId,
    details: persisted.snapshot,
  });

  if (tier !== 'free') {
    await sendPremiumConditionsEmail({
      email: ctx.profile?.email || ctx.authUser.email,
      name: ctx.profile?.name || ctx.authUser.user_metadata?.name || ctx.authUser.email,
      tier,
    }).catch(() => null);
  }

  await sendSubscriptionStatusEmail({
    email: ctx.profile?.email || ctx.authUser.email,
    name: ctx.profile?.name || ctx.authUser.user_metadata?.name || ctx.authUser.email,
    tier: persisted.snapshot.subscription_tier,
    status: persisted.snapshot.subscription_status,
    auto_renew: persisted.snapshot.auto_renew,
    cancel_at_period_end: persisted.snapshot.cancel_at_period_end,
    renewal_at: persisted.snapshot.renewal_at,
    provider: persisted.snapshot.subscription_provider,
    admin_notes: persisted.snapshot.subscription_admin_notes,
  }).catch(() => null);

  res.status(200).json({
    ok: true,
    tier: persisted.snapshot.subscription_tier,
    status: persisted.snapshot.subscription_status,
    user: {
      id: persisted.authUser.id,
      email: persisted.authUser.email,
      ...persisted.snapshot,
    },
  });
}

async function handlePaymentCheckout(req, res, ctx) {
  if (!ctx.userId || !ctx.authUser) {
    res.status(401).json({ error: 'Debes iniciar sesión para iniciar el pago.' });
    return;
  }

  const body = getRequestBody(req);
  const tier = ['plus', 'pro'].includes(String(body.tier || '')) ? String(body.tier) : null;
  const method = ['paypal', 'stripe'].includes(String(body.method || '')) ? String(body.method) : null;
  if (!tier || !method) {
    res.status(400).json({ error: 'Plan o método de pago no válidos.' });
    return;
  }

  const quote = getPremiumPlanQuote(tier, ctx.profile?.country || DEFAULT_COUNTRY);
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${protocol}://${host}`;
  const checkoutToken = createCheckoutToken(ctx.userId, tier, method);
  const successUrl = `${origin}/premium?success=1&tier=${tier}&method=${method}&checkout_token=${checkoutToken}`;
  const cancelUrl = `${origin}/premium?cancel=1&tier=${tier}&method=${method}`;

  if (method === 'paypal') {
    const business = process.env.PAYPAL_BUSINESS_EMAIL || '';
    if (!business) {
      res.status(500).json({ error: 'PayPal no está configurado.' });
      return;
    }

    const params = new URLSearchParams({
      cmd: '_xclick',
      business,
      item_name: `NexoGo ${quote.title}`,
      amount: String(quote.price),
      currency_code: String(quote.currency || 'eur').toUpperCase(),
      return: successUrl,
      cancel_return: cancelUrl,
      custom: JSON.stringify({ tier, user_id: ctx.userId }),
    });

    res.status(200).json({
      ok: true,
      method,
      url: `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`,
      quote,
    });
    return;
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeSecret) {
    res.status(500).json({ error: 'Stripe no está configurado todavía. Falta STRIPE_SECRET_KEY.' });
    return;
  }

  const stripe = new Stripe(stripeSecret);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: ctx.profile?.email || ctx.authUser.email,
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: quote.currency,
          unit_amount: quote.amountMinor,
          recurring: {
            interval: 'month',
          },
          product_data: {
            name: `NexoGo ${quote.title}`,
            description: `Suscripción ${quote.title} con renovación mensual.`,
          },
        },
      },
    ],
    metadata: {
      user_id: ctx.userId,
      tier,
    },
  });

  res.status(200).json({
    ok: true,
    method,
    url: session.url,
    quote,
  });
}

async function handleAdminReports(res, ctx) {
  if (!canReadAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const { data: reports, error: reportsError } = await serverSupabase
    .from('reports')
    .select('id, ticket_number, reporter_id, reported_user_id, reported_plan_id, reason, description, status, resolution_text, resolved_at, closed_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (reportsError) throw reportsError;

  const userIds = [
    ...new Set(
      (reports || [])
        .flatMap((report) => [report.reporter_id, report.reported_user_id])
        .filter(Boolean),
    ),
  ];
  const planIds = [...new Set((reports || []).map((report) => report.reported_plan_id).filter(Boolean))];

  const [{ data: users, error: usersError }, { data: plans, error: plansError }] = await Promise.all([
    userIds.length
      ? serverSupabase.from('users').select('id, name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length
      ? serverSupabase.from('plans').select('id, title').in('id', planIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersError) throw usersError;
  if (plansError) throw plansError;

  const userMap = new Map((users || []).map((row) => [row.id, row]));
  const planMap = new Map((plans || []).map((row) => [row.id, row]));

  res.status(200).json(
    (reports || []).map((report) => ({
      ...report,
      reporter: userMap.get(report.reporter_id) || null,
      reported_user: userMap.get(report.reported_user_id) || null,
      reported_plan: planMap.get(report.reported_plan_id) || null,
    })),
  );
}

async function handleReportMessages(req, res, ctx, reportId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { data: report, error: reportError } = await serverSupabase
    .from('reports')
    .select('id, reporter_id, ticket_number, status')
    .eq('id', reportId)
    .maybeSingle();

  if (reportError) throw reportError;
  if (!report) {
    res.status(404).json({ error: 'Ticket no encontrado.' });
    return;
  }
  if (!ctx.canReadAdmin && String(report.reporter_id) !== String(ctx.userId)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  if (req.method === 'GET') {
    const { data, error } = await serverSupabase
      .from('report_messages')
      .select('id, report_id, author_user_id, author_role, message, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.status(200).json(data || []);
    return;
  }

  const body = getRequestBody(req);
  const message = String(body.message || '').trim();
  if (!message) {
    res.status(400).json({ error: 'El mensaje del ticket es obligatorio.' });
    return;
  }

  const authorRole = ctx.canReadAdmin ? 'admin' : 'user';
  const { data, error } = await serverSupabase
    .from('report_messages')
    .insert({
      report_id: Number(reportId),
      author_user_id: ctx.userId,
      author_role: authorRole,
      message,
    })
    .select('id, report_id, author_user_id, author_role, message, created_at')
    .single();

  if (error) throw error;
  res.status(201).json({ ok: true, message: data });
}

async function handleAdminReportDecision(req, res, ctx, reportId, nextStatus) {
  if (!canManageAdmin(ctx)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }

  const body = getRequestBody(req);
  const resolutionText =
    String(body.resolution || '').trim() ||
    (nextStatus === 'resolved'
      ? 'Incidencia revisada y cerrada por administración.'
      : 'Ticket descartado tras revisión administrativa.');

  const { data: currentReport, error: currentReportError } = await serverSupabase
    .from('reports')
    .select('id, reporter_id, ticket_number')
    .eq('id', reportId)
    .maybeSingle();

  if (currentReportError) throw currentReportError;
  if (!currentReport) {
    res.status(404).json({ error: 'Ticket no encontrado.' });
    return;
  }

  const { data, error } = await serverSupabase
    .from('reports')
    .update({
      status: nextStatus,
      resolution_text: resolutionText,
      resolved_at: new Date().toISOString(),
      closed_by: ctx.userId,
    })
    .eq('id', reportId)
    .select('id, status, ticket_number, reporter_id, resolution_text, resolved_at')
    .single();

  if (error) throw error;

  await serverSupabase
    .from('report_messages')
    .insert({
      report_id: Number(reportId),
      author_user_id: ctx.userId,
      author_role: 'admin',
      message: `Resolución del ticket ${data.ticket_number || currentReport.ticket_number || reportId}: ${resolutionText}`,
    })
    .then((result) => result)
    .catch(() => ({ data: null }));

  const { data: reporter } = await serverSupabase
    .from('users')
    .select('id, email, name')
    .eq('id', data.reporter_id || currentReport.reporter_id)
    .maybeSingle()
    .then((result) => result)
    .catch(() => ({ data: null }));

  if (reporter?.id) {
    await serverSupabase.from('notifications').insert({
      user_id: reporter.id,
      type: 'report_updated',
      title: `Ticket ${data.ticket_number || currentReport.ticket_number || reportId} actualizado`,
      body: resolutionText,
    }).then((result) => result).catch(() => ({ data: null }));

    await sendReportResolutionEmail({
      email: reporter.email,
      name: reporter.name,
      ticket_number: data.ticket_number || currentReport.ticket_number || reportId,
      status: data.status,
      resolution_text: resolutionText,
      resolved_at: data.resolved_at,
    }).catch(() => null);
  }

  res.status(200).json({ ok: true, report: data });
}

async function handleNotificationRead(res, ctx, notificationId) {
  if (!ctx.userId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { error } = await serverSupabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', ctx.userId);

  if (error) throw error;
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    if (!serverSupabase) {
      res.status(500).json({ error: 'Supabase server no configurado' });
      return;
    }

    const path = Array.isArray(req.query.path) ? req.query.path : [];
    const [root, second, third, fourth, fifth] = path;
    const ctx = await getRequestContext(req);

    if (req.method === 'GET' && root === 'health') {
      await handleHealth(res);
      return;
    }

    if (root === 'guest-access' && second === 'request' && req.method === 'POST') {
      await handleGuestAccessRequest(req, res);
      return;
    }

    if (root === 'guest-access' && second === 'validate' && req.method === 'GET') {
      await handleGuestAccessValidate(req, res);
      return;
    }

    if (root === 'guest-access' && second === 'consume' && req.method === 'POST') {
      await handleGuestAccessConsume(req, res);
      return;
    }

    if (root === 'users' && second === 'me' && req.method === 'GET' && !third) {
      await handleMe(req, res, ctx);
      return;
    }

    if (root === 'users' && second === 'me' && third === 'stats' && req.method === 'GET') {
      await handleStats(res, ctx);
      return;
    }

    if (root === 'users' && second === 'me' && third === 'profile' && req.method === 'PATCH') {
      await handleProfileUpdate(req, res, ctx);
      return;
    }

    if (root === 'users' && second === 'me' && third === 'subscription' && req.method === 'PATCH') {
      await handleUserSubscriptionPreferences(req, res, ctx);
      return;
    }

    if (root === 'users' && second === 'blocks' && req.method === 'GET' && !third) {
      await handleUserBlocksList(res, ctx);
      return;
    }

    if (root === 'users' && second === 'blocks' && req.method === 'POST' && !third) {
      await handleCreateUserBlock(req, res, ctx);
      return;
    }

    if (root === 'users' && second === 'blocks' && third && req.method === 'DELETE') {
      await handleDeleteUserBlock(res, ctx, third);
      return;
    }

    if (root === 'notifications' && req.method === 'GET') {
      await handleNotifications(res, ctx);
      return;
    }

    if (root === 'assistant' && second === 'chat' && req.method === 'POST') {
      await handleChatAssistant(req, res);
      return;
    }

    if (root === 'site-chat' && second === 'messages' && req.method === 'GET') {
      await handleSiteChatList(req, res);
      return;
    }

    if (root === 'site-chat' && second === 'messages' && req.method === 'POST') {
      await handleSiteChatCreate(req, res, ctx);
      return;
    }

    if (root === 'notifications' && second && third === 'read' && req.method === 'PATCH') {
      await handleNotificationRead(res, ctx, second);
      return;
    }

    if (root === 'plans' && req.method === 'GET' && !second) {
      await handlePlanList(req, res, ctx, false);
      return;
    }

    if (root === 'plans' && second === 'nearby' && req.method === 'GET') {
      await handlePlanList(req, res, ctx, true);
      return;
    }

    if (root === 'plans' && req.method === 'POST' && !second) {
      await handleCreatePlan(req, res, ctx);
      return;
    }

    if (root === 'plans' && second && req.method === 'GET' && !third) {
      await handlePlanDetail(req, res, ctx, second);
      return;
    }

    if (root === 'plans' && second && req.method === 'DELETE' && !third) {
      await handleDeletePlan(res, ctx, second);
      return;
    }

    if (root === 'plans' && second && req.method === 'PATCH' && !third) {
      await handleUpdatePlan(req, res, ctx, second);
      return;
    }

    if (root === 'plans' && second && third === 'join' && req.method === 'POST') {
      await handleJoinPlan(req, res, ctx, second);
      return;
    }

    if (root === 'plans' && second && third === 'leave' && req.method === 'POST') {
      await handleLeavePlan(res, ctx, second);
      return;
    }

    if (root === 'plans' && second && third === 'close' && req.method === 'POST') {
      await handleClosePlan(res, ctx, second);
      return;
    }

    if (root === 'plans' && second && third === 'participants' && fourth && fifth === 'approve' && req.method === 'POST') {
      await handleParticipantDecision(res, ctx, second, fourth, 'accepted');
      return;
    }

    if (root === 'plans' && second && third === 'participants' && fourth && fifth === 'reject' && req.method === 'POST') {
      await handleParticipantDecision(res, ctx, second, fourth, 'rejected');
      return;
    }

    if (root === 'plans' && second && third === 'messages' && fourth && fifth === 'pin' && req.method === 'POST') {
      await handleMessagePin(req, res, ctx, second, fourth);
      return;
    }

    if (root === 'plans' && second && third === 'messages' && fourth && fifth === 'reactions' && req.method === 'POST') {
      await handleMessageReaction(req, res, ctx, second, fourth);
      return;
    }

    if (root === 'plans' && second && third === 'messages' && (req.method === 'GET' || req.method === 'POST') && !fourth) {
      await handleMessages(req, res, ctx, second);
      return;
    }

    if (root === 'plans' && second && third === 'reviews' && (req.method === 'GET' || req.method === 'POST')) {
      await handleReviews(req, res, ctx, second);
      return;
    }

    if (root === 'reports' && req.method === 'POST') {
      await handleCreateReport(req, res, ctx);
      return;
    }

    if (root === 'reports' && second && third === 'messages' && (req.method === 'GET' || req.method === 'POST')) {
      await handleReportMessages(req, res, ctx, second);
      return;
    }

    if (root === 'reports' && req.method === 'GET') {
      await handleReportsList(res, ctx);
      return;
    }

    if (root === 'security' && second === 'captcha' && third === 'verify' && req.method === 'POST') {
      await handleCaptchaVerify(req, res);
      return;
    }

    if (root === 'admin' && second === 'users' && req.method === 'GET' && !third) {
      await handleAdminUsers(res, ctx);
      return;
    }

    if (root === 'admin' && second === 'users' && req.method === 'POST' && !third) {
      await handleAdminCreateUser(req, res, ctx);
      return;
    }

    if (root === 'admin' && second === 'guest-access' && req.method === 'GET' && !third) {
      await handleAdminGuestAccessList(res, ctx);
      return;
    }

    if (root === 'admin' && second === 'guest-access' && third && fourth === 'approve' && req.method === 'POST') {
      await handleAdminGuestAccessDecision(req, res, ctx, third, 'approve');
      return;
    }

    if (root === 'admin' && second === 'guest-access' && third && fourth === 'reject' && req.method === 'POST') {
      await handleAdminGuestAccessDecision(req, res, ctx, third, 'reject');
      return;
    }

    if (root === 'admin' && second === 'users' && third && fourth === 'ban' && req.method === 'POST') {
      await handleAdminUserModeration(res, ctx, third, true);
      return;
    }

    if (root === 'admin' && second === 'users' && third && fourth === 'unban' && req.method === 'POST') {
      await handleAdminUserModeration(res, ctx, third, false);
      return;
    }

    if (root === 'admin' && second === 'users' && third && fourth === 'delete' && req.method === 'POST') {
      await handleAdminDeleteUser(res, ctx, third);
      return;
    }

    if (root === 'admin' && second === 'users' && third && fourth === 'subscription' && req.method === 'POST') {
      await handleAdminSetUserSubscription(req, res, ctx, third);
      return;
    }

    if (root === 'admin' && second === 'reports' && req.method === 'GET' && !third) {
      await handleAdminReports(res, ctx);
      return;
    }

    if (root === 'admin' && second === 'reports' && third && fourth === 'resolve' && req.method === 'POST') {
      await handleAdminReportDecision(req, res, ctx, third, 'resolved');
      return;
    }

    if (root === 'admin' && second === 'reports' && third && fourth === 'dismiss' && req.method === 'POST') {
      await handleAdminReportDecision(req, res, ctx, third, 'dismissed');
      return;
    }

    if (root === 'admin' && second === 'logs' && req.method === 'GET') {
      await handleAdminLogs(res, ctx);
      return;
    }

    if (root === 'admin' && second === 'team-notes' && req.method === 'GET' && !third) {
      await handleAdminTeamNotes(res, ctx);
      return;
    }

    if (root === 'admin' && second === 'team-notes' && req.method === 'POST' && !third) {
      await handleAdminUpsertTeamNote(req, res, ctx);
      return;
    }

    if (root === 'admin' && second === 'team-notes' && third && req.method === 'DELETE') {
      await handleAdminDeleteTeamNote(res, ctx, third);
      return;
    }

    if (root === 'premium' && second === 'subscribe' && req.method === 'POST') {
      await handlePremiumSubscribe(req, res, ctx);
      return;
    }

    if (root === 'payments' && second === 'checkout' && req.method === 'POST') {
      await handlePaymentCheckout(req, res, ctx);
      return;
    }

    res.status(404).json({ error: 'Ruta no encontrada' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Error interno' });
  }
}

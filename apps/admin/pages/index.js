import Script from 'next/script';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const AI_ASSISTANT_URL = process.env.NEXT_PUBLIC_AI_ASSISTANT_URL || '/assistant';
const COORDS = { lat: 40.4168, lng: -3.7038 };
const GUEST_STORAGE_KEY = 'social_plans_guest_profile';
const COOKIE_CONSENT_KEY = 'social_plans_cookie_consent';
const JOIN_PERM_BLOCK_KEY = 'social_plans_join_blocks';
const ROOM_ASSISTANT_STORAGE = 'social_plans_assistant_history';
const ROOM_JOIN_REQUESTS = 'social_plans_room_requests';
const PLAN_STORAGE_KEY = 'nexogo_plans';
const SITE_CHAT_STORAGE_KEY = 'nexogo_site_virtual_chat';
const USER_BLOCKS_STORAGE = 'social_plans_user_blocks';
const DEFAULT_AI_NAME = 'Asistente IA Social';
const AI_ASSISTANT_NAME = process.env.NEXT_PUBLIC_AI_ASSISTANT_NAME || DEFAULT_AI_NAME;
const APP_NAME = 'NexoGo';
const MIN_PASSWORD_LENGTH = 10;
const MIN_CHAT_AGE = 18;
const AGE_CONFIRMATION_LABEL = 'Confirmo que tengo 18 años o más y que los chats y el mercado social están reservados a adultos.';
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (process.env.NODE_ENV !== 'production' ? TURNSTILE_TEST_SITE_KEY : '');
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';
const ADMIN_EMAILS = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'admin@nexogo.local')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const CATEGORIES = [
  { key: 'all', label: 'Todo' },
  { key: 'cafe', label: '☕ Café' },
  { key: 'paseo', label: '🚶 Paseo' },
  { key: 'terraceo', label: '🍹 Terraceo' },
  { key: 'running', label: '🏃 Running' },
  { key: 'futbol', label: '⚽ Fútbol' },
  { key: 'paddle', label: '🏓 Pádel' },
  { key: 'estudiar', label: '📚 Estudiar' },
  { key: 'coworking', label: '💻 Coworking' },
  { key: 'gaming', label: '🎮 Gaming' },
  { key: 'idiomas', label: '🗣️ Idiomas' },
  { key: 'fiesta', label: '🎉 Fiesta' },
  { key: 'concierto', label: '🎤 Concierto' },
];

const CATEGORY_LABELS = {
  ...Object.fromEntries(CATEGORIES.map((item) => [item.key, item.label])),
  walk: '🚶 Paseo',
  terrace: '🍹 Terraceo',
  sports: '⚽ Fútbol o pádel',
  study: '📚 Estudiar',
  languages: '🗣️ Idiomas',
  music_event: '🎤 Fiesta o concierto',
};
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

const QUICK_FILTERS = [
  { key: 'all', label: 'Todo', emoji: '🌟' },
  { key: 'today', label: 'Hoy', emoji: '⏰' },
  { key: 'active', label: 'Activos', emoji: '🟢' },
  { key: 'popular', label: 'Populares', emoji: '🔥' },
];

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: `${MIN_PASSWORD_LENGTH}+ caracteres`, test: (value) => String(value || '').length >= MIN_PASSWORD_LENGTH },
  { key: 'upper', label: 'una mayúscula', test: (value) => /[A-ZÁÉÍÓÚÑ]/.test(String(value || '')) },
  { key: 'lower', label: 'una minúscula', test: (value) => /[a-záéíóúñ]/.test(String(value || '')) },
  { key: 'number', label: 'un número', test: (value) => /\d/.test(String(value || '')) },
  { key: 'special', label: 'un símbolo', test: (value) => /[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]/.test(String(value || '')) },
];

const createCaptchaChallenge = () => {
  const left = Math.floor(Math.random() * 7) + 2;
  const right = Math.floor(Math.random() * 7) + 2;
  return {
    question: `${left} + ${right}`,
    answer: String(left + right),
  };
};

const getPasswordChecks = (value) =>
  PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    ok: requirement.test(value),
  }));

const getPasswordStrength = (value) => {
  const checks = getPasswordChecks(value);
  const passed = checks.filter((entry) => entry.ok).length;
  if (!value) return { label: 'Pendiente', tone: 'idle', percent: 0 };
  if (passed <= 2) return { label: 'Baja', tone: 'weak', percent: 28 };
  if (passed <= 4) return { label: 'Media', tone: 'medium', percent: 68 };
  return { label: 'Alta', tone: 'strong', percent: 100 };
};

const SORT_OPTIONS = [
  { key: 'distance', label: 'Más cerca' },
  { key: 'time', label: 'Más pronto' },
  { key: 'popular', label: 'Más gente' },
];

const CHAT_THEMES = [
  { key: 'default', label: 'Azul profundo' },
  { key: 'matrix', label: 'Verde clásico' },
  { key: 'smoke', label: 'Gris humo' },
];

const QUICK_CHAT_ACTIONS = [
  'Llego en 10 min',
  'Estoy en la puerta',
  'Cambio de ubicación',
  'Voy con retraso',
  'Todo listo',
];

const CHAT_SAFETY_MESSAGE =
  'Por tu privacidad, no compartas datos personales, bancarios o sensibles en el chat. Usa la sala bajo tu propio criterio y, si ocurre cualquier amenaza o situación de riesgo, contacta de inmediato con las autoridades competentes de tu ciudad.';

const MESSAGE_REACTION_OPTIONS = ['👍', '🔥', '❤️', '😂', '👏', '🎉'];

const ROOM_THEME_OPTIONS = [
  { key: 'all', label: 'Todas las temáticas', emoji: '🧭', terms: [] },
  { key: 'chat-virtual', label: 'Chat virtual', emoji: '🖥️', terms: ['virtual', 'chat virtual', 'online', 'solo chat'] },
  { key: 'conocer-gente', label: 'Conocer gente', emoji: '🥂', terms: ['conocer gente', 'social', 'amigos', 'grupo'] },
  { key: 'abierto', label: 'Chat general', emoji: '💬', terms: ['chat', 'general', 'abierto', 'social'] },
  { key: 'amistad', label: 'Amistad', emoji: '🤝', terms: ['amistad', 'social', 'plan tranqui'] },
  { key: 'citas', label: 'Citas', emoji: '❤️', terms: ['citas', 'date', 'romántico', 'intimo'] },
  { key: 'sexo-adulto', label: 'Adultos y sexo', emoji: '🔞', terms: ['sexo', 'adulto', '18+', 'intimo', 'hot'] },
  { key: 'gay', label: 'Gay', emoji: '🧑‍🤝‍🧑', terms: ['gay', 'hombres', 'lgtbiq', 'lgbt'] },
  { key: 'lesbico', label: 'Lésbico', emoji: '👭', terms: ['lesbico', 'lesbianas', 'lgtbiq', 'lgbt'] },
  { key: 'bisexual', label: 'Bisexual', emoji: '🩷', terms: ['bisexual', 'bi', 'lgtbiq', 'lgbt'] },
  { key: 'trans-queer', label: 'Trans y queer', emoji: '🏳️‍⚧️', terms: ['trans', 'queer', 'identidad', 'lgtbiq'] },
  { key: 'networking', label: 'Networking', emoji: '🧠', terms: ['networking', 'negocio', 'startup', 'network'] },
  { key: 'gaming', label: 'Gaming chat', emoji: '🎮', terms: ['gaming', 'juegos', 'discord', 'party'] },
  { key: 'idiomas', label: 'Idiomas', emoji: '🗣️', terms: ['idioma', 'language', 'intercambio', 'idiomas'] },
  { key: 'lgtbiq', label: 'LGTBIQ+', emoji: '🏳️‍🌈', terms: ['lgtbiq', 'lgbt', 'queer', 'pride'] },
  { key: 'adultos-18', label: 'Adultos 18+', emoji: '🔞', terms: ['18+', 'adulto', 'adultos', 'sexo', 'intimo'] },
  { key: 'charla-intima', label: 'Charla íntima', emoji: '🫶', terms: ['intima', 'privado', 'confesiones', 'charla'] },
  { key: 'parejas', label: 'Parejas', emoji: '💞', terms: ['parejas', 'couple', 'dos', 'relación'] },
  { key: 'videollamada', label: 'Videollamada', emoji: '📹', terms: ['video', 'videollamada', 'call', 'cámara'] },
  { key: 'deporte', label: 'Deporte', emoji: '🏃', terms: ['deporte', 'running', 'fitness', 'padel', 'fútbol'] },
  { key: 'fiesta', label: 'Fiesta / música', emoji: '🎉', terms: ['fiesta', 'musica', 'concierto', 'evento'] },
];

const ACCESS_FILTER_OPTIONS = [
  { key: 'all', label: 'Todas las salas' },
  { key: 'public', label: 'Solo públicas' },
  { key: 'private', label: 'Solo privadas' },
  { key: 'premium', label: 'Solo premium' },
  { key: 'private-premium', label: 'Privadas premium' },
];

const INITIAL_VISIBLE_PLANS = 6;

const HIGHLIGHT_PANES = [
  { key: 'speed', emoji: '⚡', title: 'Planes exprés', text: 'Abre uno en 10 segundos' },
  { key: 'trust', emoji: '⭐', title: 'Reputación', text: 'Sistemas de valoraciones' },
  { key: 'safety', emoji: '🛡️', title: 'Seguridad', text: 'Reporte y moderación activa' },
  { key: 'chat', emoji: '💬', title: 'Chat', text: 'Coordinación antes del plan' },
  { key: 'maps', emoji: '📍', title: 'Geo', text: 'Encuentra cerca de ti' },
  { key: 'push', emoji: '🔔', title: 'Push', text: 'Notificaciones inteligentes' },
];

const FOOTER_PANELS = {
  about: {
    title: 'Acerca de NexoGo',
    intro: 'NexoGo es una plataforma para descubrir, crear y coordinar salas sociales en tiempo real con foco en proximidad, trazabilidad y seguridad.',
    items: [
      'La plataforma conecta a usuarios para planes físicos o chats privados según visibilidad, suscripción y permisos del creador.',
      'Las publicaciones se moderan con reportes, bloqueos, panel administrativo y registros de auditoría.',
      'Las funciones premium añaden visibilidad, métricas, prioridad comercial y salas premium o destacadas.',
      'El uso del servicio exige información veraz, custodia de credenciales y aceptación de las normas comunitarias.',
    ],
  },
  privacy: {
    title: 'Privacidad',
    intro: 'Tratamos los datos mínimos necesarios para operar la cuenta, moderar incidentes y ejecutar las funciones sociales y premium.',
    items: [
      'Se almacenan datos de cuenta, perfil, ubicación declarada, actividad social, suscripciones, bloqueos, reportes y auditoría interna.',
      'Las salas privadas, solicitudes, chats y suscripciones generan trazabilidad para prevenir fraude, amenazas, spam o abuso.',
      'Los datos no deben usarse para acoso, scraping, suplantación ni seguimiento externo sin base legal o consentimiento.',
      'El usuario puede actualizar su perfil, gestionar bloqueos y cancelar su suscripción desde su panel; la administración conserva registros de seguridad cuando sea necesario.',
    ],
    note: 'El incumplimiento grave de privacidad o seguridad puede implicar suspensión inmediata de cuenta y preservación de evidencias internas.',
  },
  terms: {
    title: 'Términos y condiciones',
    intro: 'El uso de NexoGo implica aceptación expresa de las reglas operativas, de seguridad y de monetización de la plataforma.',
    items: [
      'Solo los usuarios registrados y no bloqueados pueden publicar salas o acceder a funciones restringidas.',
      'Quedan prohibidos amenazas, coacciones, spam, fraude, suplantación, difusión no consentida de datos y cualquier uso ilícito del chat o las salas.',
      'Las suscripciones premium pueden renovarse automáticamente si así se configura; el usuario puede cancelar la renovación o solicitar baja inmediata desde su cuenta.',
      'La administración puede moderar, cerrar salas, rechazar accesos, limitar funciones, retirar ventajas premium o cancelar cuentas ante riesgo operativo o incumplimiento.',
      'Las decisiones de seguridad y moderación se documentan en registros internos y prevalecen frente al uso abusivo del servicio.',
    ],
    note: 'Los pagos, renovaciones, cancelaciones y ventajas premium están sujetos al estado real del cobro y a las políticas vigentes del servicio.',
  },
  premium: {
    title: 'Plan Premium',
    intro: 'Premium Plus y Premium Pro añaden visibilidad, salas premium, insignias, analítica y prioridad comercial.',
    items: [
      'Plus: salas premium, destacadas, insignia y visibilidad reforzada.',
      'Pro: todo Plus y además analítica avanzada, prioridad y presencia superior.',
      'La activación pasa por carrito y checkout; la renovación puede quedar automática o manual según configuración.',
      'La cuenta puede volver a Free por cancelación del usuario, retirada administrativa o incidencia de pago.',
    ],
  },
  help: {
    title: 'Cómo usar la plataforma',
    intro: 'Crea una sala pública o privada, define ubicación, país, visibilidad y permisos antes de publicarla.',
    items: [
      'Las salas privadas pueden exigir contraseña, aprobación manual o canal privado por código.',
      'Los usuarios premium pueden crear o ver salas premium según su plan.',
      'Los cambios de perfil, suscripción y seguridad quedan sincronizados con base de datos y panel admin.',
    ],
  },
  contact: {
    title: 'Contacto',
    intro: 'Canal principal de soporte, apelaciones, incidencias y revisiones administrativas.',
    items: [
      'Correo operativo: info@estructuraweb.es',
      'Usa este canal para apelaciones de bloqueos, incidencias de pago, revisión de reportes o consultas legales.',
    ],
  },
};

const LOCAL_PLAN_SEEDS = [
  {
    plan_id: 'seed-1',
    creator_id: 'seed-host-1',
    creator_name: 'Ana',
    creator_photo: 'https://i.pravatar.cc/100?img=31',
    category_code: 'cafe',
    host_rating: 4.8,
    title: 'Café exprés en Malasaña',
    description: 'Nos encontramos 15 minutos, tomamos algo y nos planteamos otro plan.',
    latitude: 40.4183,
    longitude: -3.6995,
    place_name: 'Malasaña',
    start_at: '2026-03-08T16:45:00.000Z',
    max_people: 6,
    status: 'active',
    room_level: 'informal',
    language: 'es',
    age_range: '18+',
    rules: 'Llega puntual y respeta el lugar.',
    visibility: 'public',
    approval_required: false,
    allow_chat_gpt: true,
    duration_minutes: 90,
    created_at: '2026-03-08T15:20:00.000Z',
    participants_count: 2,
  },
  {
    plan_id: 'seed-2',
    creator_id: 'seed-host-2',
    creator_name: 'Luis',
    creator_photo: 'https://i.pravatar.cc/100?img=12',
    category_code: 'paseo',
    host_rating: 4.9,
    title: 'Paseo de atardecer en Retiro',
    description: 'Paseo tranquilo para empezar semana con buena vibra.',
    latitude: 40.4154,
    longitude: -3.6846,
    place_name: 'Parque del Retiro',
    start_at: '2026-03-08T20:00:00.000Z',
    max_people: 12,
    status: 'active',
    room_level: 'muy social',
    language: 'es',
    age_range: '16+',
    rules: 'Trae ropa cómoda y agua.',
    visibility: 'public',
    approval_required: false,
    allow_chat_gpt: true,
    duration_minutes: 120,
    created_at: '2026-03-08T14:58:00.000Z',
    participants_count: 5,
  },
  {
    plan_id: 'seed-3',
    creator_id: 'seed-host-3',
    creator_name: 'Marta',
    creator_photo: 'https://i.pravatar.cc/100?img=53',
    category_code: 'running',
    host_rating: 4.5,
    title: 'Running rápido a las 20:00',
    description: 'Grupo de ritmo cómodo para 5 km por Castellana.',
    latitude: 40.4213,
    longitude: -3.7055,
    place_name: 'Plaza de Callao',
    start_at: '2026-03-08T17:30:00.000Z',
    max_people: 10,
    status: 'active',
    room_level: 'deportivo',
    language: 'es',
    age_range: '18+',
    rules: 'Sin parar mucho tiempo, ritmo moderado.',
    visibility: 'public',
    approval_required: true,
    allow_chat_gpt: true,
    duration_minutes: 60,
    created_at: '2026-03-08T15:05:00.000Z',
    participants_count: 4,
  },
  {
    plan_id: 'seed-4',
    creator_id: 'seed-host-4',
    creator_name: 'Dani',
    creator_photo: 'https://i.pravatar.cc/100?img=69',
    category_code: 'gaming',
    host_rating: 4.7,
    title: 'Partida nocturna en cowork',
    description: 'Gaming social en terraza, ven con tu portátil o móvil.',
    latitude: 40.4231,
    longitude: -3.6999,
    place_name: 'Centro',
    start_at: '2026-03-08T18:30:00.000Z',
    max_people: 8,
    status: 'active',
    room_level: 'competitivo',
    language: 'es',
    age_range: '18+',
    rules: 'Trae cargador y auriculares.',
    visibility: 'private',
    approval_required: true,
    allow_chat_gpt: true,
    duration_minutes: 180,
    created_at: '2026-03-08T15:25:00.000Z',
    participants_count: 3,
  },
  {
    plan_id: 'seed-5',
    creator_id: 'seed-host-5',
    creator_name: 'Lía',
    creator_photo: 'https://i.pravatar.cc/100?img=43',
    category_code: 'fiesta',
    host_rating: 4.4,
    title: 'Fiesta acústica para desconectar',
    description: 'Set list tranquila, ambiente íntimo y entrada libre.',
    latitude: 40.4092,
    longitude: -3.6906,
    place_name: 'Barrio de Huertas',
    start_at: '2026-03-09T03:00:00.000Z',
    max_people: 18,
    status: 'active',
    room_level: 'relajado',
    language: 'es',
    age_range: '18+',
    rules: 'Entrada libre, sin bebidas.',
    visibility: 'public',
    allow_chat_gpt: true,
    duration_minutes: 150,
    approval_required: true,
    created_at: '2026-03-08T14:40:00.000Z',
    participants_count: 6,
  },
  {
    plan_id: 'seed-6',
    creator_id: 'seed-host-6',
    creator_name: 'Sofía',
    creator_photo: 'https://i.pravatar.cc/100?img=64',
    category_code: 'cultural',
    host_rating: 4.6,
    title: 'Concierto íntimo en Madrid',
    description: 'No hay cartel cerrado todavía, pero ya estamos montando entrada.',
    latitude: 40.4125,
    longitude: -3.7021,
    place_name: 'Largo',
    start_at: '2026-03-09T09:00:00.000Z',
    max_people: 20,
    status: 'in_progress',
    room_level: 'intermedio',
    language: 'es',
    age_range: '16+',
    rules: 'Respeta el orden de asistencia.',
    visibility: 'public',
    allow_chat_gpt: true,
    duration_minutes: 200,
    approval_required: false,
    created_at: '2026-03-08T14:20:00.000Z',
    participants_count: 9,
  },
];

const DEFAULT_PLAN_FORM = {
  title: 'Plan exprés',
  description: 'Nos vemos y hacemos algo rápido',
  category: 'cafe',
  place_name: 'Centro',
  address: '',
  district: 'Centro',
  city: 'Madrid',
  country: 'España',
  latitude: String(COORDS.lat),
  longitude: String(COORDS.lng),
  start_at: '2026-03-08T18:00:00.000Z',
  max_people: '8',
  duration_minutes: '90',
  visibility: 'public',
  access_password: '',
  approval_required: false,
  rules: '',
  language: 'es',
  age_range: '18+',
  room_level: 'abierto',
  premium_room: false,
  featured_room: false,
  advanced_analytics: false,
  private_chat_enabled: false,
  private_chat_code: '',
};

const DEFAULT_GUEST = {
  id: '',
  name: 'Visitante',
  photo: 'https://i.pravatar.cc/100?img=65',
  email: '',
  city: 'Madrid',
  registered: false,
  role: 'guest',
  phone: '',
  address: '',
  district: '',
  postal_code: '',
  bio: '',
  interests: '',
  emergency_contact: '',
  birth_date: '',
  username: '',
};

const DEFAULT_AUTH_FORM = {
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  password: '',
  password_confirm: '',
  phone: '',
  birth_date: '',
  address: '',
  district: '',
  city: 'Madrid',
  postal_code: '',
  photo: '',
  bio: '',
  interests: '',
  emergency_contact: '',
  confirm_adult: false,
};

const DEFAULT_GUEST_REQUEST_FORM = {
  full_name: '',
  email: '',
  phone: '',
  city: 'Madrid',
  reason: '',
};

const SITE_NOTIF_SEED = [
  {
    id: 'site-notif-1',
    type: 'site_notice',
    title: 'Aviso de privacidad',
    body: 'No compartas datos personales, ubicaciones privadas o información sensible fuera de lo necesario para la coordinación.',
    created_at: '2026-03-08T09:00:00.000Z',
    is_local: true,
  },
  {
    id: 'site-notif-2',
    type: 'site_notice',
    title: 'Seguridad comunitaria',
    body: 'Si detectas amenazas, coacciones o comportamientos de riesgo, usa el sistema de reportes y contacta con las autoridades si procede.',
    created_at: '2026-03-08T08:30:00.000Z',
    is_local: true,
  },
  {
    id: 'site-notif-3',
    type: 'site_notice',
    title: 'Salas premium',
    body: 'Las salas premium son visibles para cuentas premium activas. Si además tienen contraseña, el acceso sigue requiriendo la clave correcta.',
    created_at: '2026-03-08T08:00:00.000Z',
    is_local: true,
  },
];

const COUNTRY_OPTIONS = (() => {
  const regionNames = new Intl.DisplayNames([DATE_LOCALE], { type: 'region' });
  const list = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`;
      const name = regionNames.of(code);
      if (name && name !== code) list.push(name);
    }
  }
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, DATE_LOCALE));
})();

const getPlanId = (plan) => plan?.plan_id || plan?.id;

const getAgeFromBirthDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
};
const getUserAvatar = (value) => {
  const fallback = 'https://i.pravatar.cc/100?img=1';
  if (!value) return fallback;
  if (String(value).startsWith('http')) return value;
  const clean = String(value).trim();
  if (!clean) return fallback;
  if (clean.includes(' ')) return fallback;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&background=60a5fa&color=ffffff&size=128&rounded=true`;
};

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
    second: '2-digit',
  });
}

function formatShortDate(iso) {
  if (!iso) return 'sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'sin fecha';
  return d.toLocaleString(DATE_LOCALE, {
    timeZone: DATE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isAdultRoomTheme(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['sexo-adulto', 'adultos-18'].includes(normalized) || normalized.includes('adult') || normalized.includes('sexo') || normalized.includes('18+');
}

function relativeTime(iso) {
  if (!iso) return 'sin fecha';
  const now = Date.now();
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'sin fecha';

  const diff = at - now;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hrs = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);

  if (days > 0) return `${diff > 0 ? 'en ' : 'hace '}${days} día${days === 1 ? '' : 's'}`;
  if (hrs > 0) return `${diff > 0 ? 'en ' : 'hace '}${hrs} hora${hrs === 1 ? '' : 's'}`;
  if (mins > 0) return `${diff > 0 ? 'en ' : 'hace '}${mins} min`;
  return 'Ahora mismo';
}

function roomRequestKey(plan, userId) {
  return `${plan?.plan_id || plan?.id || 'unknown'}::${userId || 'guest'}`;
}

function generatePrivateChatCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function getDefaultPlanDetails(plan = {}) {
  return {
    address: plan.address || 'Próximo punto de encuentro',
    district: plan.district || 'Sin distrito',
    city: plan.city || 'Madrid',
    country: plan.country || 'España',
    language: plan.language || 'es',
    age_range: plan.age_range || '18+',
    room_level: plan.room_level || 'social',
    duration_minutes: plan.duration_minutes || 90,
    rules: plan.rules || 'Respeta al grupo y respeta el lugar.',
    latitude: plan.latitude || COORDS.lat,
    longitude: plan.longitude || COORDS.lng,
    host_about: plan.host_about || 'Anfitrión activo de la comunidad',
    host_rating: Number.isFinite(Number(plan.host_rating)) ? Number(plan.host_rating) : 4.6,
    rating_count: plan.rating_count || 0,
    allow_chat_gpt: plan.allow_chat_gpt !== false,
    participant_labels: Array.isArray(plan.participant_labels) ? plan.participant_labels : [],
  };
}

function buildAssistantContext(plan = {}) {
  const details = getDefaultPlanDetails(plan);
  return {
    title: plan.title || 'Sala sin título',
    category: plan.category_code || plan.category || 'general',
    place_name: plan.place_name || 'Lugar por definir',
    city: details.city,
    start_at: plan.start_at,
    max_people: plan.max_people || 0,
    participants_count: Number(plan.participants_count || 0),
    visibility: plan.visibility || 'public',
    language: details.language,
  };
}

function getPlanVisualMeta(plan = {}) {
  const level = String(plan.room_level || '').toLowerCase();
  if (level.includes('adult') || level.includes('sexo') || level.includes('18')) return { icon: '🔞', label: 'Adultos 18+' };
  if (level.includes('cita') || level.includes('rom')) return { icon: '❤️', label: 'Citas' };
  if (level.includes('amistad')) return { icon: '🤝', label: 'Amistad' };
  if (level.includes('network')) return { icon: '🧠', label: 'Networking' };
  if (level.includes('lgt')) return { icon: '🏳️‍🌈', label: 'LGTBIQ+' };
  if (level.includes('idioma')) return { icon: '🗣️', label: 'Idiomas' };
  if (level.includes('gaming')) return { icon: '🎮', label: 'Gaming chat' };
  if (level.includes('fiesta') || level.includes('music')) return { icon: '🎉', label: 'Fiesta / música' };

  const category = String(plan.category_code || plan.category || '').toLowerCase();
  if (category.includes('cafe')) return { icon: '☕', label: 'Café' };
  if (category.includes('walk') || category.includes('paseo')) return { icon: '🚶', label: 'Paseo' };
  if (category.includes('running')) return { icon: '🏃', label: 'Running' };
  if (category.includes('sports')) return { icon: '⚽', label: 'Deporte' };
  if (category.includes('study')) return { icon: '📚', label: 'Estudio' };
  if (category.includes('cowork')) return { icon: '💻', label: 'Coworking' };
  if (category.includes('gaming')) return { icon: '🎮', label: 'Gaming' };
  if (category.includes('languages')) return { icon: '🗣️', label: 'Idiomas' };
  if (category.includes('music')) return { icon: '🎤', label: 'Evento' };
  return { icon: '💬', label: 'Sala social' };
}

function assistantFallbackReply(plan, question) {
  const text = String(question || '').toLowerCase();
  const city = (plan.city || 'la ciudad').toString();
  if (text.includes('hora') || text.includes('cuándo') || text.includes('empieza')) {
    return `Esta sala comienza el ${fmtDate(plan.start_at)}. Te recomiendo confirmar con el chat del plan antes de llegar.`;
  }
  if (text.includes('mapa') || text.includes('cómo llegar') || text.includes('ubicación')) {
    return `La ubicación marcada es ${plan.place_name || 'el punto de encuentro'}, ${city}. Puedes abrir Google Maps desde el detalle con “Ver en mapa”.`;
  }
  if (text.includes('regla') || text.includes('norma')) {
    return `Normas destacadas de la sala: ${plan.rules || 'Mantener respeto y puntualidad.'}`;
  }
  if (text.includes('precios') || text.includes('coste') || text.includes('entrada')) {
    return 'No se especificó coste de entrada. Si aplica, se anuncia en la descripción del plan.';
  }
  return `${AI_ASSISTANT_NAME} te recomienda revisar la información del plan y activar chat para acordar puntos de encuentro.`;
}

function distanceText(value = 0) {
  const meters = Number(value) || 0;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function normalizeCategoryKey(value) {
  return CATEGORY_ALIASES[String(value || '').trim().toLowerCase()] || String(value || 'cafe');
}

async function api(path, options = {}, userId = null) {
  const headers = {
    'content-type': 'application/json',
    ...(userId ? { 'x-user-id': userId } : {}),
    ...(options.headers || {}),
  };

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers,
  }).then(async (res) => {
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((payload && (payload.error || payload.title)) || `Error ${res.status}`);
    }
    return payload;
  });
}

function readJsonLS(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return fallback;
    return value;
  } catch {
    return fallback;
  }
}

function writeJsonLS(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function getStoredPlans() {
  const value = readJsonLS(PLAN_STORAGE_KEY, []);
  return Array.isArray(value) ? value : [];
}

function saveStoredPlans(plans) {
  writeJsonLS(PLAN_STORAGE_KEY, plans);
}

function getGuestProfile() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isRegisteredProfile(profile) {
  return Boolean(profile?.registered && profile?.email);
}

function setGuestProfile(profile) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // noop
  }
}

function normalizeSupabaseProfile(sessionUser, localProfile = {}) {
  if (!sessionUser) return null;
  const data = sessionUser.user_metadata || {};
  const firstName = data.first_name || localProfile.first_name || '';
  const lastName = data.last_name || localProfile.last_name || '';
  const name = data.name || `${firstName} ${lastName}`.trim() || localProfile.name || sessionUser.email || 'Usuario';
  return {
    ...DEFAULT_GUEST,
    ...localProfile,
    ...data,
    id: sessionUser.id,
    name,
    email: sessionUser.email || localProfile.email || '',
    registered: true,
    subscription_tier: localProfile.subscription_tier || data.subscription_tier || 'free',
    subscription_status: localProfile.subscription_status || data.subscription_status || 'inactive',
    auto_renew: localProfile.auto_renew ?? data.auto_renew ?? false,
    cancel_at_period_end: localProfile.cancel_at_period_end ?? data.cancel_at_period_end ?? false,
    role:
      data.role ||
      localProfile.role ||
      (ADMIN_EMAILS.includes(String(sessionUser.email || '').toLowerCase()) ? 'admin' : 'user'),
    photo: data.photo || localProfile.photo || getUserAvatar(name),
  };
}

function getCookieDefaults() {
  const fallback = {
    essential: true,
    functional: true,
    analytics: false,
    personalization: false,
    accepted: false,
    acceptedAt: null,
  };

  const stored = readJsonLS(COOKIE_CONSENT_KEY, null);
  if (!stored) return fallback;
  return { ...fallback, ...stored, acceptedAt: stored.acceptedAt || null };
}

function getJoinBlockList() {
  return readJsonLS(JOIN_PERM_BLOCK_KEY, {});
}

function saveJoinBlockList(value) {
  writeJsonLS(JOIN_PERM_BLOCK_KEY, value);
}

function getRoomRequestCache() {
  return readJsonLS(ROOM_JOIN_REQUESTS, {});
}

function getUserBlockCache() {
  return readJsonLS(USER_BLOCKS_STORAGE, {});
}

function getBlockedUsersFor(ownerId) {
  const value = getUserBlockCache();
  return Array.isArray(value?.[String(ownerId || '')]) ? value[String(ownerId || '')] : [];
}

function saveBlockedUsersFor(ownerId, entries) {
  const value = getUserBlockCache();
  value[String(ownerId || '')] = entries;
  writeJsonLS(USER_BLOCKS_STORAGE, value);
}

function saveRoomRequestCache(value) {
  writeJsonLS(ROOM_JOIN_REQUESTS, value);
}

function PlanStatusBadge({ status }) {
  const state = String(status || 'active');
  if (state === 'active') return <span className="status-pill status-ok">Abierto</span>;
  if (state === 'full') return <span className="status-pill status-warning">Completo</span>;
  if (state === 'in_progress') return <span className="status-pill status-go">En vivo</span>;
  if (state === 'completed') return <span className="status-pill status-offline">Finalizado</span>;
  if (state === 'cancelled') return <span className="status-pill status-offline">Cerrada</span>;
  return <span className="status-pill">Estado</span>;
}

function PlanPost({ plan, currentUserId, onJoin, onLeave, onOpenChat, onOpenDetail, blockedByHost }) {
  const visual = getPlanVisualMeta(plan);
  const isJoined = plan.my_status === 'accepted';
  const pending = plan.my_status === 'pending';
  const isOwner = String(plan.creator_id) === String(currentUserId);
  const premiumDirectJoin = plan.premium_room && !plan.requires_password && !isAdultRoomTheme(plan.room_level);
  const requiresAccess = isOwner ? false : (plan.approval_required || plan.visibility === 'private') && !premiumDirectJoin;
  const participantCount = Number(plan.participants_count || 0);
  const maxPeople = Number(plan.max_people || 0);
  const roomAvatar = getUserAvatar(plan.creator_photo || plan.creator_name);
  const hostLabel = plan.creator_name || 'Anfitrión anónimo';
  const progress = maxPeople > 0 ? Math.max(0, Math.min(100, (participantCount / maxPeople) * 100)) : 0;
  const categoryLabel = CATEGORY_LABELS[plan.category_code] || 'General';
  const isFull = maxPeople > 0 && participantCount >= maxPeople;
  const cannotJoin = isFull || plan.status === 'full' || plan.status === 'completed' || plan.status === 'cancelled';
  const visibilityClass = plan.visibility === 'private' ? 'tag tag-private' : 'tag';
  const visibilityLabel = plan.visibility === 'private' ? '🔒 Privado' : '🌐 Público';
  const isRejected = plan.my_status === 'rejected';
  const actionLabel = pending
    ? '⏳ Esperando aprobación'
    : isJoined
      ? 'Salir del plan'
      : requiresAccess
        ? 'Solicitar acceso'
        : 'Unirme';
  const actionDisabled = pending || isJoined || cannotJoin || blockedByHost || isRejected;
  const joinButtonClass = isJoined ? 'btn-danger' : actionDisabled ? 'btn-ghost' : 'btn-primary';
  const isChatAvailable = isJoined || isOwner;

  return (
    <article className="post-card">
      <div className="post-head">
        <div className="post-author">
          <div className="avatar-stack">
            <img src={roomAvatar} alt={hostLabel} className="avatar avatar-img" />
            {plan.premium_room && <span className="premium-badge premium-badge-avatar">P</span>}
          </div>
          <div>
            <h3>
              {hostLabel}
              {plan.premium_room && <span className="premium-badge premium-badge-inline">P</span>}
            </h3>
            <p className="muted">Plan publicado · {fmtDate(plan.created_at)}</p>
          </div>
        </div>
        <div className="post-head-pill">
          <PlanStatusBadge status={plan.status} />
          <span className="tag">{categoryLabel}</span>
          <span className="tag">{visual.icon} {visual.label}</span>
          {plan.premium_room && <span className="tag tag-premium">Premium</span>}
          <span className={visibilityClass}>{visibilityLabel}</span>
        </div>
      </div>

      <div className="post-title-row">
        <span className="plan-icon-badge">{visual.icon}</span>
        <h2 className="post-title">{plan.title}</h2>
      </div>
      <p className="post-desc">{plan.description || 'Sin descripción'}</p>

      <div className="progress-wrap">
        <span>
          Ocupación {participantCount}/{maxPeople || '∞'}
        </span>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="post-meta-grid">
        <span>📍 {plan.place_name || 'Lugar por definir'}</span>
        <span>🕒 {fmtDate(plan.start_at)}</span>
        <span>🌍 {plan.city || 'Madrid'}</span>
        <span>📡 {distanceText(plan.distance_meters)}</span>
      </div>

      <p className="muted plan-subtext">
        {requiresAccess ? '🔒 Entrada con aprobación' : premiumDirectJoin ? '👑 Entrada premium directa' : '✅ Entrada libre'} · {plan.visibility || 'public'} · ⭐{' '}
        {plan.host_rating || 'N/A'} reputación · {plan.room_level || 'nivel general'} · {plan.language ? `Idioma ${plan.language}` : ''}
      </p>
      <div className="pill-row plan-chip-row">
        {plan.private_chat_enabled && <span className="chip chip-pending">🔐 Chat privado</span>}
        {plan.premium_room && <span className="chip chip-owner">👑 Solo premium</span>}
        {String(plan.visibility || '') === 'private' && <span className="chip chip-private">🔒 Acceso privado</span>}
      </div>

      <div className="post-actions">
        {isJoined ? (
          <button className="btn btn-danger" onClick={() => onLeave(plan)}>
            Salir del plan
          </button>
        ) : (
          <button
            className={`btn ${joinButtonClass}`}
            disabled={actionDisabled}
            onClick={() => onJoin(plan)}
          >
            {actionLabel}
          </button>
        )}
        {isOwner && <span className="chip chip-owner">Soy anfitrión</span>}
        {blockedByHost && !isOwner && <span className="chip chip-private">Bloqueado por privacidad</span>}
        {pending && <span className="chip chip-pending">Solicitud enviada</span>}
        {isRejected && <span className="chip chip-danger">Entrada rechazada</span>}
        <button className="btn btn-ghost" onClick={() => onOpenChat(plan)} disabled={!isChatAvailable && !isOwner}>
          Chat
        </button>
        <button className="btn btn-ghost" onClick={() => onOpenDetail(plan)}>
          Ver detalle
        </button>
      </div>
    </article>
  );
}

function NotificationCard({ n }) {
  return (
    <article className="mini-card">
      <h4>{n.title}</h4>
      <p>{n.body}</p>
      <span className="muted">{fmtDate(n.created_at)}</span>
    </article>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [pageBusy, setPageBusy] = useState(false);
  const [health, setHealth] = useState({ ok: false, admin_token: '-' });
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState(DEFAULT_GUEST);
  const [stats, setStats] = useState({ plans_created: 0, plans_joined: 0, reviews_received: 0, online_users: 0 });
  const [plans, setPlans] = useState([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [radius, setRadius] = useState('8000');
  const [hours, setHours] = useState('24');
  const [notifications, setNotifications] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [workspaceRequest, setWorkspaceRequest] = useState({ planId: '', adminView: false, opened: false });
  const [chatPlan, setChatPlan] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatParticipants, setChatParticipants] = useState([]);
  const [chatHistory, setChatHistory] = useState({});
  const [chatSilentAdminMode, setChatSilentAdminMode] = useState(false);
  const [chatChannel, setChatChannel] = useState('main');
  const [chatPrivateCode, setChatPrivateCode] = useState('');
  const [chatPrivateDraftCode, setChatPrivateDraftCode] = useState('');
  const [chatPrivateReady, setChatPrivateReady] = useState(false);
  const [chatPrivateError, setChatPrivateError] = useState('');
  const [chatText, setChatText] = useState('');
  const [chatImagePreview, setChatImagePreview] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [siteChatOpen, setSiteChatOpen] = useState(false);
  const [siteChatMessages, setSiteChatMessages] = useState([]);
  const [siteChatText, setSiteChatText] = useState('');
  const [siteChatLoading, setSiteChatLoading] = useState(false);
  const [chatTheme, setChatTheme] = useState('default');
  const [assistantText, setAssistantText] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState({});
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewUser, setReviewUser] = useState('');
  const [joinPermissionPlan, setJoinPermissionPlan] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinRequestError, setJoinRequestError] = useState('');
  const [joinBlocks, setJoinBlocks] = useState({});
  const [roomRequests, setRoomRequests] = useState({});
  const [tab, setTab] = useState('all');
  const [sortBy, setSortBy] = useState('distance');
  const [search, setSearch] = useState('');
  const [quickJoinQuery, setQuickJoinQuery] = useState('');
  const [quickJoinNotice, setQuickJoinNotice] = useState('');
  const [roomThemeFilter, setRoomThemeFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [privateJoinSearch, setPrivateJoinSearch] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [cookieConsent, setCookieConsent] = useState({
    essential: true,
    functional: true,
    analytics: false,
    personalization: false,
    accepted: false,
    acceptedAt: null,
  });
  const [planForm, setPlanForm] = useState(DEFAULT_PLAN_FORM);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authForm, setAuthForm] = useState(DEFAULT_AUTH_FORM);
  const [guestRequestForm, setGuestRequestForm] = useState(DEFAULT_GUEST_REQUEST_FORM);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('register');
  const [captchaChallenge, setCaptchaChallenge] = useState(() => createCaptchaChallenge());
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [approvedGuestInvite, setApprovedGuestInvite] = useState(null);
  const [blockedNoticeOpen, setBlockedNoticeOpen] = useState(false);
  const [reportPlan, setReportPlan] = useState(null);
  const [closePlanTarget, setClosePlanTarget] = useState(null);
  const [reportReason, setReportReason] = useState('amenazas');
  const [reportDescription, setReportDescription] = useState('');
  const [footerPanel, setFooterPanel] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [reportBlockPrompt, setReportBlockPrompt] = useState(null);

  const isPlanBlockedByHost = (planId) => !!joinBlocks[String(planId)];
  const isRegistered = isRegisteredProfile(user);
  const isAdmin = ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase()) || String(user?.role || '') === 'admin';
  const isPremiumActive =
    String(user?.subscription_tier || 'free') !== 'free'
    && !['inactive', 'cancelled'].includes(String(user?.subscription_status || 'inactive'));
  const canUsePremiumRooms = isAdmin || isPremiumActive;
  const isAdultPremiumTheme = isAdultRoomTheme(planForm.room_level);
  const isUserBlocked = (targetUserId) =>
    blockedUsers.some((entry) => String(entry.id || entry.user_id) === String(targetUserId || ''));
  const adminPendingRequests = Object.values(roomRequests || {})
    .flat()
    .filter((item) => item?.status === 'pending').length;
  const adminPrivateRooms = plans.filter((plan) => String(plan.visibility || 'public') === 'private').length;
  const adminLiveRooms = plans.filter((plan) => String(plan.status || '') === 'in_progress').length;
  const passwordChecks = getPasswordChecks(authForm.password);
  const passwordStrength = getPasswordStrength(authForm.password);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
  const captchaContainerRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const roomChatMessagesRef = useRef(null);
  const siteChatMessagesRef = useRef(null);

  const resetCaptchaState = (refreshMath = true) => {
    setCaptchaToken('');
    setCaptchaAnswer('');
    if (turnstileEnabled && typeof window !== 'undefined' && window.turnstile && turnstileWidgetRef.current !== null) {
      try {
        window.turnstile.reset(turnstileWidgetRef.current);
      } catch {
        turnstileWidgetRef.current = null;
      }
    }
    if (!turnstileEnabled && refreshMath) {
      setCaptchaChallenge(createCaptchaChallenge());
    }
  };

  useEffect(() => {
    if (!turnstileEnabled || !authOpen || profileOpen || !['register', 'invite'].includes(authMode)) return undefined;

    let poll = null;
    const renderWidget = () => {
      if (typeof window === 'undefined' || !window.turnstile || !captchaContainerRef.current) return false;
      if (turnstileWidgetRef.current !== null) {
        try {
          window.turnstile.reset(turnstileWidgetRef.current);
        } catch {
          turnstileWidgetRef.current = null;
        }
        return true;
      }
      turnstileWidgetRef.current = window.turnstile.render(captchaContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: authMode === 'invite' ? 'guest_request' : 'register',
        theme: 'light',
        callback: (token) => setCaptchaToken(String(token || '')),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
      return true;
    };

    if (!renderWidget()) {
      poll = window.setInterval(() => {
        if (renderWidget()) {
          window.clearInterval(poll);
        }
      }, 250);
    }

    return () => {
      if (poll) window.clearInterval(poll);
    };
  }, [turnstileEnabled, authOpen, profileOpen, authMode]);

  const bootstrapGuest = async () => {
    const localProfile = getGuestProfile();
    let profile = {
      ...DEFAULT_GUEST,
      ...(localProfile || {}),
      id: localProfile?.id || `guest-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    };

    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data?.session?.user || null;
      if (sessionUser) {
        profile = normalizeSupabaseProfile(sessionUser, profile) || profile;
      }
    }

    setUser(profile);
    setUserId(String(profile.id));
    setAuthForm({
      ...DEFAULT_AUTH_FORM,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      username: profile.username || '',
      email: profile.email || '',
      password: '',
      password_confirm: '',
      phone: profile.phone || '',
      birth_date: profile.birth_date || '',
      address: profile.address || '',
      district: profile.district || '',
      city: profile.city || 'Madrid',
      postal_code: profile.postal_code || '',
      photo: profile.photo || '',
      bio: profile.bio || '',
      interests: profile.interests || '',
      emergency_contact: profile.emergency_contact || '',
      confirm_adult: (getAgeFromBirthDate(profile.birth_date) || 0) >= MIN_CHAT_AGE,
    });
    setGuestProfile(profile);
    setLoading(false);
  };

  useEffect(() => {
    bootstrapGuest();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const planId = String(params.get('plan') || '').trim();
    if (!planId) return;
    setWorkspaceRequest({
      planId,
      adminView: params.get('admin_view') === '1' || params.get('chat') === '1',
      opened: false,
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = String(params.get('invite') || '').trim();
    if (!inviteToken) return;

    api(`/guest-access/validate?token=${encodeURIComponent(inviteToken)}`)
      .then((payload) => {
        const invitation = payload?.invitation;
        if (!invitation) return;
        setApprovedGuestInvite({ ...invitation, token: inviteToken });
        setAuthForm((current) => {
          const fullName = String(invitation.full_name || '').trim();
          const parts = fullName.split(/\s+/).filter(Boolean);
          return {
            ...current,
            email: invitation.email || current.email,
            city: invitation.city || current.city || 'Madrid',
            first_name: current.first_name || parts[0] || '',
            last_name: current.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
          };
        });
        setAuthMode('register');
        setAuthOpen(true);
        setAuthError('');
        setAuthNotice('Tu acceso invitado ha sido aprobado. Completa el registro con ese mismo correo en menos de 24 horas.');
      })
      .catch((error) => {
        setApprovedGuestInvite(null);
        setAuthError(error?.message || 'No se pudo validar la invitación.');
      });
  }, []);

  useEffect(() => {
    setJoinBlocks(getJoinBlockList());
    setRoomRequests(getRoomRequestCache());
    setCookieConsent(getCookieDefaults());
  }, []);

  useEffect(() => {
    if (!userId) return;
    const local = getBlockedUsersFor(userId);
    setBlockedUsers(local);
    if (!isRegistered) return;
    api('/users/blocks', {}, userId)
      .then((rows) => {
        const normalized = (Array.isArray(rows) ? rows : []).map((entry) => ({
          id: entry.blocked_user?.id || entry.blocked_user_id,
          name: entry.blocked_user?.name || 'Usuario bloqueado',
          email: entry.blocked_user?.email || '',
          created_at: entry.created_at,
          user_id: entry.blocked_user_id,
        }));
        setBlockedUsers(normalized);
        saveBlockedUsersFor(userId, normalized);
      })
      .catch(() => {
        setBlockedUsers(local);
      });
  }, [userId]);

  useEffect(() => {
    if (!supabase) return undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user || null;
      if (!sessionUser) {
        const guest = getGuestProfile() || DEFAULT_GUEST;
        setUser({ ...DEFAULT_GUEST, ...guest, registered: false, role: 'guest' });
        setUserId(String(guest.id || ''));
        return;
      }

      const nextProfile = normalizeSupabaseProfile(sessionUser, getGuestProfile() || {}) || DEFAULT_GUEST;
      setUser(nextProfile);
      setUserId(String(nextProfile.id));
      setGuestProfile(nextProfile);
    });

    return () => subscription.unsubscribe();
  }, []);

  const localizePlan = (plan, index = 0) => {
    const parsedCreated = new Date(plan.created_at || Date.now());
    const details = getDefaultPlanDetails(plan);
    const baseDistance =
      Number(plan.distance_meters) ||
      Math.floor(Math.abs(plan.latitude - COORDS.lat) * 111000) +
        Math.floor(Math.abs(plan.longitude - COORDS.lng) * 111000);
    const normalized = {
      ...plan,
      ...details,
      is_local: plan.is_local || String(plan.plan_id || '').startsWith('seed-') || String(plan.plan_id || '').startsWith('local-'),
      participants_count: Number(plan.participants_count || 0),
      max_people: Number(plan.max_people || 0),
      access_password: plan.access_password || '',
      distance_meters: Math.max(0, baseDistance + index),
      category_code: normalizeCategoryKey(plan.category_code || plan.category || 'cafe'),
      visibility: plan.visibility || 'public',
      my_status: plan.my_status || (plan.creator_id === userId ? 'accepted' : plan.my_status || null),
      place_name: plan.place_name || 'Lugar por definir',
      created_at: Number.isNaN(parsedCreated.getTime()) ? new Date().toISOString() : plan.created_at,
      reviews: plan.reviews || [],
      rating_count: Number(plan.rating_count || 0),
      map_link: plan.map_link || `https://www.google.com/maps/search/?api=1&query=${plan.latitude || COORDS.lat},${plan.longitude || COORDS.lng}`,
      request_key: roomRequestKey(plan, userId),
    };

    return normalized;
  };

  const loadFeed = async () => {
    const params = new URLSearchParams({
      lat: String(COORDS.lat),
      lng: String(COORDS.lng),
      radius_meters: String(radius),
      max_hours: String(hours),
    });

    if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory);

    try {
      const list = await api(`/plans/nearby?${params.toString()}`, {}, userId);
      const normalized = Array.isArray(list) ? list.map((item, index) => localizePlan(item, index)) : [];
      setPlans(normalized);
      saveStoredPlans(normalized);
      return normalized;
    } catch {
      const persisted = getStoredPlans();
      const source = persisted.length > 0 ? persisted : LOCAL_PLAN_SEEDS;
      const localSeed = source.map((item, index) => ({
        ...localizePlan(item, index),
        creator_name: item.creator_name,
        is_local: true,
        reviews: [],
        status: item.status || 'active',
        my_status: item.my_status || null,
      }));

      setPlans((prev) => {
        const nonSeedLocal = prev.filter((plan) => plan.is_local && !String(plan.plan_id || '').startsWith('seed-'));
        const merged = [...localSeed, ...nonSeedLocal];
        saveStoredPlans(merged);
        return merged;
      });
      return localSeed;
    }
  };

  const loadAll = async () => {
    if (!userId) return;
    try {
      const [meRes, statsRes, healthRes, notRes] = await Promise.allSettled([
        api('/users/me', {}, userId),
        api('/users/me/stats', {}, userId),
        fetch(`${API_URL}/health`).then((r) => r.json()),
        api('/notifications', {}, userId).catch(() => []),
      ]);

      const me = meRes.status === 'fulfilled' ? meRes.value : null;
      const parsedStats = statsRes.status === 'fulfilled' ? statsRes.value : {};
      const parsedNotifications = notRes.status === 'fulfilled' ? notRes.value : [];
      const localProfile = getGuestProfile() || user || {};
      const nextResolvedUser = {
        ...DEFAULT_GUEST,
        ...localProfile,
        ...(me || {}),
        id: (me && (me.id || me.user_id)) || localProfile.id || userId,
        registered: Boolean((me && me.registered) || isRegisteredProfile(localProfile)),
        role:
          (me && me.role) ||
          localProfile.role ||
          (ADMIN_EMAILS.includes(String(localProfile.email || '').toLowerCase()) ? 'admin' : localProfile.role || 'guest'),
      };
      setUser(nextResolvedUser);
      setGuestProfile(nextResolvedUser);
      setStats(parsedStats || {});
      setNotifications(Array.isArray(parsedNotifications) ? parsedNotifications : []);
      setHealth(healthRes.status === 'fulfilled' ? healthRes.value || { ok: false } : { ok: false });
      await loadFeed();
    } catch {
      setNotifications([]);
      setHealth((prev) => prev || { ok: false, error: 'No se pudo cargar estado' });
      await loadFeed();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const timer = setInterval(() => {
      loadAll();
    }, 30000);
    const onFocus = () => {
      loadAll();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadFeed();
  }, [radius, hours, filterCategory, userId]);

  const applyCookieConsent = (next) => {
    const payload = { ...cookieConsent, ...next, acceptedAt: new Date().toISOString(), accepted: true };
    setCookieConsent(payload);
    writeJsonLS(COOKIE_CONSENT_KEY, payload);
  };

  const denyOptionalCookies = () => {
    applyCookieConsent({
      essential: true,
      functional: true,
      analytics: false,
      personalization: false,
    });
  };

  const acceptAllCookies = () => {
    applyCookieConsent({
      essential: true,
      functional: true,
      analytics: true,
      personalization: true,
    });
  };

  const registerProfile = async () => {
    const email = String(authForm.email || '').trim().toLowerCase();
    const firstName = String(authForm.first_name || '').trim();
    const lastName = String(authForm.last_name || '').trim();
    const displayName = `${firstName} ${lastName}`.trim() || String(authForm.username || '').trim();
    const password = String(authForm.password || '');

    if (profileOpen) {
      try {
        const profileAge = getAgeFromBirthDate(authForm.birth_date);
        if (profileAge !== null && profileAge < MIN_CHAT_AGE) {
          setAuthError('Los chats y el mercado social están reservados a mayores de 18 años.');
          return;
        }
        const response = await api(
          '/users/me/profile',
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...authForm,
              name: displayName || authForm.username || user?.name || 'Usuario',
              photo: authForm.photo || user?.photo || getUserAvatar(displayName || user?.name || 'Usuario'),
            }),
          },
          userId,
        );
        const saved = response?.user || {};
        const nextProfile = {
          ...user,
          ...saved,
          photo: saved.photo_url || saved.photo || authForm.photo || user?.photo,
          registered: true,
        };
        setUser(nextProfile);
        setGuestProfile(nextProfile);
        setProfileOpen(false);
        setAuthError('');
        setAuthNotice('Perfil actualizado y notificado al administrador.');
      } catch (error) {
        setAuthError(error?.message || 'No se pudo actualizar el perfil');
      }
      return;
    }

    if (authMode === 'login') {
      if (!email || !password) {
        setAuthError('Correo y contraseña son obligatorios para iniciar sesion.');
        return;
      }

      if (!supabase) {
        setAuthError('El acceso no está disponible ahora mismo. Inténtalo de nuevo más tarde.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message || 'No se pudo iniciar sesion');
        return;
      }

      const nextProfile = normalizeSupabaseProfile(data.user, getGuestProfile() || {}) || DEFAULT_GUEST;
      setUser(nextProfile);
      setUserId(String(nextProfile.id));
      setGuestProfile(nextProfile);
      setAuthOpen(false);
      setAuthError('');
      setAuthNotice('');
      return;
    }

    if (authMode === 'invite') {
      const fullName = String(guestRequestForm.full_name || '').trim();
      const requestEmail = String(guestRequestForm.email || '').trim().toLowerCase();
      const reason = String(guestRequestForm.reason || '').trim();

      if (!fullName || !requestEmail || !reason) {
        setAuthError('Completa nombre, correo y motivo de acceso.');
        return;
      }

      if (turnstileEnabled) {
        if (!captchaToken) {
          setAuthError('Completa el CAPTCHA antes de enviar la solicitud.');
          return;
        }
        try {
          await api('/security/captcha/verify', {
            method: 'POST',
            body: JSON.stringify({ token: captchaToken, action: 'guest_request' }),
          });
        } catch (error) {
          setAuthError(error?.message || 'No se pudo validar el CAPTCHA.');
          resetCaptchaState();
          return;
        }
      } else if (String(captchaAnswer || '').trim() !== String(captchaChallenge.answer || '').trim()) {
        setAuthError('El CAPTCHA no es correcto.');
        resetCaptchaState();
        return;
      }

      try {
        await api('/guest-access/request', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            email: requestEmail,
            phone: guestRequestForm.phone,
            city: guestRequestForm.city,
            reason,
          }),
        });
        setAuthError('');
        setAuthNotice('Solicitud enviada. Si se aprueba, recibirás un correo formal con un enlace temporal de 24 horas para completar el registro.');
        setGuestRequestForm(DEFAULT_GUEST_REQUEST_FORM);
        resetCaptchaState();
      } catch (error) {
        setAuthError(error?.message || 'No se pudo enviar la solicitud invitada.');
      }
      return;
    }

    if (!firstName || !email || !authForm.phone || !authForm.address) {
      setAuthError('Nombre, email, telefono y direccion son obligatorios.');
      return;
    }
    const birthAge = getAgeFromBirthDate(authForm.birth_date);
    if (birthAge === null) {
      setAuthError('La fecha de nacimiento es obligatoria para crear la cuenta.');
      return;
    }
    if (birthAge < MIN_CHAT_AGE) {
      setAuthError('Debes tener al menos 18 años para usar los chats y el mercado social.');
      return;
    }
    if (!authForm.confirm_adult) {
      setAuthError('Debes confirmar que tienes 18 años o más.');
      return;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      setAuthError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    const failedPasswordRule = PASSWORD_REQUIREMENTS.find((rule) => !rule.test(password));
    if (failedPasswordRule) {
      setAuthError(`La contraseña debe incluir ${failedPasswordRule.label}.`);
      return;
    }
    if (password !== String(authForm.password_confirm || '')) {
      setAuthError('Las contraseñas no coinciden.');
      return;
    }
    if (turnstileEnabled) {
      if (!captchaToken) {
        setAuthError('Completa el CAPTCHA de seguridad antes de registrarte.');
        return;
      }
      try {
        await api('/security/captcha/verify', {
          method: 'POST',
          body: JSON.stringify({ token: captchaToken, action: 'register' }),
        });
      } catch (error) {
        setAuthError(error?.message || 'No se pudo validar el CAPTCHA.');
        resetCaptchaState();
        return;
      }
    } else if (String(captchaAnswer || '').trim() !== String(captchaChallenge.answer || '').trim()) {
      setAuthError('El CAPTCHA no es correcto.');
      resetCaptchaState();
      return;
    }

    let nextProfile = {
      ...user,
      ...authForm,
      id: user?.id || `user-${Date.now()}`,
      name: displayName || authForm.username || 'Usuario',
      email,
      city: authForm.city || 'Madrid',
      photo: authForm.photo || getUserAvatar(displayName || authForm.username || firstName),
      registered: true,
      role: ADMIN_EMAILS.includes(email) ? 'admin' : 'user',
    };

    if (supabase) {
      if (approvedGuestInvite && String(approvedGuestInvite.email || '').toLowerCase() !== email) {
        setAuthError('Debes registrarte con el mismo correo aprobado en la invitación.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: nextProfile.email,
        password,
        options: {
          data: {
            ...nextProfile,
            role: ADMIN_EMAILS.includes(email) ? 'admin' : 'user',
          },
        },
      });

      if (error) {
        setAuthError(error.message || 'No se pudo crear la cuenta');
        return;
      }

      if (data?.user) {
        nextProfile = normalizeSupabaseProfile(data.user, nextProfile) || nextProfile;
      }

      if (approvedGuestInvite?.token && data?.session) {
        try {
          await api('/guest-access/consume', {
            method: 'POST',
            body: JSON.stringify({
              token: approvedGuestInvite.token,
              email: nextProfile.email,
            }),
          });
          setApprovedGuestInvite(null);
        } catch (consumeError) {
          setAuthError(consumeError?.message || 'No se pudo activar el acceso invitado.');
          return;
        }
      }

      if (!data?.session) {
        setAuthNotice('Cuenta creada. Revisa tu correo para confirmar el acceso.');
        setAuthError('');
        setGuestProfile(nextProfile);
        setAuthForm((current) => ({ ...current, password: '', password_confirm: '' }));
        resetCaptchaState();
        return;
      }
    }

    setUser(nextProfile);
    setUserId(String(nextProfile.id));
    setGuestProfile(nextProfile);
    setAuthOpen(false);
    setProfileOpen(false);
    setAuthError('');
    setAuthNotice('');
    resetCaptchaState();
  };

  const handleCreateClick = () => {
    if (!isRegistered) {
      setAuthError('');
      setAuthNotice('');
      setAuthMode('register');
      setAuthOpen(true);
      return;
    }
    if (user?.is_banned) {
      setBlockedNoticeOpen(true);
      return;
    }
    setEditingPlanId(null);
    setPlanForm(DEFAULT_PLAN_FORM);
    setComposerOpen(true);
  };

  const deletePlan = async (plan) => {
    if (!plan || !isAdmin) return;
    const planId = String(getPlanId(plan));

    try {
      await api(`/plans/${planId}`, { method: 'DELETE' }, userId);
    } catch {
      // Fallback local si el backend no expone borrado todavia.
    }

    setPlans((current) => {
      const next = current.filter((item) => String(getPlanId(item)) !== planId);
      saveStoredPlans(next);
      return next;
    });
    if (String(getPlanId(selectedPlan || {})) === planId) setSelectedPlan(null);
    if (String(getPlanId(chatPlan || {})) === planId) closeChat();
  };

  const closePlan = async (plan) => {
    if (!plan) return;
    const planId = String(getPlanId(plan));

    try {
      await api(`/plans/${planId}/close`, { method: 'POST' }, userId);
    } catch {
      // fallback local abajo
    }

    const applyClosedState = (current) => ({ ...current, status: 'cancelled' });
    setPlans((current) => {
      const next = current.map((item) => (String(getPlanId(item)) === planId ? applyClosedState(item) : item));
      saveStoredPlans(next);
      return next;
    });
    if (String(getPlanId(selectedPlan || {})) === planId) {
      setSelectedPlan((current) => ({ ...(current || plan), status: 'cancelled' }));
    }
    setNotifications((current) => [
      {
        id: `local-close-${Date.now()}`,
        title: 'Sala cerrada',
        body: `La sala "${plan.title || 'sin título'}" ha quedado cerrada y se ha notificado el cierre a los implicados.`,
        created_at: new Date().toISOString(),
        is_local: true,
      },
      ...current,
    ]);
    setClosePlanTarget(null);
    await loadFeed();
  };

  const openAdminChat = async (plan) => {
    if (!isAdmin || !plan) return;
    if (typeof window !== 'undefined') {
      window.location.href = `/chat?plan=${encodeURIComponent(String(getPlanId(plan)))}&admin_view=1`;
      return;
    }
    await openPlanChat({ ...plan, my_status: 'accepted' }, { silentAdmin: true });
  };

  const openAllRoomsPage = () => {
    if (typeof window === 'undefined') return;
    window.location.href = '/sala.html';
  };

  const fillCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setPlanForm((current) => ({
          ...current,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
          place_name: current.place_name || 'Ubicacion actual',
        }));
      },
      () => {
        // Se mantiene el formulario manual si el usuario no permite geolocalizacion.
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const signOutUser = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    const guest = {
      ...DEFAULT_GUEST,
      id: `guest-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      city: user?.city || 'Madrid',
    };
    setUser(guest);
    setUserId(String(guest.id));
    setGuestProfile(guest);
    setProfileOpen(false);
  };

  const updatePlanLocally = (planId, mutation) => {
    setPlans((prev) =>
      prev.map((plan) => {
        if (getPlanId(plan) !== String(planId)) return plan;
        return mutation(plan);
      }),
    );
  };

  const updatePlanById = (planId, mutation) => {
    setPlans((prev) =>
      prev.map((plan) => (getPlanId(plan) === String(planId) ? mutation(plan) : plan)),
    );
  };

  const getStoredSiteChat = () =>
    readJsonLS(SITE_CHAT_STORAGE_KEY, [
      {
        id: 'site-chat-system-1',
        author_name: APP_NAME,
        author_role: 'system',
        message: 'Bienvenido al chat virtual general. No compartas datos sensibles y usa este espacio con respeto.',
        created_at: new Date().toISOString(),
        is_system: true,
      },
    ]);

  const saveStoredSiteChat = (entries) => {
    writeJsonLS(SITE_CHAT_STORAGE_KEY, entries);
  };

  const loadSiteChat = async () => {
    setSiteChatLoading(true);
    try {
      const list = await api('/site-chat/messages');
      const normalized = Array.isArray(list) && list.length > 0 ? list : getStoredSiteChat();
      setSiteChatMessages(normalized);
      saveStoredSiteChat(normalized);
    } catch {
      setSiteChatMessages(getStoredSiteChat());
    } finally {
      setSiteChatLoading(false);
    }
  };

  const openSiteChat = async () => {
    if (typeof window === 'undefined') return;
    window.location.href = '/chat?space=global';
  };

  const sendSiteChat = async () => {
    const message = String(siteChatText || '').trim();
    if (!message) return;

    const fallbackEntry = {
      id: `site-chat-${Date.now()}`,
      author_name: user?.name || 'Invitado',
      author_role: isRegistered ? (isPremiumActive ? 'premium' : 'user') : 'guest',
      message,
      created_at: new Date().toISOString(),
    };

    try {
      const payload = await api('/site-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          author_name: fallbackEntry.author_name,
          message,
        }),
      });
      const next = [...siteChatMessages, payload?.message || fallbackEntry].slice(-120);
      setSiteChatMessages(next);
      saveStoredSiteChat(next);
      setSiteChatText('');
    } catch {
      const next = [...getStoredSiteChat(), fallbackEntry].slice(-120);
      setSiteChatMessages(next);
      saveStoredSiteChat(next);
      setSiteChatText('');
    }
  };

  const createPlan = async () => {
    if (!isRegistered) {
      setAuthOpen(true);
      return;
    }
    if (user?.is_banned) {
      setBlockedNoticeOpen(true);
      return;
    }
    if (isAdultPremiumTheme && !canUsePremiumRooms) {
      setFooterPanel('premium');
      return;
    }
    if ((planForm.premium_room || planForm.featured_room || planForm.advanced_analytics) && !canUsePremiumRooms) {
      setFooterPanel('premium');
      return;
    }
    if (!planForm.title || !planForm.place_name) return;
    if (planForm.visibility === 'private' && !planForm.access_password.trim()) {
      alert('Si el plan es privado, la contraseña es obligatoria.');
      return;
    }

    const payload = {
      ...planForm,
      max_people: Number(planForm.max_people),
      latitude: Number(planForm.latitude),
      longitude: Number(planForm.longitude),
      duration_minutes: Number(planForm.duration_minutes || 0),
      district: planForm.district || 'Centro',
      category: planForm.category,
      category_code: normalizeCategoryKey(planForm.category),
      access_password: planForm.access_password || null,
      premium_room: Boolean(isAdultPremiumTheme || planForm.premium_room),
      featured_room: Boolean(planForm.featured_room),
      advanced_analytics: Boolean(planForm.advanced_analytics),
      private_chat_enabled: Boolean(planForm.private_chat_enabled),
      private_chat_code: String(planForm.private_chat_code || '').trim() || (planForm.private_chat_enabled ? generatePrivateChatCode() : ''),
      visibility: isAdultPremiumTheme ? 'private' : planForm.visibility,
      approval_required: isAdultPremiumTheme ? true : Boolean(planForm.approval_required),
      age_range: isAdultPremiumTheme ? '18+' : planForm.age_range,
    };

    try {
      await api(
        editingPlanId ? `/plans/${editingPlanId}` : '/plans',
        { method: editingPlanId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
        userId,
      );
      setComposerOpen(false);
      setPlanForm(DEFAULT_PLAN_FORM);
      setEditingPlanId(null);
      await loadFeed();
    } catch {
      if (editingPlanId) {
        updatePlanById(editingPlanId, (current) => ({ ...current, ...payload, category_code: payload.category_code }));
        setComposerOpen(false);
        setPlanForm(DEFAULT_PLAN_FORM);
        setEditingPlanId(null);
        return;
      }
      const localPlan = localizePlan({
        ...payload,
        plan_id: `local-${Date.now()}`,
        creator_id: userId,
        creator_name: user?.name || 'Invitado social',
        title: payload.title,
        description: payload.description,
        status: 'active',
        created_at: new Date().toISOString(),
        my_status: 'accepted',
        participants_count: 1,
        is_local: true,
        private_chat_enabled: Boolean(payload.private_chat_enabled),
        private_chat_code: payload.private_chat_code || '',
      });

      setPlans((prev) => {
        const next = [localPlan, ...prev];
        saveStoredPlans(next);
        return next;
      });
      setComposerOpen(false);
      setPlanForm(DEFAULT_PLAN_FORM);
      setEditingPlanId(null);
    }
  };

  const startEditPlan = (plan) => {
    if (!plan) return;
    setEditingPlanId(getPlanId(plan));
    setPlanForm({
      ...DEFAULT_PLAN_FORM,
      ...plan,
      category: plan.category_code || plan.category || DEFAULT_PLAN_FORM.category,
      access_password: '',
      max_people: String(plan.max_people || DEFAULT_PLAN_FORM.max_people),
      duration_minutes: String(plan.duration_minutes || DEFAULT_PLAN_FORM.duration_minutes),
      latitude: String(plan.latitude || COORDS.lat),
      longitude: String(plan.longitude || COORDS.lng),
    });
    setComposerOpen(true);
    setSelectedPlan(null);
  };

  const openPlanChat = async (plan, options = {}) => {
    if (!plan) return;
    if (!isRegistered && !options.silentAdmin) {
      setAuthMode('register');
      setAuthNotice('');
      setAuthError('Debes registrarte para acceder al chat de una sala.');
      setAuthOpen(true);
      return;
    }
    const currentId = getPlanId(plan);
    if (!plan.is_local && typeof window !== 'undefined') {
      const params = new URLSearchParams();
      params.set('plan', String(currentId));
      if (options.silentAdmin) params.set('admin_view', '1');
      window.location.href = `/chat?${params.toString()}`;
      return;
    }
    const isChatOwner = isAdmin || String(plan.creator_id) === String(userId);
    const welcomeSystemMessage = {
      id: `sys-${Date.now()}`,
      user_id: 'system',
      user_name: 'Sistema',
      message: `Chat inicial del plan ${plan.title || 'sin título'}.`,
      created_at: new Date().toISOString(),
      channel: 'main',
    };
    setChatChannel('main');
    setChatPrivateCode('');
    setChatPrivateDraftCode('');
    setChatPrivateReady(isChatOwner && Boolean(plan.private_chat_enabled));
    setChatPrivateError('');
    setChatImagePreview('');
    setChatSilentAdminMode(Boolean(options.silentAdmin));

    if (plan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      const persisted = chatHistory[currentId];
      const assistantPersisted = readJsonLS(ROOM_ASSISTANT_STORAGE, {});
      const nextMessages = persisted && persisted.length ? persisted : [welcomeSystemMessage];
      if (!persisted || !persisted.length) {
        setChatHistory((current) => ({ ...current, [currentId]: nextMessages }));
      }
      setChatPlan(plan);
      setChatMessages(nextMessages.filter((msg) => String(msg.channel || 'main') === 'main'));
      setChatParticipants(Array.isArray(plan.participants) ? plan.participants : []);
      setAssistantMessages((current) => ({ ...current, [currentId]: assistantPersisted?.[currentId] || [] }));
      return;
    }

    try {
      const [detail, messages] = await Promise.all([
        api(`/plans/${currentId}`, {}, userId),
        api(`/plans/${currentId}/messages`, {}, userId).catch(() => []),
      ]);
      const safeMessages = Array.isArray(messages) && messages.length > 0 ? messages : [welcomeSystemMessage];
      setChatPlan(detail || plan);
      setChatMessages(safeMessages);
      setChatParticipants(Array.isArray(detail?.participants) ? detail.participants : []);
      setChatHistory((current) => ({ ...current, [currentId]: safeMessages }));
      setAssistantMessages((current) => ({
        ...current,
        [currentId]: readJsonLS(ROOM_ASSISTANT_STORAGE, {})?.[currentId] || [],
      }));
    } catch {
      const safeMessages = chatHistory[currentId] && chatHistory[currentId].length > 0 ? chatHistory[currentId] : [welcomeSystemMessage];
      setChatPlan(plan);
      setChatMessages(safeMessages);
      setChatParticipants(Array.isArray(plan.participants) ? plan.participants : []);
      setChatHistory((current) => ({ ...current, [currentId]: safeMessages }));
      setAssistantMessages((current) => ({ ...current, [currentId]: readJsonLS(ROOM_ASSISTANT_STORAGE, {})?.[currentId] || [] }));
    }
  };

  const refreshActiveChat = async (sourcePlan = null) => {
    const activePlan = sourcePlan || chatPlan;
    if (!activePlan) return;
    const currentId = getPlanId(activePlan);
    if (!currentId || activePlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      const localMessages = (chatHistory[currentId] || []).filter(
        (msg) => String(msg.channel || 'main') === String(chatChannel || 'main'),
      );
      setChatMessages(localMessages);
      return;
    }

    try {
      const query =
        chatChannel === 'private'
          ? `?channel=private&code=${encodeURIComponent(chatPrivateCode || '')}`
          : '';
      const [detail, messages] = await Promise.all([
        api(`/plans/${currentId}`, {}, userId),
        api(`/plans/${currentId}/messages${query}`, {}, userId),
      ]);
      setChatPlan((current) => ({ ...(current || activePlan), ...(detail || {}) }));
      setChatParticipants(Array.isArray(detail?.participants) ? detail.participants : []);
      setChatMessages(Array.isArray(messages) ? messages : []);
    } catch (error) {
      if (chatChannel === 'private') {
        setChatPrivateError(error?.message || 'No se pudo abrir el chat privado');
      }
    }
  };

  const performJoinPlan = async (plan, password = '', opts = { allowRequest: false }) => {
    const currentId = getPlanId(plan);
    if (!plan) return;
    const needsPassword = String(plan.visibility || '') === 'private' && String(plan.access_password || '').trim();
    const premiumDirectJoin = plan.premium_room && canUsePremiumRooms && !plan.requires_password && !needsPassword && !isAdultRoomTheme(plan.room_level);
    const requiresApproval = (plan.approval_required || plan.visibility === 'private') && !premiumDirectJoin;

    if (
      needsPassword &&
      String(plan.creator_id) !== String(userId) &&
      String(password) !== String(plan.access_password || '')
    ) {
      throw new Error('Contraseña incorrecta');
    }

    const setPlanState = (status) => {
      updatePlanById(currentId, (current) => {
        if (!current) return current;
        if (status === 'accepted') {
          if (current.my_status === 'accepted') return current;
          const max = Number(current.max_people || 0);
          const count = Number(current.participants_count || 0);
          if (max > 0 && count >= max) return current;
          return { ...current, my_status: 'accepted', participants_count: count + 1, status: current.status || 'active' };
        }
        return { ...current, my_status: status };
      });
    };

    if (requiresApproval && !opts.allowRequest) {
      return {
        requestSent: true,
      };
    }

    if (requiresApproval) {
      setPlanState('accepted');
      return { accepted: true };
    }

    if (plan.is_local) {
      setPlanState('accepted');
      await openPlanChat(plan);
      return { accepted: true };
    }

    try {
      await api(`/plans/${currentId}/join`, { method: 'POST', body: JSON.stringify({ password: String(password || ''), request: requiresApproval }) }, userId);
      await loadFeed();
      await openPlanChat(plan);
      setPlanState('accepted');
      return { accepted: true };
    } catch {
      if (!plan.is_local && requiresApproval) {
        setPlanState('pending');
        return { requestSent: true };
      }
      setPlanState('accepted');
      await openPlanChat(plan);
      return { accepted: true };
    }
  };

  const joinPlan = (plan) => {
    if (!plan) return;
    if (!isRegistered) {
      setAuthMode('register');
      setAuthNotice('');
      setAuthError('Debes registrarte para acceder a una sala.');
      setAuthOpen(true);
      return;
    }
    const premiumDirectJoin = plan.premium_room && canUsePremiumRooms && !plan.requires_password && !isAdultRoomTheme(plan.room_level);
    const requiresAccess = (plan.approval_required || String(plan.visibility || 'public') === 'private') && !premiumDirectJoin;
    if (isPlanBlockedByHost(getPlanId(plan))) return;

    if (!requiresAccess) {
      performJoinPlan(plan, '');
      return;
    }

    setJoinPermissionPlan(plan);
    setJoinPassword('');
    setJoinRequestError('');
  };

  const quickJoinRoom = async () => {
    const term = String(quickJoinQuery || '').trim().toLowerCase();
    if (!term) {
      setQuickJoinNotice('Escribe el nombre, la ciudad o la temática de la sala.');
      return;
    }
    const match = plans.find((plan) =>
      [
        getPlanId(plan),
        plan.title,
        plan.place_name,
        plan.city,
        plan.country,
        plan.room_level,
        plan.category_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
    if (!match) {
      setQuickJoinNotice('No se encontró ninguna sala con ese criterio.');
      return;
    }
    setQuickJoinNotice('');
    await openDetail(match);
  };

  const acceptJoinWithPermission = async () => {
    if (!joinPermissionPlan) return;
    try {
      setJoinRequestError('');
      const currentId = getPlanId(joinPermissionPlan);
      const needsPassword =
        String(joinPermissionPlan.visibility || '') === 'private' &&
        String(joinPermissionPlan.access_password || '').trim() &&
        String(joinPermissionPlan.creator_id) !== String(userId);

      if (needsPassword && String(joinPassword) !== String(joinPermissionPlan.access_password || '')) {
        setJoinRequestError('La contraseña no coincide con la configurada por el anfitrión.');
        return;
      }

      const result = await performJoinPlan(joinPermissionPlan, joinPassword, { allowRequest: true });
      const currentPlan = getPlanId(joinPermissionPlan);

      setRoomRequests((current) => {
        const currentItem = current?.[currentPlan] || [];
        const next = [
          ...currentItem,
          {
            id: Date.now(),
            action: result?.requestSent ? 'requested' : 'accepted',
            status: result?.requestSent ? 'pending' : 'accepted',
            user: user?.name || user?.id || userId,
            created_at: new Date().toISOString(),
          },
        ];
        const nextMap = { ...current, [currentPlan]: next.slice(-5) };
        saveRoomRequestCache(nextMap);
        return nextMap;
      });

      if (result?.accepted) {
        await openPlanChat(joinPermissionPlan);
      }
      setJoinPermissionPlan(null);
      setJoinPassword('');
      setJoinRequestError('');
      await loadFeed();
    } catch (error) {
      setJoinRequestError(error?.message || 'No se pudo completar la solicitud');
    }
  };

  const rejectJoinRequest = () => {
    setJoinPermissionPlan(null);
    setJoinPassword('');
    setJoinRequestError('');
  };

  const blockForeverAndIgnore = () => {
    if (!joinPermissionPlan) return;
    const key = String(getPlanId(joinPermissionPlan));
    const next = { ...(joinBlocks || {}), [key]: true };
    setJoinBlocks(next);
    saveJoinBlockList(next);
    setJoinPermissionPlan(null);
    setJoinRequestError('');
    setJoinPassword('');
    setRoomRequests((current) => {
      const nextRequests = {
        ...(current || {}),
        [key]: [
          ...(current?.[key] || []),
          {
            id: Date.now(),
            action: 'blocked',
            status: 'rejected-forever',
            user: user?.name || user?.id || userId,
            created_at: new Date().toISOString(),
          },
        ],
      };
      saveRoomRequestCache(nextRequests);
      return nextRequests;
    });
  };

  const cancelPendingIfAny = (plan) => {
    if (!plan) return;
    updatePlanById(plan.plan_id || plan.id, (current) => {
      if (current?.my_status !== 'pending') return current;
      return { ...current, my_status: null };
    });
    setRoomRequests((current) => current);
    loadFeed();
  };

  const closePermissionModal = () => {
    setJoinPermissionPlan(null);
    setJoinPassword('');
    setJoinRequestError('');
  };

  const leavePlan = async (plan) => {
    const currentId = getPlanId(plan);
    if (!plan) return;

    if (plan.is_local) {
      updatePlanById(currentId, (current) => {
        if (current.my_status !== 'accepted') return current;
        const nextCount = Math.max(0, Number(current.participants_count || 0) - 1);
        return { ...current, my_status: null, participants_count: nextCount };
      });
      return;
    }

    try {
      await api(`/plans/${currentId}/leave`, { method: 'POST' }, userId);
      await loadFeed();
    } catch {
      updatePlanById(currentId, (current) => {
        if (current.my_status !== 'accepted') return current;
        return { ...current, my_status: null, participants_count: Math.max(0, Number(current.participants_count || 0) - 1) };
      });
    }
  };

  const openDetail = async (plan) => {
    if (!plan) return;
    if (!isRegistered) {
      setAuthMode('register');
      setAuthNotice('');
      setAuthError('Debes registrarte para acceder a la información de una sala.');
      setAuthOpen(true);
      return;
    }
    setPageBusy(true);

    if (plan.is_local) {
      const withMeta = {
        ...plan,
        ...getDefaultPlanDetails(plan),
        reviews: plan.reviews || [],
        participants: plan.participants || [
          { user_id: plan.creator_id || 'host', name: plan.creator_name || 'Anfitrión', photo_url: plan.creator_photo },
          ...(Array.isArray(plan.participants)
            ? plan.participants
            : [...Array(Math.min(plan.participants_count || 0, 4))].map((_, idx) => ({
                user_id: `guest-${idx}`,
                name: `Asistente ${idx + 1}`,
                photo_url: getUserAvatar(`Asistente ${idx + 1}`),
                role: 'assist',
              }))),
        ],
      };
      setSelectedPlan(withMeta);
      setPageBusy(false);
      return;
    }

    try {
      const [detailRes, reviewsRes] = await Promise.all([
        api(`/plans/${getPlanId(plan)}`, {}, userId),
        api(`/plans/${getPlanId(plan)}/reviews`, {}, userId).catch(() => []),
      ]);
      setSelectedPlan({
        ...getDefaultPlanDetails(detailRes || {}),
        ...plan,
        ...(detailRes || {}),
        reviews: Array.isArray(reviewsRes) ? reviewsRes : [],
        participants: Array.isArray(detailRes?.participants)
          ? detailRes.participants
          : [
              {
                user_id: (detailRes || plan).creator_id || plan.creator_id || 'host',
                name: (detailRes || plan).creator_name || plan.creator_name || 'Anfitrión',
                photo_url: (detailRes || plan).creator_photo || plan.creator_photo,
                role: 'host',
              },
              ...(Array.isArray(detailRes?.participants)
                ? detailRes.participants.filter((item) => String(item.role || 'assistant') !== 'host')
                : []),
            ],
      });
    } catch {
      setSelectedPlan({ ...plan, ...getDefaultPlanDetails(plan), reviews: plan.reviews || [], participants: plan.participants || [] });
    } finally {
      setPageBusy(false);
    }
  };

  useEffect(() => {
    if (!workspaceRequest.planId || workspaceRequest.opened || plans.length === 0) return;
    const targetPlan = plans.find((plan) => String(getPlanId(plan)) === String(workspaceRequest.planId));
    if (!targetPlan) return;
    const run = async () => {
      await openDetail(targetPlan);
      if (workspaceRequest.adminView && isAdmin) {
        await openAdminChat(targetPlan);
      }
      setWorkspaceRequest((current) => ({ ...current, opened: true }));
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    };
    run();
  }, [workspaceRequest, plans, isAdmin]);

  const openChat = async (plan) => {
    const isOwner = String(plan?.creator_id) === String(userId);
    const isMember = String(plan?.my_status || '') === 'accepted';
    if (!isOwner && !isMember) {
      return;
    }
    await openPlanChat(plan, { silentAdmin: false });
  };

  const closeChat = () => {
    setChatPlan(null);
    setChatMessages([]);
    setChatParticipants([]);
    setChatSilentAdminMode(false);
    setChatChannel('main');
    setChatPrivateCode('');
    setChatPrivateDraftCode('');
    setChatPrivateReady(false);
    setChatPrivateError('');
    setChatImagePreview('');
    setChatSearch('');
    setChatText('');
    setAssistantText('');
    setAssistantLoading(false);
  };

  useEffect(() => {
    if (!chatPlan || !userId) return undefined;
    const currentId = getPlanId(chatPlan);
    if (!currentId || chatPlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      return undefined;
    }

    const timer = setInterval(() => {
      refreshActiveChat(chatPlan);
    }, 1500);

    return () => clearInterval(timer);
  }, [chatPlan, userId, chatChannel, chatPrivateCode, chatPrivateReady]);

  useEffect(() => {
    if (!siteChatOpen) return undefined;
    const timer = setInterval(() => {
      loadSiteChat();
    }, 1500);
    return () => clearInterval(timer);
  }, [siteChatOpen]);

  useEffect(() => {
    if (!chatPlan) return;
    refreshActiveChat(chatPlan);
  }, [chatChannel, chatPrivateReady]);

  const sendChat = async () => {
    if (!chatPlan || (!chatText.trim() && !chatImagePreview)) return;
    const currentId = getPlanId(chatPlan);
    const body = chatText.trim();

    const message = {
      id: chatPlan.is_local || String(currentId).startsWith('local-') ? `chat-${Date.now()}` : undefined,
      user_id: userId,
      user_name: user?.name || userId,
      message: body || '[imagen]',
      created_at: new Date().toISOString(),
      channel: chatChannel,
      image_url: chatImagePreview || null,
      reactions: [],
      is_pinned: false,
    };

    if (chatPlan.is_local) {
      setChatMessages((current) => [...current, message]);
      setChatHistory((current) => ({
        ...current,
        [currentId]: [...(current[currentId] || []), message],
      }));
      setChatText('');
      setChatImagePreview('');
      return;
    }

    try {
      await api(
        `/plans/${currentId}/messages${chatChannel === 'private' ? `?channel=private&code=${encodeURIComponent(chatPrivateCode || '')}` : ''}`,
        {
          method: 'POST',
          body: JSON.stringify({ message: body, code: chatPrivateCode, image_url: chatImagePreview || null }),
        },
        userId,
      );
      await refreshActiveChat(chatPlan);
      setChatText('');
      setChatImagePreview('');
    } catch {
      setChatMessages((current) => [...current, message]);
      setChatHistory((current) => ({
        ...current,
        [currentId]: [...(current[currentId] || []), message],
      }));
      setChatText('');
      setChatImagePreview('');
    }
  };

  const handleChatImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await fileToDataUrl(file);
      setChatImagePreview(result);
    } catch {
      // noop
    }
  };

  const togglePinMessage = async (msg) => {
    if (!chatPlan || !msg) return;
    const currentId = getPlanId(chatPlan);
    const shouldPin = !msg.is_pinned;

    if (chatPlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      const mutate = (entry) => (String(entry.id) === String(msg.id) ? { ...entry, is_pinned: shouldPin, pinned_at: shouldPin ? new Date().toISOString() : null } : entry);
      setChatMessages((current) => current.map(mutate));
      setChatHistory((current) => ({ ...current, [currentId]: (current[currentId] || []).map(mutate) }));
      return;
    }

    try {
      await api(`/plans/${currentId}/messages/${msg.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pinned: shouldPin }),
      }, userId);
      await refreshActiveChat(chatPlan);
    } catch {
      // noop
    }
  };

  const toggleReaction = async (msg, emoji) => {
    if (!chatPlan || !msg || !emoji) return;
    const currentId = getPlanId(chatPlan);

    const toggleLocal = (entry) => {
      if (String(entry.id) !== String(msg.id)) return entry;
      const currentReactions = Array.isArray(entry.reactions) ? entry.reactions : [];
      const currentEmoji = currentReactions.find((item) => item.emoji === emoji);
      const nextReactions = currentEmoji
        ? currentReactions
            .map((item) =>
              item.emoji === emoji
                ? { ...item, count: Math.max(0, Number(item.count || 1) - 1), reacted_by_me: false }
                : item,
            )
            .filter((item) => Number(item.count || 0) > 0)
        : [...currentReactions, { emoji, count: 1, reacted_by_me: true }];
      return { ...entry, reactions: nextReactions };
    };

    if (chatPlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      setChatMessages((current) => current.map(toggleLocal));
      setChatHistory((current) => ({ ...current, [currentId]: (current[currentId] || []).map(toggleLocal) }));
      return;
    }

    try {
      await api(`/plans/${currentId}/messages/${msg.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, userId);
      await refreshActiveChat(chatPlan);
    } catch {
      // noop
    }
  };

  const copyPrivateChatCode = async () => {
    if (!chatPrivateCode || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(chatPrivateCode);
      setNotifications((current) => [
        {
          id: `copy-code-${Date.now()}`,
          title: 'Código copiado',
          body: 'El código privado del chat se ha copiado al portapapeles.',
          created_at: new Date().toISOString(),
          is_local: true,
        },
        ...current,
      ]);
    } catch {
      // noop
    }
  };

  const injectQuickMessage = (value) => {
    setChatText(value);
  };

  const savePrivateChatConfig = async () => {
    if (!chatPlan) return;
    const isChatOwner = isAdmin || String(chatPlan.creator_id) === String(userId);
    if (!isChatOwner) return;

    const nextCode = String(chatPrivateDraftCode || '').trim() || generatePrivateChatCode();
    const currentId = getPlanId(chatPlan);

    if (chatPlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      const updated = {
        ...chatPlan,
        private_chat_enabled: true,
        private_chat_code: nextCode,
      };
      setChatPlan(updated);
      setChatPrivateCode(nextCode);
      setChatPrivateDraftCode(nextCode);
      setChatPrivateReady(true);
      setChatChannel('private');
      updatePlanById(currentId, (current) => ({ ...current, private_chat_enabled: true, private_chat_code: nextCode }));
      setChatPrivateError('');
      return;
    }

    try {
      const updated = await api(
        `/plans/${currentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            private_chat_enabled: true,
            private_chat_code: nextCode,
          }),
        },
        userId,
      );
      setChatPlan((current) => ({ ...(current || {}), ...(updated || {}), private_chat_enabled: true }));
      setChatPrivateCode(nextCode);
      setChatPrivateDraftCode(nextCode);
      setChatPrivateReady(true);
      setChatChannel('private');
      setChatPrivateError('');
    } catch (error) {
      setChatPrivateError(error?.message || 'No se pudo configurar el chat privado');
    }
  };

  const unlockPrivateChat = async () => {
    if (!chatPlan) return;
    const currentId = getPlanId(chatPlan);
    const nextCode = String(chatPrivateDraftCode || '').trim();
    if (!nextCode) {
      setChatPrivateError('Introduce el código privado para acceder.');
      return;
    }

    if (chatPlan.is_local || String(currentId).startsWith('local-') || String(currentId).startsWith('seed-')) {
      if (String(chatPlan.private_chat_code || '') !== nextCode) {
        setChatPrivateError('Código privado incorrecto.');
        return;
      }
      setChatPrivateCode(nextCode);
      setChatPrivateReady(true);
      setChatChannel('private');
      setChatPrivateError('');
      return;
    }

    try {
      await api(`/plans/${currentId}/messages?channel=private&code=${encodeURIComponent(nextCode)}`, {}, userId);
      setChatPrivateCode(nextCode);
      setChatPrivateReady(true);
      setChatChannel('private');
      setChatPrivateError('');
    } catch (error) {
      setChatPrivateError(error?.message || 'No se pudo validar el código del chat privado');
    }
  };

  const getAssistantHistory = (planId) => {
    const normalized = String(planId);
    return assistantMessages[normalized] || [];
  };

  const setAssistantHistory = (planId, history) => {
    const normalized = String(planId);
    const next = { ...(assistantMessages || {}), [normalized]: history };
    setAssistantMessages(next);
    writeJsonLS(ROOM_ASSISTANT_STORAGE, next);
  };

  const sendAssistantQuestion = async () => {
    if (!chatPlan || !assistantText.trim()) return;
    const currentId = getPlanId(chatPlan);
    const question = assistantText.trim();
    const userMessage = {
      role: 'user',
      body: question,
      user_id: user?.id || userId,
      created_at: new Date().toISOString(),
    };
    const seed = getAssistantHistory(currentId);
    const nextSeed = [...seed, { ...userMessage, isAssistant: false }];
    setAssistantText('');
    setAssistantHistory(currentId, nextSeed);
    setAssistantLoading(true);

    if (!cookieConsent.personalization) {
      setAssistantHistory(currentId, [
        ...nextSeed,
        {
          role: 'assistant',
          body: assistantFallbackReply(chatPlan, question),
          user_id: 'assistant',
          created_at: new Date().toISOString(),
          isAssistant: true,
        },
      ]);
      setAssistantLoading(false);
      return;
    }

    try {
      const response = await api(
        AI_ASSISTANT_URL,
        {
          method: 'POST',
          body: JSON.stringify({
            message: question,
            user_id: user?.id || userId,
            room: {
              id: currentId,
              ...buildAssistantContext(chatPlan),
            },
            history: nextSeed.slice(-10),
            assistant_name: AI_ASSISTANT_NAME,
          }),
        },
      );

      const assistantTextResp =
        typeof response?.reply === 'string'
          ? response.reply
          : typeof response?.message === 'string'
            ? response.message
            : typeof response?.text === 'string'
              ? response.text
              : assistantFallbackReply(chatPlan, question);

      setAssistantHistory(currentId, [
        ...nextSeed,
        {
          role: 'assistant',
          body: assistantTextResp,
          user_id: 'assistant',
          created_at: new Date().toISOString(),
          isAssistant: true,
        },
      ]);
    } catch {
      setAssistantHistory(currentId, [
        ...nextSeed,
        {
          role: 'assistant',
          body: assistantFallbackReply(chatPlan, question),
          user_id: 'assistant',
          created_at: new Date().toISOString(),
          isAssistant: true,
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  const getChatAssistantHistory = (plan) => getAssistantHistory(getPlanId(plan || {}));

  const filteredChatMessages = useMemo(() => {
    const terms = chatSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return chatMessages;
    return chatMessages.filter((msg) => {
      const haystack = [msg.user_name, msg.message, msg.channel].filter(Boolean).join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [chatMessages, chatSearch]);

  const visibleChatParticipants = useMemo(() => {
    if (!chatSilentAdminMode) return chatParticipants;
    return (chatParticipants || []).filter((member) => String(member.user_id || member.id) !== String(userId));
  }, [chatParticipants, chatSilentAdminMode, userId]);

  const pinnedChatMessages = useMemo(
    () => filteredChatMessages.filter((msg) => msg.is_pinned),
    [filteredChatMessages],
  );

  useEffect(() => {
    if (!chatPlan || !roomChatMessagesRef.current) return;
    requestAnimationFrame(() => {
      const node = roomChatMessagesRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [chatPlan, chatChannel, filteredChatMessages.length]);

  useEffect(() => {
    if (!siteChatOpen || !siteChatMessagesRef.current) return;
    requestAnimationFrame(() => {
      const node = siteChatMessagesRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [siteChatOpen, siteChatMessages.length]);

  const sendReview = async () => {
    if (!selectedPlan || !reviewUser) return;
    const targetPlanId = getPlanId(selectedPlan);
    const review = {
      id: `review-${Date.now()}`,
      reviewer_id: userId,
      reviewed_user_id: reviewUser,
      rating: Number(reviewRating) || 0,
      comment: reviewText || null,
      created_at: new Date().toISOString(),
    };

    if (selectedPlan.is_local) {
      setSelectedPlan((prev) => ({
        ...prev,
        reviews: [...(prev?.reviews || []), review],
      }));
      updatePlanById(targetPlanId, (current) => ({
        ...current,
        reviews: [...(current.reviews || []), review],
      }));
      setReviewText('');
      setReviewUser('');
      return;
    }

    try {
      await api(
        `/plans/${targetPlanId}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify(review),
        },
        userId,
      );
      const fresh = await api(`/plans/${targetPlanId}/reviews`, {}, userId);
      setSelectedPlan((prev) => ({ ...prev, reviews: fresh }));
      setReviewText('');
      setReviewUser('');
    } catch {
      setSelectedPlan((prev) => ({
        ...prev,
        reviews: [...(prev?.reviews || []), review],
      }));
      updatePlanById(targetPlanId, (current) => ({
        ...current,
        reviews: [...(current.reviews || []), review],
      }));
      setReviewText('');
      setReviewUser('');
    }
  };

  const markNotificationRead = async (notif) => {
    if (!notif?.id) return;
    if (notif.is_local) {
      setNotifications((prev) => prev.filter((item) => item.id !== notif.id));
      return;
    }
    try {
      await api(`/notifications/${notif.id}/read`, { method: 'PATCH' }, userId);
      setNotifications((prev) => prev.filter((it) => it.id !== notif.id));
    } catch {
      setNotifications((prev) => prev.filter((it) => it.id !== notif.id));
    }
  };

  const openReportModal = (plan) => {
    if (!isRegistered) {
      setAuthMode('register');
      setAuthOpen(true);
      return;
    }
    setReportPlan(plan);
    setReportReason('amenazas');
    setReportDescription('');
  };

  const submitReport = async () => {
    if (!reportPlan) return;
    try {
      await api(
        '/reports',
        {
          method: 'POST',
          body: JSON.stringify({
            reported_plan_id: getPlanId(reportPlan),
            reported_user_id: reportPlan.creator_id,
            reason: reportReason,
            description: reportDescription,
          }),
        },
        userId,
      );
      setNotifications((current) => [
        {
          id: `local-report-${Date.now()}`,
          title: 'Reporte enviado',
          body: 'El equipo de administración revisará la incidencia reportada.',
          created_at: new Date().toISOString(),
          is_local: true,
        },
        ...current,
      ]);
      setReportBlockPrompt({
        id: reportPlan.creator_id,
        name: reportPlan.creator_name,
        email: reportPlan.creator_email || '',
      });
      setReportPlan(null);
      setReportDescription('');
      setReportReason('amenazas');
    } catch (error) {
      setAuthError(error?.message || 'No se pudo enviar el reporte');
      setReportPlan(null);
    }
  };

  const blockUserLocally = (target) => {
    if (!target?.id || !userId) return;
    if (isUserBlocked(target.id)) return;
    const next = [
      ...blockedUsers,
      {
        id: target.id,
        name: target.name || 'Usuario bloqueado',
        email: target.email || '',
        created_at: new Date().toISOString(),
      },
    ];
    setBlockedUsers(next);
    saveBlockedUsersFor(userId, next);
    if (isRegistered) {
      api(
        '/users/blocks',
        {
          method: 'POST',
          body: JSON.stringify({
            blocked_user_id: target.id,
            reason: 'bloqueado_desde_interfaz',
          }),
        },
        userId,
      ).catch(() => null);
    }
  };

  const unblockUserLocally = (targetUserId) => {
    const next = blockedUsers.filter((entry) => String(entry.id || entry.user_id) !== String(targetUserId || ''));
    setBlockedUsers(next);
    saveBlockedUsersFor(userId, next);
    if (isRegistered) {
      api(`/users/blocks/${targetUserId}`, { method: 'DELETE' }, userId).catch(() => null);
    }
  };

  const applyQuickFilter = (key) => {
    setTab(key);
    if (key === 'today') {
      setHours('24');
      setSortBy('time');
      return;
    }
    if (key === 'active') {
      setSortBy('time');
      return;
    }
    if (key === 'popular') {
      setSortBy('popular');
      return;
    }
    setSortBy('distance');
  };

  const trending = useMemo(() => {
    const all = plans.map((plan) => plan.category_code || 'general');
    const map = {};
    all.forEach((item) => {
      map[item] = (map[item] || 0) + 1;
    });
    return Object.entries(map)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [plans]);

  const feedByFilters = useMemo(() => {
    const terms = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const radiusLimit = Number(radius || 0);
    const hoursLimit = Number(hours || 0);

    const filtered = [...plans].filter((plan) => {
      const haystack = [
        plan.title,
        plan.description,
        plan.place_name,
        plan.city,
        plan.country,
        plan.district,
        plan.address,
        plan.creator_name,
        plan.rules,
        plan.category_code,
        CATEGORY_LABELS[plan.category_code],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const privateHaystack = [
        plan.title,
        plan.description,
        plan.place_name,
        plan.room_level,
        plan.rules,
        plan.city,
        plan.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const themeConfig = ROOM_THEME_OPTIONS.find((entry) => entry.key === roomThemeFilter);

      if (terms.length > 0 && !terms.every((term) => haystack.includes(term))) return false;
      if (String(plan.status || '') === 'cancelled') return false;
      if (isPlanBlockedByHost(getPlanId(plan))) return false;
      if (isUserBlocked(plan.creator_id)) return false;
      if (plan.premium_room && !canUsePremiumRooms && String(plan.creator_id) !== String(userId)) return false;
      if (roomThemeFilter !== 'all' && themeConfig && !themeConfig.terms.some((term) => haystack.includes(term))) return false;
      if (accessFilter === 'public' && String(plan.visibility || '') !== 'public') return false;
      if (accessFilter === 'private' && String(plan.visibility || '') !== 'private') return false;
      if (accessFilter === 'premium' && !plan.premium_room) return false;
      if (accessFilter === 'private-premium' && !(String(plan.visibility || '') === 'private' && plan.premium_room)) return false;
      if (privateJoinSearch.trim()) {
        const privateTerms = privateJoinSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (String(plan.visibility || '') !== 'private') return false;
        if (!privateTerms.every((term) => privateHaystack.includes(term))) return false;
      }
      if (filterCategory !== 'all' && String(plan.category_code || plan.category) !== String(filterCategory)) return false;
      if (radiusLimit > 0 && Number(plan.distance_meters || 0) > radiusLimit) return false;

      const startsAt = new Date(plan.start_at || 0).getTime();
      if (hoursLimit > 0 && !Number.isNaN(startsAt) && startsAt > now + hoursLimit * 60 * 60 * 1000) return false;

      if (tab === 'today') {
        if (Number.isNaN(startsAt)) return false;
        const sameDay = new Date(startsAt).toLocaleDateString(DATE_LOCALE, { timeZone: DATE_TIMEZONE });
        const today = new Date(now).toLocaleDateString(DATE_LOCALE, { timeZone: DATE_TIMEZONE });
        return sameDay === today;
      }

      if (tab === 'active') {
        return plan.status === 'active' || plan.status === 'in_progress';
      }

      if (tab === 'popular') {
        return Number(plan.participants_count || 0) >= 2;
      }

      return true;
    });

    if (sortBy === 'distance') {
      return filtered.sort((a, b) => Number(a.distance_meters || 0) - Number(b.distance_meters || 0));
    }
    if (sortBy === 'popular') {
      return filtered.sort((a, b) => Number(b.participants_count || 0) - Number(a.participants_count || 0));
    }
    return filtered.sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));
  }, [
    plans,
    search,
    sortBy,
    tab,
    blockedUsers,
    filterCategory,
    radius,
    hours,
    joinBlocks,
    canUsePremiumRooms,
    userId,
    roomThemeFilter,
    accessFilter,
    privateJoinSearch,
  ]);

  const displayedPlans = feedByFilters.slice(0, INITIAL_VISIBLE_PLANS);

  const cityPulse = useMemo(() => {
    const active = plans.filter((plan) => plan.status === 'active').length;
    const inProgress = plans.filter((plan) => plan.status === 'in_progress').length;
    const totalParticipants = plans.reduce((acc, plan) => acc + Number(plan.participants_count || 0), 0);
    const avgDistance = plans.length
      ? plans.reduce((acc, plan) => acc + Number(plan.distance_meters || 0), 0) / plans.length
      : 0;

    return {
      active,
      inProgress,
      totalParticipants,
      avgDistance,
    };
  }, [plans]);

  const communityDayPulse = useMemo(() => {
    const now = Date.now();
    const todayText = new Date(now).toLocaleDateString(DATE_LOCALE, { timeZone: DATE_TIMEZONE });
    const createdToday = plans.filter((plan) => {
      const createdAt = new Date(plan.created_at || 0).getTime();
      if (Number.isNaN(createdAt)) return false;
      return new Date(createdAt).toLocaleDateString(DATE_LOCALE, { timeZone: DATE_TIMEZONE }) === todayText;
    }).length;
    const roomsWithGroup = plans.filter((plan) => Number(plan.participants_count || 0) >= 2).length;
    const premiumRoomsLive = plans.filter(
      (plan) => Boolean(plan.premium_room) && ['active', 'in_progress'].includes(String(plan.status || '')),
    ).length;
    const moderatedPrivate = plans.filter(
      (plan) => String(plan.visibility || 'public') === 'private' && Boolean(plan.approval_required),
    ).length;
    const directJoin = plans.filter(
      (plan) =>
        ['active', 'in_progress'].includes(String(plan.status || ''))
        && !plan.approval_required
        && !plan.access_password_hash
        && (!plan.premium_room || canUsePremiumRooms),
    ).length;
    const trustedHosts = plans.filter((plan) => Number(plan.host_rating || 0) >= 4.5).length;
    const nextStarts = [...plans]
      .filter((plan) => ['active', 'in_progress'].includes(String(plan.status || '')))
      .sort((left, right) => new Date(left.start_at || 0).getTime() - new Date(right.start_at || 0).getTime())
      .slice(0, 3)
      .map((plan) => ({
        id: plan.id,
        title: plan.title,
        place: plan.place_name || plan.city || 'Sala abierta',
        time: fmtDate(plan.start_at),
      }));
    return {
      headline: `${createdToday} salas nuevas y ${roomsWithGroup} grupos ya en ritmo hoy.`,
      quickAccess: directJoin,
      moderatedPrivate,
      premiumRoomsLive,
      trustedHosts,
      reviewsReceived: Number(stats.reviews_received || 0),
      nextStarts,
    };
  }, [plans, stats.reviews_received, canUsePremiumRooms]);

  const myJoinedPlans = useMemo(
    () => plans.filter((plan) => String(plan.creator_id) === String(userId) || plan.my_status === 'accepted'),
    [plans, userId],
  );

  const onlineUsers = Math.max(isRegistered ? 1 : 0, Number(stats.online_users || 0));
  const siteNotifications = (Array.isArray(notifications) ? notifications : []).filter((item) =>
    ['site_notice', 'site_maintenance', 'site_security', 'site_legal', 'site_product'].includes(String(item?.type || '')),
  );
  const chatThemeClass = `chat-theme-${chatTheme || 'default'}`;
  const visibleNotifications = siteNotifications.length > 0 ? siteNotifications : SITE_NOTIF_SEED;

  return (
    <main className="social-shell">
      {(loading || pageBusy) && (
        <div className="brand-loader-screen">
          <div className="brand-loader-card">
            <div className="brand-loader-mark">NG</div>
            <strong>{APP_NAME}</strong>
            <p>Cargando sala y actividad en tiempo real...</p>
            <div className="brand-loader-orbit">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      )}
      <header className="topbar">
        <div className="brand brand-hero">
          <button className="brand-mark" onClick={() => { window.location.href = '/'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>{APP_NAME}</h1>
              <div className="brand-live-pills">
                <span className="status-pill status-go">En vivo · {cityPulse.inProgress}</span>
                <span className="status-pill status-ok">{plans.length} salas activas</span>
                <span className="status-pill status-warning">{onlineUsers} usuarios online</span>
              </div>
            </div>
            <p className="muted">Salas sociales cercanas para quedar, crear y coordinar en tiempo real.</p>
            <div className="brand-tags">
              <span className="chip chip-owner">⚡ Descubrimiento inmediato</span>
              <span className="chip chip-private">🔐 Privadas y por código</span>
              <span className="chip chip-pending">👑 Premium y destacadas</span>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={openSiteChat}>
            Chat virtual
          </button>
          <button
            className="btn btn-ghost"
              onClick={() => {
                if (typeof window === 'undefined') return;
                window.location.href = '/mercado';
              }}
            >
              Mercado
          </button>
          {!isRegistered && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAuthForm({ ...DEFAULT_AUTH_FORM, city: user?.city || 'Madrid' });
                setAuthMode('register');
                setAuthNotice('');
                setAuthError('');
                resetCaptchaState();
                setAuthOpen(true);
              }}
            >
              Crear cuenta
            </button>
          )}
          {isRegistered && (
            <button
              className="btn btn-ghost"
              onClick={() => { window.location.href = '/cuenta'; }}
            >
              Mi cuenta
            </button>
          )}
          {isRegistered && (
            <button className="btn btn-ghost" onClick={signOutUser}>
              Cerrar sesión
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-ghost" onClick={() => { window.location.href = '/admin'; }}>
              Centro admin
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleCreateClick}>
            Crear sala
          </button>
        </div>
      </header>

      <section className="social-stats-grid">
        <article className="stat-card">
          <h3>Ciudad activa</h3>
          <p>{plans.length} planes</p>
          <p className="muted">+ {cityPulse.active} abiertos hoy</p>
        </article>
        <article className="stat-card">
          <h3>Comunidad</h3>
          <p>{onlineUsers} online</p>
          <p className="muted">Asistentes en cola: {cityPulse.totalParticipants}</p>
        </article>
        <article className="stat-card">
          <h3>Tu actividad</h3>
          <p>{stats.plans_created || 0} creados</p>
          <p className="muted">{stats.plans_joined || 0} uniones</p>
        </article>
        <article className="stat-card">
          <h3>Distancia media</h3>
          <p>{distanceText(cityPulse.avgDistance || 0)}</p>
          <p className="muted">Desde tu ubicación</p>
        </article>
      </section>

      <section className="plan-toolbar">
        <div className="toolbar-group">
          {QUICK_FILTERS.map((option) => (
            <button
              key={option.key}
              className={`btn btn-pill ${tab === option.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => applyQuickFilter(option.key)}
            >
              <span>{option.emoji}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar planes: título, lugar o tipo..."
          className="search-input"
        />
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="sort-select">
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              Ordenar: {option.label}
            </option>
          ))}
        </select>
      </section>

      <section className="community-radar-grid">
        <article className="community-radar-card community-radar-hero">
          <span className="story-kicker">Radar social</span>
          <h3>Lo que está encajando ahora</h3>
          <p>{communityDayPulse.headline}</p>
          <div className="community-radar-highlights">
            <div className="community-radar-chip">
              <strong>{communityDayPulse.quickAccess}</strong>
              <span>salas con entrada directa</span>
            </div>
            <div className="community-radar-chip">
              <strong>{communityDayPulse.moderatedPrivate}</strong>
              <span>privadas con revisión manual</span>
            </div>
            <div className="community-radar-chip">
              <strong>{communityDayPulse.premiumRoomsLive}</strong>
              <span>premium visibles ahora</span>
            </div>
          </div>
        </article>
        <article className="community-radar-card">
          <span className="story-kicker">Próximas en marcha</span>
          <h4>Ventana de actividad</h4>
          <div className="community-radar-list">
            {communityDayPulse.nextStarts.length ? communityDayPulse.nextStarts.map((item) => (
              <div key={item.id} className="community-radar-list-item">
                <strong>{item.title}</strong>
                <span>{item.place}</span>
                <small>{item.time}</small>
              </div>
            )) : <p className="muted">No hay arranques inmediatos detectados.</p>}
          </div>
        </article>
        <article className="community-radar-card">
          <span className="story-kicker">Confianza</span>
          <h4>Calidad de anfitriones</h4>
          <div className="community-radar-kpis">
            <div>
              <strong>{communityDayPulse.trustedHosts}</strong>
              <span>hosts con reputación alta</span>
            </div>
            <div>
              <strong>{communityDayPulse.reviewsReceived}</strong>
              <span>valoraciones cerradas hoy</span>
            </div>
          </div>
        </article>
        <article className="community-radar-card">
          <span className="story-kicker">Navegación rápida</span>
          <h4>Todo enlazado a la web</h4>
          <ul className="community-radar-actions">
            <li>Entra directo a salas abiertas sin esperar confirmación.</li>
            <li>Detecta premium activas si tu plan ya está operativo.</li>
            <li>Salta a chat virtual o mercado desde la misma portada.</li>
          </ul>
        </article>
      </section>

      <section className="square-grid">
        {HIGHLIGHT_PANES.map((pane) => (
          <article key={pane.key} className="square-card">
            <span>{pane.emoji}</span>
            <h3>{pane.title}</h3>
            <p>{pane.text}</p>
          </article>
        ))}
      </section>

      <div className="social-grid">
        <aside className="sidebar left">
          <section className="mini-card">
            <h3>{isRegistered ? 'Tu perfil' : 'Acceso visitante'}</h3>
            <p>
              {user?.name || 'Visitante'}
              {isPremiumActive && <span className="premium-badge premium-badge-inline">P</span>}
            </p>
            <p className="muted">Ciudad: {user?.city || 'Madrid'}</p>
            <p className="stat-mini">Perfil: {isRegistered ? (isAdmin ? 'Administrador' : 'Usuario registrado') : 'Visitante sin publicar'}</p>
            <p className="stat-mini">
              Suscripción: {String(user?.subscription_tier || 'free').toUpperCase()} · {user?.subscription_status || 'inactive'}
            </p>
            {isPremiumActive && <p className="stat-mini premium-copy">Tu cuenta premium está activa y puede ver salas premium.</p>}
            <p className="stat-mini">Planes creados: {stats.plans_created || 0}</p>
            <p className="stat-mini">Planes unidos: {stats.plans_joined || 0}</p>
            <p className="stat-mini">Reputacion: {stats.avg_review ? `${stats.avg_review}/5` : 'Sin valorar'}</p>
            <div className="pill-row">
              {!isRegistered && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setAuthForm({ ...DEFAULT_AUTH_FORM, city: user?.city || 'Madrid' });
                    setAuthMode('register');
                    setAuthNotice('');
                    setAuthError('');
                    resetCaptchaState();
                    setAuthOpen(true);
                  }}
                >
                  Completar registro
                </button>
              )}
              {isRegistered && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setAuthForm({ ...DEFAULT_AUTH_FORM, ...user });
                    setAuthNotice('');
                    setAuthError('');
                    setProfileOpen(true);
                  }}
                >
                  Editar perfil
                </button>
              )}
            </div>
          </section>

          <section className="mini-card">
            <h3>Filtros</h3>
            <label className="label">Categoría</label>
            <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
              {CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>

            <label className="label">Radio (m)</label>
            <input value={radius} onChange={(event) => setRadius(event.target.value)} placeholder="8000" />

            <label className="label">Horas</label>
            <input value={hours} onChange={(event) => setHours(event.target.value)} placeholder="24" />

            <button className="btn btn-primary" onClick={loadFeed} style={{ marginTop: 10 }}>
              Aplicar filtros
            </button>
          </section>

          <section className="mini-card">
            <h3>Rutas rápidas</h3>
            <p className="muted">Accesos rápidos por categorías, chats, premium, mercado y otros recorridos</p>
            <div className="quick-route-grid">
              {CATEGORIES.slice(1).map((category) => (
                <button key={category.key} className="chip chip-action quick-route-chip" onClick={() => setFilterCategory(category.key)}>
                  {category.label}
                </button>
              ))}
              <button className="chip chip-action quick-route-chip" onClick={() => setRoomThemeFilter('chat')}>
                💬 Chat
              </button>
              <button className="chip chip-action quick-route-chip" onClick={() => setRoomThemeFilter('amistad')}>
                🤝 Amistad
              </button>
              <button className="chip chip-action quick-route-chip" onClick={() => setRoomThemeFilter('networking')}>
                💼 Networking
              </button>
              <button className="chip chip-action quick-route-chip" onClick={() => setAccessFilter('premium')}>
                👑 Premium
              </button>
              <button className="chip chip-action quick-route-chip" onClick={() => setAccessFilter('private')}>
                🔒 Privadas
              </button>
              <button className="chip chip-action quick-route-chip" onClick={openSiteChat}>
                🌐 Chat virtual
              </button>
              <button
                className="chip chip-action quick-route-chip"
                onClick={() => {
                  if (typeof window === 'undefined') return;
                  window.location.href = '/mercado';
                }}
              >
                🛒 Mercado
              </button>
              <button
                className="chip chip-action quick-route-chip"
                onClick={() => {
                  setFilterCategory('all');
                  setRoomThemeFilter('all');
                  setAccessFilter('all');
                  setSearch('otros');
                }}
              >
                ✨ Otros
              </button>
            </div>
          </section>
        </aside>

        <section className="timeline">
          <article className="mini-card timeline-head">
            <div>
              <h3>Ahora mismo está pasando</h3>
              <p className="muted">
                Feed en vivo · {cityPulse.inProgress} planes en ejecución · {myJoinedPlans.length} planes en los que participas
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleCreateClick}>
              {isRegistered ? 'Publicar sala' : 'Registrate para publicar'}
            </button>
          </article>

          <article className="mini-card discovery-bar-card">
            <div className="discovery-bar-head">
              <div>
                <h3>Descubrir salas por temática</h3>
                <p className="muted">
                  Filtro rápido para chats, amistad, citas, networking, LGTBIQ+, adultos 18+ y salas privadas o premium.
                </p>
              </div>
              <div className="discovery-bar-note">
                <strong>Privadas premium</strong>
                <span className="muted">Si la sala es privada y premium, solo la ven usuarios premium autorizados.</span>
              </div>
            </div>

            <div className="discovery-bar-grid">
              <select value={roomThemeFilter} onChange={(event) => setRoomThemeFilter(event.target.value)}>
                {ROOM_THEME_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.emoji} {option.label}
                  </option>
                ))}
              </select>

              <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                {ACCESS_FILTER_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                value={privateJoinSearch}
                onChange={(event) => setPrivateJoinSearch(event.target.value)}
                placeholder="Buscar sala privada por nombre, ciudad o temática"
              />
            </div>

            <div className="discovery-join-row">
              <input
                value={quickJoinQuery}
                onChange={(event) => setQuickJoinQuery(event.target.value)}
                placeholder="Entrar en sala: escribe nombre, ciudad, temática o ID"
              />
              <button className="btn btn-primary" onClick={quickJoinRoom}>
                Ir a sala
              </button>
            </div>
            {quickJoinNotice && <p className="muted discovery-join-note">{quickJoinNotice}</p>}

            <div className="pill-row">
              {ROOM_THEME_OPTIONS.slice(1).map((option) => (
                <button
                  key={option.key}
                  className={`chip chip-action ${roomThemeFilter === option.key ? 'chip-action-active' : ''}`}
                  onClick={() => setRoomThemeFilter(option.key)}
                >
                  {option.emoji} {option.label}
                </button>
              ))}
            </div>
          </article>

          {loading && <p className="muted">Conectando y cargando recomendaciones...</p>}

          {!loading && myJoinedPlans.length > 0 && (
            <article className="mini-card">
              <h3>Tu agenda</h3>
              <p className="muted">{myJoinedPlans.length} planes en los que ya estás dentro</p>
              <div className="pill-row">
                {myJoinedPlans.slice(0, 4).map((plan) => (
                  <button key={getPlanId(plan)} className="btn btn-ghost" onClick={() => openDetail(plan)}>
                    {plan.title}
                  </button>
                ))}
              </div>
            </article>
          )}

          {!loading && feedByFilters.length === 0 && (
            <article className="empty-state">
              <h2>No hay planes ahora mismo</h2>
              <p>¡Lanza el tuyo y activa la energía de la comunidad!</p>
              <button className="btn btn-primary" onClick={handleCreateClick}>
                Crear primer plan
              </button>
            </article>
          )}

          {!loading && displayedPlans.length > 0 && (
            <div className="plan-grid">
              {displayedPlans.map((plan) => (
                <PlanPost
                  key={plan.plan_id || plan.id}
                  plan={plan}
                  currentUserId={userId}
                  onJoin={joinPlan}
                  onLeave={leavePlan}
                  onOpenChat={openChat}
                  onOpenDetail={openDetail}
                  blockedByHost={isPlanBlockedByHost(getPlanId(plan))}
                />
              ))}
            </div>
          )}

          {!loading && feedByFilters.length > INITIAL_VISIBLE_PLANS && (
            <div className="view-more-wrap">
              <button className="btn btn-ghost" onClick={openAllRoomsPage}>
                Ver más salas
              </button>
            </div>
          )}

          {selectedPlan && (
            <div className="composer-overlay">
              <article className="detail-modal">
                {(() => {
                  const visual = getPlanVisualMeta(selectedPlan);
                  return (
                    <>
                <div className="detail-head">
                  <div className="detail-icon-badge">{visual.icon}</div>
                  <div className="avatar-stack avatar-stack-large">
                    <img
                      src={getUserAvatar(selectedPlan.creator_photo || selectedPlan.creator_name)}
                      className="avatar avatar-img avatar-large"
                      alt={selectedPlan.creator_name || 'Anfitrión'}
                    />
                    {selectedPlan.premium_room && <span className="premium-badge premium-badge-avatar premium-badge-large">P</span>}
                  </div>
                  <div>
                    <h2>{selectedPlan.title}</h2>
                    <p className="muted">
                      Por <strong>{selectedPlan.creator_name || 'Anfitrión'} </strong> · {selectedPlan.host_rating || '4.6'} ⭐
                    </p>
                    <p className="muted">
                      {visual.label} · {selectedPlan.language || 'es'} · {selectedPlan.age_range || '18+'} ·
                      {selectedPlan.visibility === 'private' ? ' 🔒 Privada' : ' 🌐 Pública'}
                    </p>
                  </div>
                  <div className="pill-row detail-hero-pills">
                    <span className="tag">{visual.icon} {visual.label}</span>
                    {selectedPlan.premium_room && <span className="tag tag-premium">👑 Solo premium</span>}
                    {selectedPlan.private_chat_enabled && <span className="tag">🔐 Chat privado</span>}
                    <PlanStatusBadge status={selectedPlan.status} />
                  </div>
                  {(String(selectedPlan?.my_status || '') === 'accepted' ||
                    String(selectedPlan?.creator_id) === String(userId) ||
                    isAdmin) && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (isAdmin) {
                          openAdminChat(selectedPlan);
                          return;
                        }
                        openChat(selectedPlan);
                      }}
                    >
                      {isAdmin ? 'Supervisar chat' : 'Abrir chat'}
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn btn-danger" onClick={() => deletePlan(selectedPlan)}>
                      Borrar sala
                    </button>
                  )}
                  {(String(selectedPlan?.creator_id) === String(userId) || isAdmin) && (
                    <button className="btn btn-ghost" onClick={() => startEditPlan(selectedPlan)}>
                      Editar sala
                    </button>
                  )}
                  {(String(selectedPlan?.creator_id) === String(userId) || isAdmin) &&
                    String(selectedPlan?.status || 'active') !== 'cancelled' && (
                      <button className="btn btn-danger" onClick={() => setClosePlanTarget(selectedPlan)}>
                        Cerrar sala
                      </button>
                    )}
                  {String(selectedPlan?.creator_id) !== String(userId) && (
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        isUserBlocked(selectedPlan.creator_id)
                          ? unblockUserLocally(selectedPlan.creator_id)
                          : blockUserLocally({
                              id: selectedPlan.creator_id,
                              name: selectedPlan.creator_name,
                              email: selectedPlan.creator_email || '',
                            })
                      }
                    >
                      {isUserBlocked(selectedPlan.creator_id) ? 'Desbloquear usuario' : 'Bloquear usuario'}
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => openReportModal(selectedPlan)}>
                    Reportar
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSelectedPlan(null)}>
                    Cerrar
                  </button>
                </div>
                <section className="mini-card detail-highlight-card">
                  <p className="muted">
                    {selectedPlan.visibility === 'private'
                      ? 'Sala privada: para unirte debes solicitar acceso o introducir la clave si el anfitrión la ha definido.'
                      : 'Sala pública: aparece en el feed abierto y puedes entrar directamente si hay hueco.'}
                  </p>
                  <p className="muted">
                    {selectedPlan.premium_room
                      ? 'Sala premium: los usuarios free no la verán. Solo suscriptores premium y usuarios autorizados.'
                      : 'Sala free: visible para usuarios estándar según sus filtros y radio.'}
                  </p>
                </section>
                    </>
                  );
                })()}

                <div className="detail-grid">
                  <section className="mini-card">
                    <h3>Información de la sala</h3>
                    <p>
                      <strong>Descripción:</strong> {selectedPlan.description || 'Sin descripción'}
                    </p>
                    <p className="muted">Estado: {selectedPlan.status || 'active'}</p>
                    <p className="muted">Inicio: {fmtDate(selectedPlan.start_at)}</p>
                    <p className="muted">Duración: {selectedPlan.duration_minutes || 90} min</p>
                    <p className="muted">
                      Ubicación: {selectedPlan.place_name} · {selectedPlan.district || selectedPlan.address || 'Sin zona'}
                    </p>
                    <p className="muted">
                      Ciudad: {selectedPlan.city || 'Madrid'} · {selectedPlan.country || 'España'}
                    </p>
                    <p className="muted">Distancia: {distanceText(selectedPlan.distance_meters || 0)}</p>
                    <p className="muted">Ocupación: {selectedPlan.participants_count || 0}/{selectedPlan.max_people || 0}</p>
                    <a
                      className="btn btn-ghost map-link"
                      href={selectedPlan.map_link || `https://www.google.com/maps/search/?api=1&query=${selectedPlan.latitude},${selectedPlan.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en mapa
                    </a>
                  </section>

                  <section className="mini-card">
                    <h3>Reglas y configuración</h3>
                    <p>{selectedPlan.rules || 'Mantener respeto y puntualidad'}</p>
                    <p className="muted">
                      Requiere aprobación:
                      {' '}
                      {selectedPlan.approval_required ? 'Sí' : 'No'}
                    </p>
                    <p className="muted">
                      Contraseña:
                      {selectedPlan.requires_password ? ' habilitada' : ' no requerida'}
                    </p>
                    <p className="muted">Asistente IA activa: {selectedPlan.allow_chat_gpt ? 'Sí' : 'No'}</p>
                    <p className="muted">Sala premium: {selectedPlan.premium_room ? 'Sí' : 'No'}</p>
                    <p className="muted">Sala destacada: {selectedPlan.featured_room ? 'Sí' : 'No'}</p>
                    <p className="muted">Analítica avanzada: {selectedPlan.advanced_analytics ? 'Sí' : 'No'}</p>
                    <p className="muted">Chat privado por código: {selectedPlan.private_chat_enabled ? 'Sí' : 'No'}</p>
                    <label className="label">
                      Tipo: {CATEGORY_LABELS[selectedPlan.category_code] || selectedPlan.category_code || 'General'}
                    </label>
                  </section>

                  <section className="mini-card">
                    <h3>Participantes y reputación</h3>
                    <p className="muted">
                      Valoración anfitrión: {selectedPlan.host_rating || '4.6'} ({selectedPlan.rating_count || 0} valoraciones)
                    </p>
                    <div className="detail-participants">
                      {(selectedPlan.participants || []).slice(0, 8).map((member, idx) => (
                        <div key={member.user_id || idx} className="detail-member">
                          <img src={getUserAvatar(member.photo_url || member.name)} alt={member.name} />
                          <span>{member.name || `Usuario ${idx + 1}`}</span>
                          {String(member.user_id || '') !== String(userId) && (
                            <button
                              className="btn btn-ghost btn-inline"
                              onClick={() =>
                                isUserBlocked(member.user_id)
                                  ? unblockUserLocally(member.user_id)
                                  : blockUserLocally({
                                      id: member.user_id,
                                      name: member.name,
                                      email: member.email || '',
                                    })
                              }
                            >
                              {isUserBlocked(member.user_id) ? 'Desbloquear' : 'Bloquear'}
                            </button>
                          )}
                        </div>
                      ))}
                      {(selectedPlan.participants || []).length === 0 && <p className="muted">Sin asistentes cargados.</p>}
                    </div>
                  </section>
                </div>

                {(selectedPlan.reviews?.length || 0) > 0 && (
                  <section className="mini-card review-preview">
                    <h4>Reseñas recientes</h4>
                    {(selectedPlan.reviews || []).slice(0, 3).map((rev) => (
                      <p key={rev.id}>
                        ⭐ {rev.rating}/5 — {rev.comment || 'Sin comentario'}
                      </p>
                    ))}
                  </section>
                )}

                <div className="detail-form">
                  <div className="composer-fields">
                    <label className="label">Valorar a un asistente</label>
                    <input
                      value={reviewUser}
                      onChange={(event) => setReviewUser(event.target.value)}
                      placeholder="ID usuario para valorar"
                    />
                    <input
                      value={reviewRating}
                      onChange={(event) => setReviewRating(event.target.value)}
                      placeholder="Puntuación 1-5"
                    />
                    <input
                      value={reviewText}
                      onChange={(event) => setReviewText(event.target.value)}
                      placeholder="Comentario corto"
                    />
                  </div>
                  <div className="composer-actions">
                    <button className="btn btn-secondary" onClick={sendReview}>
                      Enviar reseña
                    </button>
                  </div>
                </div>
              </article>
            </div>
          )}
        </section>

        <aside className="sidebar right">
          <section className="mini-card">
            <h3>Notificaciones</h3>
            {visibleNotifications.length === 0 && <p className="muted">Sin novedades</p>}
            {visibleNotifications.slice(0, 5).map((item) => (
              <div key={item.id} onClick={() => markNotificationRead(item)}>
                <NotificationCard n={item} />
              </div>
            ))}
          </section>

          <section className="mini-card">
            <h3>Tendencias</h3>
            {trending.length === 0 && <p className="muted">Aún sin tendencia</p>}
            {trending.map((trend) => (
              <p key={trend.label} className="trend-row">
                <strong>#{trend.label}</strong>
                <span>
                  {trend.count} plan{trend.count > 1 ? 'es' : ''}
                </span>
              </p>
            ))}
          </section>

          <section className="mini-card">
            <h3>Actividad diaria</h3>
            <p className="muted">Planes hoy: {plans.length}</p>
            <p className="muted">En vivo: {cityPulse.inProgress}</p>
            <p className="muted">Activos en tu radio: {cityPulse.active}</p>
          </section>

          <section className="mini-card">
            <h3>Tips de comunidad</h3>
            <p className="muted">• Crea el plan con un lugar reconocible.</p>
            <p className="muted">• Añade una hora de llegada cómoda.</p>
            <p className="muted">• Indica si el plan es privado o público.</p>
          </section>

        </aside>
      </div>

      <section className="premium-strip">
        <article className="premium-card premium-card-free">
          <h3>Usuario normal</h3>
          <p className="muted">Gratis</p>
          <ul className="footer-links">
            <li>Crear y unirse a salas</li>
            <li>Chat de sala</li>
            <li>Reportes y reputación</li>
          </ul>
        </article>
        <article className="premium-card premium-card-plus">
          <h3>Premium Plus</h3>
          <p className="muted">9,99 EUR/mes</p>
          <ul className="footer-links">
            <li>Salas destacadas</li>
            <li>Insignia premium</li>
            <li>Analítica de asistentes</li>
          </ul>
          <button className="btn btn-primary" onClick={() => { window.location.href = '/premium'; }}>
            Ver premium
          </button>
        </article>
        <article className="premium-card premium-card-pro">
          <h3>Premium Pro</h3>
          <p className="muted">19,99 EUR/mes</p>
          <ul className="footer-links">
            <li>Boost prioritario</li>
            <li>Acceso anticipado a eventos</li>
            <li>Partners, locales y experiencias</li>
          </ul>
          <button className="btn btn-secondary" onClick={() => { window.location.href = '/premium'; }}>
            Comparar planes
          </button>
        </article>
      </section>

      {!cookieConsent.accepted && (
        <div className="cookie-banner">
          <h3>Cookies y datos de experiencia</h3>
          <p>
            Esta web usa cookies esenciales para iniciar sesión y guardar preferencias. Si aceptas también habilitamos
            mejoras de rendimiento y personalización de chat inteligente.
          </p>
          <div className="cookie-actions">
            <button className="btn btn-ghost" onClick={acceptAllCookies}>
              Aceptar todas
            </button>
            <button className="btn btn-secondary" onClick={denyOptionalCookies}>
              Rechazar opcionales
            </button>
            <button className="btn btn-primary" onClick={() => applyCookieConsent(cookieConsent)}>
              Continuar con lo esencial
            </button>
          </div>
        </div>
      )}

      {siteChatOpen && (
        <div className="composer-overlay">
          <article className="composer-modal chat-modal site-chat-modal">
            <header className="chat-header">
              <div className="chat-header-main">
                <div>
                  <h2>Chat virtual global</h2>
                  <p className="muted">Espacio general abierto para invitados y usuarios registrados, separado de las salas.</p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="btn btn-ghost" onClick={loadSiteChat}>
                  Actualizar
                </button>
                <button className="btn btn-ghost" onClick={() => setSiteChatOpen(false)}>
                  Cerrar chat
                </button>
              </div>
            </header>

            <section className="chat-summary-strip">
              <article className="chat-summary-card">
                <strong>Acceso</strong>
                <span>Global · abierto para invitados y registrados</span>
              </article>
              <article className="chat-summary-card">
                <strong>Mensajes</strong>
                <span>{siteChatMessages.length} visibles</span>
              </article>
              <article className="chat-summary-card">
                <strong>Perfil actual</strong>
                <span>{isRegistered ? (isPremiumActive ? 'Usuario premium' : 'Usuario registrado') : 'Invitado'}</span>
              </article>
              <article className="chat-summary-card">
                <strong>Uso</strong>
                <span>Presentaciones, dudas rápidas y coordinación abierta</span>
              </article>
            </section>

            <div className="chat-layout">
              <section className="chat-section chat-main-surface">
                <article className="chat-safety-banner">
                  <strong>Aviso automático de convivencia</strong>
                  <p>No compartas datos sensibles, contenido ilegal ni información privada de terceros. Este chat global no sustituye la moderación ni las autoridades competentes.</p>
                </article>
                <div ref={siteChatMessagesRef} className="chat-messages chat-live-thread">
                  {!siteChatLoading && siteChatMessages.length === 0 && <p className="muted">Todavía no hay mensajes en el chat virtual.</p>}
                  {siteChatMessages.map((msg) => (
                    <div key={msg.id || `${msg.author_name}-${msg.created_at}`} className="chat-message-row">
                      <img
                        className="chat-message-avatar"
                        src={getUserAvatar(msg.author_name || 'Chat')}
                        alt={msg.author_name || 'Usuario'}
                      />
                      <article className={`chat-bubble ${msg.author_role === 'system' ? 'chat-system-bubble' : ''}`}>
                        <div className="chat-bubble-head">
                          <strong>{msg.author_name || 'Usuario'}</strong>
                          <span className="chip">{msg.author_role || 'guest'}</span>
                        </div>
                        <p>{msg.message}</p>
                        <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
                      </article>
                    </div>
                  ))}
                </div>
                <div className="chat-send">
                  <input
                    value={siteChatText}
                    onChange={(event) => setSiteChatText(event.target.value)}
                    placeholder="Escribe en el chat virtual..."
                  />
                  <button className="btn btn-primary" onClick={sendSiteChat}>
                    Enviar
                  </button>
                </div>
                <p className="muted chat-compose-hint">
                  Los invitados pueden usar este chat general, pero no acceden al chat de salas privadas, premium o moderadas.
                </p>
              </section>

              <aside className="chat-users-pane chat-sidebar-stack">
                <section className="chat-side-card">
                  <div className="chat-side-head">
                    <div>
                      <h3>Reglas rápidas</h3>
                      <p className="muted">Normas mínimas para mantener el espacio operativo.</p>
                    </div>
                  </div>
                  <ul className="policy-list">
                    <li>No compartas datos privados ni contactos externos sin consentimiento.</li>
                    <li>No uses el chat general para actividad sexual explícita ni captación agresiva.</li>
                    <li>Las temáticas adultas solo se gestionan en salas premium 18+ y con moderación.</li>
                    <li>Si detectas amenazas o coacciones, usa reportes y acude a las autoridades si procede.</li>
                  </ul>
                </section>
              </aside>
            </div>
          </article>
        </div>
      )}

      {(authOpen || profileOpen) && (
        <div className="composer-overlay">
          <article className="composer-modal profile-modal">
            <h2>{profileOpen ? 'Perfil de usuario' : authMode === 'invite' ? 'Solicitud de acceso invitado' : 'Registro de usuario'}</h2>
            <p className="muted">
              {profileOpen
                ? 'Perfil completo del usuario para publicar salas, participar y mejorar la confianza de la comunidad.'
                : authMode === 'invite'
                  ? 'Solicita revisión manual al equipo administrativo. Si se aprueba, recibirás un enlace personal con 24 horas de validez para completar el registro.'
                  : 'Perfil completo del usuario para publicar salas, participar y mejorar la confianza de la comunidad.'}
            </p>

            {!profileOpen && (
              <div className="auth-switch">
                <button
                  className={`btn ${authMode === 'register' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                    setAuthNotice('');
                    resetCaptchaState();
                  }}
                >
                  Crear cuenta
                </button>
                <button
                  className={`btn ${authMode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                    setAuthNotice('');
                    resetCaptchaState(false);
                  }}
                >
                  Iniciar sesion
                </button>
                <button
                  className={`btn ${authMode === 'invite' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setAuthMode('invite');
                    setAuthError('');
                    setAuthNotice('');
                    resetCaptchaState();
                  }}
                >
                  Solicitar invitación
                </button>
              </div>
            )}

            <div className="profile-sections">
              {!profileOpen && (
                <section className="mini-card">
                  <h3>{authMode === 'invite' ? 'Solicitud de acceso invitado' : 'Acceso'}</h3>
                  <div className="composer-grid">
                    {authMode === 'invite' ? (
                      <>
                        <input
                          value={guestRequestForm.full_name}
                          onChange={(event) => setGuestRequestForm((current) => ({ ...current, full_name: event.target.value }))}
                          placeholder="Nombre completo"
                        />
                        <input
                          value={guestRequestForm.email}
                          onChange={(event) => setGuestRequestForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="Correo de acceso"
                        />
                        <input
                          value={guestRequestForm.phone}
                          onChange={(event) => setGuestRequestForm((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="Teléfono"
                        />
                        <input
                          value={guestRequestForm.city}
                          onChange={(event) => setGuestRequestForm((current) => ({ ...current, city: event.target.value }))}
                          placeholder="Ciudad"
                        />
                        <textarea
                          className="auth-request-textarea"
                          value={guestRequestForm.reason}
                          onChange={(event) => setGuestRequestForm((current) => ({ ...current, reason: event.target.value }))}
                          placeholder="Explica por qué solicitas acceso invitado y qué uso darás a la plataforma"
                        />
                      </>
                    ) : (
                      <>
                        <input
                          value={authForm.email}
                          disabled={Boolean(approvedGuestInvite && authMode === 'register')}
                          onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="Correo"
                        />
                        <input
                          className="auth-password-input"
                          type="password"
                          value={authForm.password}
                          onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                          placeholder="Contraseña segura"
                        />
                      </>
                    )}
                    {authMode === 'register' && (
                      <input
                        className="auth-password-input"
                        type="password"
                        value={authForm.password_confirm}
                        onChange={(event) =>
                          setAuthForm((current) => ({ ...current, password_confirm: event.target.value }))
                        }
                        placeholder="Confirmar contraseña"
                      />
                    )}
                  </div>
                  {approvedGuestInvite && authMode === 'register' && (
                    <p className="auth-invite-banner">
                      Invitación aprobada para <strong>{approvedGuestInvite.email}</strong>. Debes finalizar el registro antes del {formatShortDate(approvedGuestInvite.expires_at)}.
                    </p>
                  )}
                  {authMode !== 'login' && (
                    <div className="auth-security-grid">
                      <article className="auth-security-card auth-security-card-compact">
                        <div className="auth-security-head">
                          <div>
                            <strong>Contraseña de seguridad</strong>
                            <p className="muted">Mínimo {MIN_PASSWORD_LENGTH} caracteres, mezcla letras, números y símbolos.</p>
                          </div>
                          <span className={`chip password-chip password-chip-${passwordStrength.tone}`}>{passwordStrength.label}</span>
                        </div>
                        {authMode === 'register' ? (
                          <>
                            <div className="password-strength-bar" aria-hidden="true">
                              <span
                                className={`password-strength-fill password-strength-fill-${passwordStrength.tone}`}
                                style={{ width: `${passwordStrength.percent}%` }}
                              />
                            </div>
                            <ul className="password-check-list">
                              {passwordChecks.map((check) => (
                                <li key={check.key} className={check.ok ? 'is-ok' : ''}>
                                  <span>{check.ok ? '✓' : '•'}</span>
                                  <span>{check.label}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <p className="muted">
                            Esta solicitud será revisada manualmente. Si se aprueba, recibirás un enlace personal y temporal para completar el alta con verificación de correo.
                          </p>
                        )}
                      </article>
                      <article className="auth-security-card">
                        <div className="auth-security-head">
                          <div>
                            <strong>{turnstileEnabled ? 'Cloudflare Turnstile' : 'CAPTCHA de verificación'}</strong>
                            <p className="muted">
                              {turnstileEnabled
                                ? authMode === 'invite'
                                  ? 'Verificación reforzada antes de remitir la solicitud al equipo de administración.'
                                  : 'Verificación reforzada con comprobación del token antes de completar el alta.'
                                : authMode === 'invite'
                                  ? 'Confirma que la solicitud la está haciendo una persona real.'
                                  : 'Confirma que el alta la está haciendo una persona real.'}
                            </p>
                          </div>
                          {!turnstileEnabled && (
                            <button
                              className="btn btn-ghost btn-inline"
                              onClick={() => {
                                setCaptchaChallenge(createCaptchaChallenge());
                                setCaptchaAnswer('');
                              }}
                            >
                              Nuevo reto
                            </button>
                          )}
                        </div>
                        {turnstileEnabled ? (
                          <div className="turnstile-shell">
                            <div ref={captchaContainerRef} className="turnstile-box" />
                            <p className="muted">
                              {captchaToken ? 'CAPTCHA validado correctamente.' : 'Completa la verificación para poder crear la cuenta.'}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="captcha-box">
                              <span className="captcha-question">{captchaChallenge.question} = ?</span>
                            </div>
                            <input
                              value={captchaAnswer}
                              onChange={(event) => setCaptchaAnswer(event.target.value)}
                              placeholder="Respuesta CAPTCHA"
                            />
                          </>
                        )}
                      </article>
                    </div>
                  )}
                </section>
              )}

              {(profileOpen || authMode === 'register') && (
              <section className="mini-card">
                <h3>Datos personales</h3>
                <div className="composer-grid">
                  <input
                    value={authForm.first_name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, first_name: event.target.value }))}
                    placeholder="Nombre"
                  />
                  <input
                    value={authForm.last_name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, last_name: event.target.value }))}
                    placeholder="Apellidos"
                  />
                  <input
                    value={authForm.username}
                    onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="Alias publico"
                  />
                  <input
                    type="date"
                    value={authForm.birth_date}
                    onChange={(event) => setAuthForm((current) => ({ ...current, birth_date: event.target.value }))}
                    placeholder="Fecha de nacimiento"
                  />
                  <input
                    value={authForm.bio}
                    onChange={(event) => setAuthForm((current) => ({ ...current, bio: event.target.value }))}
                    placeholder="Biografia corta"
                  />
                  <input
                    value={authForm.photo}
                    onChange={(event) => setAuthForm((current) => ({ ...current, photo: event.target.value }))}
                    placeholder="URL de foto"
                  />
                </div>
              </section>
              )}

              {(profileOpen || authMode === 'register') && (
              <section className="mini-card">
                <h3>Contacto y direccion</h3>
                <div className="composer-grid">
                  {profileOpen && (
                    <input
                      value={authForm.email}
                      onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Correo"
                    />
                  )}
                  <input
                    value={authForm.phone}
                    onChange={(event) => setAuthForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Telefono"
                  />
                  <input
                    value={authForm.address}
                    onChange={(event) => setAuthForm((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Direccion"
                  />
                  <input
                    value={authForm.district}
                    onChange={(event) => setAuthForm((current) => ({ ...current, district: event.target.value }))}
                    placeholder="Barrio"
                  />
                  <input
                    value={authForm.city}
                    onChange={(event) => setAuthForm((current) => ({ ...current, city: event.target.value }))}
                    placeholder="Ciudad"
                  />
                  <input
                    value={authForm.postal_code}
                    onChange={(event) => setAuthForm((current) => ({ ...current, postal_code: event.target.value }))}
                    placeholder="Codigo postal"
                  />
                </div>
              </section>
              )}

              {(profileOpen || authMode === 'register') && (
              <section className="mini-card">
                <h3>Preferencias sociales</h3>
                <div className="composer-grid">
                  <input
                    value={authForm.interests}
                    onChange={(event) => setAuthForm((current) => ({ ...current, interests: event.target.value }))}
                    placeholder="Intereses: cafe, deporte, idiomas..."
                  />
                  <input
                    value={authForm.emergency_contact}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, emergency_contact: event.target.value }))
                    }
                    placeholder="Contacto de emergencia"
                  />
                </div>
                <label className="adult-confirm-row">
                  <input
                    type="checkbox"
                    checked={Boolean(authForm.confirm_adult)}
                    onChange={(event) => setAuthForm((current) => ({ ...current, confirm_adult: event.target.checked }))}
                  />
                  <span>{AGE_CONFIRMATION_LABEL}</span>
                </label>
              </section>
              )}
            </div>

            {authError && <p className="error-message">{authError}</p>}
            {authNotice && <p className="auth-notice">{authNotice}</p>}
            <div className="composer-actions">
              <button className="btn btn-primary" onClick={registerProfile}>
                {profileOpen ? 'Guardar perfil' : authMode === 'login' ? 'Entrar' : authMode === 'invite' ? 'Enviar solicitud' : 'Crear cuenta'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAuthOpen(false);
                  setProfileOpen(false);
                  setAuthError('');
                }}
              >
                Cerrar
              </button>
            </div>
          </article>
        </div>
      )}

      {composerOpen && (
        <div className="composer-overlay">
          <article className="composer-modal">
            <h2>{editingPlanId ? 'Editar sala' : 'Crear plan'}</h2>

            <div className="composer-grid">
              <input
                value={planForm.title}
                onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                placeholder="Título"
              />
              <input
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                placeholder="Descripción"
              />
              <select
                value={planForm.category}
                onChange={(e) => setPlanForm({ ...planForm, category: e.target.value })}
              >
                {CATEGORIES.filter((category) => category.key !== 'all').map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
              <input
                value={planForm.place_name}
                onChange={(e) => setPlanForm({ ...planForm, place_name: e.target.value })}
                placeholder="Lugar"
              />
              <input
                value={planForm.address}
                onChange={(e) => setPlanForm({ ...planForm, address: e.target.value })}
                placeholder="Dirección exacta"
              />
              <input
                value={planForm.district}
                onChange={(e) => setPlanForm({ ...planForm, district: e.target.value })}
                placeholder="Barrio / Zona"
              />
              <input
                value={planForm.city}
                onChange={(e) => setPlanForm({ ...planForm, city: e.target.value })}
                placeholder="Ciudad"
              />
              <select
                value={planForm.country}
                onChange={(e) => setPlanForm({ ...planForm, country: e.target.value })}
              >
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country} value={country}>
                    País: {country}
                  </option>
                ))}
              </select>
              <input
                value={planForm.start_at}
                onChange={(e) => setPlanForm({ ...planForm, start_at: e.target.value })}
                placeholder="Inicio ISO"
              />
              <input
                value={planForm.max_people}
                onChange={(e) => setPlanForm({ ...planForm, max_people: e.target.value })}
                placeholder="Máx. personas"
              />
              <input
                value={planForm.duration_minutes}
                onChange={(e) => setPlanForm({ ...planForm, duration_minutes: e.target.value })}
                placeholder="Duración (min)"
              />
              <select
                value={planForm.room_level}
                onChange={(e) =>
                  setPlanForm((current) => {
                    const nextTheme = e.target.value;
                    const nextAdult = isAdultRoomTheme(nextTheme);
                    return {
                      ...current,
                      room_level: nextTheme,
                      premium_room: nextAdult ? true : current.premium_room,
                      visibility: nextAdult ? 'private' : current.visibility,
                      approval_required: nextAdult ? true : current.approval_required,
                      age_range: nextAdult ? '18+' : current.age_range,
                    };
                  })
                }
              >
                {ROOM_THEME_OPTIONS.filter((option) => option.key !== 'all').map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.emoji} Temática: {option.label}
                  </option>
                ))}
              </select>
              <select
                value={planForm.language}
                onChange={(e) => setPlanForm({ ...planForm, language: e.target.value })}
              >
                <option value="es">Idioma: Español</option>
                <option value="en">Idioma: English</option>
                <option value="fr">Idioma: Français</option>
                <option value="it">Idioma: Italiano</option>
              </select>
              <input
                value={planForm.age_range}
                onChange={(e) => setPlanForm({ ...planForm, age_range: e.target.value })}
                placeholder="Edad mínima/máxima"
              />
              <select
                value={planForm.visibility}
                disabled={isAdultPremiumTheme}
                onChange={(e) =>
                  setPlanForm((current) => ({
                    ...current,
                    visibility: e.target.value,
                    ...(e.target.value === 'public' ? { access_password: '' } : {}),
                  }))
                }
              >
                <option value="public">🌐 Público</option>
                <option value="private">🔒 Privado</option>
              </select>
              {planForm.visibility === 'private' && (
                <input
                  type="password"
                  value={planForm.access_password}
                  onChange={(e) => setPlanForm({ ...planForm, access_password: e.target.value })}
                  placeholder="Contraseña del plan"
                />
              )}
              <input
                value={planForm.latitude}
                onChange={(e) => setPlanForm({ ...planForm, latitude: e.target.value })}
                placeholder="Latitud"
              />
              <input
                value={planForm.longitude}
                onChange={(e) => setPlanForm({ ...planForm, longitude: e.target.value })}
                placeholder="Longitud"
              />
              <input
                value={planForm.rules}
                onChange={(e) => setPlanForm({ ...planForm, rules: e.target.value })}
                placeholder="Reglas y etiqueta de conducta"
              />
              <div className="option-panel">
                <div className="option-panel-head">
                  <strong>Tipo de sala</strong>
                  <span className="muted">
                    {isAdultPremiumTheme
                      ? 'La temática adulta queda forzada a premium, privada, 18+ y con aprobación manual.'
                      : canUsePremiumRooms
                        ? 'Puedes elegir entre sala free o premium.'
                        : 'Las salas premium requieren suscripción Plus o Pro.'}
                  </span>
                </div>
                <div className="option-choice-grid">
                  <button
                    type="button"
                    className={`option-choice-card ${!planForm.premium_room ? 'option-choice-card-active' : ''}`}
                    onClick={() => {
                      if (isAdultPremiumTheme) return;
                      setPlanForm((current) => ({
                        ...current,
                        premium_room: false,
                        featured_room: false,
                        advanced_analytics: false,
                      }));
                    }}
                  >
                    <strong>Sala free</strong>
                    <p>{isAdultPremiumTheme ? 'No disponible para temáticas adultas.' : 'Visible para todos los usuarios y sin extras de posicionamiento.'}</p>
                  </button>
                  <button
                    type="button"
                    className={`option-choice-card option-choice-card-premium ${planForm.premium_room ? 'option-choice-card-active' : ''}`}
                    onClick={() => {
                      if (!canUsePremiumRooms) {
                        window.location.href = '/premium?plan=plus';
                        return;
                      }
                      setPlanForm((current) => ({ ...current, premium_room: true }));
                    }}
                  >
                    <strong>Sala premium</strong>
                    <p>Solo visible para usuarios premium, con insignia y más calidad de tráfico.</p>
                  </button>
                </div>
              </div>
              <label className="label">
                <input
                  type="checkbox"
                  checked={planForm.approval_required}
                  disabled={isAdultPremiumTheme}
                  onChange={(event) =>
                    setPlanForm((current) => ({ ...current, approval_required: event.target.checked }))
                  }
                />
                {' '}
                Requiere aprobación
              </label>
              <label className="label">
                <input
                  type="checkbox"
                  checked={planForm.private_chat_enabled}
                  onChange={(event) =>
                    setPlanForm((current) => ({
                      ...current,
                      private_chat_enabled: event.target.checked,
                      private_chat_code: event.target.checked ? current.private_chat_code || generatePrivateChatCode() : '',
                    }))
                  }
                />
                {' '}
                Preparar canal privado del chat con código
              </label>
              {planForm.private_chat_enabled && (
                <input
                  value={planForm.private_chat_code}
                  onChange={(e) => setPlanForm((current) => ({ ...current, private_chat_code: e.target.value.toUpperCase() }))}
                  placeholder="Código privado del chat"
                />
              )}
              {String(user?.subscription_tier || 'free') !== 'free' && (
                <>
                  <label className="label">
                    <input
                      type="checkbox"
                      checked={planForm.featured_room}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, featured_room: event.target.checked }))
                      }
                    />
                    {' '}
                    Sala destacada en feed y mapa
                  </label>
                  <label className="label">
                    <input
                      type="checkbox"
                      checked={planForm.premium_room}
                      disabled={isAdultPremiumTheme}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, premium_room: event.target.checked }))
                      }
                    />
                    {' '}
                    Sala premium con insignia
                  </label>
                  {String(user?.subscription_tier || 'free') === 'pro' && (
                    <label className="label">
                      <input
                        type="checkbox"
                        checked={planForm.advanced_analytics}
                        onChange={(event) =>
                          setPlanForm((current) => ({ ...current, advanced_analytics: event.target.checked }))
                        }
                      />
                      {' '}
                      Analítica avanzada de asistentes
                    </label>
                  )}
                </>
              )}
            </div>

              <article className="mini-card location-preview">
              <h3>Ubicacion de la sala</h3>
              <p className="muted">
                {planForm.place_name || 'Lugar'} · {planForm.address || 'Direccion pendiente'} · {planForm.district || 'Zona'} ·{' '}
                {planForm.city || 'Ciudad'} · {planForm.country || 'Pais'}
              </p>
              <p className="muted">
                Temática: {ROOM_THEME_OPTIONS.find((option) => option.key === planForm.room_level)?.label || 'Sala social'}
                {' · '}
                {isAdultPremiumTheme
                  ? 'Adultos 18+ premium: privada, moderada y solo para cuentas activas'
                  : planForm.premium_room
                  ? planForm.visibility === 'private'
                    ? 'Privada premium: solo premium autorizados'
                    : 'Premium visible para suscriptores'
                  : planForm.visibility === 'private'
                    ? 'Privada con solicitud o clave'
                    : 'Sala free visible para todos'}
              </p>
              <p className="muted">
                Coordenadas: {planForm.latitude || '-'} / {planForm.longitude || '-'}
              </p>
              <div className="pill-row">
                <button className="btn btn-ghost" onClick={fillCurrentLocation}>
                  Usar mi ubicacion
                </button>
              </div>
            </article>

            <div className="composer-actions">
              <button className="btn btn-primary" onClick={createPlan}>
                {editingPlanId ? 'Guardar cambios' : 'Publicar'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setComposerOpen(false);
                  setEditingPlanId(null);
                  setPlanForm(DEFAULT_PLAN_FORM);
                }}
              >
                Cancelar
              </button>
            </div>
          </article>
        </div>
      )}

      {chatPlan && (
        <div className="composer-overlay">
          <article className={`chat-modal ${chatThemeClass}`}>
            <header className="chat-header">
              <div className="chat-header-main">
                <div className="chat-room-badge">{getPlanVisualMeta(chatPlan).icon}</div>
                <div>
                  <h2>{chatPlan.title}</h2>
                  <p className="muted">
                    {chatPlan.place_name || 'Lugar pendiente'} · {chatPlan.city || 'Madrid'} · {visibleChatParticipants.length} participantes
                  </p>
                </div>
              </div>
              <div className="chat-header-actions">
                <select className="chat-theme-select" value={chatTheme} onChange={(event) => setChatTheme(event.target.value)}>
                  {CHAT_THEMES.map((theme) => (
                    <option key={theme.key} value={theme.key}>
                      {theme.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={() => refreshActiveChat(chatPlan)}>
                  Refrescar
                </button>
                <button className="btn btn-ghost" onClick={closeChat}>
                  Cerrar chat
                </button>
              </div>
            </header>

            <section className="chat-summary-strip">
              <article className="chat-summary-card">
                <strong>Canal actual</strong>
                <span>{chatChannel === 'private' ? 'Privado por código' : 'General de la sala'}</span>
              </article>
              <article className="chat-summary-card">
                <strong>Mensajes</strong>
                <span>{filteredChatMessages.length} visibles · {chatMessages.length} totales</span>
              </article>
              <article className="chat-summary-card">
                <strong>Acceso</strong>
                <span>
                  {chatPlan.visibility === 'private' ? 'Sala privada' : 'Sala pública'}
                  {chatPlan.premium_room ? ' · solo premium' : ' · free/premium'}
                </span>
              </article>
              <article className="chat-summary-card">
                <strong>Privacidad</strong>
                <span>{chatPlan.private_chat_enabled ? 'Canal privado disponible' : 'Solo canal general'}</span>
              </article>
            </section>

            <div className="chat-layout">
              <section className="chat-section chat-main-surface">
                <div className="chat-room-meta">
                  <div>
                    <h3>Chat de la sala</h3>
                    <p className="muted">
                      {visibleChatParticipants.length} personas en la sala
                      {chatSilentAdminMode ? ' · supervisión discreta' : ''}
                    </p>
                  </div>
                  <button className="btn btn-ghost" onClick={() => refreshActiveChat(chatPlan)}>
                    Actualizar
                  </button>
                </div>
                <div className="chat-presence-row">
                  <span className="chip chip-owner">{chatChannel === 'private' ? '🔐 Canal privado' : '💬 Canal general'}</span>
                  <span className="chip">{filteredChatMessages.length} mensajes filtrados</span>
                  <span className="chip">{visibleChatParticipants.length} participantes visibles</span>
                  {chatImagePreview && <span className="chip chip-pending">Adjunto listo</span>}
                </div>
                <article className="chat-safety-banner">
                  <strong>Aviso automático de privacidad</strong>
                  <p>{CHAT_SAFETY_MESSAGE}</p>
                  <div className="chat-safety-actions">
                    <button
                      className="btn btn-danger btn-inline"
                      onClick={() => {
                        openReportModal(chatPlan);
                        setAuthNotice(
                          'La incidencia quedará registrada para moderación. Si existe riesgo inmediato, contacta también con las autoridades competentes de tu ciudad.',
                        );
                      }}
                    >
                      Alertar moderación
                    </button>
                    <span className="muted">
                      Si detectas amenazas, coacciones o riesgo real, no compartas más datos y solicita revisión inmediata.
                    </span>
                  </div>
                </article>
                <div className="chat-tools-grid">
                  <input
                    value={chatSearch}
                    onChange={(event) => setChatSearch(event.target.value)}
                    placeholder="Buscar dentro del chat por texto o usuario"
                  />
                  <div className="pill-row">
                    {QUICK_CHAT_ACTIONS.map((action) => (
                      <button key={action} className="chip chip-action" onClick={() => injectQuickMessage(action)}>
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chat-channel-bar">
                  <button
                    className={`btn ${chatChannel === 'main' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      setChatChannel('main');
                      setChatPrivateError('');
                    }}
                  >
                    Chat general
                  </button>
                  <button
                    className={`btn ${chatChannel === 'private' ? 'btn-secondary' : 'btn-ghost'}`}
                    disabled={!chatPlan.private_chat_enabled && !(isAdmin || String(chatPlan.creator_id) === String(userId))}
                    onClick={() => {
                      if (chatPrivateReady || isAdmin || String(chatPlan.creator_id) === String(userId)) {
                        setChatChannel('private');
                      }
                    }}
                  >
                    Chat privado
                  </button>
                </div>
                <article className="mini-card chat-private-card">
                  <div className="chat-private-head">
                    <div>
                      <strong>Canal privado por código</strong>
                      <p className="muted">
                        {chatPlan.private_chat_enabled
                          ? 'El canal privado ya está habilitado para esta sala.'
                          : 'Puedes abrir un canal adicional con código para conversaciones más cerradas.'}
                      </p>
                    </div>
                    {(isAdmin || String(chatPlan.creator_id) === String(userId)) && (
                      <div className="pill-row">
                        {chatPrivateCode && (
                          <button className="btn btn-ghost" onClick={copyPrivateChatCode}>
                            Copiar código
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={savePrivateChatConfig}>
                          {chatPlan.private_chat_enabled ? 'Regenerar código' : 'Crear chat privado'}
                        </button>
                      </div>
                    )}
                  </div>

                  {(isAdmin || String(chatPlan.creator_id) === String(userId)) ? (
                    <div className="chat-private-controls">
                      <input
                        value={chatPrivateDraftCode}
                        onChange={(event) => setChatPrivateDraftCode(event.target.value.toUpperCase())}
                        placeholder="Código privado del chat"
                      />
                      {chatPrivateCode && <span className="chip chip-owner">Código activo: {chatPrivateCode}</span>}
                    </div>
                  ) : (
                    <>
                      {chatPlan.private_chat_enabled ? (
                        <div className="chat-private-controls">
                          <input
                            value={chatPrivateDraftCode}
                            onChange={(event) => setChatPrivateDraftCode(event.target.value.toUpperCase())}
                            placeholder="Introduce el código privado"
                          />
                          <button className="btn btn-secondary" onClick={unlockPrivateChat}>
                            Acceder al privado
                          </button>
                        </div>
                      ) : (
                        <p className="muted">El anfitrión no ha activado todavía un canal privado.</p>
                      )}
                    </>
                  )}
                  {chatPrivateError && <p className="error-message">{chatPrivateError}</p>}
                </article>
                {pinnedChatMessages.length > 0 && (
                  <section className="chat-pinned-strip">
                    <div className="chat-side-head">
                      <div>
                        <h3>Mensajes fijados</h3>
                        <p className="muted">Quedan arriba para que el grupo vea lo importante primero.</p>
                      </div>
                    </div>
                    <div className="chat-pinned-list">
                      {pinnedChatMessages.map((msg) => (
                        <article key={`pinned-${msg.id}`} className="chat-pinned-card">
                          <strong>{msg.user_name || 'Usuario'}</strong>
                          <p>{msg.message}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                <div ref={roomChatMessagesRef} className="chat-messages chat-live-thread">
                  {filteredChatMessages.length === 0 && <p className="muted">No hay mensajes para este filtro o canal</p>}
                  {filteredChatMessages.map((msg) => (
                    <div
                      key={msg.id || `${msg.user_id}-${msg.created_at}`}
                      className={`chat-message-row ${msg.user_id === userId ? 'chat-message-row-mine' : ''}`}
                    >
                      {msg.user_id !== userId && (
                        <img
                          className="chat-message-avatar"
                          src={getUserAvatar(msg.user_photo || msg.user_name || msg.user_id)}
                          alt={msg.user_name || 'Usuario'}
                        />
                      )}
                      <article className={`chat-bubble ${msg.user_id === userId ? 'chat-mine' : ''}`}>
                        <div className="chat-bubble-head">
                          <strong>{msg.user_name || msg.user_id}</strong>
                          <span className="chip">
                            {String(msg.channel || 'main') === 'private' ? 'Privado' : 'General'}
                          </span>
                        </div>
                        <p>{msg.message}</p>
                        {msg.image_url && (
                          <img className="chat-image" src={msg.image_url} alt="Adjunto del chat" />
                        )}
                        <div className="chat-message-actions">
                          <div className="pill-row">
                            {MESSAGE_REACTION_OPTIONS.map((emoji) => {
                              const reaction = (msg.reactions || []).find((entry) => entry.emoji === emoji);
                              return (
                                <button
                                  key={`${msg.id}-${emoji}`}
                                  className={`chip chip-action ${reaction?.reacted_by_me ? 'chip-action-active' : ''}`}
                                  onClick={() => toggleReaction(msg, emoji)}
                                >
                                  {emoji}
                                  {reaction?.count ? ` ${reaction.count}` : ''}
                                </button>
                              );
                            })}
                          </div>
                          {(String(chatPlan.creator_id) === String(userId) || isAdmin) && (
                            <button className="btn btn-ghost btn-inline" onClick={() => togglePinMessage(msg)}>
                              {msg.is_pinned ? 'Desfijar' : 'Fijar'}
                            </button>
                          )}
                        </div>
                        <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
                      </article>
                      {msg.user_id === userId && (
                        <img
                          className="chat-message-avatar"
                          src={getUserAvatar(msg.user_photo || msg.user_name || user?.name || 'Tú')}
                          alt={msg.user_name || 'Tu usuario'}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {chatImagePreview && (
                  <div className="chat-image-preview">
                    <img src={chatImagePreview} alt="Vista previa del adjunto" />
                    <button className="btn btn-ghost" onClick={() => setChatImagePreview('')}>
                      Quitar imagen
                    </button>
                  </div>
                )}
                <div className="chat-compose-tools">
                  {['😀', '🙌', '📍', '⏰', '🔥', '👋'].map((emoji) => (
                    <button
                      key={emoji}
                      className="chip chip-action"
                      onClick={() => setChatText((current) => `${current}${current ? ' ' : ''}${emoji}`)}
                    >
                      {emoji}
                    </button>
                  ))}
                  <span className="muted">Atajos rápidos para responder como en una app de mensajería.</span>
                </div>
                <div className="chat-send">
                  <input
                    value={chatText}
                    onChange={(event) => setChatText(event.target.value)}
                    placeholder="Escribe un mensaje al grupo..."
                  />
                  <label className="btn btn-ghost chat-upload-btn">
                    Adjuntar imagen
                    <input type="file" accept="image/*" hidden onChange={handleChatImageUpload} />
                  </label>
                  <button className="btn btn-primary" onClick={sendChat}>
                    Enviar
                  </button>
                </div>
                <p className="muted chat-compose-hint">
                  Usa las acciones rápidas o escribe libremente. El canal privado solo acepta a quien tenga código o permiso.
                </p>
              </section>

              <aside className="chat-users-pane chat-sidebar-stack">
                <section className="chat-side-card">
                  <div className="chat-side-head">
                    <div>
                      <h3>Participantes</h3>
                      <p className="muted">Quién está dentro y en qué estado.</p>
                    </div>
                    <span className="chip">{visibleChatParticipants.length} activos</span>
                  </div>
                    <div className="chat-users-list">
                    {visibleChatParticipants.length === 0 && <p className="muted">Sin participantes visibles.</p>}
                    {visibleChatParticipants.map((member, index) => (
                      <article key={`${member.user_id || member.id || index}`} className="chat-user-card">
                        <img
                          src={getUserAvatar(member.photo_url || member.name || member.user_name)}
                          alt={member.name || member.user_name || `Usuario ${index + 1}`}
                        />
                        <div>
                          <strong>{member.name || member.user_name || `Usuario ${index + 1}`}</strong>
                          <p className="muted">
                            {member.role || 'participante'} · {member.status || 'activo'}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="chat-side-card room-side-card">
                  <div className="chat-side-head">
                    <div>
                      <h3>Panel de sala</h3>
                      <p className="muted">Contexto rápido para coordinar sin salir del chat.</p>
                    </div>
                    <span className="chip">{getPlanVisualMeta(chatPlan).label}</span>
                  </div>

                  <div className="room-side-grid">
                    <div>
                      <strong>Ubicación</strong>
                      <p className="muted">{chatPlan.place_name || 'Sin definir'} · {chatPlan.city || 'Madrid'}</p>
                    </div>
                    <div>
                      <strong>Duración</strong>
                      <p className="muted">{chatPlan.duration_minutes || 90} min</p>
                    </div>
                    <div>
                      <strong>Acceso</strong>
                      <p className="muted">
                        {chatPlan.visibility === 'private' ? 'Privada' : 'Pública'}
                        {chatPlan.premium_room ? ' · solo premium' : ''}
                      </p>
                    </div>
                    <div>
                      <strong>Reglas</strong>
                      <p className="muted">{chatPlan.rules || 'Respeto y puntualidad'}</p>
                    </div>
                  </div>

                  <div className="pill-row">
                    {chatPrivateCode && (
                      <span className="chip chip-owner">Código activo: {chatPrivateCode}</span>
                    )}
                    {chatPlan.private_chat_enabled && <span className="chip chip-pending">Canal privado activo</span>}
                    {chatPlan.premium_room && <span className="chip chip-private">Sala premium</span>}
                  </div>
                </section>
              </aside>
            </div>
          </article>
        </div>
      )}

      {joinPermissionPlan && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>Solicitar acceso al plan</h2>
            <p className="muted">
              El creador de &ldquo;{joinPermissionPlan.title || 'la sala'}&rdquo; debe aprobar tu acceso.
              Si es privada, incluye la contraseña.
            </p>
            {(String(joinPermissionPlan.visibility || '') === 'private' || joinPermissionPlan.approval_required) && (
              <input
                value={joinPassword}
                type="text"
                onChange={(event) => setJoinPassword(event.target.value)}
                placeholder="Comentario/clave opcional para el anfitrión"
              />
            )}
            {joinRequestError && <p className="error-message">{joinRequestError}</p>}
            <p className="muted">Elige:</p>
            <div className="composer-actions">
              <button className="btn btn-primary" onClick={acceptJoinWithPermission}>
                Aceptar solicitud
              </button>
              <button className="btn btn-secondary" onClick={rejectJoinRequest}>
                Rechazar
              </button>
              <button className="btn btn-danger" onClick={blockForeverAndIgnore}>
                Rechazar para siempre
              </button>
            </div>
            <button className="btn btn-ghost" onClick={closePermissionModal}>
              Cerrar
            </button>
          </article>
        </div>
      )}

      {blockedNoticeOpen && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>Cuenta bloqueada</h2>
            <p className="muted">
              Tu cuenta no puede crear salas en este momento. Contacta con el administrador en
              {' '}
              <strong>info@estructuraweb.es</strong>
              {' '}
              para revisar el bloqueo.
            </p>
            <div className="composer-actions">
              <button className="btn btn-primary" onClick={() => setBlockedNoticeOpen(false)}>
                Entendido
              </button>
            </div>
          </article>
        </div>
      )}

      {closePlanTarget && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>Confirmar cierre de sala</h2>
            <p className="muted">
              Vas a cerrar la sala
              {' '}
              <strong>{closePlanTarget.title || 'sin título'}</strong>
              .
              Una vez cerrada, no podrá entrar nadie más.
            </p>
            <p className="muted">
              Si confirmas, la sala cambiará a estado cerrado y se enviará un correo de confirmación.
            </p>
            <div className="composer-actions">
              <button className="btn btn-danger" onClick={() => closePlan(closePlanTarget)}>
                Sí, cerrar sala
              </button>
              <button className="btn btn-ghost" onClick={() => setClosePlanTarget(null)}>
                No, mantener abierta
              </button>
            </div>
          </article>
        </div>
      )}

      {reportPlan && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>Reportar sala o usuario</h2>
            <p className="muted">
              Reportando la sala &ldquo;{reportPlan.title || 'sin título'}&rdquo; y su anfitrión por incidentes como amenazas,
              acoso, spam o conducta inapropiada.
            </p>
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
              <option value="amenazas">Amenazas</option>
              <option value="acoso">Acoso</option>
              <option value="spam">Spam</option>
              <option value="suplantacion">Suplantación</option>
              <option value="contenido_inapropiado">Contenido inapropiado</option>
            </select>
            <textarea
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              placeholder="Describe el problema con el mayor detalle posible"
            />
            <div className="composer-actions">
              <button className="btn btn-primary" onClick={submitReport}>
                Enviar reporte
              </button>
              <button className="btn btn-ghost" onClick={() => setReportPlan(null)}>
                Cancelar
              </button>
            </div>
          </article>
        </div>
      )}

      {reportBlockPrompt && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>Reporte enviado correctamente</h2>
            <p className="muted">
              El reporte ha quedado registrado. ¿Quieres además bloquear a
              {' '}
              <strong>{reportBlockPrompt.name || 'este usuario'}</strong>
              {' '}
              para que no vuelva a molestarte?
            </p>
            <div className="composer-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  blockUserLocally(reportBlockPrompt);
                  setReportBlockPrompt(null);
                }}
              >
                Sí, bloquear usuario
              </button>
              <button className="btn btn-ghost" onClick={() => setReportBlockPrompt(null)}>
                No, solo reportar
              </button>
            </div>
          </article>
        </div>
      )}

      {footerPanel && (
        <div className="composer-overlay">
          <article className="composer-modal permission-modal">
            <h2>{FOOTER_PANELS[footerPanel]?.title || 'Información'}</h2>
            <p className="muted">{FOOTER_PANELS[footerPanel]?.intro || 'Sin contenido.'}</p>
            {Array.isArray(FOOTER_PANELS[footerPanel]?.items) && (
              <ul className="policy-list">
                {FOOTER_PANELS[footerPanel].items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {FOOTER_PANELS[footerPanel]?.note && <p className="policy-note">{FOOTER_PANELS[footerPanel].note}</p>}
            <div className="composer-actions">
              {footerPanel === 'premium' && (
                <button className="btn btn-primary" onClick={() => { window.location.href = '/premium'; }}>
                  Ver condiciones premium
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setFooterPanel(null)}>
                Cerrar
              </button>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}

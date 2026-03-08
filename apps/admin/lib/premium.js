export const PREMIUM_PLAN_CATALOG = {
  free: {
    title: 'Normal',
    badge: 'Base',
    prices: {
      eur: 0,
      usd: 0,
      gbp: 0,
      mxn: 0,
      cop: 0,
    },
    features: ['Crear salas estándar', 'Unirse a planes', 'Chat y reportes', 'Perfil y reputación básica'],
  },
  plus: {
    title: 'Premium Plus',
    badge: 'Más visibilidad',
    prices: {
      eur: 9.99,
      usd: 10.99,
      gbp: 8.99,
      mxn: 189.0,
      cop: 44900,
    },
    features: ['Salas destacadas', 'Insignia premium', 'Analítica de asistentes', 'Más visibilidad en feed y mapa'],
  },
  pro: {
    title: 'Premium Pro',
    badge: 'Profesional',
    prices: {
      eur: 19.99,
      usd: 21.99,
      gbp: 17.99,
      mxn: 389.0,
      cop: 89900,
    },
    features: ['Boost prioritario', 'Prioridad en eventos y partners', 'Analítica avanzada', 'Mayor control y presencia de marca'],
  },
};

const COUNTRY_CURRENCY_MAP = {
  espana: 'eur',
  españa: 'eur',
  spain: 'eur',
  portugal: 'eur',
  france: 'eur',
  francia: 'eur',
  italy: 'eur',
  italia: 'eur',
  germany: 'eur',
  alemania: 'eur',
  belgium: 'eur',
  belgica: 'eur',
  mexico: 'mxn',
  méxico: 'mxn',
  usa: 'usd',
  'estados unidos': 'usd',
  'united states': 'usd',
  canada: 'cad',
  canadà: 'cad',
  canadaa: 'cad',
  colombia: 'cop',
  chile: 'usd',
  peru: 'usd',
  perú: 'usd',
  argentina: 'usd',
  uk: 'gbp',
  'reino unido': 'gbp',
  'united kingdom': 'gbp',
};

export function resolveCurrencyByCountry(country) {
  const key = String(country || '').trim().toLowerCase();
  return COUNTRY_CURRENCY_MAP[key] || 'eur';
}

export function formatMoney(amount, currency) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: String(currency || 'eur').toUpperCase(),
    maximumFractionDigits: currency === 'cop' ? 0 : 2,
  }).format(Number(amount || 0));
}

export function getPremiumPlanQuote(tier, country) {
  const normalizedTier = PREMIUM_PLAN_CATALOG[tier] ? tier : 'free';
  const currency = resolveCurrencyByCountry(country);
  const price = PREMIUM_PLAN_CATALOG[normalizedTier].prices[currency] ?? PREMIUM_PLAN_CATALOG[normalizedTier].prices.eur;
  const amountMinor = currency === 'cop' ? Math.round(price) : Math.round(Number(price) * 100);
  return {
    tier: normalizedTier,
    currency,
    price,
    amountMinor,
    priceLabel: formatMoney(price, currency),
    title: PREMIUM_PLAN_CATALOG[normalizedTier].title,
  };
}

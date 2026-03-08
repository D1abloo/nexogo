export const MARKET_STORAGE_KEY = 'nexogo_marketplace_items';

export const MARKET_DEMO_ITEMS = [
  {
    id: 'market-demo-1',
    title: 'Entrada doble para festival urbano',
    description: 'Entradas digitales verificables, entrega en mano o videollamada antes del cierre. Ideal para quedar luego en una sala musical.',
    trade_type: 'sell',
    category: 'eventos',
    condition: 'nuevo',
    price_amount: 65,
    currency: 'EUR',
    city: 'Madrid',
    country: 'España',
    district: 'Centro',
    image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80',
    allow_offers: true,
    status: 'active',
    seller_user_id: 'demo-seller-1',
    seller_name: 'Lucía Eventos',
    seller_photo: 'https://i.pravatar.cc/120?img=32',
    created_at: '2026-03-08T10:00:00.000Z',
  },
  {
    id: 'market-demo-2',
    title: 'Raqueta de pádel seminueva',
    description: 'Buen estado general, grip cambiado hace poco y funda incluida. Se puede revisar antes de pagar.',
    trade_type: 'sell',
    category: 'deporte',
    condition: 'muy bueno',
    price_amount: 48,
    currency: 'EUR',
    city: 'Sevilla',
    country: 'España',
    district: 'Nervión',
    image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=900&q=80',
    allow_offers: true,
    status: 'active',
    seller_user_id: 'demo-seller-2',
    seller_name: 'Diego Sport',
    seller_photo: 'https://i.pravatar.cc/120?img=14',
    created_at: '2026-03-08T11:20:00.000Z',
  },
  {
    id: 'market-demo-3',
    title: 'Busco portátil ligero para coworking',
    description: 'Necesito equipo funcional, batería decente y entrega local. Presupuesto contenido y prueba previa.',
    trade_type: 'buy',
    category: 'tecnologia',
    condition: 'funcional',
    price_amount: 350,
    currency: 'EUR',
    city: 'Valencia',
    country: 'España',
    district: 'Ruzafa',
    image_url: 'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
    allow_offers: true,
    status: 'active',
    seller_user_id: 'demo-seller-3',
    seller_name: 'Mario Work',
    seller_photo: 'https://i.pravatar.cc/120?img=55',
    created_at: '2026-03-08T12:10:00.000Z',
  },
  {
    id: 'market-demo-4',
    title: 'Intercambio cámara instantánea',
    description: 'Cambio por auriculares premium o smartwatch. Todo se negocia dentro del chat de mercado.',
    trade_type: 'swap',
    category: 'lifestyle',
    condition: 'bueno',
    price_amount: 0,
    currency: 'EUR',
    city: 'Barcelona',
    country: 'España',
    district: 'Gràcia',
    image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80',
    allow_offers: true,
    status: 'active',
    seller_user_id: 'demo-seller-4',
    seller_name: 'Nora Exchange',
    seller_photo: 'https://i.pravatar.cc/120?img=48',
    created_at: '2026-03-08T13:45:00.000Z',
  },
];

export function readLocalMarketItems() {
  if (typeof window === 'undefined') return [...MARKET_DEMO_ITEMS];
  try {
    const raw = window.localStorage.getItem(MARKET_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    const valid = Array.isArray(parsed) ? parsed : [];
    return valid.length ? valid : [...MARKET_DEMO_ITEMS];
  } catch {
    return [...MARKET_DEMO_ITEMS];
  }
}

export function writeLocalMarketItems(items) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(items));
}

export function ensureLocalMarketItems() {
  const items = readLocalMarketItems();
  if (typeof window !== 'undefined' && !window.localStorage.getItem(MARKET_STORAGE_KEY)) {
    writeLocalMarketItems(items);
  }
  return items;
}

export function formatMoney(item) {
  const amount = Number(item?.price_amount || 0);
  const currency = String(item?.currency || 'EUR');
  if (!amount) return item?.trade_type === 'swap' ? 'Intercambio' : 'Consultar';
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function marketShareUrl(id) {
  return `/mercado/${encodeURIComponent(String(id || ''))}`;
}

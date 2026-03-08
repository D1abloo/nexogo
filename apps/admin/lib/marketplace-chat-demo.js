const THREADS_KEY = 'nexogo_market_threads';
const MESSAGES_KEY = 'nexogo_market_thread_messages';

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = JSON.parse(raw || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getLocalMarketThreads() {
  return readJson(THREADS_KEY, []);
}

export function saveLocalMarketThreads(value) {
  writeJson(THREADS_KEY, value);
}

export function getLocalThreadMessages() {
  return readJson(MESSAGES_KEY, {});
}

export function saveLocalThreadMessages(value) {
  writeJson(MESSAGES_KEY, value);
}

export function ensureLocalThread(item, seller, buyer) {
  const threads = getLocalMarketThreads();
  const existing = threads.find((entry) => String(entry.item_id) === String(item.id) && String(entry.buyer_user_id) === String(buyer.id) && String(entry.seller_user_id) === String(seller.id));
  if (existing) return existing;
  const created = {
    id: `local-thread-${Date.now()}`,
    item_id: item.id,
    seller_user_id: seller.id,
    buyer_user_id: buyer.id,
    seller_name: seller.name,
    buyer_name: buyer.name,
    title: item.title,
    image_url: item.image_url || '',
    city: item.city || '',
    price_amount: item.price_amount || 0,
    currency: item.currency || 'EUR',
    status: 'active',
    created_at: new Date().toISOString(),
  };
  saveLocalMarketThreads([created, ...threads]);
  return created;
}

export function getLocalThreadById(id) {
  return getLocalMarketThreads().find((entry) => String(entry.id) === String(id)) || null;
}

export function getLocalMessagesByThread(threadId) {
  const map = getLocalThreadMessages();
  return Array.isArray(map[String(threadId)]) ? map[String(threadId)] : [];
}

export function appendLocalThreadMessage(threadId, message) {
  const map = getLocalThreadMessages();
  const current = Array.isArray(map[String(threadId)]) ? map[String(threadId)] : [];
  const next = {
    ...map,
    [String(threadId)]: [...current, message],
  };
  saveLocalThreadMessages(next);
  return next[String(threadId)];
}

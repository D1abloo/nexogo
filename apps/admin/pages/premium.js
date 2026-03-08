import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPremiumPlanQuote, PREMIUM_PLAN_CATALOG } from '../lib/premium';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const CART_STORAGE_KEY = 'nexogo_premium_cart';

async function api(path, options = {}) {
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error((payload && (payload.error || payload.message)) || `Error ${res.status}`);
  return payload;
}

function readCart() {
  if (typeof window === 'undefined') return 'plus';
  return window.localStorage.getItem(CART_STORAGE_KEY) || 'plus';
}

function saveCart(tier) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CART_STORAGE_KEY, tier);
}

export default function PremiumPage() {
  const [message, setMessage] = useState('');
  const [activeTier, setActiveTier] = useState('free');
  const [country, setCountry] = useState('España');
  const [cartTier, setCartTier] = useState('plus');
  const [busyKey, setBusyKey] = useState('');

  const premiumPlans = useMemo(
    () =>
      ['free', 'plus', 'pro'].map((key) => ({
        key,
        ...PREMIUM_PLAN_CATALOG[key],
        quote: getPremiumPlanQuote(key, country),
      })),
    [country],
  );

  const selectedCartPlan = useMemo(
    () => premiumPlans.find((plan) => plan.key === cartTier) || premiumPlans.find((plan) => plan.key === 'plus'),
    [cartTier, premiumPlans],
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const sessionUser = data?.session?.user;
      const tier = sessionUser?.user_metadata?.subscription_tier || 'free';
      const nextCountry = sessionUser?.user_metadata?.country || 'España';
      setActiveTier(tier);
      setCountry(nextCountry);
      setCartTier(readCart());
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const requestedPlan = params.get('plan');
    if (requestedPlan === 'plus' || requestedPlan === 'pro') {
      setCartTier(requestedPlan);
      saveCart(requestedPlan);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const tier = params.get('tier');
    const method = params.get('method');
    const cancel = params.get('cancel');
    const checkoutToken = params.get('checkout_token');

    if (cancel === '1') {
      setMessage(`Pago cancelado${method ? ` con ${method}` : ''}. El carrito sigue disponible para reintentar.`);
      return;
    }

    if (success === '1' && (tier === 'plus' || tier === 'pro')) {
      api('/premium/subscribe', {
        method: 'POST',
        body: JSON.stringify({ tier, method, checkout_token: checkoutToken }),
      })
        .then(() => {
          setActiveTier(tier);
          setMessage(`Pago completado. Tu plan ${tier.toUpperCase()} ya está activo y recibirás las condiciones por correo.`);
          window.history.replaceState({}, document.title, '/premium');
        })
        .catch((error) => {
          setMessage(error?.message || 'No se pudo cerrar la activación del plan');
        });
    }
  }, []);

  const activateFree = async () => {
    try {
      setBusyKey('free');
      const result = await api('/premium/subscribe', {
        method: 'POST',
        body: JSON.stringify({ tier: 'free' }),
      });
      setActiveTier(result.tier || 'free');
      setMessage('Has vuelto al plan gratuito.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo volver al plan free');
    } finally {
      setBusyKey('');
    }
  };

  const addToCart = (tier) => {
    if (tier !== 'plus' && tier !== 'pro') return;
    setCartTier(tier);
    saveCart(tier);
    setMessage(`Plan ${tier.toUpperCase()} añadido al carrito. Continúa con PayPal o Stripe.`);
  };

  const startPayment = async (method) => {
    if (!selectedCartPlan || selectedCartPlan.key === 'free') {
      setMessage('Selecciona un plan de pago para continuar.');
      return;
    }

    try {
      setBusyKey(`${selectedCartPlan.key}:${method}`);
      const result = await api('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ tier: selectedCartPlan.key, method }),
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      setMessage('No se pudo iniciar el checkout.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo iniciar el pago');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <main className="social-shell account-shell">
      <header className="topbar admin-topbar">
        <div className="brand" onClick={() => { window.location.href = '/'; }} role="button" tabIndex={0}>
          <span className="brand-icon">NG</span>
          <div>
            <h1>Premium NexoGo</h1>
            <p className="muted">Suscripciones serias, checkout controlado y ventajas reales para salas y visibilidad</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/cuenta'; }}>
            Mi cuenta
          </button>
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/'; }}>
            Ir al inicio
          </button>
        </div>
      </header>

      {message && (
        <section className="mini-card">
          <p className="muted">{message}</p>
        </section>
      )}

      <section className="mini-card premium-intro-card">
        <div>
          <h3>Comparar planes y pagar con checkout</h3>
          <p className="muted">
            El usuario ya no puede activarse un plan de pago sin pasar por pasarela. El flujo es:
            seleccionar plan, añadir al carrito, revisar condiciones y pagar.
          </p>
        </div>
        <div className="premium-country-box">
          <strong>{country}</strong>
          <span className="muted">
            Moneda principal:
            {' '}
            {String(selectedCartPlan?.quote?.currency || 'eur').toUpperCase()}
          </span>
        </div>
      </section>

      <section className="premium-strip premium-strip-rich">
        {premiumPlans.map((plan) => (
          <article key={plan.key} className={`premium-card premium-card-${plan.key}`}>
            <div className="premium-card-top">
              <div>
                <h3>{plan.title}</h3>
                <p className="muted">{plan.badge}</p>
              </div>
              {activeTier === plan.key && <span className="chip chip-owner">Activo</span>}
            </div>

            <p className="premium-price">
              <strong>{plan.quote.priceLabel}</strong>
              {plan.key !== 'free' && <span className="muted"> / mes</span>}
            </p>
            <p className="muted">Moneda por país: {String(plan.quote.currency || 'eur').toUpperCase()}</p>

            <div className="premium-feature-list">
              {plan.features.map((feature) => (
                <div key={feature} className="premium-feature-item">
                  <span>✓</span>
                  <p>{feature}</p>
                </div>
              ))}
            </div>

            <div className="premium-card-actions">
              {plan.key === 'free' ? (
                <button className={`btn ${activeTier === 'free' ? 'btn-secondary' : 'btn-ghost'}`} disabled={busyKey === 'free'} onClick={activateFree}>
                  {activeTier === 'free' ? 'Plan actual' : 'Volver a Free'}
                </button>
              ) : (
                <button
                  className={`btn ${cartTier === plan.key ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => addToCart(plan.key)}
                >
                  {cartTier === plan.key ? 'En carrito' : 'Añadir al carrito'}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="premium-checkout-grid">
        <article className="mini-card premium-cart-card">
          <h3>Carrito premium</h3>
          {selectedCartPlan && selectedCartPlan.key !== 'free' ? (
            <>
              <div className="premium-cart-row">
                <div>
                  <strong>{selectedCartPlan.title}</strong>
                  <p className="muted">{selectedCartPlan.badge}</p>
                </div>
                <strong>{selectedCartPlan.quote.priceLabel}</strong>
              </div>
              <div className="premium-cart-row">
                <span className="muted">Moneda</span>
                <span>{String(selectedCartPlan.quote.currency || 'eur').toUpperCase()}</span>
              </div>
              <div className="premium-cart-row">
                <span className="muted">Cobro recurrente</span>
                <span>Mensual</span>
              </div>
              <div className="premium-cart-row">
                <span className="muted">Condiciones</span>
                <span>Renovación automática hasta cancelación</span>
              </div>
              <div className="pill-row">
                <button
                  className="btn btn-primary"
                  disabled={busyKey === `${selectedCartPlan.key}:paypal`}
                  onClick={() => startPayment('paypal')}
                >
                  Pagar con PayPal
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={busyKey === `${selectedCartPlan.key}:stripe`}
                  onClick={() => startPayment('stripe')}
                >
                  Pagar con Stripe
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Añade un plan de pago para iniciar el checkout.</p>
          )}
        </article>

        <article className="mini-card premium-terms-card">
          <h3>Condiciones completas de suscripción</h3>
          <div className="premium-table">
            <div className="premium-row">
              <strong>Alta del servicio</strong>
              <span>El alta del plan de pago solo se completa tras checkout válido.</span>
              <span>Los botones de alta directa quedan reservados al plan gratuito.</span>
            </div>
            <div className="premium-row">
              <strong>Renovación y baja</strong>
              <span>La suscripción se renueva por ciclo mensual salvo cancelación previa.</span>
              <span>La baja detiene la siguiente renovación, no el periodo ya pagado.</span>
            </div>
            <div className="premium-row">
              <strong>Ventajas Premium Plus</strong>
              <span>Salas premium, destacadas, mejor visibilidad, insignia y analítica comercial.</span>
              <span>Ideal para anfitriones frecuentes y planes con más exposición.</span>
            </div>
            <div className="premium-row">
              <strong>Ventajas Premium Pro</strong>
              <span>Todo Plus y además analítica avanzada, prioridad, partners y salas pro.</span>
              <span>Orientado a creadores intensivos, locales y experiencias patrocinadas.</span>
            </div>
            <div className="premium-row">
              <strong>Restricciones</strong>
              <span>Las salas premium solo son visibles para usuarios premium y administradores.</span>
              <span>El abuso del servicio, spam o amenazas puede implicar suspensión inmediata.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="mini-card premium-compare-table">
        <h3>Qué puede hacer Free, Plus y Pro</h3>
        <div className="premium-table">
          <div className="premium-row">
            <strong>Salas free</strong>
            <span>Free: sí</span>
            <span>Plus/Pro: sí</span>
          </div>
          <div className="premium-row">
            <strong>Salas premium visibles</strong>
            <span>Free: no</span>
            <span>Plus/Pro: sí</span>
          </div>
          <div className="premium-row">
            <strong>Crear sala premium</strong>
            <span>Free: no</span>
            <span>Plus/Pro: sí</span>
          </div>
          <div className="premium-row">
            <strong>Sala destacada en feed</strong>
            <span>Free: no</span>
            <span>Plus/Pro: sí</span>
          </div>
          <div className="premium-row">
            <strong>Analítica avanzada</strong>
            <span>Free/Plus: no</span>
            <span>Pro: sí</span>
          </div>
          <div className="premium-row">
            <strong>Insignia y prioridad</strong>
            <span>Free: no</span>
            <span>Plus/Pro: sí</span>
          </div>
        </div>
      </section>
    </main>
  );
}

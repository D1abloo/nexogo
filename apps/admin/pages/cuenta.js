import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPremiumPlanQuote } from '../lib/premium';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/backend';
const DATE_LOCALE = 'es-ES';
const DATE_TIMEZONE = 'Europe/Madrid';

const EMPTY_PROFILE = {
  name: '',
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  address: '',
  district: '',
  city: 'Madrid',
  postal_code: '',
  country: 'España',
  bio: '',
  photo: '',
  emergency_contact: '',
  birth_date: '',
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
  });
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
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error((payload && (payload.error || payload.message)) || `Error ${res.status}`);
    return payload;
  } finally {
    if (showLoader && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexogo:loading:end'));
    }
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function mapProfileToForm(user) {
  return {
    ...EMPTY_PROFILE,
    name: user?.name || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    district: user?.district || '',
    city: user?.city || 'Madrid',
    postal_code: user?.postal_code || '',
    country: user?.country || 'España',
    bio: user?.bio || '',
    photo: user?.photo || user?.photo_url || '',
    emergency_contact: user?.emergency_contact || '',
    birth_date: user?.birth_date || '',
  };
}

function userAvatar(profileForm) {
  return profileForm.photo || 'https://ui-avatars.com/api/?name=Usuario&background=2563eb&color=ffffff';
}

export default function CuentaPage() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({});
  const [reports, setReports] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [premiumTier, setPremiumTier] = useState('free');
  const [premiumStatus, setPremiumStatus] = useState('inactive');
  const [subscriptionState, setSubscriptionState] = useState({
    auto_renew: false,
    cancel_at_period_end: false,
    renewal_at: null,
    payment_method: 'manual',
    subscription_provider: null,
    subscription_admin_notes: '',
  });
  const [message, setMessage] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);

  const currentQuote = useMemo(() => getPremiumPlanQuote(premiumTier === 'free' ? 'plus' : premiumTier, profileForm.country), [premiumTier, profileForm.country]);
  const latestReport = useMemo(() => (Array.isArray(reports) && reports.length > 0 ? reports[0] : null), [reports]);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const authUser = data?.session?.user;
        if (!authUser) {
          window.location.href = '/';
          return;
        }

        const [me, myStats, myReports, myBlocks] = await Promise.all([
          api('/users/me'),
          api('/users/me/stats'),
          api('/reports').catch(() => []),
          api('/users/blocks').catch(() => []),
        ]);

        if (!mounted) return;
        setUser(me || null);
        setProfileForm(mapProfileToForm(me));
        setStats(myStats || {});
        setReports(Array.isArray(myReports) ? myReports : []);
        setBlockedUsers(Array.isArray(myBlocks) ? myBlocks : []);
        setPremiumTier(String(me?.subscription_tier || authUser.user_metadata?.subscription_tier || 'free'));
        setPremiumStatus(String(me?.subscription_status || authUser.user_metadata?.subscription_status || 'inactive'));
        setSubscriptionState({
          auto_renew: Boolean(me?.auto_renew),
          cancel_at_period_end: Boolean(me?.cancel_at_period_end),
          renewal_at: me?.renewal_at || null,
          payment_method: me?.payment_method || 'manual',
          subscription_provider: me?.subscription_provider || null,
          subscription_admin_notes: me?.subscription_admin_notes || '',
        });
      } catch (error) {
        if (mounted) setMessage(error?.message || 'No se pudo cargar tu cuenta');
      } finally {
        if (mounted) setReady(true);
      }
    };

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const saveProfile = async () => {
    try {
      setSavingProfile(true);
      const response = await api('/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });
      const nextUser = response?.user || user;
      setUser(nextUser);
      setProfileForm(mapProfileToForm(nextUser));
      setPremiumTier(String(nextUser?.subscription_tier || premiumTier));
      setPremiumStatus(String(nextUser?.subscription_status || premiumStatus));
      setSubscriptionState((current) => ({
        ...current,
        auto_renew: Boolean(nextUser?.auto_renew),
        cancel_at_period_end: Boolean(nextUser?.cancel_at_period_end),
        renewal_at: nextUser?.renewal_at || current.renewal_at,
        payment_method: nextUser?.payment_method || current.payment_method,
        subscription_provider: nextUser?.subscription_provider || current.subscription_provider,
        subscription_admin_notes: nextUser?.subscription_admin_notes || current.subscription_admin_notes,
      }));
      setMessage('Perfil actualizado. La base de datos se ha sincronizado y el administrador ha sido notificado por correo.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo guardar el perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSubscriptionPreferences = async (payload) => {
    try {
      setSavingSubscription(true);
      const response = await api('/users/me/subscription', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const next = response?.subscription || {};
      setPremiumTier(String(next.subscription_tier || premiumTier));
      setPremiumStatus(String(next.subscription_status || premiumStatus));
      setSubscriptionState({
        auto_renew: Boolean(next.auto_renew),
        cancel_at_period_end: Boolean(next.cancel_at_period_end),
        renewal_at: next.renewal_at || null,
        payment_method: next.payment_method || subscriptionState.payment_method,
        subscription_provider: next.subscription_provider || subscriptionState.subscription_provider,
        subscription_admin_notes: next.subscription_admin_notes || subscriptionState.subscription_admin_notes,
      });
      setUser((current) => ({
        ...(current || {}),
        ...next,
      }));
      setMessage('Preferencias de suscripción actualizadas.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo actualizar la suscripción');
    } finally {
      setSavingSubscription(false);
    }
  };

  const handlePhotoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setProfileForm((current) => ({ ...current, photo: dataUrl }));
      setMessage('Imagen cargada. Guarda el perfil para persistirla.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo cargar la imagen');
    }
  };

  const unblockUser = async (targetId) => {
    try {
      await api(`/users/blocks/${targetId}`, { method: 'DELETE' });
      setBlockedUsers((current) => current.filter((entry) => String(entry.blocked_user_id || entry.id) !== String(targetId)));
    } catch (error) {
      setMessage(error?.message || 'No se pudo desbloquear al usuario');
    }
  };

  const goToPremium = (tier) => {
    window.location.href = tier && tier !== 'free' ? `/premium?plan=${tier}` : '/premium';
  };

  if (!ready) {
    return (
      <main className="social-shell account-shell">
        <section className="empty-state">
          <h2>Cargando tu panel</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="social-shell account-shell">
      <header className="topbar admin-topbar">
        <div className="brand brand-hero">
          <button className="brand-mark" onClick={() => { window.location.href = '/'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>Mi cuenta</h1>
              <div className="brand-live-pills">
                <span className="status-pill status-ok">{String(premiumTier || 'free').toUpperCase()}</span>
                <span className="status-pill status-go">{premiumStatus}</span>
                {subscriptionState.never_expires && <span className="status-pill status-warning">Nunca expira</span>}
                <span className="status-pill status-warning">{subscriptionState.auto_renew ? 'Renovación automática' : 'Renovación manual'}</span>
              </div>
            </div>
            <p className="muted">Perfil, suscripción, cancelación, bloqueos y trazabilidad personal de la cuenta.</p>
            <div className="brand-tags">
              <span className="chip chip-owner">Perfil reforzado</span>
              <span className="chip chip-pending">Suscripción y cobro</span>
              <span className="chip chip-private">Bloqueos y reportes</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/premium'; }}>
            Ver premium
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

      <section className="account-command-grid">
        <article className="admin-command-card">
          <span>Plan actual</span>
          <strong>{String(premiumTier || 'free').toUpperCase()}</strong>
          <p className="muted">Estado: {premiumStatus}</p>
        </article>
        <article className="admin-command-card">
          <span>Próxima renovación</span>
          <strong>{subscriptionState.renewal_at ? fmtDate(subscriptionState.renewal_at) : 'No definida'}</strong>
          <p className="muted">Método: {subscriptionState.payment_method || 'manual'}</p>
        </article>
        <article className="admin-command-card">
          <span>Actividad</span>
          <strong>{stats.plans_created || 0}</strong>
          <p className="muted">Salas creadas · {stats.plans_joined || 0} uniones</p>
        </article>
        <article className="admin-command-card">
          <span>Seguridad</span>
          <strong>{blockedUsers.length}</strong>
          <p className="muted">Usuarios bloqueados · {reports.length} reportes enviados</p>
        </article>
      </section>

      <div className="account-dashboard-grid">
        <aside className="mini-card account-rail-card">
          <div className="avatar-stack avatar-stack-large">
            <img className="account-avatar account-avatar-large" src={userAvatar(profileForm)} alt={profileForm.name || user?.email || 'Usuario'} />
            {String(premiumTier || 'free') !== 'free' && !['inactive', 'cancelled'].includes(String(premiumStatus || 'inactive')) && (
              <span className="premium-badge premium-badge-avatar premium-badge-large">P</span>
            )}
          </div>
          <h3>{profileForm.name || user?.email}</h3>
          <p className="muted">{profileForm.email}</p>
          <div className="account-side-stats">
            <div><strong>{stats.plans_created || 0}</strong><span>Salas creadas</span></div>
            <div><strong>{stats.plans_joined || 0}</strong><span>Salas unidas</span></div>
            <div><strong>{stats.reviews_received || 0}</strong><span>Reseñas</span></div>
          </div>
          <div className="account-tier-pill">
            <strong>{String(premiumTier || 'free').toUpperCase()}</strong>
            <span>{premiumStatus}</span>
          </div>
          {latestReport && (
            <div className="account-tier-pill">
              <strong>{latestReport.ticket_number || `TCK-${latestReport.id}`}</strong>
              <span>{latestReport.status}</span>
            </div>
          )}
          <p className="muted">
            {subscriptionState.never_expires
              ? 'Tu plan premium ha sido marcado por administración como permanente.'
              : subscriptionState.cancel_at_period_end
                ? 'Tu plan quedará cancelado al finalizar el ciclo.'
                : 'Tu plan seguirá activo según la configuración actual.'}
          </p>
        </aside>

        <section className="account-main-stack">
          <article className="mini-card account-surface-card">
            <div className="admin-section-head">
              <div>
                <h3>Perfil del usuario</h3>
                <p className="muted">La foto, dirección, alias y datos de confianza se guardan en base de datos y notifican al administrador.</p>
              </div>
              <button className="btn btn-primary" disabled={savingProfile} onClick={saveProfile}>
                {savingProfile ? 'Guardando...' : 'Guardar perfil'}
              </button>
            </div>

            <div className="account-profile-hero">
              <div className="account-photo-box">
                <img className="account-avatar account-avatar-large" src={userAvatar(profileForm)} alt="Avatar" />
                <label className="btn btn-ghost account-upload-btn">
                  Subir foto
                  <input type="file" accept="image/*" onChange={handlePhotoFile} hidden />
                </label>
              </div>
              <div className="account-profile-summary">
                <div className="account-profile-badge">
                  <strong>{profileForm.city || 'Madrid'}</strong>
                  <span>{profileForm.country || 'España'}</span>
                </div>
                <p className="muted">Completa tus datos para aumentar confianza al crear salas, pedir acceso a privadas y participar en planes premium.</p>
              </div>
            </div>

            <div className="account-form-grid">
              <input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre visible" />
              <input value={profileForm.username} onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))} placeholder="Alias público" />
              <input value={profileForm.first_name} onChange={(event) => setProfileForm((current) => ({ ...current, first_name: event.target.value }))} placeholder="Nombre" />
              <input value={profileForm.last_name} onChange={(event) => setProfileForm((current) => ({ ...current, last_name: event.target.value }))} placeholder="Apellidos" />
              <input value={profileForm.email} disabled placeholder="Correo de acceso" />
              <input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Teléfono" />
              <input value={profileForm.birth_date} onChange={(event) => setProfileForm((current) => ({ ...current, birth_date: event.target.value }))} placeholder="Fecha de nacimiento" />
              <input value={profileForm.emergency_contact} onChange={(event) => setProfileForm((current) => ({ ...current, emergency_contact: event.target.value }))} placeholder="Contacto de emergencia" />
              <input value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} placeholder="Dirección" />
              <input value={profileForm.district} onChange={(event) => setProfileForm((current) => ({ ...current, district: event.target.value }))} placeholder="Barrio / distrito" />
              <input value={profileForm.city} onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))} placeholder="Ciudad" />
              <input value={profileForm.postal_code} onChange={(event) => setProfileForm((current) => ({ ...current, postal_code: event.target.value }))} placeholder="Código postal" />
              <input value={profileForm.country} onChange={(event) => setProfileForm((current) => ({ ...current, country: event.target.value }))} placeholder="País" />
              <input value={profileForm.photo} onChange={(event) => setProfileForm((current) => ({ ...current, photo: event.target.value }))} placeholder="URL de foto o imagen subida" />
              <textarea value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Biografía / presentación" />
            </div>
          </article>

          <article className="mini-card account-surface-card">
            <div className="admin-section-head">
              <div>
                <h3>Suscripción, renovación y cancelación</h3>
                <p className="muted">Controlas si se renueva automáticamente o si quieres cancelar al final del periodo o de inmediato.</p>
              </div>
              <button className="btn btn-ghost" onClick={() => goToPremium(premiumTier === 'free' ? 'plus' : premiumTier)}>
                {premiumTier === 'free' ? 'Ver planes' : 'Gestionar premium'}
              </button>
            </div>

            <div className="account-billing-grid">
              <article className="account-billing-card">
                <strong>Plan actual</strong>
                <p>{String(premiumTier || 'free').toUpperCase()} · {premiumStatus}</p>
                <span className="muted">Proveedor: {subscriptionState.subscription_provider || 'manual'} · Método: {subscriptionState.payment_method || 'manual'}</span>
              </article>
              <article className="account-billing-card">
                <strong>Renovación</strong>
                <p>{subscriptionState.renewal_at ? fmtDate(subscriptionState.renewal_at) : 'No definida'}</p>
                <span className="muted">{subscriptionState.auto_renew ? 'Automática' : 'Manual'}</span>
              </article>
              <article className="account-billing-card">
                <strong>Política de baja</strong>
                <p>{subscriptionState.cancel_at_period_end ? 'Cancelada al final del ciclo' : 'Sin cancelación programada'}</p>
                <span className="muted">Puedes reactivar o cancelar cuando quieras.</span>
              </article>
            </div>

            <div className="pill-row account-action-row">
              {premiumTier === 'free' ? (
                <>
                  <button className="btn btn-primary" onClick={() => goToPremium('plus')}>Añadir Plus al carrito</button>
                  <button className="btn btn-secondary" onClick={() => goToPremium('pro')}>Añadir Pro al carrito</button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={savingSubscription} onClick={() => saveSubscriptionPreferences({ auto_renew: !subscriptionState.auto_renew, cancel_at_period_end: false })}>
                    {subscriptionState.auto_renew ? 'Pasar a renovación manual' : 'Activar renovación automática'}
                  </button>
                  {!subscriptionState.cancel_at_period_end ? (
                    <button className="btn btn-ghost" disabled={savingSubscription} onClick={() => saveSubscriptionPreferences({ cancel_at_period_end: true, auto_renew: false })}>
                      Cancelar al final del periodo
                    </button>
                  ) : (
                    <button className="btn btn-ghost" disabled={savingSubscription} onClick={() => saveSubscriptionPreferences({ cancel_at_period_end: false, auto_renew: true })}>
                      Reactivar renovación
                    </button>
                  )}
                  <button className="btn btn-danger" disabled={savingSubscription} onClick={() => saveSubscriptionPreferences({ cancel_now: true, tier: 'free', status: 'inactive' })}>
                    Cancelar ahora y bajar a Free
                  </button>
                </>
              )}
            </div>

            <div className="premium-inline-summary">
              <div>
                <strong>Tarifa orientativa</strong>
                <p className="muted">{currentQuote.priceLabel} / mes</p>
              </div>
              <div>
                <strong>Salas premium</strong>
                <p className="muted">{premiumTier === 'free' ? 'No visibles' : 'Visibles y creables'}</p>
              </div>
              <div>
                <strong>Nota admin</strong>
                <p className="muted">{subscriptionState.subscription_admin_notes || 'Sin notas administrativas.'}</p>
              </div>
            </div>
          </article>

          <article className="mini-card account-surface-card">
            <div className="admin-section-head">
              <div>
                <h3>Usuarios bloqueados</h3>
                <p className="muted">Puedes desbloquear en cualquier momento si ya no quieres mantener el bloqueo.</p>
              </div>
            </div>
            {blockedUsers.length === 0 && <p className="muted">No has bloqueado a ningún usuario.</p>}
            <div className="admin-user-list">
              {blockedUsers.map((entry) => {
                const blocked = entry.blocked_user || entry;
                return (
                  <article key={entry.id || blocked.id} className="admin-user-row">
                    <div>
                      <strong>{blocked.name || blocked.email || 'Usuario bloqueado'}</strong>
                      <p className="muted">{blocked.email || 'Sin correo'} · {fmtDate(entry.created_at)}</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => unblockUser(entry.blocked_user_id || blocked.id)}>
                      Desbloquear
                    </button>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="mini-card account-surface-card">
            <div className="admin-section-head">
              <div>
                <h3>Histórico de reportes</h3>
                <p className="muted">Tus reportes quedan registrados y se revisan en el panel de administración.</p>
              </div>
            </div>
            {reports.length === 0 && <p className="muted">Aún no has enviado reportes.</p>}
            <div className="admin-report-list">
              {reports.map((report) => (
                <article key={report.id} className="admin-report-card">
                  <div>
                    <strong>{report.ticket_number || `TCK-${report.id}`}</strong>
                    <p className="muted">{report.reason}</p>
                    <p className="muted">{report.description || 'Sin descripción adicional.'}</p>
                    <p className="muted">Estado: {report.status} · {fmtDate(report.created_at)}</p>
                    {report.resolution_text && <p className="muted">Resolución: {report.resolution_text}</p>}
                  </div>
                  <button className="btn btn-primary" onClick={() => { window.location.href = `/ticket?id=${report.id}`; }}>
                    Abrir ticket
                  </button>
                </article>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

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

function toInputDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

async function marketApi(path, options = {}) {
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
    const res = await fetch(path, { ...options, cache: 'no-store', headers });
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

function getUserAvatar(seed = 'Admin') {
  const label = encodeURIComponent(String(seed || 'Admin'));
  return `https://ui-avatars.com/api/?name=${label}&background=1d4ed8&color=ffffff&bold=true`;
}

function defaultDraft(user = {}) {
  return {
    tier: String(user.subscription_tier || 'free'),
    status: String(user.subscription_status || (user.subscription_tier === 'free' ? 'inactive' : 'active')),
    auto_renew: user.auto_renew !== false && String(user.subscription_tier || 'free') !== 'free',
    cancel_at_period_end: Boolean(user.cancel_at_period_end),
    never_expires: Boolean(user.never_expires),
    renewal_at: user.never_expires ? '' : toInputDate(user.renewal_at),
    payment_method: user.payment_method || user.subscription_provider || 'manual',
    provider: user.subscription_provider || 'admin',
    admin_notes: user.subscription_admin_notes || '',
  };
}

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [teamNotes, setTeamNotes] = useState([]);
  const [guestRequests, setGuestRequests] = useState([]);
  const [marketItems, setMarketItems] = useState([]);
  const [guestRequestNotes, setGuestRequestNotes] = useState({});
  const [activePlan, setActivePlan] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [reportFilters, setReportFilters] = useState({
    search: '',
    status: 'all',
    from: '',
    to: '',
  });
  const [logFilters, setLogFilters] = useState({
    search: '',
    from: '',
    to: '',
  });
  const [userSearch, setUserSearch] = useState('');
  const [subscriptionDrafts, setSubscriptionDrafts] = useState({});
  const [reportResolutionDrafts, setReportResolutionDrafts] = useState({});
  const [teamNoteDraft, setTeamNoteDraft] = useState({ note: '', pinned: false });
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    admin_access_level: 'none',
    city: 'Madrid',
    country: 'España',
  });
  const adminChatMessagesRef = useRef(null);

  const isAdmin = ADMIN_EMAILS.includes(String(user?.email || '').toLowerCase()) || String(user?.role || '') === 'admin';
  const adminAccessLevel = String(user?.admin_access_level || (isAdmin ? 'owner' : 'none'));
  const canWriteAdmin = ['write', 'owner'].includes(adminAccessLevel);
  const pendingRequests = useMemo(
    () =>
      plans.flatMap((plan) =>
        (plan.participants || [])
          .filter((participant) => String(participant.status || '') === 'pending')
          .map((participant) => ({
            ...participant,
            plan_id: plan.plan_id || plan.id,
            plan_title: plan.title,
            plan_visibility: plan.visibility,
          })),
      ),
    [plans],
  );

  const stats = useMemo(() => {
    const privateCount = plans.filter((plan) => String(plan.visibility || '') === 'private').length;
    const liveCount = plans.filter((plan) => String(plan.status || '') === 'in_progress').length;
    const pendingCount = pendingRequests.length;
    const participants = plans.reduce((acc, plan) => acc + Number(plan.participants_count || 0), 0);
    const openReports = reports.filter((report) => !['resolved', 'dismissed'].includes(String(report.status || ''))).length;
    const bannedUsers = users.filter((entry) => entry.is_banned).length;
    const premiumUsers = users.filter((entry) => String(entry.subscription_tier || 'free') !== 'free' && !['inactive', 'cancelled'].includes(String(entry.subscription_status || 'inactive'))).length;
    const autoRenewUsers = users.filter((entry) => Boolean(entry.auto_renew) && String(entry.subscription_tier || 'free') !== 'free').length;
    const guestPendingCount = guestRequests.filter((entry) => String(entry.status || '') === 'pending').length;
    return { privateCount, liveCount, pendingCount, participants, openReports, bannedUsers, premiumUsers, autoRenewUsers, guestPendingCount };
  }, [guestRequests, plans, pendingRequests, reports, users]);

  const businessPulse = useMemo(() => {
    const premiumRooms = plans.filter((plan) => Boolean(plan.premium_room)).length;
    const featuredRooms = plans.filter((plan) => Boolean(plan.featured_room)).length;
    const averageOccupancy = plans.length
      ? Math.round(
          plans.reduce((acc, plan) => acc + Number(plan.participants_count || 0), 0)
          / Math.max(1, plans.length),
        )
      : 0;
    const estimatedMrr = users.reduce((acc, entry) => {
      if (String(entry.subscription_status || '') !== 'active') return acc;
      if (String(entry.subscription_tier || '') === 'pro') return acc + 19.99;
      if (String(entry.subscription_tier || '') === 'plus') return acc + 9.99;
      return acc;
    }, 0);
    return {
      premiumRooms,
      featuredRooms,
      averageOccupancy,
      estimatedMrr: estimatedMrr.toFixed(2),
    };
  }, [plans, users]);

  const marketStats = useMemo(() => {
    const active = marketItems.filter((item) => String(item.status || '') === 'active').length;
    const reserved = marketItems.filter((item) => String(item.status || '') === 'reserved').length;
    const sold = marketItems.filter((item) => String(item.status || '') === 'sold').length;
    const featured = marketItems.filter((item) => Boolean(item.featured)).length;
    const saved = marketItems.reduce((acc, item) => acc + Number(item.favorites_count || 0), 0);
    return { active, reserved, sold, featured, saved };
  }, [marketItems]);

  const preLaunchChecklist = useMemo(
    () => [
      {
        label: 'Pagos premium',
        state: users.some((entry) => String(entry.subscription_tier || 'free') !== 'free') ? 'ok' : 'warn',
        text: users.some((entry) => String(entry.subscription_tier || 'free') !== 'free')
          ? 'Ya hay suscripciones cargadas para validar renovaciones y bajas.'
          : 'Todavía no hay usuarios premium para validar el ciclo completo.',
      },
      {
        label: 'Moderación',
        state: reports.length > 0 || stats.pendingCount > 0 ? 'ok' : 'warn',
        text: reports.length > 0 || stats.pendingCount > 0
          ? 'El panel ya tiene flujo real de revisión y decisiones.'
          : 'Conviene generar reportes y solicitudes de prueba para revisar la moderación.',
      },
      {
        label: 'Auditoría',
        state: logs.length > 0 ? 'ok' : 'warn',
        text: logs.length > 0
          ? 'Los cambios críticos ya quedan registrados en el log.'
          : 'Genera cambios de suscripción y bloqueo para validar el log.',
      },
      {
        label: 'Comunidad',
        state: plans.length > 0 ? 'ok' : 'warn',
        text: plans.length > 0
          ? 'Ya existen salas para revisar feed, detalle, chat y cierres.'
          : 'Falta sembrar salas de ejemplo para medir descubrimiento.',
      },
    ],
    [logs.length, plans.length, reports.length, stats.pendingCount, users],
  );

  const filteredUsers = useMemo(() => {
    const term = String(userSearch || '').trim().toLowerCase();
    if (!term) return users;
    return users.filter((entry) =>
      [entry.name, entry.email, entry.city, entry.country, entry.role, entry.subscription_tier]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [users, userSearch]);

  const filteredReports = useMemo(() => {
    const term = String(reportFilters.search || '').trim().toLowerCase();
    const from = reportFilters.from ? new Date(`${reportFilters.from}T00:00:00`).getTime() : null;
    const to = reportFilters.to ? new Date(`${reportFilters.to}T23:59:59`).getTime() : null;
    return reports.filter((report) => {
      const reportTime = report.created_at ? new Date(report.created_at).getTime() : null;
      if (reportFilters.status !== 'all' && String(report.status || '') !== reportFilters.status) return false;
      if (from && reportTime && reportTime < from) return false;
      if (to && reportTime && reportTime > to) return false;
      if (term) {
        const haystack = [report.reason, report.description, report.status, report.reporter_email, report.reported_user_email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [reports, reportFilters]);

  const filteredLogs = useMemo(() => {
    const term = String(logFilters.search || '').trim().toLowerCase();
    const from = logFilters.from ? new Date(`${logFilters.from}T00:00:00`).getTime() : null;
    const to = logFilters.to ? new Date(`${logFilters.to}T23:59:59`).getTime() : null;

    return logs.filter((log) => {
      const logTime = log.created_at ? new Date(log.created_at).getTime() : null;
      if (from && logTime && logTime < from) return false;
      if (to && logTime && logTime > to) return false;
      if (term) {
        const haystack = [
          log.action,
          log.entity_type,
          log.entity_id,
          log.actor?.email,
          log.target?.email,
          JSON.stringify(log.details || {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [logs, logFilters]);

  const loadAll = async () => {
    const [me, planList, notificationList, userList, reportList, logList, teamNoteList, guestRequestList, marketItemList] = await Promise.all([
      api('/users/me'),
      api('/plans'),
      api('/notifications').catch(() => []),
      api('/admin/users').catch(() => []),
      api('/admin/reports').catch(() => []),
      api('/admin/logs').catch(() => []),
      api('/admin/team-notes').catch(() => []),
      api('/admin/guest-access').catch(() => []),
      marketApi('/api/marketplace/items').catch(() => []),
    ]);

    setUser(me || null);
    const adminFlag = ADMIN_EMAILS.includes(String(me?.email || '').toLowerCase()) || String(me?.role || '') === 'admin';
    const accessLevel = String(me?.admin_access_level || (adminFlag ? 'owner' : 'none'));
    setAllowed(adminFlag && accessLevel !== 'none');
    setPlans(Array.isArray(planList) ? planList : []);
    setNotifications(Array.isArray(notificationList) ? notificationList : []);
    setUsers(Array.isArray(userList) ? userList : []);
    setReports(Array.isArray(reportList) ? reportList : []);
    setLogs(Array.isArray(logList) ? logList : []);
    setTeamNotes(Array.isArray(teamNoteList) ? teamNoteList : []);
    setGuestRequests(Array.isArray(guestRequestList) ? guestRequestList : []);
    setMarketItems(Array.isArray(marketItemList) ? marketItemList : []);
    setSubscriptionDrafts((current) => {
      const next = { ...current };
      (Array.isArray(userList) ? userList : []).forEach((entry) => {
        next[entry.id] = next[entry.id] ? { ...defaultDraft(entry), ...next[entry.id] } : defaultDraft(entry);
      });
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) {
          if (mounted) {
            setAllowed(false);
            setReady(true);
          }
          return;
        }
        await loadAll();
      } catch (err) {
        if (mounted) setError(err?.message || 'No se pudo cargar el panel admin');
      } finally {
        if (mounted) setReady(true);
      }
    };
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const updateDraft = (userId, field, value) => {
    setSubscriptionDrafts((current) => ({
      ...current,
      [userId]: {
        ...defaultDraft(users.find((entry) => String(entry.id) === String(userId))),
        ...(current[userId] || {}),
        [field]: value,
      },
    }));
  };

  const openChat = async (plan) => {
    const planId = plan?.plan_id || plan?.id;
    if (!planId || typeof window === 'undefined') return;
    window.location.href = `/chat?plan=${encodeURIComponent(String(planId))}&admin_view=1`;
  };

  useEffect(() => {
    if (!activePlan) return undefined;
    const planId = activePlan.plan_id || activePlan.id;
    if (!planId) return undefined;
    const timer = setInterval(async () => {
      try {
        const list = await api(`/plans/${planId}/messages`);
        setMessages(Array.isArray(list) ? list : []);
      } catch {
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [activePlan]);

  useEffect(() => {
    if (!activePlan || !adminChatMessagesRef.current) return;
    requestAnimationFrame(() => {
      const node = adminChatMessagesRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [activePlan, messages.length]);

  const openPlanWorkspace = (plan) => {
    const planId = plan?.plan_id || plan?.id;
    if (!planId || typeof window === 'undefined') return;
    window.location.href = `/?plan=${encodeURIComponent(planId)}&admin_view=1`;
  };

  const deletePlan = async (plan) => {
    try {
      await api(`/plans/${plan.plan_id || plan.id}`, { method: 'DELETE' });
      await loadAll();
      if (String(activePlan?.plan_id || activePlan?.id) === String(plan.plan_id || plan.id)) {
        setActivePlan(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err?.message || 'No se pudo borrar la sala');
    }
  };

  const moderateRequest = async (request, action) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      const suffix = action === 'approve' ? 'approve' : 'reject';
      setBusyKey(`${request.plan_id}:${request.user_id}:${suffix}`);
      await api(`/plans/${request.plan_id}/participants/${request.user_id}/${suffix}`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar la solicitud');
    } finally {
      setBusyKey('');
    }
  };

  const moderateReport = async (report, action) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      const suffix = action === 'resolve' ? 'resolve' : 'dismiss';
      setBusyKey(`report:${report.id}:${suffix}`);
      await api(`/admin/reports/${report.id}/${suffix}`, {
        method: 'POST',
        body: JSON.stringify({
          resolution:
            String(reportResolutionDrafts[report.id] || '').trim() ||
            (action === 'resolve'
              ? 'Incidencia revisada y cerrada por administración.'
              : 'Ticket descartado tras revisión administrativa.'),
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el reporte');
    } finally {
      setBusyKey('');
    }
  };

  const moderateUser = async (targetUser, action) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      const suffix = action === 'ban' ? 'ban' : 'unban';
      setBusyKey(`user:${targetUser.id}:${suffix}`);
      await api(`/admin/users/${targetUser.id}/${suffix}`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el usuario');
    } finally {
      setBusyKey('');
    }
  };

  const createUser = async () => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey('create-user');
      await api('/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'user',
        admin_access_level: 'none',
        city: 'Madrid',
        country: 'España',
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo crear el usuario');
    } finally {
      setBusyKey('');
    }
  };

  const saveTeamNote = async () => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    const note = String(teamNoteDraft.note || '').trim();
    if (!note) return;
    try {
      setBusyKey('team-note');
      await api('/admin/team-notes', {
        method: 'POST',
        body: JSON.stringify({
          note,
          pinned: Boolean(teamNoteDraft.pinned),
        }),
      });
      setTeamNoteDraft({ note: '', pinned: false });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la nota interna');
    } finally {
      setBusyKey('');
    }
  };

  const deleteTeamNote = async (noteId) => {
    if (!noteId) return;
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`team-note:${noteId}`);
      await api(`/admin/team-notes/${noteId}`, { method: 'DELETE' });
      setTeamNotes((current) => current.filter((entry) => String(entry.id) !== String(noteId)));
    } catch (err) {
      setError(err?.message || 'No se pudo borrar la nota interna');
    } finally {
      setBusyKey('');
    }
  };

  const deleteUser = async (targetUser) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`user:${targetUser.id}:delete`);
      await api(`/admin/users/${targetUser.id}/delete`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo borrar el usuario');
    } finally {
      setBusyKey('');
    }
  };

  const updateGuestRequestNote = (requestId, value) => {
    setGuestRequestNotes((current) => ({ ...current, [requestId]: value }));
  };

  const reviewGuestRequest = async (request, decision) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`guest-request:${request.id}:${decision}`);
      await api(`/admin/guest-access/${request.id}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({
          admin_notes: guestRequestNotes[request.id] || '',
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo revisar la solicitud invitada');
    } finally {
      setBusyKey('');
    }
  };

  const saveSubscription = async (targetUser) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    const draft = subscriptionDrafts[targetUser.id] || defaultDraft(targetUser);
    try {
      setBusyKey(`subscription:${targetUser.id}`);
      await api(`/admin/users/${targetUser.id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          renewal_at: draft.never_expires ? null : draft.renewal_at ? new Date(draft.renewal_at).toISOString() : null,
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la suscripción');
    } finally {
      setBusyKey('');
    }
  };

  const removeSubscription = async (targetUser) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`subscription:${targetUser.id}:free`);
      await api(`/admin/users/${targetUser.id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({
          tier: 'free',
          status: 'inactive',
          auto_renew: false,
          cancel_at_period_end: false,
          payment_method: 'manual',
          provider: 'admin',
          admin_notes: 'Retirada manual por administración.',
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'No se pudo retirar la suscripción');
    } finally {
      setBusyKey('');
    }
  };

  const applyLogPreset = (preset) => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const toDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    if (preset === 'today') {
      const today = toDateInput(now);
      setLogFilters((current) => ({ ...current, from: today, to: today }));
      return;
    }

    if (preset === 'week') {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      setLogFilters((current) => ({ ...current, from: toDateInput(from), to: toDateInput(now) }));
      return;
    }

    setLogFilters((current) => ({ ...current, search: '', from: '', to: '' }));
  };

  const updateMarketItem = async (item, payload) => {
    if (!canWriteAdmin) {
      setError('Tu acceso es de solo lectura.');
      return;
    }
    try {
      setBusyKey(`market:${item.id}`);
      await marketApi(`/api/marketplace/items/${encodeURIComponent(String(item.id))}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const nextItems = await marketApi('/api/marketplace/items').catch(() => []);
      setMarketItems(Array.isArray(nextItems) ? nextItems : []);
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el anuncio del marketplace');
    } finally {
      setBusyKey('');
    }
  };

  if (!ready) {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state brand-panel-loader">
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

  if (!allowed || !isAdmin || adminAccessLevel === 'none') {
    return (
      <main className="social-shell admin-shell">
        <section className="empty-state">
          <h2>Acceso restringido</h2>
          <p>Este panel solo está disponible para cuentas con rol administrador.</p>
          <button className="btn btn-primary" onClick={() => { window.location.href = '/'; }}>
            Ir al inicio
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="social-shell admin-shell">
      <header className="topbar admin-topbar">
        <div className="brand brand-hero" role="button" tabIndex={0} onClick={() => { window.location.href = '/'; }}>
          <button className="brand-mark">
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>Centro de control</h1>
              <div className="brand-live-pills">
                <span className="status-pill status-go">{stats.openReports} incidencias abiertas</span>
                <span className="status-pill status-ok">{stats.premiumUsers} premium activas</span>
                <span className="status-pill status-warning">{logs.length} eventos en log</span>
                <span className="status-pill status-offline">Acceso {adminAccessLevel}</span>
              </div>
            </div>
            <p className="muted">Moderación, soporte, suscripciones, seguridad operativa y revisión de actividad.</p>
            <div className="brand-tags">
              <span className="chip chip-owner">Actividad registrada</span>
              <span className="chip chip-pending">Gestión de suscripciones</span>
              <span className="chip chip-private">Supervisión de chat</span>
              <span className="chip">Marketplace</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { window.location.href = '/'; }}>
            Ir al inicio
          </button>
        </div>
      </header>

      {error && (
        <section className="mini-card">
          <p className="muted">{error}</p>
        </section>
      )}

      {!canWriteAdmin && (
        <section className="mini-card">
          <p className="muted">
            Tu cuenta está en modo solo lectura. Puedes revisar panel, reportes, salas y logs, pero no ejecutar cambios.
          </p>
        </section>
      )}

      <section className="admin-command-grid">
        <article className="admin-command-card">
          <span>Salas visibles</span>
          <strong>{plans.length}</strong>
          <p className="muted">{stats.liveCount} en vivo · {stats.privateCount} privadas</p>
        </article>
        <article className="admin-command-card">
          <span>Usuarios premium</span>
          <strong>{stats.premiumUsers}</strong>
          <p className="muted">{stats.autoRenewUsers} con renovación automática</p>
        </article>
        <article className="admin-command-card">
          <span>Moderación</span>
          <strong>{stats.pendingCount}</strong>
          <p className="muted">{stats.openReports} reportes abiertos · {stats.guestPendingCount} invitadas pendientes</p>
        </article>
        <article className="admin-command-card">
          <span>Seguridad</span>
          <strong>{stats.bannedUsers}</strong>
          <p className="muted">Usuarios bloqueados · {stats.participants} asistentes contabilizados</p>
        </article>
      </section>

      <div className="admin-panel-grid">
        <aside className="admin-left-rail">
          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Resumen comercial</h3>
                <p className="muted">Ingresos estimados, visibilidad premium y ocupación media actual.</p>
              </div>
            </div>
            <div className="admin-side-metrics">
              <div className="admin-side-metric">
                <strong>{businessPulse.estimatedMrr} €</strong>
                <span>MRR estimado actual</span>
              </div>
              <div className="admin-side-metric">
                <strong>{businessPulse.premiumRooms}</strong>
                <span>salas premium</span>
              </div>
              <div className="admin-side-metric">
                <strong>{businessPulse.featuredRooms}</strong>
                <span>salas destacadas</span>
              </div>
              <div className="admin-side-metric">
                <strong>{businessPulse.averageOccupancy}</strong>
                <span>ocupación media</span>
              </div>
            </div>
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Checklist operativo</h3>
                <p className="muted">Estado resumido de pagos, moderación, comunidad y actividad registrada.</p>
              </div>
            </div>
            <div className="admin-checklist">
              {preLaunchChecklist.map((item) => (
                <article key={item.label} className={`admin-check-item admin-check-item-${item.state}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <p className="muted">{item.text}</p>
                  </div>
                  <span className={`chip ${item.state === 'ok' ? 'chip-owner' : 'chip-pending'}`}>
                    {item.state === 'ok' ? 'Listo' : 'Pendiente'}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Oportunidades</h3>
                <p className="muted">Acciones recomendadas para aumentar calidad, retención y conversión.</p>
              </div>
            </div>
            <ul className="policy-list">
              <li>Top semanal de anfitriones con mejor asistencia real.</li>
              <li>Boost temporal de salas premium por franja horaria.</li>
              <li>Campañas por ciudad: cafés, running, idiomas y coworking.</li>
              <li>Alertas internas cuando una sala privada supera cierto ratio de reportes.</li>
            </ul>
          </section>
        </aside>

        <section className="admin-primary-stack">
          <article className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Gestión premium y renovaciones</h3>
                <p className="muted">Desde aquí puedes regalar, retirar, reactivar o cancelar suscripciones, además de cambiar método y renovación.</p>
              </div>
            </div>
            <div className="admin-subscription-grid admin-subscription-grid-featured">
              {users.slice(0, 4).map((entry) => {
                const draft = subscriptionDrafts[entry.id] || defaultDraft(entry);
                return (
                  <article key={entry.id} className="admin-subscription-card">
                    <div className="admin-subscription-head">
                      <div className="admin-user-inline">
                        <img src={getUserAvatar(entry.name || entry.email)} alt={entry.name || entry.email} />
                        <div>
                          <strong>{entry.name || 'Usuario'}</strong>
                          <p className="muted">
                            {entry.email} · {entry.role || 'user'} · panel {entry.admin_access_level || 'none'} · {entry.city || 'Sin ciudad'}
                          </p>
                        </div>
                      </div>
                      <div className="pill-row">
                        <span className="chip chip-owner">{String(entry.subscription_tier || 'free').toUpperCase()}</span>
                        <span className="chip">{entry.subscription_status || 'inactive'}</span>
                        {entry.never_expires && <span className="chip chip-private">Nunca expira</span>}
                      </div>
                    </div>
                    <div className="admin-subscription-form">
                      <select value={draft.tier} onChange={(event) => updateDraft(entry.id, 'tier', event.target.value)}>
                        <option value="free">Free</option>
                        <option value="plus">Premium Plus</option>
                        <option value="pro">Premium Pro</option>
                      </select>
                      <select value={draft.status} onChange={(event) => updateDraft(entry.id, 'status', event.target.value)}>
                        <option value="inactive">inactive</option>
                        <option value="trial">trial</option>
                        <option value="active">active</option>
                        <option value="past_due">past_due</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      <select value={draft.payment_method} onChange={(event) => updateDraft(entry.id, 'payment_method', event.target.value)}>
                        <option value="manual">manual</option>
                        <option value="paypal">paypal</option>
                        <option value="stripe">stripe</option>
                      </select>
                      <input
                        type="datetime-local"
                        value={draft.renewal_at}
                        disabled={Boolean(draft.never_expires)}
                        onChange={(event) => updateDraft(entry.id, 'renewal_at', event.target.value)}
                      />
                      <label className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.never_expires)}
                          onChange={(event) => updateDraft(entry.id, 'never_expires', event.target.checked)}
                        />
                        Nunca expira
                      </label>
                      <label className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.auto_renew)}
                          onChange={(event) => updateDraft(entry.id, 'auto_renew', event.target.checked)}
                        />
                        Renovación automática
                      </label>
                      <label className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.cancel_at_period_end)}
                          onChange={(event) => updateDraft(entry.id, 'cancel_at_period_end', event.target.checked)}
                        />
                        Cancelar al final del periodo
                      </label>
                      <textarea
                        value={draft.admin_notes}
                        onChange={(event) => updateDraft(entry.id, 'admin_notes', event.target.value)}
                        placeholder="Notas internas de administración"
                      />
                    </div>
                    <div className="pill-row">
                      <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === `subscription:${entry.id}`} onClick={() => saveSubscription(entry)}>
                        Guardar suscripción
                      </button>
                      <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `subscription:${entry.id}:free`} onClick={() => removeSubscription(entry)}>
                        Quitar premium
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {users.length > 4 && (
              <details className="admin-expand-panel">
                <summary>Ver todas las gestiones y renovaciones ({users.length})</summary>
                <div className="admin-subscription-grid admin-subscription-grid-all">
                  {users.map((entry) => {
                    const draft = subscriptionDrafts[entry.id] || defaultDraft(entry);
                    return (
                      <article key={`all-${entry.id}`} className="admin-subscription-card">
                        <div className="admin-subscription-head">
                          <div className="admin-user-inline">
                            <img src={getUserAvatar(entry.name || entry.email)} alt={entry.name || entry.email} />
                            <div>
                              <strong>{entry.name || 'Usuario'}</strong>
                              <p className="muted">
                                {entry.email} · {entry.role || 'user'} · panel {entry.admin_access_level || 'none'} · {entry.city || 'Sin ciudad'}
                              </p>
                            </div>
                          </div>
                          <div className="pill-row">
                            <span className="chip chip-owner">{String(entry.subscription_tier || 'free').toUpperCase()}</span>
                            <span className="chip">{entry.subscription_status || 'inactive'}</span>
                            {entry.never_expires && <span className="chip chip-private">Nunca expira</span>}
                          </div>
                        </div>
                        <div className="admin-subscription-form">
                          <select value={draft.tier} onChange={(event) => updateDraft(entry.id, 'tier', event.target.value)}>
                            <option value="free">Free</option>
                            <option value="plus">Premium Plus</option>
                            <option value="pro">Premium Pro</option>
                          </select>
                          <select value={draft.status} onChange={(event) => updateDraft(entry.id, 'status', event.target.value)}>
                            <option value="inactive">inactive</option>
                            <option value="trial">trial</option>
                            <option value="active">active</option>
                            <option value="past_due">past_due</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                          <select value={draft.payment_method} onChange={(event) => updateDraft(entry.id, 'payment_method', event.target.value)}>
                            <option value="manual">manual</option>
                            <option value="paypal">paypal</option>
                            <option value="stripe">stripe</option>
                          </select>
                          <input
                            type="datetime-local"
                            value={draft.renewal_at}
                            disabled={Boolean(draft.never_expires)}
                            onChange={(event) => updateDraft(entry.id, 'renewal_at', event.target.value)}
                          />
                          <label className="admin-check-row">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.never_expires)}
                              onChange={(event) => updateDraft(entry.id, 'never_expires', event.target.checked)}
                            />
                            Nunca expira
                          </label>
                          <label className="admin-check-row">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.auto_renew)}
                              onChange={(event) => updateDraft(entry.id, 'auto_renew', event.target.checked)}
                            />
                            Renovación automática
                          </label>
                          <label className="admin-check-row">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.cancel_at_period_end)}
                              onChange={(event) => updateDraft(entry.id, 'cancel_at_period_end', event.target.checked)}
                            />
                            Cancelar al final del periodo
                          </label>
                          <textarea
                            value={draft.admin_notes}
                            onChange={(event) => updateDraft(entry.id, 'admin_notes', event.target.value)}
                            placeholder="Notas internas de administración"
                          />
                        </div>
                        <div className="pill-row">
                          <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === `subscription:${entry.id}`} onClick={() => saveSubscription(entry)}>
                            Guardar suscripción
                          </button>
                          <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `subscription:${entry.id}:free`} onClick={() => removeSubscription(entry)}>
                            Quitar premium
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </details>
            )}
          </article>

          <article className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Solicitudes pendientes</h3>
                <p className="muted">Aprobación o rechazo directo de accesos a salas privadas y moderadas.</p>
              </div>
            </div>
            <div className="admin-request-list">
              {pendingRequests.map((request) => (
                <article key={`${request.plan_id}:${request.user_id}`} className="admin-request-card">
                  <div>
                    <strong>{request.name || 'Usuario'}</strong>
                    <p className="muted">Solicita entrar en <strong>{request.plan_title}</strong> · {request.plan_visibility === 'private' ? 'Privada' : 'Pública'}</p>
                  </div>
                  <div className="pill-row">
                    <button className="btn btn-primary" disabled={busyKey === `${request.plan_id}:${request.user_id}:approve`} onClick={() => moderateRequest(request, 'approve')}>
                      Aprobar
                    </button>
                    <button className="btn btn-danger" disabled={busyKey === `${request.plan_id}:${request.user_id}:reject`} onClick={() => moderateRequest(request, 'reject')}>
                      Rechazar
                    </button>
                  </div>
                </article>
              ))}
              {pendingRequests.length === 0 && <p className="muted">No hay solicitudes pendientes.</p>}
            </div>
          </article>

          <article className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Salas activas</h3>
                <p className="muted">Revisión rápida de ubicación, ocupación, privacidad, chat y acciones de moderación.</p>
              </div>
              <button className="btn btn-ghost" onClick={() => { window.location.href = '/admin-salas'; }}>
                Ver todas
              </button>
            </div>
            <div className="admin-room-list">
              {plans.slice(0, 4).map((plan) => (
                <article key={plan.plan_id || plan.id} className="admin-room-card">
                  <div className="admin-room-head">
                    <div>
                      <h3>{plan.title}</h3>
                      <p className="muted">{plan.creator_name || 'Anfitrión'} · {plan.visibility === 'private' ? 'Privada' : 'Pública'} · {plan.premium_room ? 'Premium' : 'Free'}</p>
                    </div>
                    <span className="tag">{plan.category_code || 'general'}</span>
                  </div>
                  <div className="post-meta-grid">
                    <span>📍 {plan.place_name || 'Sin lugar'}</span>
                    <span>🕒 {fmtDate(plan.start_at)}</span>
                    <span>👥 {plan.participants_count || 0}/{plan.max_people || 0}</span>
                    <span>🌍 {plan.city || 'Sin ciudad'}</span>
                  </div>
                  <div className="pill-row">
                    <button className="btn btn-ghost" onClick={() => openPlanWorkspace(plan)}>
                      Abrir sala
                    </button>
                    <button className="btn btn-ghost" onClick={() => openChat(plan)}>
                      Supervisar chat
                    </button>
                    <button className="btn btn-danger" disabled={!canWriteAdmin} onClick={() => deletePlan(plan)}>
                      Borrar sala
                    </button>
                  </div>
                </article>
              ))}
              {plans.length === 0 && <p className="muted">No hay salas cargadas en este momento.</p>}
            </div>
            {plans.length > 4 && (
              <details className="admin-expand-panel">
                <summary>Ver todas las salas activas ({plans.length})</summary>
                <div className="admin-room-list">
                  {plans.map((plan) => (
                    <article key={`all-${plan.plan_id || plan.id}`} className="admin-room-card">
                      <div className="admin-room-head">
                        <div>
                          <h3>{plan.title}</h3>
                          <p className="muted">{plan.creator_name || 'Anfitrión'} · {plan.visibility === 'private' ? 'Privada' : 'Pública'} · {plan.premium_room ? 'Premium' : 'Free'}</p>
                        </div>
                        <span className="tag">{plan.category_code || 'general'}</span>
                      </div>
                      <div className="post-meta-grid">
                        <span>📍 {plan.place_name || 'Sin lugar'}</span>
                        <span>🕒 {fmtDate(plan.start_at)}</span>
                        <span>👥 {plan.participants_count || 0}/{plan.max_people || 0}</span>
                        <span>🌍 {plan.city || 'Sin ciudad'}</span>
                      </div>
                      <div className="pill-row">
                        <button className="btn btn-ghost" onClick={() => openPlanWorkspace(plan)}>
                          Abrir sala
                        </button>
                        <button className="btn btn-ghost" onClick={() => openChat(plan)}>
                          Supervisar chat
                        </button>
                        <button className="btn btn-danger" disabled={!canWriteAdmin} onClick={() => deletePlan(plan)}>
                          Borrar sala
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </article>

          <article className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Marketplace</h3>
                <p className="muted">Resumen de anuncios, destacados, guardados y acceso directo a ficha o perfil vendedor.</p>
              </div>
              <button className="btn btn-ghost" onClick={() => { window.location.href = '/admin-mercado'; }}>
                Ver control de mercado
              </button>
            </div>
            <div className="admin-log-summary-grid">
              <article className="admin-log-summary-card">
                <strong>{marketItems.length}</strong>
                <span>anuncios</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{marketStats.active}</strong>
                <span>activos</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{marketStats.featured}</strong>
                <span>destacados</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{marketStats.saved}</strong>
                <span>guardados</span>
              </article>
            </div>
            <div className="admin-market-grid">
              {marketItems.slice(0, 4).map((item) => (
                <article key={item.id} className="admin-market-card">
                  <div className="admin-room-head">
                    <div>
                      <h3>{item.title}</h3>
                      <p className="muted">
                        {item.seller_name || 'Usuario'} · {item.city || 'Sin ciudad'} · {item.trade_type || 'sell'}
                      </p>
                    </div>
                    <div className="pill-row">
                      {item.featured && <span className="chip chip-owner">Destacado</span>}
                      <span className={`chip ${item.status === 'sold' ? 'chip-owner' : item.status === 'reserved' ? 'chip-pending' : ''}`}>{item.status || 'active'}</span>
                    </div>
                  </div>
                  <div className="admin-market-meta">
                    <span><strong>{item.price_amount || 0}</strong> {item.currency || 'EUR'}</span>
                    <span>{item.favorites_count || 0} guardados</span>
                    <span>{item.category || 'general'}</span>
                  </div>
                  <div className="pill-row">
                    <button className="btn btn-ghost" onClick={() => { window.location.href = `/mercado/${item.id}`; }}>
                      Ver ficha
                    </button>
                    <button className="btn btn-ghost" onClick={() => { window.location.href = `/mercado/perfil/${item.seller_user_id}`; }}>
                      Ver vendedor
                    </button>
                    <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === `market:${item.id}`} onClick={() => updateMarketItem(item, { featured: !item.featured })}>
                      {item.featured ? 'Quitar destaque' : 'Destacar'}
                    </button>
                  </div>
                </article>
              ))}
              {marketItems.length === 0 && <p className="muted">No hay anuncios cargados en el marketplace.</p>}
            </div>
          </article>

          <article className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Actividad operativa</h3>
                <p className="muted">Resumen de movimientos internos, incidencias, suscripciones y cambios sobre cuentas.</p>
              </div>
            </div>
            <div className="admin-log-filters">
              <input
                value={logFilters.search}
                onChange={(event) => setLogFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar por acción, actor, entidad o detalle"
              />
              <input
                type="date"
                value={logFilters.from}
                onChange={(event) => setLogFilters((current) => ({ ...current, from: event.target.value }))}
              />
              <input
                type="date"
                value={logFilters.to}
                onChange={(event) => setLogFilters((current) => ({ ...current, to: event.target.value }))}
              />
              <div className="admin-log-actions">
                <button className="btn btn-secondary" onClick={() => applyLogPreset('today')}>
                  Hoy
                </button>
                <button className="btn btn-secondary" onClick={() => applyLogPreset('week')}>
                  7 días
                </button>
                <button className="btn btn-ghost" onClick={() => applyLogPreset('clear')}>
                  Limpiar
                </button>
              </div>
            </div>
            <div className="admin-log-summary-grid">
              <article className="admin-log-summary-card">
                <strong>{filteredLogs.length}</strong>
                <span>eventos filtrados</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{filteredLogs.filter((log) => String(log.entity_type || '') === 'report').length}</strong>
                <span>incidencias trazadas</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{filteredLogs.filter((log) => String(log.entity_type || '') === 'subscription').length}</strong>
                <span>cambios premium</span>
              </article>
              <article className="admin-log-summary-card">
                <strong>{filteredLogs.filter((log) => String(log.entity_type || '') === 'user').length}</strong>
                <span>acciones sobre usuarios</span>
              </article>
            </div>
            <div className="admin-log-list">
              {filteredLogs.slice(0, 4).map((log) => (
                <article key={log.id} className="admin-log-card">
                  <div className="admin-log-top">
                    <strong>{log.action}</strong>
                    <span className="chip">{log.entity_type}</span>
                  </div>
                  <p className="muted">Actor: {log.actor?.email || 'sistema'} · Objetivo: {log.target?.email || 'n/a'}</p>
                  <p className="muted">Entidad: {log.entity_id || 'sin id'} · {fmtDate(log.created_at)}</p>
                  <p className="admin-log-inline-note">
                    {log.details && Object.keys(log.details).length > 0
                      ? `Detalle: ${Object.keys(log.details).slice(0, 3).join(' · ')}`
                      : 'Sin detalle adicional visible.'}
                  </p>
                </article>
              ))}
              {filteredLogs.length === 0 && <p className="muted">No hay actividad registrada para esos filtros.</p>}
            </div>
          </article>
        </section>

        <aside className="admin-secondary-stack">
          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Crear usuario</h3>
                <p className="muted">Alta rápida desde administración con rol y ciudad base.</p>
              </div>
            </div>
            <div className="admin-create-user-panel">
              <div className="admin-create-user admin-create-user-wide">
                <input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre" disabled={!canWriteAdmin} />
                <input value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="Correo" disabled={!canWriteAdmin} />
                <input type="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña" disabled={!canWriteAdmin} />
                <select
                  value={newUser.role}
                  disabled={!canWriteAdmin}
                  onChange={(event) =>
                    setNewUser((current) => ({
                      ...current,
                      role: event.target.value,
                      admin_access_level: event.target.value === 'admin' ? current.admin_access_level || 'read' : 'none',
                    }))
                  }
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  value={newUser.admin_access_level}
                  disabled={!canWriteAdmin || newUser.role !== 'admin'}
                  onChange={(event) => setNewUser((current) => ({ ...current, admin_access_level: event.target.value }))}
                >
                  <option value="none">Sin panel</option>
                  <option value="read">Solo lectura</option>
                  <option value="write">Gestión</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === 'create-user'} onClick={createUser}>
                  Crear usuario
                </button>
              </div>
              <div className="admin-create-user-meta">
                <span className="chip chip-owner">Alta confirmada</span>
                <span className="chip">Rol y ciudad inicial</span>
                <span className="chip chip-pending">{newUser.role === 'admin' ? `Panel ${newUser.admin_access_level}` : 'Sin panel admin'}</span>
              </div>
              <div className="admin-create-user-note">
                <strong>Alta administrativa</strong>
                <p className="muted">Usa este bloque para crear cuentas controladas, asignar rol inicial y revisar altas de soporte o moderación.</p>
              </div>
            </div>
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Usuarios</h3>
                <p className="muted">Bloqueo, desbloqueo, borrado y estado de suscripción visible.</p>
              </div>
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar usuario, correo, ciudad o plan" />
            </div>
            <div className="admin-user-grid">
              {filteredUsers.map((entry) => (
                <article key={entry.id} className="admin-user-row admin-user-card">
                  <div>
                    <strong>{entry.name || 'Usuario'}</strong>
                    <p className="muted">
                      {entry.email} · {entry.city || 'Sin ciudad'} · {entry.role || 'user'} · panel {entry.admin_access_level || 'none'}
                    </p>
                    <p className="muted">
                      {String(entry.subscription_tier || 'free').toUpperCase()} · {entry.subscription_status || 'inactive'} ·
                      renovación: {entry.never_expires ? 'nunca expira' : entry.auto_renew ? 'auto' : 'manual'}
                    </p>
                  </div>
                  <div className="pill-row">
                    {entry.never_expires && <span className="chip chip-owner">Nunca expira</span>}
                    <button className="btn btn-ghost" disabled={!canWriteAdmin || busyKey === `user:${entry.id}:${entry.is_banned ? 'unban' : 'ban'}`} onClick={() => moderateUser(entry, entry.is_banned ? 'unban' : 'ban')}>
                      {entry.is_banned ? 'Desbloquear' : 'Bloquear'}
                    </button>
                    <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `user:${entry.id}:delete`} onClick={() => deleteUser(entry)}>
                      Borrar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Solicitudes invitadas</h3>
                <p className="muted">Aprobación manual por correo con enlace temporal de 24 horas.</p>
              </div>
            </div>
            <div className="admin-guest-grid">
              {guestRequests.slice(0, 4).map((request) => (
                <article key={request.id} className="admin-guest-card">
                  <div className="admin-log-top">
                    <strong>{request.full_name || 'Solicitante'}</strong>
                    <span className="chip">{request.status || 'pending'}</span>
                  </div>
                  <p className="muted">{request.email} · {request.city || 'Sin ciudad'} · {fmtDate(request.requested_at)}</p>
                  <p>{request.reason || 'Sin motivo indicado.'}</p>
                  <textarea
                    value={guestRequestNotes[request.id] || request.admin_notes || ''}
                    disabled={!canWriteAdmin}
                    onChange={(event) => updateGuestRequestNote(request.id, event.target.value)}
                    placeholder="Nota interna para aprobación o rechazo"
                  />
                  <div className="pill-row">
                    <button
                      className="btn btn-primary"
                      disabled={!canWriteAdmin || busyKey === `guest-request:${request.id}:approve` || request.status === 'approved'}
                      onClick={() => reviewGuestRequest(request, 'approve')}
                    >
                      Aprobar 24h
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={!canWriteAdmin || busyKey === `guest-request:${request.id}:reject` || request.status === 'rejected'}
                      onClick={() => reviewGuestRequest(request, 'reject')}
                    >
                      Rechazar
                    </button>
                  </div>
                </article>
              ))}
              {guestRequests.length === 0 && <p className="muted">No hay solicitudes invitadas pendientes.</p>}
            </div>
            {guestRequests.length > 4 && (
              <details className="admin-expand-panel">
                <summary>Ver todas las solicitudes invitadas ({guestRequests.length})</summary>
                <div className="admin-guest-grid">
                  {guestRequests.map((request) => (
                    <article key={`all-${request.id}`} className="admin-guest-card">
                      <div className="admin-log-top">
                        <strong>{request.full_name || 'Solicitante'}</strong>
                        <span className="chip">{request.status || 'pending'}</span>
                      </div>
                      <p className="muted">{request.email} · {request.city || 'Sin ciudad'} · {fmtDate(request.requested_at)}</p>
                      <p>{request.reason || 'Sin motivo indicado.'}</p>
                      <textarea
                        value={guestRequestNotes[request.id] || request.admin_notes || ''}
                        disabled={!canWriteAdmin}
                        onChange={(event) => updateGuestRequestNote(request.id, event.target.value)}
                        placeholder="Nota interna para aprobación o rechazo"
                      />
                      <div className="pill-row">
                        <button
                          className="btn btn-primary"
                          disabled={!canWriteAdmin || busyKey === `guest-request:${request.id}:approve` || request.status === 'approved'}
                          onClick={() => reviewGuestRequest(request, 'approve')}
                        >
                          Aprobar 24h
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={!canWriteAdmin || busyKey === `guest-request:${request.id}:reject` || request.status === 'rejected'}
                          onClick={() => reviewGuestRequest(request, 'reject')}
                        >
                          Rechazar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Reportes</h3>
                <p className="muted">Todos los reportes llegan aquí para revisión y resolución.</p>
                </div>
              </div>
            <div className="admin-report-filters">
              <input
                value={reportFilters.search}
                onChange={(event) => setReportFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar por motivo, descripción o estado"
              />
              <select
                value={reportFilters.status}
                onChange={(event) => setReportFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
              <input
                type="date"
                value={reportFilters.from}
                onChange={(event) => setReportFilters((current) => ({ ...current, from: event.target.value }))}
              />
              <input
                type="date"
                value={reportFilters.to}
                onChange={(event) => setReportFilters((current) => ({ ...current, to: event.target.value }))}
              />
            </div>
            <div className="admin-report-list">
              {filteredReports.map((report) => (
                <article key={report.id} className="admin-report-card">
                  <div>
                    <strong>{report.ticket_number || `TCK-${report.id}`}</strong>
                    <p className="muted">{report.reason}</p>
                    <p className="muted">{report.description || 'Sin descripción adicional.'}</p>
                    <p className="muted">Estado: {report.status} · {fmtDate(report.created_at)}</p>
                    {report.resolution_text && <p className="muted">Resolución: {report.resolution_text}</p>}
                  </div>
                  <textarea
                    value={reportResolutionDrafts[report.id] || report.resolution_text || ''}
                    onChange={(event) =>
                      setReportResolutionDrafts((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                    placeholder="Escribe la resolución oficial del ticket"
                  />
                  <div className="pill-row">
                    <button className="btn btn-secondary" onClick={() => { window.location.href = `/ticket?id=${report.id}`; }}>
                      Abrir ticket
                    </button>
                    <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === `report:${report.id}:resolve`} onClick={() => moderateReport(report, 'resolve')}>
                      Resolver
                    </button>
                    <button className="btn btn-ghost" disabled={!canWriteAdmin || busyKey === `report:${report.id}:dismiss`} onClick={() => moderateReport(report, 'dismiss')}>
                      Descartar
                    </button>
                  </div>
                </article>
              ))}
              {filteredReports.length === 0 && <p className="muted">No hay reportes para esos filtros.</p>}
            </div>
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Notas internas</h3>
                <p className="muted">Mensajes internos para cambios de turno, seguimiento operativo y decisiones pendientes.</p>
              </div>
            </div>
            <div className="admin-note-summary-grid">
              <article className="admin-note-summary-card">
                <strong>{teamNotes.length}</strong>
                <span>notas activas</span>
              </article>
              <article className="admin-note-summary-card">
                <strong>{teamNotes.filter((entry) => entry.pinned).length}</strong>
                <span>notas fijadas</span>
              </article>
              <article className="admin-note-summary-card">
                <strong>{teamNotes.filter((entry) => String(entry.author?.id || '') === String(user?.id || '')).length}</strong>
                <span>creadas por ti</span>
              </article>
              <article className="admin-note-summary-card">
                <strong>{teamNotes[0]?.updated_at ? fmtDate(teamNotes[0].updated_at) : 'Sin cambios'}</strong>
                <span>última actualización</span>
              </article>
            </div>
            <div className="admin-team-note-compose">
              <textarea
                value={teamNoteDraft.note}
                onChange={(event) => setTeamNoteDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="Escribe una nota clara para el siguiente administrador o moderador..."
              />
              <div className="admin-team-note-actions">
                <label className="admin-check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(teamNoteDraft.pinned)}
                    onChange={(event) => setTeamNoteDraft((current) => ({ ...current, pinned: event.target.checked }))}
                  />
                  Fijar nota
                </label>
                <button className="btn btn-primary" disabled={!canWriteAdmin || busyKey === 'team-note'} onClick={saveTeamNote}>
                  Guardar nota
                </button>
              </div>
            </div>
            <div className="admin-team-note-list">
              {teamNotes.slice(0, 4).map((entry) => (
                <article key={entry.id} className="admin-log-card admin-team-note-card">
                  <div className="admin-log-top">
                    <strong>{entry.author?.name || entry.author?.email || 'Administrador'}</strong>
                    <div className="pill-row">
                      {entry.pinned && <span className="chip chip-owner">Fijada</span>}
                      <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `team-note:${entry.id}`} onClick={() => deleteTeamNote(entry.id)}>
                        Borrar
                      </button>
                    </div>
                  </div>
                  <p>{entry.note}</p>
                  <p className="muted">{fmtDate(entry.updated_at || entry.created_at)}</p>
                </article>
              ))}
              {teamNotes.length === 0 && <p className="muted">Todavía no hay notas compartidas.</p>}
            </div>
            {teamNotes.length > 4 && (
              <details className="admin-expand-panel">
                <summary>Ver todas las notas internas ({teamNotes.length})</summary>
                <div className="admin-team-note-list">
                  {teamNotes.map((entry) => (
                    <article key={`all-${entry.id}`} className="admin-log-card admin-team-note-card">
                      <div className="admin-log-top">
                        <strong>{entry.author?.name || entry.author?.email || 'Administrador'}</strong>
                        <div className="pill-row">
                          {entry.pinned && <span className="chip chip-owner">Fijada</span>}
                          <button className="btn btn-danger" disabled={!canWriteAdmin || busyKey === `team-note:${entry.id}`} onClick={() => deleteTeamNote(entry.id)}>
                            Borrar
                          </button>
                        </div>
                      </div>
                      <p>{entry.note}</p>
                      <p className="muted">{fmtDate(entry.updated_at || entry.created_at)}</p>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section className="mini-card admin-surface">
            <div className="admin-section-head">
              <div>
                <h3>Notificaciones internas</h3>
                <p className="muted">Actividad reciente relevante para operaciones.</p>
              </div>
            </div>
            {notifications.length === 0 && <p className="muted">Sin notificaciones nuevas.</p>}
            {notifications.slice(0, 6).map((item) => (
              <article key={item.id} className="mini-card">
                <h4>{item.title}</h4>
                <p>{item.body}</p>
                <span className="muted">{fmtDate(item.created_at)}</span>
              </article>
            ))}
          </section>

        </aside>
      </div>

      {activePlan && (
        <div className="composer-overlay">
          <article className="chat-modal admin-chat-modal">
            <header className="chat-header">
              <div className="chat-header-main">
                <div className="chat-room-badge">🛡️</div>
                <div>
                  <h2>Supervisión discreta</h2>
                  <p className="muted">
                    {activePlan.title} · lectura invisible para revisar integridad, amenazas o incidencias
                  </p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="btn btn-ghost" onClick={() => openChat(activePlan)}>
                  Refrescar
                </button>
                <button className="btn btn-ghost" onClick={() => setActivePlan(null)}>
                  Cerrar
                </button>
              </div>
            </header>

            <section className="chat-summary-strip">
              <article className="chat-summary-card">
                <strong>Sala</strong>
                <span>{activePlan.title || 'Sin título'}</span>
              </article>
              <article className="chat-summary-card">
                <strong>Mensajes</strong>
                <span>{messages.length} visibles en revisión</span>
              </article>
              <article className="chat-summary-card">
                <strong>Participantes</strong>
                <span>{Array.isArray(activePlan.participants) ? activePlan.participants.length : 0} registrados</span>
              </article>
              <article className="chat-summary-card">
                <strong>Modo</strong>
                <span>Supervisor oculto · sin presencia visible</span>
              </article>
            </section>

            <div className="chat-layout admin-chat-layout">
              <section className="chat-section chat-main-surface">
                <article className="chat-safety-banner">
                  <strong>Monitorización silenciosa</strong>
                  <p>
                    Esta revisión no muestra al administrador dentro de la sala. Si detectas amenazas o riesgo real,
                    aplica moderación, conserva el registro y escala la incidencia según corresponda.
                  </p>
                </article>
                <div ref={adminChatMessagesRef} className="chat-messages chat-live-thread admin-chat-thread">
                  {!loadingChat && messages.length === 0 && <p className="muted">No hay mensajes en esta sala.</p>}
                  {messages.map((message) => (
                    <div key={message.id} className="chat-message-row">
                      <img
                        className="chat-message-avatar"
                        src={getUserAvatar(message.user_name || message.user_id || 'Usuario')}
                        alt={message.user_name || 'Usuario'}
                      />
                      <article className="chat-bubble">
                        <div className="chat-bubble-head">
                          <strong>{message.user_name || message.user_id}</strong>
                          <span className="chip">{String(message.channel || 'main') === 'private' ? 'Privado' : 'General'}</span>
                        </div>
                        <p>{message.message}</p>
                        {message.image_url && <img className="chat-image" src={message.image_url} alt="Adjunto del chat" />}
                        <small>{fmtDate(message.created_at)}</small>
                      </article>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="chat-users-pane admin-chat-side">
                <section className="chat-side-card">
                  <div className="chat-side-head">
                    <div>
                      <h3>Acciones sugeridas</h3>
                      <p className="muted">Guía rápida para reaccionar sin exponer al supervisor.</p>
                    </div>
                  </div>
                  <ul className="policy-list">
                    <li>Bloquea y reporta si ves amenazas directas, coacción o extorsión.</li>
                    <li>Conserva el chat y el contexto antes de cerrar o limitar la sala.</li>
                    <li>Si hay peligro inmediato, indica acudir a autoridades competentes.</li>
                    <li>La supervisión permanece oculta durante toda la revisión.</li>
                  </ul>
                </section>
              </aside>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}

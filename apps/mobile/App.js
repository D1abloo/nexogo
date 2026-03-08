import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const CATEGORY_OPTIONS = [
  'all',
  'cafe',
  'paseo',
  'terraceo',
  'running',
  'futbol',
  'paddle',
  'estudiar',
  'coworking',
  'gaming',
  'idiomas',
  'fiesta',
  'concierto',
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Público' },
  { value: 'private', label: 'Privado' },
];

const STATUS_LABELS = {
  accepted: '✅ Participando',
  pending: '⏳ Pendiente',
  cancelled: '🚫 Cancelado',
  attended: '✔️ Asistió',
  no_show: '❗ No Show',
};

const PLAN_STATUS_LABELS = {
  active: 'Activo',
  full: 'Completo',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  draft: 'Borrador',
};

function fmtDate(iso) {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleString();
}

function distanceText(meters = 0) {
  const m = Number(meters) || 0;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function statusForPlan(status) {
  const value = PLAN_STATUS_LABELS[status] || status || 'Estado';
  return `Estado: ${value}`;
}

function chipStyleForParticipation(status) {
  if (status === 'accepted') return styles.chipSuccess;
  if (status === 'pending') return styles.chipWarning;
  if (status === 'cancelled') return styles.chipDanger;
  return styles.chipMuted;
}

async function api(path, options = {}, userId = null) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload && (payload.error || payload.title)) || `Error ${response.status}`);
  }
  return payload;
}

function IconButton({ label, onPress, disabled, variant = 'ghost' }) {
  const styleByVariant = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    danger: styles.btnDanger,
    ghost: styles.btnGhost,
  };

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        styleByVariant[variant],
        disabled ? styles.btnDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={variant === 'ghost' ? styles.btnGhostText : styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlanCard({ plan, onJoin, onLeave, onOpenPlan }) {
  const statusLabel = STATUS_LABELS[plan.my_status] || 'Sin estado';
  const participants = Number(plan.participants_count || 0);
  const maxPeople = Number(plan.max_people || 0);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.tag}>#{plan.category_code || 'plan'}</Text>
        <Text style={[styles.chip, chipStyleForParticipation(plan.my_status)]}>{statusLabel}</Text>
      </View>
      <Text style={styles.cardTitle}>{plan.title}</Text>
      <Text style={styles.cardMeta}>{fmtDate(plan.start_at)}</Text>
      <Text style={styles.cardText}>📍 {plan.place_name || 'Sin ubicación'}</Text>
      <Text style={styles.cardText}>
        👥 {participants}/{maxPeople || '∞'} • {distanceText(plan.distance_meters)} • {plan.creator_name || 'Sin anfitrión'}
      </Text>
      <Text style={styles.cardSubtle}>{statusForPlan(plan.status)}</Text>

      <View style={styles.row}>
        {plan.my_status === 'accepted' ? (
          <IconButton label="Abandonar" onPress={() => onLeave(plan)} variant="danger" />
        ) : (
          <IconButton label="Unirme" onPress={() => onJoin(plan)} variant="primary" />
        )}
        <IconButton label="Ver detalle" onPress={() => onOpenPlan(plan)} variant="ghost" />
      </View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('feed');
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState(null);

  const [name, setName] = useState('Usuario demo');
  const [email, setEmail] = useState('demo@social.local');

  const [category, setCategory] = useState('all');
  const [hours, setHours] = useState('24');
  const [radius, setRadius] = useState('8000');

  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [reviewUserId, setReviewUserId] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewComment, setReviewComment] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('Descubriendo planes cercanos...');

  const [planForm, setPlanForm] = useState({
    title: 'Café de ahora',
    description: 'Plan exprés para compartir una tarde',
    category: 'cafe',
    place_name: 'Centro',
    latitude: '40.4168',
    longitude: '-3.7038',
    start_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    max_people: '6',
    visibility: 'public',
    approval_required: false,
    rules: '',
  });

  const coords = useMemo(() => {
    return { latitude: 40.4168, longitude: -3.7038 };
  }, []);

  useEffect(() => {
    const register = async () => {
      try {
        const result = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
          }),
        });

        const id = result?.auth?.user_id || result?.user?.id;
        if (!id) {
          throw new Error('Sin usuario');
        }

        setUserId(id);
      } catch {
        Alert.alert('Error', 'No se pudo registrar/obtener usuario demo');
      }
    };

    register();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const loadProfile = async () => {
      try {
        const userRes = await api('/users/me', {}, userId);
        const statsRes = await api('/users/me/stats', {}, userId);
        setUser(userRes);
        setStats(statsRes);
      } catch {
        setUser(null);
      }
    };

    loadProfile();
  }, [userId]);

  const loadPlans = async () => {
    try {
      setNoticeMessage('Cargando planes...');
      const params = new URLSearchParams({
        lat: String(coords.latitude),
        lng: String(coords.longitude),
        radius_meters: String(radius),
        max_hours: String(hours),
      });
      if (category && category !== 'all') params.set('category', category);

      const data = await api(`/plans/nearby?${params.toString()}`, {}, userId);
      setPlans(Array.isArray(data) ? data : []);
      setNoticeMessage('Listo');
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de planes');
      setNoticeMessage('No se pudieron cargar planes');
    }
  };

  useEffect(() => {
    if (!userId) return;
    loadPlans();
    const interval = setInterval(loadPlans, 5000);
    return () => clearInterval(interval);
  }, [userId, category, hours, radius]);

  const openPlan = async (plan) => {
    try {
      const [detail, participantsRes, chat] = await Promise.all([
        api(`/plans/${plan.plan_id || plan.id}`, {}, userId),
        api(`/plans/${plan.plan_id || plan.id}/participants`, {}, userId),
        api(`/plans/${plan.plan_id || plan.id}/messages`, {}, userId),
      ]);

      setSelectedPlan(detail);
      setParticipants(Array.isArray(participantsRes) ? participantsRes : []);
      setMessages(Array.isArray(chat) ? chat : []);
      const firstOther = (participantsRes || []).find((p) => p.user_id !== userId);
      setReviewUserId(firstOther ? firstOther.user_id : '');
      setReviewRating('5');
      setReviewComment('');
      setScreen('plan');
    } catch {
      Alert.alert('Error', 'No se pudo abrir el detalle del plan');
    }
  };

  const loadNotifications = async () => {
    try {
      const data = await api('/notifications', {}, userId);
      setNotifications(Array.isArray(data) ? data : []);
      setScreen('notifications');
    } catch {
      Alert.alert('Error', 'No se pudieron cargar notificaciones');
    }
  };

  const openChat = async () => {
    if (!selectedPlan) return;
    try {
      const chat = await api(`/plans/${selectedPlan.id}/messages`, {}, userId);
      setMessages(Array.isArray(chat) ? chat : []);
      setScreen('chat');
    } catch {
      Alert.alert('Error', 'No autorizado para el chat');
    }
  };

  const joinPlan = async (plan) => {
    try {
      await api(`/plans/${plan.plan_id || plan.id}/join`, {
        method: 'POST',
      }, userId);
      await loadPlans();
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo unirse');
    }
  };

  const leavePlan = async (plan) => {
    try {
      await api(`/plans/${plan.plan_id || plan.id}/leave`, {
        method: 'POST',
      }, userId);
      await loadPlans();
    } catch {
      Alert.alert('Error', 'No se pudo abandonar el plan');
    }
  };

  const sendMessage = async () => {
    if (!selectedPlan || !messageInput.trim()) return;
    try {
      await api(`/plans/${selectedPlan.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: messageInput.trim() }),
      }, userId);
      const chat = await api(`/plans/${selectedPlan.id}/messages`, {}, userId);
      setMessages(Array.isArray(chat) ? chat : []);
      setMessageInput('');
    } catch {
      Alert.alert('Error', 'No se pudo enviar mensaje');
    }
  };

  const createPlan = async () => {
    if (!planForm.title.trim() || !planForm.place_name.trim()) {
      return Alert.alert('Atención', 'Completa título y lugar');
    }
    try {
      await api('/plans', {
        method: 'POST',
        body: JSON.stringify({
          ...planForm,
          max_people: Number(planForm.max_people),
          latitude: Number(planForm.latitude),
          longitude: Number(planForm.longitude),
          visibility: planForm.visibility || 'public',
          approval_required: Boolean(planForm.approval_required),
          rules: planForm.rules || null,
        }),
      }, userId);
      await loadPlans();
      setScreen('feed');
      Alert.alert('Plan creado', 'Listo para que otros se unan');
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo crear el plan');
    }
  };

  const submitReview = async () => {
    if (!selectedPlan || !reviewUserId) {
      return Alert.alert('Atención', 'Selecciona a un usuario para valorar');
    }

    try {
      await api(`/plans/${selectedPlan.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          reviewed_user_id: reviewUserId,
          rating: Number(reviewRating),
          comment: reviewComment || null,
        }),
      }, userId);

      const reviews = await api(`/plans/${selectedPlan.id}/reviews`, {}, userId);
      setSelectedPlan((prev) => ({ ...prev, reviews }));
      Alert.alert('Gracias', 'Valoración guardada');
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo valorar');
    }
  };

  const markNotificationRead = async (notification) => {
    try {
      await api(`/notifications/${notification.id}/read`, { method: 'PATCH' }, userId);
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    } catch {
      // noop
    }
  };

  if (!userId) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Text style={styles.title}>Arrancando sesión...</Text>
        <Text style={styles.smallText}>Conectando con el backend</Text>
      </SafeAreaView>
    );
  }

  if (screen === 'notifications') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          <IconButton label="Volver" onPress={() => setScreen('feed')} />
        </View>
        <FlatList
          style={{ width: '100%' }}
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => markNotificationRead(item)}>
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.timestamp}>{new Date(item.created_at).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.cardText}>{item.body}</Text>
                <Text style={styles.cardSubtle}>Pulsa para marcar como leída</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardText}>Sin notificaciones.</Text>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  if (screen === 'chat') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedPlan?.title || 'Chat del plan'}</Text>
          <IconButton label="Detalle" onPress={() => setScreen('plan')} />
        </View>
        <Text style={styles.cardSubtle}>Espacio privado del plan</Text>

        <FlatList
          style={{ width: '100%' }}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const isMine = item.user_id === userId;
            return (
              <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                <Text style={isMine ? styles.messageAuthorMine : styles.messageAuthor}>{item.user_name || item.user_id}</Text>
                <Text style={isMine ? styles.messageBodyMine : styles.messageBody}>{item.message}</Text>
                <Text style={styles.timestamp}>
                  {item.created_at ? new Date(item.created_at).toLocaleTimeString() : ''}
                </Text>
              </View>
            );
          }}
        />

        <View style={[styles.row, styles.inputRow]}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Escribe un mensaje"
            placeholderTextColor="#93a4b8"
          />
          <IconButton label="Enviar" onPress={sendMessage} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'plan' && selectedPlan) {
    const myStatus = participants.find((p) => p.user_id === userId)?.status;
    const reviewTargets = participants.filter((p) => p.user_id !== userId && p.status === 'attended');

    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.sectionTitle}>Detalle del plan</Text>
            <Text style={styles.sectionHero}>{selectedPlan.title}</Text>
          </View>
          <IconButton label="Volver" onPress={() => setScreen('feed')} />
        </View>

        <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardText}>{selectedPlan.description}</Text>
            <Text style={styles.cardText}>Categoría: {selectedPlan.category_code}</Text>
            <Text style={styles.cardText}>Inicio: {fmtDate(selectedPlan.start_at)}</Text>
            <Text style={styles.cardText}>Lugar: {selectedPlan.place_name || '—'}</Text>
            <Text style={styles.cardText}>Estado: {statusForPlan(selectedPlan.status)}</Text>
            <Text style={styles.cardText}>Participantes: {selectedPlan.metrics?.accepted_count || 0}/{selectedPlan.max_people || 0}</Text>
            <Text style={styles.cardText}>Pendientes: {selectedPlan.metrics?.pending_count || 0}</Text>
          </View>

          <View style={styles.row}>
            {myStatus === 'accepted' ? (
              <IconButton
                label="Salir del plan"
                onPress={() => leavePlan(selectedPlan).then(() => setScreen('feed'))}
                variant="danger"
              />
            ) : myStatus === 'pending' ? (
              <Text style={styles.cardSubtle}>Esperando aprobación del anfitrión</Text>
            ) : (
              <IconButton
                label="Unirme"
                onPress={() => joinPlan(selectedPlan).then(() => openPlan(selectedPlan))}
                variant="primary"
              />
            )}
            <IconButton label="Abrir chat" onPress={openChat} variant="secondary" />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Participantes</Text>
            {participants.length === 0 && <Text style={styles.cardSubtle}>Aún no hay participantes</Text>}
            {participants.map((p) => (
              <View key={p.user_id} style={styles.listRow}>
                <Text style={styles.cardText}>{p.name || p.user_id}</Text>
                <Text style={styles.chipMuted}>{p.status}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Valoraciones</Text>
            <Text style={styles.cardSubtle}>
              {reviewTargets.length
                ? 'Selecciona a un asistente y déjalo una valoración'
                : 'No hay asistentes a los que valorar todavía'}
            </Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="ID de usuario"
                value={reviewUserId}
                onChangeText={setReviewUserId}
                placeholderTextColor="#93a4b8"
              />
              <TextInput
                style={[styles.input, { width: 96 }]}
                placeholder="Punt."
                value={reviewRating}
                onChangeText={setReviewRating}
                keyboardType="numeric"
                placeholderTextColor="#93a4b8"
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Comentario (opcional)"
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholderTextColor="#93a4b8"
            />
            <IconButton label="Enviar valoración" onPress={submitReview} variant="secondary" />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'create') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Crear plan</Text>
            <Text style={styles.cardSubtle}>Tu experiencia de 1 minuto para publicar</Text>
          </View>
          <IconButton label="Cancelar" onPress={() => setScreen('feed')} variant="ghost" />
        </View>

        <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.groupLabel}>Básico</Text>
            <TextInput
              style={styles.input}
              placeholder="Título del plan"
              value={planForm.title}
              onChangeText={(value) => setPlanForm({ ...planForm, title: value })}
              placeholderTextColor="#93a4b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Descripción"
              value={planForm.description}
              onChangeText={(value) => setPlanForm({ ...planForm, description: value })}
              placeholderTextColor="#93a4b8"
            />
            <Text style={styles.groupLabel}>Categoría</Text>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.slice(0, 6).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.pill, planForm.category === item ? styles.pillActive : null]}
                  onPress={() => setPlanForm({ ...planForm, category: item })}
                >
                  <Text style={[styles.pillText, planForm.category === item ? styles.pillTextActive : null]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Categoría personalizada"
              value={planForm.category}
              onChangeText={(value) => setPlanForm({ ...planForm, category: value })}
              placeholderTextColor="#93a4b8"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.groupLabel}>Lugar y hora</Text>
            <TextInput
              style={styles.input}
              placeholder="Lugar"
              value={planForm.place_name}
              onChangeText={(value) => setPlanForm({ ...planForm, place_name: value })}
              placeholderTextColor="#93a4b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Latitud"
              keyboardType="numeric"
              value={planForm.latitude}
              onChangeText={(value) => setPlanForm({ ...planForm, latitude: value })}
              placeholderTextColor="#93a4b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Longitud"
              keyboardType="numeric"
              value={planForm.longitude}
              onChangeText={(value) => setPlanForm({ ...planForm, longitude: value })}
              placeholderTextColor="#93a4b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Máx. personas"
              keyboardType="numeric"
              value={planForm.max_people}
              onChangeText={(value) => setPlanForm({ ...planForm, max_people: value })}
              placeholderTextColor="#93a4b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Inicio (ISO: 2026-03-08T20:00:00.000Z)"
              value={planForm.start_at}
              onChangeText={(value) => setPlanForm({ ...planForm, start_at: value })}
              placeholderTextColor="#93a4b8"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.groupLabel}>Visibilidad y reglas</Text>
            <Text style={styles.cardText}>Visibilidad</Text>
            <View style={styles.chipRow}>
              {VISIBILITY_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.pill, planForm.visibility === item.value ? styles.pillActive : null]}
                  onPress={() => setPlanForm({ ...planForm, visibility: item.value })}
                >
                  <Text style={[styles.pillText, planForm.visibility === item.value ? styles.pillTextActive : null]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                planForm.approval_required ? styles.toggleActive : null,
              ]}
              onPress={() => setPlanForm((prev) => ({ ...prev, approval_required: !prev.approval_required }))}
            >
              <Text style={styles.toggleText}>
                {planForm.approval_required ? 'Aprobación del anfitrión activada' : 'Aprobación automática'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Reglas (opcional)"
              value={planForm.rules}
              onChangeText={(value) => setPlanForm({ ...planForm, rules: value })}
              placeholderTextColor="#93a4b8"
            />
          </View>

          <IconButton label="Publicar plan" onPress={createPlan} variant="primary" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'profile') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mi perfil</Text>
          <IconButton label="Volver" onPress={() => setScreen('feed')} variant="ghost" />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ID de usuario</Text>
          <Text style={styles.cardSubtle}>{userId}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.groupLabel}>Datos</Text>
          <Text style={styles.cardText}>Usuario: {user?.name || '—'}</Text>
          <Text style={styles.cardText}>Email: {user?.email || '—'}</Text>
          <Text style={styles.cardText}>Ciudad: {user?.city || '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.groupLabel}>Reputación</Text>
          <Text style={styles.sectionHero}>
            {stats ? `${stats.avg_review || 0}/5` : 'Cargando...'}
          </Text>
          <Text style={styles.cardText}>Valoraciones recibidas: {stats?.reviews_received || 0}</Text>
          <Text style={styles.cardText}>Planes creados: {stats?.plans_created || 0}</Text>
          <Text style={styles.cardText}>Planes unidos: {stats?.plans_joined || 0}</Text>
          <Text style={styles.cardText}>Reportes abiertos: {stats?.open_reports || 0}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <View>
          <Text style={styles.sectionTitle}>Hola {user?.name || 'Planero'}</Text>
          <Text style={styles.heroLabel}>Descubre algo bueno hoy, cerca de ti</Text>
        </View>
        <IconButton label="Notificaciones" onPress={loadNotifications} />
      </View>

      <View style={styles.filtersBlock}>
        <Text style={styles.groupLabel}>Filtros</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.filterInput}
            value={radius}
            onChangeText={setRadius}
            placeholder="Radio (m)"
            keyboardType="numeric"
            placeholderTextColor="#93a4b8"
          />
          <TextInput
            style={styles.filterInput}
            value={hours}
            onChangeText={setHours}
            placeholder="Horas"
            keyboardType="numeric"
            placeholderTextColor="#93a4b8"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
          {CATEGORY_OPTIONS.map((item) => {
            const isActive = category === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.pill, isActive ? styles.pillActive : null]}
                onPress={() => setCategory(item)}
              >
                <Text style={[styles.pillText, isActive ? styles.pillTextActive : null]}>
                  {item === 'all' ? 'Todas' : item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <Text style={styles.smallText}>{noticeMessage}</Text>

      <FlatList
        style={{ width: '100%' }}
        data={plans}
        keyExtractor={(item) => String(item.plan_id || item.id)}
        renderItem={({ item }) => (
          <PlanCard
            plan={item}
            onJoin={joinPlan}
            onLeave={leavePlan}
            onOpenPlan={openPlan}
          />
        )}
        onRefresh={loadPlans}
        refreshing={false}
        ListEmptyComponent={
          <View style={styles.card}>
            <Text style={styles.cardText}>Aún no hay planes cerca.</Text>
          </View>
        }
      />

      <View style={styles.bottomBar}>
        <IconButton
          label="Crear"
          onPress={() => setScreen('create')}
          variant="primary"
        />
        <IconButton
          label="Perfil"
          onPress={() => setScreen('profile')}
          variant="secondary"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#f8fafc',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnGhostText: {
    color: '#1d4ed8',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    borderWidth: 1,
    borderColor: '#1d4ed8',
  },
  btnSecondary: {
    backgroundColor: '#0f766e',
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  btnDanger: {
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  btnGhost: {
    borderColor: '#93c5fd',
    borderWidth: 1,
    backgroundColor: '#e0ecff',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardText: {
    marginTop: 4,
    color: '#1e293b',
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 18,
    color: '#0f172a',
  },
  cardMeta: {
    color: '#334155',
    marginTop: 2,
    marginBottom: 4,
    fontWeight: '600',
  },
  cardSubtle: {
    color: '#64748b',
    marginTop: 6,
    marginBottom: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    fontSize: 12,
  },
  chipMuted: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    fontSize: 12,
    alignSelf: 'flex-start',
  },
  chipSuccess: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  chipWarning: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  chipDanger: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 8,
    width: 100,
    marginRight: 8,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  filtersBlock: {
    marginBottom: 12,
    width: '100%',
  },
  groupLabel: {
    color: '#334155',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 2,
  },
  hero: {
    backgroundColor: '#1e3a8a',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    color: '#dbeafe',
    marginTop: 2,
  },
  sectionHero: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    width: '100%',
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  inputRow: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageAuthor: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 4,
  },
  messageAuthorMine: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 4,
  },
  messageBody: {
    color: '#334155',
  },
  messageBodyMine: {
    color: '#0f172a',
  },
  messageRow: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  messageRowMine: {
    backgroundColor: '#e0ecff',
    marginLeft: 44,
  },
  messageRowOther: {
    backgroundColor: '#f1f5f9',
    marginRight: 44,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 10,
    color: '#0f172a',
  },
  smallText: {
    color: '#64748b',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    width: '100%',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  scrollRow: {
    marginTop: 8,
    marginBottom: 2,
  },
  sectionSub: {
    color: '#bfdbfe',
    marginTop: 2,
  },
  tag: {
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  timestamp: {
    color: '#94a3b8',
    fontSize: 11,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingBottom: 8,
    paddingTop: 8,
    gap: 10,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  pillActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1d4ed8',
  },
  pillText: {
    color: '#334155',
    textTransform: 'lowercase',
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#f8fafc',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  toggle: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#e2e8f0',
    marginBottom: 10,
  },
  toggleActive: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  toggleText: {
    color: '#334155',
    fontWeight: '700',
  },
});

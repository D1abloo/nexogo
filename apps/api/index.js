const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://plansocial:plansocial@localhost:5432/plansocial',
});

const PORT = process.env.PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'root';

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseUserId(req) {
  return req.header('x-user-id') || req.body?.user_id || req.query.user_id;
}

function parseLimit(value, fallback, max = 100) {
  const raw = asNumber(value, fallback);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(raw, max);
}

async function run(queryText, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(queryText, params);
  } finally {
    client.release();
  }
}

function socketRoomForPlan(planId) {
  return `plan:${planId}`;
}

function socketRoomForUser(userId) {
  return `user:${userId}`;
}

async function emitNotification({ userId, type, title, body, payload = {} }) {
  if (!userId) return null;

  const { rows } = await run(
    `INSERT INTO notifications (user_id, type, title, body, payload)
     VALUES ($1, $2::notification_type, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      userId,
      type,
      title,
      body,
      JSON.stringify(payload),
    ]
  );

  const notification = rows[0];
  io.to(socketRoomForUser(userId)).emit('NOTIFICATION', notification);
  return notification;
}

async function getUser(req, res) {
  const userId = parseUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'user_id o x-user-id faltante' });
    return null;
  }

  const { rows } = await run(
    'SELECT id, name, email, city, photo_url, birth_date, bio, rating_avg, rating_count, verified, is_banned FROM users WHERE id = $1',
    [userId]
  );

  if (!rows.length) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return null;
  }

  if (rows[0].is_banned) {
    res.status(403).json({ error: 'Usuario bloqueado' });
    return null;
  }

  return rows[0];
}

async function getPlan(req, res) {
  const { rows } = await run(
    `SELECT p.*, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
            u.name AS creator_name, u.photo_url AS creator_photo
     FROM plans p
     JOIN users u ON u.id = p.creator_id
     WHERE p.id = $1`,
    [req.params.id]
  );

  if (!rows.length) {
    res.status(404).json({ error: 'Plan no encontrado' });
    return null;
  }

  return rows[0];
}

function requireAdmin(req, res) {
  const token = req.header('x-admin-token') || req.body.admin_token || req.query.admin_token;
  if (!token || token !== ADMIN_TOKEN) {
    res.status(403).json({ error: 'Token de administración inválido' });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'social-plans-api', admin_token: ADMIN_TOKEN });
});

// Auth & perfil
app.post('/auth/register', async (req, res) => {
  const { name, email, city, photo_url, birth_date, bio } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'name y email son obligatorios' });
  }

  try {
    const { rows } = await run(
      `INSERT INTO users (name, email, city, photo_url, birth_date, bio)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email)
       DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         city = EXCLUDED.city,
         photo_url = EXCLUDED.photo_url,
         birth_date = EXCLUDED.birth_date,
         bio = EXCLUDED.bio,
         updated_at = NOW()
       RETURNING id, name, email, city, photo_url, birth_date, bio, rating_avg, rating_count, verified, is_banned, created_at, updated_at;`,
      [name, email.toLowerCase().trim(), city || null, photo_url || null, birth_date || null, bio || null]
    );

    const user = rows[0];
    res.status(201).json({ user, auth: { user_id: user.id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email obligatorio' });
  }

  try {
    const { rows } = await run(
      'SELECT id, name, email, city, photo_url, birth_date, bio, rating_avg, rating_count, verified, is_banned, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: rows[0], auth: { user_id: rows[0].id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

app.get('/users/me', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  res.json(user);
});

app.get('/users/:id', async (req, res) => {
  const { rows } = await run(
    `SELECT id, name, email, city, photo_url, birth_date, bio, rating_avg, rating_count, verified, is_banned, created_at
     FROM users
     WHERE id = $1`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json(rows[0]);
});

app.patch('/users/me', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const fields = [];
  const values = [];
  const allowed = ['name', 'city', 'photo_url', 'birth_date', 'bio'];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      values.push(req.body[key]);
      fields.push(`${key} = $${values.length}`);
    }
  });

  if (!fields.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
  values.push(user.id);

  try {
    const { rows } = await run(sql, values);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar usuario' });
  }
});

app.get('/users/me/stats', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  try {
    const [{ rows: plansCreated }, { rows: plansJoined }, { rows: reviews }, { rows: reports }] = await Promise.all([
      run(`SELECT COUNT(*)::int AS count FROM plans WHERE creator_id = $1`, [user.id]),
      run(
        `SELECT COUNT(*)::int AS count
         FROM plan_participants
         WHERE user_id = $1 AND status IN ('accepted', 'attended')`,
        [user.id]
      ),
      run(
        `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg
         FROM reviews
         WHERE reviewed_user_id = $1`,
        [user.id]
      ),
      run(
        `SELECT COUNT(*)::int AS count
         FROM reports
         WHERE reported_user_id = $1 AND status = 'open'`,
        [user.id]
      ),
    ]);

    res.json({
      user_id: user.id,
      plans_created: plansCreated[0].count,
      plans_joined: plansJoined[0].count,
      reviews_received: reviews[0].count,
      avg_review: Number(reviews[0].avg || 0).toFixed(2),
      open_reports: reports[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener estadísticas' });
  }
});

app.put('/users/me/interests', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const interests = Array.isArray(req.body?.interests) ? req.body.interests : [];

  try {
    await run('DELETE FROM user_interests WHERE user_id = $1', [user.id]);

    if (interests.length) {
      const values = [];
      const placeholders = interests
        .map((interest) => {
          values.push(user.id);
          values.push(String(interest));
          const i = values.length;
          const j = values.length - 1;
          return `($${i - 1}, $${j + 1})`;
        })
        .join(', ');

      await run(`INSERT INTO user_interests (user_id, interest_key) VALUES ${placeholders}`, values);
    }

    const { rows } = await run('SELECT interest_key FROM user_interests WHERE user_id = $1 ORDER BY interest_key', [user.id]);
    res.json({ user_id: user.id, interests: rows.map((r) => r.interest_key) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron guardar intereses' });
  }
});

app.get('/users/me/interests', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { rows } = await run('SELECT interest_key FROM user_interests WHERE user_id = $1 ORDER BY interest_key', [user.id]);
  res.json(rows.map((r) => r.interest_key));
});

// Catálogo y búsqueda
app.get('/plans/categories', async (_req, res) => {
  try {
    const { rows } = await run('SELECT code, label FROM plan_categories ORDER BY label ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener categorías' });
  }
});

app.get('/plans', async (req, res) => {
  const limit = parseLimit(req.query.limit, 50, 100);
  const offset = Math.max(0, asNumber(req.query.offset, 0));
  const status = req.query.status || 'active';

  try {
    const { rows } = await run(
      `SELECT p.id AS plan_id, p.title, p.description, p.category_code, p.start_at, p.max_people, p.status, p.visibility,
              p.place_name, ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude,
              COALESCE(cnt.count, 0) AS participants_count, u.name AS creator_name
       FROM plans p
       JOIN users u ON u.id = p.creator_id
       LEFT JOIN (
         SELECT plan_id, COUNT(*)::int AS count
         FROM plan_participants
         WHERE status IN ('accepted', 'attended')
         GROUP BY plan_id
       ) cnt ON cnt.plan_id = p.id
       WHERE p.status = $1
       ORDER BY p.start_at ASC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron listar planes' });
  }
});

app.get('/plans/nearby', async (req, res) => {
  const userId = parseUserId(req);
  const lat = asNumber(req.query.lat, null);
  const lng = asNumber(req.query.lng, null);
  const radiusMeters = asNumber(req.query.radius_meters, 3000);
  const category = req.query.category || null;
  const maxHours = req.query.max_hours ? asNumber(req.query.max_hours, null) : null;

  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'lat y lng obligatorios' });
  }

  try {
    const { rows } = await run('SELECT * FROM nearby_plans($1, $2, $3, $4, $5)', [lat, lng, radiusMeters, category, maxHours]);

    const planIds = rows.map((plan) => plan.plan_id);
    let myParticipation = {};
    let participantsCount = {};

    if (planIds.length) {
      const [{ rows: countsRows }, { rows: participantRows }] = await Promise.all([
        run(
          `SELECT plan_id, COUNT(*)::int AS accepted_count
           FROM plan_participants
           WHERE plan_id = ANY($1::uuid[]) AND status IN ('accepted', 'attended')
           GROUP BY plan_id`,
          [planIds]
        ),
        userId
          ? run(
              'SELECT plan_id, status FROM plan_participants WHERE plan_id = ANY($1::uuid[]) AND user_id = $2',
              [planIds, userId]
            )
          : Promise.resolve({ rows: [] }),
      ]);

      participantsCount = Object.fromEntries(countsRows.map((r) => [r.plan_id, Number(r.accepted_count || 0)]));
      myParticipation = Object.fromEntries(participantRows.map((r) => [r.plan_id, r.status]));
    }

    const enriched = rows.map((plan) => ({
      ...plan,
      participants_count: participantsCount[plan.plan_id] || 0,
      my_status: myParticipation[plan.plan_id] || 'none',
      can_join: !userId ? false : plan.status !== 'completed' && plan.status !== 'cancelled',
      start_at_iso: plan.start_at,
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error buscando planes' });
  }
});

app.get('/plans/:id', async (req, res) => {
  try {
    const plan = await getPlan(req, res);
    if (!plan) return;

    const [participantRows, countsRows, messageRows] = await Promise.all([
      run(
        `SELECT pp.user_id, pp.role, pp.status, pp.joined_at, u.name
         FROM plan_participants pp
         JOIN users u ON u.id = pp.user_id
         WHERE pp.plan_id = $1
         ORDER BY pp.joined_at DESC`,
        [plan.id]
      ),
      run(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('accepted', 'attended'))::int AS accepted_count,
           COUNT(*) FILTER (WHERE status = 'attended')::int AS attended_count,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count
         FROM plan_participants
         WHERE plan_id = $1`,
        [plan.id]
      ),
      run(
        `SELECT COUNT(*)::int AS count
         FROM messages
         WHERE plan_id = $1 AND is_deleted = FALSE`,
        [plan.id]
      ),
    ]);

    const stats = countsRows[0] || { accepted_count: 0, attended_count: 0, pending_count: 0 };
    plan.participants = participantRows;
    plan.metrics = {
      accepted_count: Number(stats.accepted_count || 0),
      attended_count: Number(stats.attended_count || 0),
      pending_count: Number(stats.pending_count || 0),
      message_count: Number(messageRows[0]?.count || 0),
    };

    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el plan' });
  }
});

app.post('/plans', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const {
    category,
    title,
    description,
    latitude,
    longitude,
    place_name,
    start_at,
    max_people,
    visibility = 'public',
    approval_required = false,
    rules,
  } = req.body || {};

  if (!category || !title || !description || latitude === undefined || longitude === undefined || !start_at || !max_people) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const parsedDate = asDate(start_at);
  if (!parsedDate) {
    return res.status(400).json({ error: 'start_at inválido' });
  }

  const people = Math.floor(asNumber(max_people, 1));
  if (!people || people < 2) {
    return res.status(400).json({ error: 'max_people debe ser mayor que 1' });
  }

  try {
    const { rows } = await run(
      `INSERT INTO plans
       (creator_id, category_code, title, description, location, place_name, start_at, max_people, visibility, approval_required, rules)
       VALUES
       ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5, $6),4326)::geography,$7,$8,$9,$10,$11)
       RETURNING id, creator_id, category_code, title, description, place_name, start_at, max_people, status, visibility, approval_required, rules, created_at, updated_at;`,
      [
        user.id,
        category,
        title,
        description,
        asNumber(longitude, 0),
        asNumber(latitude, 0),
        place_name || null,
        parsedDate,
        people,
        visibility,
        Boolean(approval_required),
        rules || null,
      ]
    );

    const plan = rows[0];
    await run(
      `INSERT INTO plan_participants (plan_id, user_id, role, status)
       VALUES ($1, $2, 'host', 'accepted')
       ON CONFLICT (plan_id, user_id) DO NOTHING`,
      [plan.id, user.id]
    );

    io.emit('PLAN_CREATED', plan);
    await emitNotification({
      userId: user.id,
      type: 'new_plan_nearby',
      title: 'Plan publicado',
      body: `Has creado "${plan.title}"`,
      payload: { plan_id: plan.id },
    });

    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    if (String(err.message).includes('plan_categories_code_fkey')) {
      return res.status(400).json({ error: 'La categoría indicada no existe' });
    }
    res.status(500).json({ error: 'No se pudo crear el plan' });
  }
});

app.patch('/plans/:id', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const plan = await getPlan(req, res);
  if (!plan) return;

  if (plan.creator_id !== user.id) {
    return res.status(403).json({ error: 'Solo el creador puede editar el plan' });
  }

  const fields = [];
  const values = [];
  const allowed = ['title', 'description', 'place_name', 'start_at', 'max_people', 'status', 'visibility', 'approval_required', 'rules'];

  allowed.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) return;
    const value = req.body[key];

    if (key === 'start_at') {
      const parsed = asDate(value);
      if (!parsed) return;
      values.push(parsed);
      fields.push(`${key} = $${values.length}`);
      return;
    }

    if (key === 'max_people') {
      const parsed = Math.floor(asNumber(value, plan.max_people));
      if (parsed < 1) return;
      values.push(parsed);
      fields.push(`${key} = $${values.length}`);
      return;
    }

    values.push(value);
    fields.push(`${key} = $${values.length}`);
  });

  if (!fields.length) {
    return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
  }

  const sql = `UPDATE plans SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING *`;
  values.push(plan.id);

  try {
    const { rows } = await run(sql, values);
    const updated = rows[0];
    io.emit('PLAN_UPDATED', { plan_id: updated.id, updates: req.body || {} });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el plan' });
  }
});

app.post('/plans/:id/cancel', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const plan = await getPlan(req, res);
  if (!plan) return;

  if (plan.creator_id !== user.id) {
    return res.status(403).json({ error: 'Solo el creador puede cancelar el plan' });
  }

  try {
    const { rows } = await run(
      `UPDATE plans SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [plan.id]
    );

    await run(
      `UPDATE plan_participants
       SET status = CASE WHEN status = 'accepted' THEN 'cancelled' ELSE status END,
           cancelled_at = CASE WHEN status = 'accepted' THEN NOW() ELSE cancelled_at END
       WHERE plan_id = $1`,
      [plan.id]
    );

    const updated = rows[0];
    io.emit('PLAN_CANCELLED', { plan_id: plan.id });
    await emitNotification({
      userId: user.id,
      type: 'plan_cancelled',
      title: 'Plan cancelado',
      body: `Has cancelado "${plan.title}"`,
      payload: { plan_id: plan.id },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo cancelar el plan' });
  }
});

app.post('/plans/:id/finish', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const plan = await getPlan(req, res);
  if (!plan) return;

  if (plan.creator_id !== user.id) {
    return res.status(403).json({ error: 'Solo el creador puede finalizar el plan' });
  }

  try {
    const { rows } = await run(
      `UPDATE plans SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [plan.id]
    );

    io.emit('PLAN_COMPLETED', { plan_id: plan.id });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo finalizar el plan' });
  }
});

app.get('/plans/:id/participants', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  try {
    const [{ rows: planRows }, { rows: participants }] = await Promise.all([
      run('SELECT creator_id FROM plans WHERE id = $1', [req.params.id]),
      run(
        `SELECT pp.id, pp.user_id, pp.role, pp.status, pp.joined_at, pp.checked_in_at, u.name, u.photo_url
         FROM plan_participants pp
         JOIN users u ON u.id = pp.user_id
         WHERE pp.plan_id = $1
         ORDER BY pp.joined_at DESC`,
        [req.params.id]
      ),
    ]);

    if (!planRows.length) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    res.json(participants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar participantes' });
  }
});

app.post('/plans/:id/join', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  try {
    const { rows: planRows } = await run('SELECT * FROM plans WHERE id = $1', [req.params.id]);
    if (!planRows.length) return res.status(404).json({ error: 'Plan no encontrado' });
    const targetPlan = planRows[0];

    if (targetPlan.status === 'completed' || targetPlan.status === 'cancelled') {
      return res.status(409).json({ error: 'No se puede unir a un plan cerrado' });
    }

    const { rows: existingRows } = await run(
      'SELECT id, status FROM plan_participants WHERE plan_id = $1 AND user_id = $2',
      [targetPlan.id, user.id]
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      if (existing.status === 'cancelled') {
        // permite volver a solicitar
      } else {
        return res.status(409).json({ error: 'Ya tienes una participación activa en este plan', status: existing.status });
      }
    }

    const { rows: currentRows } = await run(
      `SELECT COUNT(*)::int AS count FROM plan_participants
       WHERE plan_id = $1 AND status IN ('accepted', 'attended')`,
      [targetPlan.id]
    );

    const isFull = Number(currentRows[0].count || 0) >= targetPlan.max_people;

    let status = 'accepted';
    let message = 'Te has unido al plan';

    if (targetPlan.visibility === 'private' || targetPlan.approval_required) {
      status = 'pending';
      message = 'Solicitud enviada, pendiente de aprobación';
    } else if (isFull) {
      return res.status(409).json({ error: 'Plan completo' });
    }

    const { rows } = await run(
      `INSERT INTO plan_participants (plan_id, user_id, role, status)
       VALUES ($1, $2, 'participant', $3)
       ON CONFLICT (plan_id, user_id)
       DO UPDATE SET role = EXCLUDED.role,
                     status = EXCLUDED.status,
                     joined_at = NOW(),
                     cancelled_at = NULL,
                     updated_at = NOW()
       RETURNING id, plan_id, user_id, role, status, joined_at;`,
      [targetPlan.id, user.id, status]
    );

    if (status === 'accepted' && !isFull && Number(currentRows[0].count || 0) + 1 >= targetPlan.max_people) {
      await run("UPDATE plans SET status = 'full' WHERE id = $1", [targetPlan.id]);
    } else if (status === 'accepted' && targetPlan.status !== 'in_progress') {
      await run("UPDATE plans SET status = 'active' WHERE id = $1", [targetPlan.id]);
    }

    if (status === 'pending') {
      await emitNotification({
        userId: targetPlan.creator_id,
        type: 'new_participant',
        title: 'Solicitud de plan',
        body: `${user.name} quiere unirse a ${targetPlan.title}`,
        payload: { plan_id: targetPlan.id, user_id: user.id },
      });
    } else {
      io.to(socketRoomForPlan(targetPlan.id)).emit('USER_JOINED_PLAN', rows[0]);
      await emitNotification({
        userId: targetPlan.creator_id,
        type: 'new_participant',
        title: 'Nuevo participante',
        body: `${user.name} se unió a ${targetPlan.title}`,
        payload: { plan_id: targetPlan.id, user_id: user.id },
      });
    }

    res.status(status === 'pending' ? 202 : 201).json({ ...rows[0], message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo unir al plan' });
  }
});

app.post('/plans/:id/leave', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  try {
    const plan = await getPlan(req, res);
    if (!plan) return;

    if (plan.creator_id === user.id && plan.status === 'active') {
      return res.status(409).json({ error: 'El anfitrión no puede abandonar un plan activo; cancélalo si es necesario.' });
    }

    const { rows } = await run(
      `UPDATE plan_participants
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE plan_id = $1 AND user_id = $2
       RETURNING id, plan_id, user_id, status`,
      [plan.id, user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'No estabas unido a este plan' });

    io.to(socketRoomForPlan(plan.id)).emit('USER_LEFT_PLAN', rows[0]);

    await run("UPDATE plans SET status = CASE WHEN status = 'full' THEN 'active' ELSE status END WHERE id = $1", [plan.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo abandonar el plan' });
  }
});

app.post('/plans/:id/approve', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { participant_id } = req.body || {};
  if (!participant_id) return res.status(400).json({ error: 'participant_id obligatorio' });

  try {
    const plan = await getPlan(req, res);
    if (!plan) return;
    if (plan.creator_id !== user.id) return res.status(403).json({ error: 'Solo el anfitrión puede aprobar' });

    const { rows } = await run(
      `UPDATE plan_participants
       SET status = 'accepted', updated_at = NOW()
       WHERE plan_id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING *`,
      [plan.id, participant_id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });

    io.to(socketRoomForPlan(plan.id)).emit('USER_JOINED_PLAN', rows[0]);
    await emitNotification({
      userId: participant_id,
      type: 'review_request',
      title: 'Solicitud aprobada',
      body: `Has sido aprobado para ${plan.title}`,
      payload: { plan_id: plan.id },
    });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo aprobar participación' });
  }
});

app.post('/plans/:id/reject', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { participant_id } = req.body || {};
  if (!participant_id) return res.status(400).json({ error: 'participant_id obligatorio' });

  try {
    const plan = await getPlan(req, res);
    if (!plan) return;
    if (plan.creator_id !== user.id) return res.status(403).json({ error: 'Solo el anfitrión puede rechazar' });

    const { rows } = await run(
      `UPDATE plan_participants
       SET status = 'rejected', updated_at = NOW()
       WHERE plan_id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING *`,
      [plan.id, participant_id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo rechazar participación' });
  }
});

app.post('/plans/:id/checkin', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const targetUserId = req.body?.user_id || user.id;

  try {
    const plan = await getPlan(req, res);
    if (!plan) return;
    if (plan.creator_id !== user.id && targetUserId !== user.id) {
      return res.status(403).json({ error: 'Solo el anfitrión puede marcar asistencia de otros' });
    }

    const { rows } = await run(
      `UPDATE plan_participants
       SET status = 'attended', checked_in_at = NOW(), updated_at = NOW()
       WHERE plan_id = $1 AND user_id = $2
       RETURNING *`,
      [plan.id, targetUserId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Participante no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo hacer check-in' });
  }
});

app.get('/plans/:id/messages', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const access = await run(
    `SELECT 1 FROM plan_participants
     WHERE plan_id = $1 AND user_id = $2 AND status IN ('accepted', 'attended')`,
    [req.params.id, user.id]
  );

  if (!access.rows.length) return res.status(403).json({ error: 'No autorizado para este chat' });

  try {
    const { rows } = await run(
      `SELECT m.id, m.user_id, u.name AS user_name, m.message, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.plan_id = $1 AND m.is_deleted = FALSE
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener mensajes' });
  }
});

app.post('/plans/:id/messages', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const message = req.body?.message;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message obligatorio' });

  const access = await run(
    `SELECT 1 FROM plan_participants
     WHERE plan_id = $1 AND user_id = $2 AND status IN ('accepted', 'attended')`,
    [req.params.id, user.id]
  );
  if (!access.rows.length) return res.status(403).json({ error: 'No autorizado para escribir en este chat' });

  try {
    const { rows } = await run(
      `INSERT INTO messages (plan_id, user_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, plan_id, user_id, message, created_at`,
      [req.params.id, user.id, message.trim()]
    );

    io.to(socketRoomForPlan(req.params.id)).emit('PLAN_MESSAGE', { ...rows[0], user_name: user.name });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo enviar mensaje' });
  }
});

app.get('/plans/:id/reviews', async (req, res) => {
  try {
    const { rows } = await run(
      `SELECT r.id, r.plan_id, r.reviewer_id, u.name AS reviewer_name, r.reviewed_user_id, v.name AS reviewed_name,
              r.rating, r.comment, r.created_at
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN users v ON v.id = r.reviewed_user_id
       WHERE r.plan_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener valoraciones' });
  }
});

app.post('/plans/:id/reviews', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { reviewed_user_id, rating, comment } = req.body || {};
  if (!reviewed_user_id || !rating) return res.status(400).json({ error: 'reviewed_user_id y rating obligatorios' });

  const value = asNumber(rating, 0);
  if (!value || value < 1 || value > 5) return res.status(400).json({ error: 'rating debe estar entre 1 y 5' });

  try {
    const plan = await getPlan(req, res);
    if (!plan) return;

    const { rows: allowedRows } = await run(
      `SELECT 1 FROM plan_participants
       WHERE plan_id = $1 AND user_id = $2 AND status IN ('accepted', 'attended')`,
      [plan.id, user.id]
    );

    if (!allowedRows.length) {
      return res.status(403).json({ error: 'Solo asistentes pueden valorar en este plan' });
    }

    if (reviewed_user_id === user.id) {
      return res.status(400).json({ error: 'No puedes valorarte a ti mismo' });
    }

    const { rows } = await run(
      `INSERT INTO reviews (plan_id, reviewer_id, reviewed_user_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [plan.id, user.id, reviewed_user_id, value, comment || null]
    );

    await run(
      `UPDATE users
       SET rating_avg = (
         SELECT COALESCE(AVG(rating)::numeric(3,2), 0)
         FROM reviews
         WHERE reviewed_user_id = $1
       ),
       rating_count = (
         SELECT COUNT(*)::int
         FROM reviews
         WHERE reviewed_user_id = $1
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [reviewed_user_id]
    );

    io.emit('REVIEW_SUBMITTED', rows[0]);
    await emitNotification({
      userId: reviewed_user_id,
      type: 'review_request',
      title: 'Nueva valoración',
      body: `Recibiste una valoración en ${plan.title}`,
      payload: { plan_id: plan.id },
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (String(err.message).includes('duplicate key value')) {
      return res.status(409).json({ error: 'Ya valoraste a este usuario en este plan' });
    }
    res.status(500).json({ error: 'No se pudo guardar valoración' });
  }
});

app.post('/reports', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { reported_user_id, reported_plan_id, reason, description } = req.body || {};
  if (!reason || (!reported_user_id && !reported_plan_id)) {
    return res.status(400).json({ error: 'reason y target (usuario o plan) obligatorios' });
  }

  try {
    const { rows } = await run(
      `INSERT INTO reports (reporter_id, reported_user_id, reported_plan_id, reason, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, reporter_id, reported_user_id, reported_plan_id, reason, description, status, created_at`,
      [user.id, reported_user_id || null, reported_plan_id || null, reason, description || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear reporte' });
  }
});

app.get('/admin/plans', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const limit = parseLimit(req.query.limit, 50, 200);
  const status = req.query.status || null;
  const where = status ? 'WHERE p.status = $1' : '';

  try {
    const queryText = `
      SELECT p.id AS plan_id, p.title, p.category_code, p.status, p.visibility,
             p.start_at, p.max_people, p.created_at,
             u.name AS creator_name,
             COALESCE(cnt.count, 0) AS participants_count
      FROM plans p
      JOIN users u ON u.id = p.creator_id
      LEFT JOIN (
        SELECT plan_id, COUNT(*)::int AS count
        FROM plan_participants
        WHERE status IN ('accepted', 'attended')
        GROUP BY plan_id
      ) cnt ON cnt.plan_id = p.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;

    const { rows } = status
      ? await run(queryText, [status])
      : await run(queryText);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron listar planes' });
  }
});

app.get('/admin/reports', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const status = req.query.status || null;
  const limit = parseLimit(req.query.limit, 100, 200);

  try {
    const query = `
      SELECT r.id, r.reason, r.description, r.status, r.created_at,
             ru.name AS reporter_name, pu.name AS reported_user_name, p.title AS reported_plan_title
      FROM reports r
      LEFT JOIN users ru ON ru.id = r.reporter_id
      LEFT JOIN users pu ON pu.id = r.reported_user_id
      LEFT JOIN plans p ON p.id = r.reported_plan_id
      ${status ? 'WHERE r.status = $1' : ''}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;

    const { rows } = status
      ? await run(query, [status])
      : await run(query);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron listar reportes' });
  }
});

app.patch('/admin/reports/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status obligatorio' });

  try {
    const { rows } = await run('UPDATE reports SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar reporte' });
  }
});

app.post('/admin/users/:id/ban', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { rows } = await run(
      'UPDATE users SET is_banned = TRUE WHERE id = $1 RETURNING id, name, email, is_banned',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo bloquear usuario' });
  }
});

app.post('/admin/users/:id/unban', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { rows } = await run(
      'UPDATE users SET is_banned = FALSE WHERE id = $1 RETURNING id, name, email, is_banned',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo desbloquear usuario' });
  }
});

app.get('/admin/metrics', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const queries = [
      run("SELECT COUNT(*)::int AS value FROM users"),
      run("SELECT COUNT(*)::int AS value FROM plans"),
      run("SELECT COUNT(*)::int AS value FROM plans WHERE status = 'active'"),
      run("SELECT COUNT(*)::int AS value FROM plan_participants WHERE status IN ('accepted', 'attended')"),
      run("SELECT COUNT(*)::int AS value FROM reviews"),
      run("SELECT COUNT(*)::int AS value FROM plans WHERE status = 'completed'"),
      run("SELECT COUNT(*)::int AS value FROM reports WHERE status = 'open'"),
    ];

    const [users, plans, activePlans, participants, reviews, completedPlans, openReports] = await Promise.all(queries);

    res.json({
      users: users[0].rows[0].value,
      plans: plans[0].rows[0].value,
      active_plans: activePlans[0].rows[0].value,
      participant_records: participants[0].rows[0].value,
      reviews: reviews[0].rows[0].value,
      completed_plans: completedPlans[0].rows[0].value,
      open_reports: openReports[0].rows[0].value,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener métricas' });
  }
});

app.get('/notifications', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const limit = parseLimit(req.query.limit, 50, 100);

  try {
    const { rows } = await run(
      `SELECT *
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [user.id, limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener notificaciones' });
  }
});

app.patch('/notifications/:id/read', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  try {
    const { rows } = await run(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo marcar como leída' });
  }
});

app.post('/notifications/push-token', async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const { push_token, platform = 'unknown' } = req.body || {};
  if (!push_token) return res.status(400).json({ error: 'push_token obligatorio' });

  try {
    const { rows } = await run(
      `INSERT INTO user_devices (user_id, platform, push_token)
       VALUES ($1, $2::device_platform, $3)
       ON CONFLICT (platform, push_token)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
       RETURNING *`,
      [user.id, platform, push_token]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar token' });
  }
});

// Sockets y rooms
io.on('connection', (socket) => {
  socket.on('identify', (userId) => {
    if (userId) socket.join(socketRoomForUser(userId));
  });

  socket.on('join_plan_room', (planId) => {
    if (planId) socket.join(socketRoomForPlan(planId));
  });

  socket.on('leave_plan_room', (planId) => {
    if (planId) socket.leave(socketRoomForPlan(planId));
  });
});

server.listen(PORT, () => {
  console.log(`API social plans running on port ${PORT}`);
});

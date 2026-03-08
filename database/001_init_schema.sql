CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_status') THEN
    CREATE TYPE plan_status AS ENUM ('draft', 'active', 'full', 'in_progress', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_visibility') THEN
    CREATE TYPE plan_visibility AS ENUM ('public', 'private');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_status') THEN
    CREATE TYPE participant_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'attended', 'no_show');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_role') THEN
    CREATE TYPE participant_role AS ENUM ('host', 'participant');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('open', 'in_review', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'new_participant',
      'plan_starting_soon',
      'plan_updated',
      'new_plan_nearby',
      'plan_cancelled',
      'review_request'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_platform') THEN
    CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web', 'unknown');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  photo_url TEXT,
  birth_date DATE,
  city TEXT,
  bio TEXT,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_interests (
  id BIGSERIAL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, interest_key)
);

CREATE TABLE IF NOT EXISTS plan_categories (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES plan_categories(code) ON UPDATE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  place_name TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  max_people INTEGER NOT NULL CHECK (max_people > 0),
  status plan_status NOT NULL DEFAULT 'active',
  visibility plan_visibility NOT NULL DEFAULT 'public',
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  rules TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_participants (
  id BIGSERIAL PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role participant_role NOT NULL DEFAULT 'participant',
  status participant_status NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewer_id <> reviewed_user_id),
  UNIQUE (plan_id, reviewer_id, reviewed_user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_target_chk CHECK (reported_user_id IS NOT NULL OR reported_plan_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_devices (
  id BIGSERIAL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform device_platform NOT NULL,
  push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, push_token)
);

CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_visibility ON plans(visibility);
CREATE INDEX IF NOT EXISTS idx_plans_start_at ON plans(start_at);
CREATE INDEX IF NOT EXISTS idx_plans_creator ON plans(creator_id);
CREATE INDEX IF NOT EXISTS idx_plans_location ON plans USING gist (location);
CREATE INDEX IF NOT EXISTS idx_plans_category ON plans(category_code);
CREATE INDEX IF NOT EXISTS idx_plan_participants_plan ON plan_participants(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_participants_user ON plan_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_plan_created_at ON messages(plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_plan ON reviews(plan_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_user ON reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_plans_updated_at ON plans;
CREATE TRIGGER trg_plans_updated_at
BEFORE UPDATE ON plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_plan_participants_updated_at ON plan_participants;
CREATE TRIGGER trg_plan_participants_updated_at
BEFORE UPDATE ON plan_participants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_devices_updated_at ON user_devices;
CREATE TRIGGER trg_user_devices_updated_at
BEFORE UPDATE ON user_devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO plan_categories (code, label)
VALUES
  ('cafe', 'Café'),
  ('walk', 'Paseo'),
  ('terrace', 'Terraceo'),
  ('running', 'Running'),
  ('sports', 'Fútbol o pádel'),
  ('study', 'Estudiar'),
  ('coworking', 'Coworking'),
  ('gaming', 'Gaming'),
  ('languages', 'Idiomas'),
  ('music_event', 'Fiesta o concierto')
ON CONFLICT (code) DO NOTHING;

DROP MATERIALIZED VIEW IF EXISTS mv_plan_stats;
CREATE MATERIALIZED VIEW mv_plan_stats AS
SELECT
  p.id AS plan_id,
  p.title,
  p.status,
  COUNT(DISTINCT pp.user_id) FILTER (WHERE pp.status IN ('accepted', 'attended')) AS joined_accepted_count,
  COUNT(DISTINCT pp.user_id) FILTER (WHERE pp.status = 'attended') AS attended_count,
  COUNT(DISTINCT m.id) AS message_count
FROM plans p
LEFT JOIN plan_participants pp ON pp.plan_id = p.id
LEFT JOIN messages m ON m.plan_id = p.id
GROUP BY p.id, p.title, p.status;

DROP VIEW IF EXISTS nearby_plans_view;
CREATE VIEW nearby_plans_view AS
SELECT
  p.id,
  p.title,
  p.description,
  p.category_code,
  p.start_at,
  p.max_people,
  p.status,
  p.visibility,
  p.place_name,
  p.location,
  ST_Y(location::geometry) AS latitude,
  ST_X(location::geometry) AS longitude,
  p.created_at,
  p.updated_at
FROM plans p;

CREATE OR REPLACE FUNCTION nearby_plans(
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 3000,
  category_filter TEXT DEFAULT NULL,
  max_hours INTEGER DEFAULT NULL
)
RETURNS TABLE (
  plan_id uuid,
  title TEXT,
  description TEXT,
  category_code TEXT,
  start_at TIMESTAMPTZ,
  max_people INTEGER,
  status plan_status,
  place_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.description,
    p.category_code,
    p.start_at,
    p.max_people,
    p.status,
    p.place_name,
    ST_Y(p.location::geometry) AS latitude,
    ST_X(p.location::geometry) AS longitude,
    ST_Distance(p.location, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) AS distance_meters
  FROM plans p
  WHERE p.status IN ('active', 'full', 'in_progress')
    AND p.visibility = 'public'
    AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
      radius_meters
    )
    AND (category_filter IS NULL OR p.category_code = category_filter)
    AND (
      max_hours IS NULL
      OR p.start_at <= NOW() + (max_hours || ' hours')::interval
    )
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql STABLE;

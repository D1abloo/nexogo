#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-${SUPABASE_DB_ADMIN_URL:-}}"

if [[ -z "${DB_URL}" ]]; then
  echo "Falta DATABASE_URL o SUPABASE_DB_ADMIN_URL con credenciales de administración."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql no está instalado."
  exit 1
fi

read -r -p "Nombre del usuario readonly: " RO_USER
if [[ -z "${RO_USER}" ]]; then
  echo "El nombre de usuario es obligatorio."
  exit 1
fi

read -r -s -p "Contraseña del usuario readonly: " RO_PASS
echo
if [[ -z "${RO_PASS}" ]]; then
  echo "La contraseña es obligatoria."
  exit 1
fi

psql "${DB_URL}" \
  -v ON_ERROR_STOP=1 \
  --set readonly_user="${RO_USER}" \
  --set readonly_pass="${RO_PASS}" <<'SQL'
DO $$
DECLARE
  role_name text := :'readonly_user';
  role_pass text := :'readonly_pass';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT BYPASSRLS',
      role_name,
      role_pass
    );
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L BYPASSRLS', role_name, role_pass);
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO :"readonly_user";
GRANT USAGE ON SCHEMA public TO :"readonly_user";
GRANT USAGE ON SCHEMA auth TO :"readonly_user";
GRANT USAGE ON SCHEMA storage TO :"readonly_user";

GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"readonly_user";
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO :"readonly_user";
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO :"readonly_user";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO :"readonly_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO :"readonly_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO :"readonly_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO :"readonly_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT ON TABLES TO :"readonly_user";
SQL

echo "Usuario readonly creado o actualizado: ${RO_USER}"
echo "Acceso: lectura completa con BYPASSRLS. Usa este usuario solo para consulta y auditoría."

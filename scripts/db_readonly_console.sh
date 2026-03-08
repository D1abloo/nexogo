#!/usr/bin/env bash
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql no está instalado."
  exit 1
fi

declare -a PSQL_ARGS=()

prompt_default() {
  local prompt="$1"
  local default_value="${2:-}"
  local value
  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " value
    echo "${value:-${default_value}}"
  else
    read -r -p "${prompt}: " value
    echo "${value}"
  fi
}

setup_connection() {
  local mode host port database user password url

  echo
  echo "=============================="
  echo " Acceso BBDD · Solo lectura"
  echo "=============================="
  echo "1) Usar READONLY_DATABASE_URL / DATABASE_URL"
  echo "2) Pegar cadena PostgreSQL"
  echo "3) Introducir host, puerto, base, usuario y contraseña"
  echo
  read -r -p "Modo de acceso: " mode

  case "${mode}" in
    1)
      url="${READONLY_DATABASE_URL:-${DATABASE_URL:-}}"
      if [[ -z "${url}" ]]; then
        echo "Falta READONLY_DATABASE_URL o DATABASE_URL."
        exit 1
      fi
      PSQL_ARGS=("${url}")
      ;;
    2)
      read -r -p "Pega la cadena PostgreSQL: " url
      [[ -z "${url}" ]] && { echo "Cadena vacía."; exit 1; }
      PSQL_ARGS=("${url}")
      ;;
    3)
      host="$(prompt_default "Host" "aws-1-eu-west-1.pooler.supabase.com")"
      port="$(prompt_default "Puerto" "6543")"
      database="$(prompt_default "Base de datos" "postgres")"
      user="$(prompt_default "Usuario" "postgres")"
      read -r -s -p "Contraseña: " password
      echo
      export PGHOST="${host}" PGPORT="${port}" PGDATABASE="${database}" PGUSER="${user}" PGPASSWORD="${password}"
      PSQL_ARGS=()
      ;;
    *)
      echo "Modo no válido."
      exit 1
      ;;
  esac
}

run_query() {
  local sql="$1"
  PAGER=cat psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -P pager=off -c "${sql}"
}

test_connection() {
  run_query "select current_database() as db, current_user as usuario, now() as fecha;" >/dev/null
}

run_custom_select() {
  local sql
  echo "Escribe una consulta de solo lectura (SELECT / WITH / EXPLAIN):"
  read -r sql
  if [[ ! "${sql}" =~ ^[[:space:]]*(SELECT|WITH|EXPLAIN)[[:space:]] ]]; then
    echo "Solo se permiten consultas de lectura."
    return
  fi
  run_query "${sql}"
}

setup_connection
test_connection

while true; do
  cat <<'MENU'

=========================================
 Consola BBDD · Solo lectura · NexoGo
=========================================
1) Resumen ejecutivo
2) Estado de conexión
3) Usuarios y roles
4) Suscripciones activas y renovaciones
5) Salas recientes
6) Salas premium, privadas o con contraseña
7) Participantes por sala
8) Chat reciente y mensajes fijados
9) Solicitudes invitadas
10) Reportes abiertos
11) Actividad registrada
12) Notas internas admin
13) Presencia y usuarios online
14) Ejecutar consulta SELECT personalizada
0) Salir
MENU

  read -r -p "Elige una opción: " option

  case "${option}" in
    1) run_query "select (select count(*) from public.users) as usuarios, (select count(*) from public.plans where status <> 'cancelled') as salas_visibles, (select count(*) from public.user_subscriptions where tier <> 'free' and status='active') as premium_activas, (select count(*) from public.reports where status not in ('resolved','dismissed')) as reportes_abiertos, (select count(*) from public.guest_access_requests where status='pending') as invitaciones_pendientes;" ;;
    2) run_query "select current_database() as db, current_user as usuario, now() as fecha, version();" ;;
    3) run_query "select id, email, name, role, admin_access_level, city, country, is_banned, verified, created_at from public.users order by created_at desc limit 100;" ;;
    4) run_query "select s.user_id, u.email, s.tier, s.status, s.payment_method, s.auto_renew, s.cancel_at_period_end, s.never_expires, s.renewal_at from public.user_subscriptions s left join public.users u on u.id = s.user_id order by s.renewal_at nulls last, s.updated_at desc limit 100;" ;;
    5) run_query "select id, title, category_code, visibility, premium_room, featured_room, status, city, country, start_at, max_people from public.plans order by created_at desc limit 100;" ;;
    6) run_query "select id, title, visibility, premium_room, featured_room, access_password_hash is not null as tiene_password, city, start_at from public.plans where premium_room = true or visibility = 'private' or access_password_hash is not null order by created_at desc limit 100;" ;;
    7) run_query "select pp.plan_id, p.title, pp.user_id, u.email, pp.role, pp.status, pp.joined_at from public.plan_participants pp left join public.plans p on p.id = pp.plan_id left join public.users u on u.id = pp.user_id order by pp.joined_at desc limit 150;" ;;
    8) run_query "select m.id, m.plan_id, p.title, u.email, m.channel, m.is_pinned, left(m.message, 120) as preview, m.created_at from public.messages m left join public.plans p on p.id = m.plan_id left join public.users u on u.id = m.user_id order by m.created_at desc limit 150;" ;;
    9) run_query "select id, full_name, email, city, status, requested_at, approval_expires_at, used_at from public.guest_access_requests order by requested_at desc limit 100;" ;;
    10) run_query "select r.id, r.reason, r.status, reporter.email as reporter_email, reported.email as reported_user_email, p.title as sala, r.created_at from public.reports r left join public.users reporter on reporter.id = r.reporter_id left join public.users reported on reported.id = r.reported_user_id left join public.plans p on p.id = r.reported_plan_id where r.status not in ('resolved','dismissed') order by r.created_at desc limit 100;" ;;
    11) run_query "select id, action, entity_type, entity_id, created_at, details from public.audit_logs order by created_at desc limit 100;" ;;
    12) run_query "select n.id, author.email as autor, n.pinned, n.note, n.updated_at from public.admin_team_notes n left join public.users author on author.id = n.author_user_id order by n.pinned desc, n.updated_at desc limit 100;" ;;
    13) run_query "select p.user_id, u.email, p.status, p.last_seen, p.updated_at from public.user_presence p left join public.users u on u.id = p.user_id order by p.updated_at desc limit 100;" ;;
    14) run_custom_select ;;
    0) exit 0 ;;
    *) echo "Opción no válida." ;;
  esac
done

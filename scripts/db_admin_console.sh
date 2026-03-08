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

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

setup_connection() {
  local mode host port database user password url

  echo
  echo "====================================="
  echo " Acceso BBDD · Administración"
  echo "====================================="
  echo "1) Usar DATABASE_URL / SUPABASE_DB_ADMIN_URL"
  echo "2) Pegar cadena PostgreSQL"
  echo "3) Introducir host, puerto, base, usuario y contraseña"
  echo
  read -r -p "Modo de acceso: " mode

  case "${mode}" in
    1)
      url="${DATABASE_URL:-${SUPABASE_DB_ADMIN_URL:-}}"
      if [[ -z "${url}" ]]; then
        echo "Falta DATABASE_URL o SUPABASE_DB_ADMIN_URL."
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

confirm() {
  local prompt="$1"
  local answer
  read -r -p "${prompt} [y/N]: " answer
  [[ "${answer}" =~ ^[Yy]$ ]]
}

setup_connection
test_connection

while true; do
  cat <<'MENU'

========================================
 Consola BBDD · Administración · NexoGo
========================================
1) Resumen ejecutivo
2) Dar o cambiar acceso admin
3) Bloquear / desbloquear usuario
4) Asignar o actualizar suscripción
5) Marcar suscripción como nunca expira
6) Aprobar solicitud invitada
7) Rechazar solicitud invitada
8) Cerrar sala
9) Reabrir sala
10) Crear nota interna admin
11) Ver actividad registrada
12) Ejecutar SQL libre
0) Salir
MENU

  read -r -p "Elige una opción: " option

  case "${option}" in
    1)
      run_query "select (select count(*) from public.users) as usuarios, (select count(*) from public.plans) as salas, (select count(*) from public.user_subscriptions where tier <> 'free' and status='active') as premium_activas, (select count(*) from public.reports where status not in ('resolved','dismissed')) as reportes_abiertos, (select count(*) from public.guest_access_requests where status='pending') as invitaciones_pendientes;"
      ;;
    2)
      read -r -p "ID del usuario: " target_user
      read -r -p "Rol base (user/admin): " role_value
      read -r -p "Acceso panel (none/read/write/owner): " access_value
      target_user="$(sql_escape "${target_user}")"
      role_value="$(sql_escape "${role_value}")"
      access_value="$(sql_escape "${access_value}")"
      confirm "Aplicar cambios al usuario ${target_user}?" || continue
      run_query "update public.users set role='${role_value}', admin_access_level='${access_value}' where id='${target_user}';"
      ;;
    3)
      read -r -p "ID del usuario: " target_user
      read -r -p "Estado (true para bloquear / false para desbloquear): " ban_value
      target_user="$(sql_escape "${target_user}")"
      confirm "Actualizar bloqueo del usuario ${target_user}?" || continue
      run_query "update public.users set is_banned=${ban_value} where id='${target_user}';"
      ;;
    4)
      read -r -p "ID del usuario: " target_user
      read -r -p "Tier (free/plus/pro): " tier_value
      read -r -p "Estado (inactive/trial/active/past_due/cancelled): " status_value
      read -r -p "Método de pago (manual/paypal/stripe): " payment_method
      target_user="$(sql_escape "${target_user}")"
      tier_value="$(sql_escape "${tier_value}")"
      status_value="$(sql_escape "${status_value}")"
      payment_method="$(sql_escape "${payment_method}")"
      confirm "Guardar suscripción para ${target_user}?" || continue
      run_query "insert into public.user_subscriptions (user_id, tier, status, provider, payment_method, started_at, renewal_at, auto_renew, cancel_at_period_end, never_expires) values ('${target_user}', '${tier_value}', '${status_value}', 'admin_console', '${payment_method}', now(), case when '${tier_value}'='free' then null else now() + interval '30 days' end, case when '${tier_value}'='free' then false else true end, false, false) on conflict (user_id) do update set tier=excluded.tier, status=excluded.status, provider=excluded.provider, payment_method=excluded.payment_method, renewal_at=excluded.renewal_at, auto_renew=excluded.auto_renew, cancel_at_period_end=excluded.cancel_at_period_end;"
      ;;
    5)
      read -r -p "ID del usuario: " target_user
      read -r -p "Valor (true/false): " lifetime_value
      target_user="$(sql_escape "${target_user}")"
      confirm "Actualizar never_expires para ${target_user}?" || continue
      run_query "update public.user_subscriptions set never_expires=${lifetime_value}, auto_renew=case when ${lifetime_value} then true else auto_renew end, cancel_at_period_end=case when ${lifetime_value} then false else cancel_at_period_end end, renewal_at=case when ${lifetime_value} then null else renewal_at end where user_id='${target_user}';"
      ;;
    6)
      read -r -p "ID de la solicitud invitada: " request_id
      request_id="$(sql_escape "${request_id}")"
      confirm "Aprobar la solicitud ${request_id}?" || continue
      run_query "update public.guest_access_requests set status='approved', approved_at=now(), approval_expires_at=now() + interval '24 hours', updated_at=now() where id='${request_id}';"
      ;;
    7)
      read -r -p "ID de la solicitud invitada: " request_id
      request_id="$(sql_escape "${request_id}")"
      confirm "Rechazar la solicitud ${request_id}?" || continue
      run_query "update public.guest_access_requests set status='rejected', rejected_at=now(), approval_token_hash=null, approval_expires_at=null, approval_sent_at=null, updated_at=now() where id='${request_id}';"
      ;;
    8)
      read -r -p "ID de la sala: " plan_id
      plan_id="$(sql_escape "${plan_id}")"
      confirm "Cerrar la sala ${plan_id}?" || continue
      run_query "update public.plans set status='cancelled' where id='${plan_id}';"
      ;;
    9)
      read -r -p "ID de la sala: " plan_id
      plan_id="$(sql_escape "${plan_id}")"
      confirm "Reabrir la sala ${plan_id}?" || continue
      run_query "update public.plans set status='active' where id='${plan_id}';"
      ;;
    10)
      read -r -p "ID del admin autor: " author_id
      read -r -p "Texto de la nota: " note_text
      read -r -p "Fijada (true/false): " pinned_value
      author_id="$(sql_escape "${author_id}")"
      note_text="$(sql_escape "${note_text}")"
      confirm "Crear la nota interna?" || continue
      run_query "insert into public.admin_team_notes (author_user_id, note, pinned, updated_at) values ('${author_id}', '${note_text}', ${pinned_value}, now());"
      ;;
    11)
      run_query "select id, action, entity_type, entity_id, created_at, details from public.audit_logs order by created_at desc limit 100;"
      ;;
    12)
      echo "Escribe SQL libre. Termina con una línea que contenga solo ';'"
      custom_sql=""
      while IFS= read -r line; do
        [[ "${line}" == ";" ]] && break
        custom_sql+="${line}"$'\n'
      done
      [[ -z "${custom_sql}" ]] && continue
      confirm "Ejecutar SQL libre?" || continue
      run_query "${custom_sql}"
      ;;
    0) exit 0 ;;
    *) echo "Opción no válida." ;;
  esac
done

# Supabase + Hostinger

Este proyecto ya queda preparado en local para autenticacion con Supabase en `apps/admin/.env.local`.

## Variables locales

En local se usan:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

No metas `service_role` en el frontend ni en variables `NEXT_PUBLIC_*`.

## SQL a ejecutar en Supabase

Ejecuta, en este orden, desde el SQL Editor de Supabase:

1. [001_init_schema.sql](/home/isaac/Escritorio/App/database/001_init_schema.sql)
2. [002_supabase_auth_rls.sql](/home/isaac/Escritorio/App/database/002_supabase_auth_rls.sql)

## Marcar administrador

Despues de crear tu usuario:

```sql
update public.users
set role = 'admin'
where email = 'tu-correo@dominio.com';
```

## SMTP Hostinger

En `Supabase Dashboard -> Authentication -> SMTP Settings` configura:

- Host: `smtp.hostinger.com`
- Port: `465` con SSL o `587` con STARTTLS
- Username: tu correo completo de Hostinger
- Password: la contraseña del buzón
- Sender name: `QuedamosYa`
- Sender email: por ejemplo `noreply@tu-dominio.com`

## Produccion en Hostinger

Cuando pases a Hostinger:

- Define `NEXT_PUBLIC_SUPABASE_URL`
- Define `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Si añades backend privado, define `SUPABASE_SERVICE_ROLE_KEY` solo en servidor

## Limitacion actual

Con solo `anon key` no puedo ejecutar cambios de esquema remotos en Supabase. Para hacerlo desde terminal necesito una de estas dos cosas:

- acceso al SQL Editor del proyecto
- `SUPABASE_SERVICE_ROLE_KEY`

# Esquema relacional (resumen)

## Entidades y relaciones

- `users` 1---N `plan_participants`
- `users` 1---N `plans` (como creador)
- `users` 1---N `messages`
- `users` 1---N `reviews` (como `reviewer_id`)
- `users` 1---N `reviews` (como `reviewed_user_id`)
- `users` 1---N `notifications`
- `users` 1---N `user_devices`
- `users` 1---N `user_interests`
- `plans` 1---N `plan_participants`
- `plans` 1---N `messages`
- `plans` 1---N `reviews`
- `plans` 1---N `reports` (como `reported_plan_id`)

## Estados del dominio

### Plan (`plans.status`)
- `draft`
- `active`
- `full`
- `in_progress`
- `completed`
- `cancelled`

### Participación (`plan_participants.status`)
- `pending`
- `accepted`
- `rejected`
- `cancelled`
- `attended`
- `no_show`

## Consulta de cercanía recomendada

```sql
SELECT *
FROM nearby_plans(40.4168, -3.7038, 3000, NULL, 24);
```

Devuelve planes activos en un radio de 3km, próximos hasta 24h.

## Semilla inicial de categorías
Las categorías iniciales vienen precargadas:
- `cafe`, `walk`, `terrace`, `running`, `sports`, `study`, `coworking`, `gaming`, `languages`, `music_event`

## Regla importante de negocio

- Solo anfitriones o participantes aceptados pueden enviar/leer `messages` del plan.
- Solo asistentes (`attended`) pueden crear `reviews`.
- Solo el creador puede cambiar estado de `plans` y aceptar/rechazar privados.

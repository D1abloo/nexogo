# NexoGo

Aplicacion web social para descubrir salas, crear planes, usar chat en vivo, operar un marketplace y moderar toda la actividad desde un panel administrativo.

Este `README.md` es interno. Sirve para que cualquier compañero que entre al proyecto entienda:

- que hay montado
- donde esta cada parte
- que permisos existen
- como arrancarlo en local
- como desplegarlo en Hostinger
- como operar la base de datos y el panel admin

No incluye secretos, contraseñas ni valores reales de produccion.

---

## 1. Estado del proyecto

El proyecto esta preparado para:

- web publica principal
- registro y login con Supabase Auth
- gestion de salas publicas, privadas y premium
- chats en vivo por polling
- chat virtual global
- marketplace con anuncios, chats comprador-vendedor y valoraciones
- sistema de reportes con ticket y seguimiento
- panel admin
- panel admin de marketplace
- correo SMTP por Hostinger
- integracion opcional con OpenAI para asistente contextual

El proyecto no depende de Docker para ejecutarse en su estado actual. La web corre como aplicacion `Next.js` tradicional con API routes server-side.

---

## 2. Stack tecnico

### Frontend y servidor web

- `Next.js 14`
- `React 18`
- CSS global en un solo fichero principal

### Base de datos y auth

- `Supabase`
- `PostgreSQL`
- `Supabase Auth`
- RLS en tablas principales

### Pagos

- `Stripe` preparado
- `PayPal` preparado

### Email

- `Nodemailer`
- SMTP de `Hostinger`

### AI

- `OpenAI API` opcional
- asistente restringido a contexto de chats, acceso, normas, premium, tickets y marketplace

---

## 3. Estructura del repositorio

### Raiz

- `apps/admin`
  - aplicacion web principal
- `database`
  - migraciones SQL de Supabase/PostgreSQL
- `docs`
  - notas de setup y referencia
- `scripts`
  - utilidades CLI para base de datos

### Aplicacion web

- `apps/admin/pages/index.js`
  - portada, feed, salas, detalle, filtros, registro y login
- `apps/admin/pages/chat.js`
  - chat de sala, chat global y chat de mercado
- `apps/admin/pages/admin.js`
  - panel de administracion principal
- `apps/admin/pages/admin-salas.js`
  - vista completa de salas para admin
- `apps/admin/pages/admin-mercado.js`
  - vista completa de marketplace para admin
- `apps/admin/pages/cuenta.js`
  - panel del usuario
- `apps/admin/pages/premium.js`
  - comparativa y gestion premium
- `apps/admin/pages/ticket.js`
  - seguimiento de tickets de incidencias
- `apps/admin/pages/sala.html.js`
  - listado extendido de salas
- `apps/admin/pages/acerca.js`
- `apps/admin/pages/privacidad.js`
- `apps/admin/pages/terminos.js`

### Marketplace

- `apps/admin/pages/mercado/index.js`
  - listado general del marketplace
- `apps/admin/pages/mercado/[id].js`
  - ficha completa de anuncio
- `apps/admin/pages/mercado/perfil/[sellerId].js`
  - perfil publico del vendedor
- `apps/admin/pages/mercado/chat/[threadId].js`
  - chat privado comprador-vendedor
- `apps/admin/pages/mercado/registro.js`
  - alta/entrada al flujo del marketplace

### API routes

- `apps/admin/pages/api/backend/[...path].js`
  - backend principal de salas, usuarios, tickets, suscripciones y admin
- `apps/admin/pages/api/marketplace/items/index.js`
  - listado y alta de anuncios
- `apps/admin/pages/api/marketplace/items/[id].js`
  - detalle y actualizacion de anuncio
- `apps/admin/pages/api/marketplace/items/[id]/images.js`
  - imagenes del anuncio
- `apps/admin/pages/api/marketplace/items/[id]/reviews.js`
  - valoraciones de venta
- `apps/admin/pages/api/marketplace/items/[id]/threads.js`
  - hilos del anuncio
- `apps/admin/pages/api/marketplace/items/[id]/favorite.js`
  - favoritos
- `apps/admin/pages/api/marketplace/threads/index.js`
  - apertura de chat comprador-vendedor
- `apps/admin/pages/api/marketplace/threads/[threadId]/index.js`
  - detalle del hilo
- `apps/admin/pages/api/marketplace/threads/[threadId]/messages.js`
  - mensajes del hilo
- `apps/admin/pages/api/marketplace/sellers/[sellerId].js`
  - perfil vendedor, anuncios y reputacion
- `apps/admin/pages/api/marketplace/reports/index.js`
  - reportes del marketplace

### Librerias

- `apps/admin/lib/supabase.js`
  - cliente Supabase para frontend
- `apps/admin/lib/server-supabase.js`
  - cliente servidor y utilidades de sesion/admin
- `apps/admin/lib/mailer.js`
  - envio de correos
- `apps/admin/lib/premium.js`
  - reglas y precios premium
- `apps/admin/lib/marketplace-demo.js`
  - fallback local del marketplace
- `apps/admin/lib/marketplace-chat-demo.js`
  - fallback local del chat de marketplace

### Scripts

- `scripts/bootstrap-db.sh`
- `scripts/db_create_readonly_user.sh`
- `scripts/db_readonly_console.sh`
- `scripts/db_admin_console.sh`
- `apps/admin/scripts/seed-demo-users.mjs`

---

## 4. Modulos funcionales

### 4.1 Salas

Soporta:

- salas publicas
- salas privadas
- salas premium
- salas premium privadas
- acceso por aprobacion
- acceso por contraseña
- cierre de sala
- chat privado por codigo dentro de la sala

### 4.2 Chats

Tipos:

- chat de sala
- canal privado dentro de la sala
- chat virtual global
- chat del marketplace comprador-vendedor
- supervision oculta para administracion

### 4.3 Marketplace

Incluye:

- publicar anuncio
- editar y borrar anuncio
- subir imagenes
- marcar reservado y vendido
- abrir chat privado entre comprador y vendedor
- favoritos
- destacados
- perfil publico del vendedor
- valoracion tras venta
- investigacion o reporte con pruebas

### 4.4 Tickets y moderacion

Incluye:

- reportes de usuarios y salas
- ticket con numero unico
- mensajes dentro del ticket
- resolucion final
- correo al admin al abrir
- correo al usuario al cerrar

### 4.5 Premium

Planes:

- `Free`
- `Premium Plus`
- `Premium Pro`

Controles:

- renovacion automatica
- cancelacion al final de periodo
- cancelacion manual
- `never expires`
- gestion administrativa manual

### 4.6 Administracion

Paneles disponibles:

- `/admin`
- `/admin-salas`
- `/admin-mercado`

Permiten:

- gestionar usuarios
- gestionar niveles de admin
- bloquear y desbloquear usuarios
- gestionar suscripciones
- revisar reportes
- operar tickets
- moderar salas
- supervisar chats en oculto
- gestionar anuncios del marketplace
- destacar anuncios
- revisar actividad y logs
- mantener notas internas

---

## 5. Roles y permisos

### Invitado

Puede:

- ver parte de la portada
- entrar al chat virtual global
- entrar al marketplace publico
- solicitar invitacion

No puede:

- entrar en salas
- crear salas
- usar chat de sala
- publicar salas
- operar tickets como usuario autenticado

### Usuario registrado

Puede:

- crear sala
- unirse a sala
- abrir chat de sala si tiene acceso
- abrir tickets
- responder sus tickets
- usar marketplace
- abrir chat con vendedor/comprador

### Usuario premium

Puede ademas:

- ver salas premium
- entrar a salas premium segun reglas de acceso
- crear ciertas salas premium
- usar funciones premium segun plan

### Usuario bloqueado

Limitaciones:

- no puede crear salas
- puede recibir bloqueo operativo segun moderacion
- la UI le informa que contacte con administracion

### Admin

`role = admin`

Niveles de acceso al panel:

- `read`
  - lectura del panel
  - sin cambios
- `write`
  - cambios operativos y moderacion
- `owner`
  - control total

Nota:

- todo admin se considera operativamente premium
- el modo supervisor de chat debe permanecer oculto para el resto de usuarios

---

## 6. Politicas funcionales importantes

### Edad minima

- uso de chats, salas, marketplace y mensajeria restringido a mayores de 18 anos
- el registro exige fecha de nacimiento y validacion de edad

### Adultos 18+

- las categorias adultas no son abiertas
- se gestionan como premium, privadas y moderadas
- deben permanecer sujetas a reglas estrictas

### Privacidad y seguridad

- no se deben mostrar datos internos de infraestructura en la UI
- no se debe mostrar presencia del admin en supervision silenciosa
- las notificaciones de la web no deben exponer actividad privada de usuarios

---

## 7. Base de datos

### Tablas principales

- `users`
- `user_interests`
- `plans`
- `plan_participants`
- `messages`
- `message_reactions`
- `reviews`
- `reports`
- `report_messages`
- `notifications`
- `user_devices`
- `user_blocks`
- `user_subscriptions`
- `audit_logs`
- `guest_access_requests`
- `site_virtual_chat_messages`
- `team_notes`
- `marketplace_items`
- `marketplace_item_images`
- `marketplace_threads`
- `marketplace_thread_messages`
- `marketplace_reviews`
- `marketplace_favorites`
- `report_evidence`

### Orden de migraciones

Ejecutar en este orden:

1. `001_init_schema.sql`
2. `002_supabase_auth_rls.sql`
3. `003_plan_room_metadata.sql`
4. `004_user_blocks_and_subscriptions.sql`
5. `005_premium_room_features.sql`
6. `006_private_chat_channels.sql`
7. `007_chat_media_pins_reactions.sql`
8. `008_audit_logs_and_subscription_controls.sql`
9. `009_admin_presence_and_team_notes.sql`
10. `010_subscription_never_expires.sql`
11. `011_admin_access_levels.sql`
12. `012_guest_access_requests.sql`
13. `013_site_virtual_chat.sql`
14. `014_report_tickets_and_messages.sql`
15. `015_marketplace_items.sql`
16. `016_marketplace_threads.sql`
17. `017_marketplace_reviews_profiles_and_evidence.sql`
18. `018_marketplace_favorites_and_featured.sql`

### Recomendacion de operacion

- no mezclar cambios manuales en tablas con cambios no versionados
- cualquier ajuste nuevo de esquema debe entrar como migracion SQL nueva
- si se modifica RLS, revisar tambien API routes y panel admin

---

## 8. Variables de entorno

Las siguientes son las variables relevantes de la aplicacion. No pongas valores reales aqui.

### Frontend publico

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_EMAILS=
NEXT_PUBLIC_AI_ASSISTANT_URL=
NEXT_PUBLIC_AI_ASSISTANT_NAME=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

### Servidor / API

```env
SUPABASE_SERVICE_ROLE_KEY=
CHECKOUT_TOKEN_SECRET=
TURNSTILE_SECRET_KEY=
OPENAI_API_KEY=
OPENAI_CHAT_ASSISTANT_MODEL=
STRIPE_SECRET_KEY=
PAYPAL_BUSINESS_EMAIL=
REPORT_ALERT_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### Seeds demo opcionales

```env
DEMO_USER_PASSWORD=
DEMO_USER_COUNTRY=
```

### Reglas

- nunca exponer `SUPABASE_SERVICE_ROLE_KEY` en `NEXT_PUBLIC_*`
- nunca exponer `SMTP_PASS`, `STRIPE_SECRET_KEY` ni `OPENAI_API_KEY` en frontend
- cualquier clave filtrada debe rotarse antes de produccion

---

## 9. Arranque en local

### Requisitos

- `Node.js 20+`
- `npm`
- proyecto Supabase preparado
- SMTP de pruebas o real si se quieren probar correos

### Instalacion

```bash
cd /home/isaac/Escritorio/App/apps/admin
npm install
```

### Variables locales

Crear `apps/admin/.env.local` con las variables necesarias.

### Ejecutar en desarrollo

```bash
cd /home/isaac/Escritorio/App/apps/admin
npm run dev -- --hostname 0.0.0.0 --port 4000
```

### Ejecutar build de produccion local

```bash
cd /home/isaac/Escritorio/App/apps/admin
npm run build
npm run start
```

---

## 10. Scripts de base de datos

### Consola readonly

```bash
cd /home/isaac/Escritorio/App
./scripts/db_readonly_console.sh
```

Sirve para:

- resumen ejecutivo
- usuarios y roles
- suscripciones
- salas
- participantes
- chats
- tickets
- marketplace
- actividad registrada

### Consola admin

```bash
cd /home/isaac/Escritorio/App
./scripts/db_admin_console.sh
```

Sirve para:

- cambiar acceso admin
- bloquear usuarios
- asignar suscripciones
- marcar `never expires`
- aprobar invitados
- cerrar o reabrir salas
- crear notas internas

### Crear usuario readonly de BBDD

```bash
cd /home/isaac/Escritorio/App
./scripts/db_create_readonly_user.sh
```

### Seeds demo

```bash
cd /home/isaac/Escritorio/App/apps/admin
node scripts/seed-demo-users.mjs 100 'PasswordSegura.2026!'
```

---

## 11. Flujo funcional resumido

### Registro

1. usuario abre registro
2. completa datos
3. pasa captcha
4. valida mayoria de edad
5. confirma correo
6. entra a la plataforma

### Sala

1. usuario crea sala
2. define categoria, acceso y ubicacion
3. otros usuarios se unen o solicitan acceso
4. se usa el chat en vivo
5. se valora tras finalizar

### Ticket

1. usuario reporta incidencia
2. se genera ticket en BBDD
3. admin recibe correo con numero de ticket
4. usuario y admin pueden conversar en `/ticket`
5. admin resuelve o descarta
6. usuario recibe correo con estado final y resolucion

### Marketplace

1. vendedor publica anuncio
2. comprador abre chat privado desde el anuncio
3. vendedor negocia y marca vendido
4. vendedor o comprador deja valoracion
5. si hay incidencia, se abre investigacion con pruebas

---

## 12. Produccion en Hostinger

### Recomendacion

Para este proyecto, la opcion correcta es `Hostinger VPS` o entorno equivalente con Node.js real.

Motivo:

- la app usa `Next.js` con API routes server-side
- necesita variables privadas
- necesita integracion con Supabase, SMTP y pagos
- un hosting estatico o compartido simple no es suficiente

### Arquitectura recomendada de produccion

- `Hostinger VPS`
- `Ubuntu`
- `Node.js 20 LTS`
- `Nginx` como reverse proxy
- `PM2` para proceso persistente
- `Supabase` como BBDD/Auth
- `Hostinger SMTP`

### Paso a paso de despliegue

#### 1. Preparar servidor

Instalar:

- Node.js 20
- npm
- nginx
- pm2

#### 2. Copiar proyecto

Subir el repositorio al VPS y situarlo en una ruta estable, por ejemplo:

```bash
/var/www/nexogo
```

#### 3. Variables de entorno

Crear archivo de produccion, por ejemplo:

```bash
/var/www/nexogo/apps/admin/.env.production
```

Definir:

- Supabase
- SMTP
- Stripe/PayPal
- Turnstile
- OpenAI si se usa
- secretos internos

#### 4. Instalar dependencias

```bash
cd /var/www/nexogo/apps/admin
npm install
```

#### 5. Build

```bash
npm run build
```

#### 6. Arranque con PM2

```bash
pm2 start npm --name nexogo-web -- start
pm2 save
```

#### 7. Configurar Nginx

Proxy hacia `localhost:4000`.

Ejemplo:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 8. SSL

Activar `HTTPS` con LetsEncrypt o el sistema que uses en Hostinger.

#### 9. SMTP

Configurar Hostinger SMTP:

- Host: `smtp.hostinger.com`
- Port: `465` o `587`
- Usuario: correo completo
- Password: password del buzon
- From: direccion formal del proyecto

#### 10. Supabase

Verificar:

- migraciones aplicadas
- usuarios admin correctos
- RLS correcto
- correos de confirmacion activos
- dominio permitido en auth redirect

### Checklist antes de pasar a produccion

- [ ] rotar cualquier API key expuesta anteriormente
- [ ] revisar `NEXT_PUBLIC_ADMIN_EMAILS`
- [ ] comprobar correos SMTP reales
- [ ] comprobar captcha real
- [ ] comprobar Stripe/PayPal en modo live cuando toque
- [ ] revisar politicas legales
- [ ] probar login, registro, sala, chat, ticket y marketplace
- [ ] probar `/admin`, `/admin-salas` y `/admin-mercado`
- [ ] probar restauracion/reinicio del proceso con PM2

---

## 13. Operacion diaria

### Admin principal

Rutas:

- `/admin`
- `/admin-salas`
- `/admin-mercado`

Desde ahi se gestiona:

- suscripciones
- usuarios
- marketplace
- reportes
- tickets
- actividad
- notas internas

### Moderacion

Reglas operativas:

- la supervision del chat debe permanecer oculta
- un ticket debe tener resolucion antes de cerrarse
- un usuario bloqueado no debe poder crear salas
- contenido sensible de adultos debe mantenerse moderado y restringido

### Marketplace

Reglas operativas:

- un anuncio `sold` no debe seguir operativo para negociacion
- las valoraciones deben quedarse ligadas a la venta
- toda investigacion debe generar trazabilidad en BBDD

---

## 14. Seguridad

- no exponer secretos en frontend
- no publicar rutas internas o detalles de infraestructura en la UI
- rotar claves filtradas
- revisar RLS al tocar tablas
- usar HTTPS en produccion
- proteger el acceso admin por rol y nivel
- no introducir usuarios falsos en produccion para aparentar actividad

---

## 15. Problemas comunes

### El panel admin no carga

Revisar:

- sesion activa
- `role = admin`
- `admin_access_level != none`
- `NEXT_PUBLIC_ADMIN_EMAILS`

### El marketplace no muestra datos

Revisar:

- migraciones `015`, `016`, `017`, `018`
- sesion
- API routes del marketplace

### Los correos no salen

Revisar:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- spam y reputacion del dominio

### El asistente AI no responde

Revisar:

- `OPENAI_API_KEY`
- `OPENAI_CHAT_ASSISTANT_MODEL`
- conectividad saliente

---

## 16. Siguiente capa recomendada

Antes de cerrar del todo produccion, lo mas razonable es:

1. revisar visualmente `/`, `/admin`, `/admin-mercado`, `/mercado` y `/chat`
2. probar el flujo completo en VPS de preproduccion
3. rotar claves expuestas
4. pasar a Hostinger con deploy limpio y variables finales

---

## 17. Referencias internas

- `docs/supabase-hostinger-setup.md`
- `database/*.sql`
- `scripts/*.sh`
- `apps/admin/pages/*`


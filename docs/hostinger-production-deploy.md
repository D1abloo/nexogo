# Despliegue de NexoGo en Hostinger

Este documento describe la ruta recomendada para desplegar la aplicacion en Hostinger sin VPS, usando `Node.js Web Apps Hosting`.

## 1. Cuando necesitas VPS y cuando no

No necesitas VPS si tu plan de Hostinger incluye `Node.js Web Apps Hosting`.

Ruta recomendada:

- `Business Web Hosting`
- `Cloud Startup`
- `Cloud Professional`
- `Cloud Enterprise`
- `Cloud Enterprise Plus`

Solo necesitas VPS si:

- quieres control total del sistema operativo
- necesitas instalar software de sistema no gestionado
- quieres personalizar el servidor mas alla de lo que ofrece Hostinger Web Apps

## 2. Opcion recomendada para este proyecto

Para `NexoGo`, la opcion recomendada sin VPS es:

- Hostinger `Node.js Web App`
- despliegue por `GitHub` o por `ZIP`
- build y start gestionados por Hostinger

## 3. Ruta de despliegue mas segura

### Opcion A: repositorio separado del frontend web

Como esta app vive dentro de `apps/admin`, la opcion mas limpia es:

1. crear un repo de despliegue solo con el contenido de `apps/admin`
2. usar ese repo en Hostinger

### Opcion B: ZIP listo para Hostinger

Usa:

```bash
cd /home/isaac/Escritorio/App
./scripts/prepare-hostinger-package.sh
```

Esto genera:

```bash
.deploy/hostinger-node-app
```

Ese directorio lo puedes comprimir y subir como paquete del proyecto.

## 4. Variables de entorno

Debes cargar en Hostinger los valores reales de:

```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_EMAILS=
NEXT_PUBLIC_AI_ASSISTANT_URL=/api/backend/assistant
NEXT_PUBLIC_AI_ASSISTANT_NAME=Asistente NexoGo
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CHECKOUT_TOKEN_SECRET=
TURNSTILE_SECRET_KEY=
OPENAI_API_KEY=
OPENAI_CHAT_ASSISTANT_MODEL=gpt-4.1-mini
STRIPE_SECRET_KEY=
PAYPAL_BUSINESS_EMAIL=
REPORT_ALERT_EMAIL=
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## 4.1 Archivo listo para produccion

El proyecto ya tiene preparado:

- `apps/admin/.env.production`

Antes de lanzar en publico:

- rota `OPENAI_API_KEY`
- rota `SUPABASE_SERVICE_ROLE_KEY`
- revisa `SMTP_PASS`
- sustituye las claves de `Turnstile` de prueba por las reales

## 4.2 Auth redirect URLs en Supabase

En `Supabase Dashboard -> Authentication -> URL Configuration` configura:

### Site URL

Usa tu dominio principal:

```txt
https://tu-dominio.com
```

### Redirect URLs

Añade como minimo:

```txt
https://tu-dominio.com
https://tu-dominio.com/
https://tu-dominio.com/**
https://www.tu-dominio.com
https://www.tu-dominio.com/
https://www.tu-dominio.com/**
```

Si primero pruebas con el subdominio o dominio temporal de Hostinger, añade tambien ese dominio:

```txt
https://tu-app.hostingersite.com
https://tu-app.hostingersite.com/
https://tu-app.hostingersite.com/**
```

Si mantienes pruebas locales para login:

```txt
http://localhost:4000/**
http://192.168.1.15:4000/**
```

## 4.3 Correos de autenticacion

En `Supabase Dashboard -> Authentication -> SMTP Settings` usa:

- Host: `smtp.hostinger.com`
- Port: `465`
- Username: `info@estructuraweb.es`
- Sender email: `info@estructuraweb.es`

La contraseña SMTP debe revisarse y rotarse si ha sido compartida en canales inseguros.

## 5. Ajustes recomendados en Hostinger

Configura la app Node.js con:

- Node.js: `20.x`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm run start`

## 6. Checklist antes de publicar

- rotar claves expuestas en desarrollo
- verificar correos SMTP
- verificar captcha real
- revisar admins
- revisar RLS en Supabase
- probar salas
- probar chat
- probar tickets
- probar marketplace
- probar `/admin`
- probar `/admin-mercado`

## 7. Checklist despues de publicar

- comprobar login y registro
- comprobar confirmacion de correo
- comprobar creacion de sala
- comprobar ticket de reporte
- comprobar chat comprador-vendedor
- comprobar correo de resolucion
- comprobar panel admin

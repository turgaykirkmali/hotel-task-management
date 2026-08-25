# Hotel Task Management – Deployment Guide

This package is independent of Replit and is prepared for **Render + external PostgreSQL** (recommended: Neon) or local Windows/Linux deployment.

## 1. Render + Neon

1. Create a PostgreSQL database at Neon (or use another PostgreSQL provider).
2. Copy its connection string into `DATABASE_URL`.
3. Push this folder to a GitHub repository.
4. In Render, create a new **Web Service** from the repository.
5. Render can use the included `render.yaml` as a Blueprint, or configure manually:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
   - Health check: `/healthz`
6. Add the environment variables listed in `.env.example`.
7. After the first deployment, run the database schema push from a shell/CI environment:
   `npm run db:push`

### Important
The application currently contains two test-oriented Telegram endpoints in `server/routes.ts`. Before public production use, protect or remove them.

WhatsApp is intentionally still **simulation mode** in this source package; no WhatsApp Web session is created.

## 2. Local Windows

Requirements:
- Node.js 20 LTS
- PostgreSQL 14+

Then:

```powershell
npm ci
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/hotel_tasks"
$env:DATABASE_SSL="false"
$env:SESSION_SECRET="change-this-secret"
npm run db:push
npm run dev
```

Open `http://localhost:5000`.

## 3. Production local server

Build first:

```bash
npm ci
npm run db:push
npm run build
NODE_ENV=production npm start
```

On Windows PowerShell, set `NODE_ENV` before starting:

```powershell
$env:NODE_ENV="production"
npm start
```

## Environment variables

- `DATABASE_URL`: required
- `SESSION_SECRET`: strongly recommended/required for production
- `DATABASE_SSL`: `true` for hosted PostgreSQL, `false` for a local non-SSL PostgreSQL
- `TELEGRAM_BOT_TOKEN`: optional
- `SENDGRID_API_KEY`: optional


## Render first deployment (v4)

Required Environment Variables on the Web Service:
- `DATABASE_URL`
- `SESSION_SECRET`
- `SUPERADMIN_USERNAME`
- `SUPERADMIN_PASSWORD`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Optional:
- `BOOTSTRAP_RESET_PASSWORDS=true` for a one-time password reset
- `BOOTSTRAP_HOTEL_NAME`

The build command must run `npm ci && npm run db:push && npm run build`. The application now fails fast if bootstrap credentials are missing instead of silently skipping user creation.

## v11 Enterprise Modules

New modules are initialized automatically at startup:
- Integrations: SendGrid email, Twilio SMS/WhatsApp, Meta Instagram DM, existing Telegram workflow
- Review Tracker: review storage, NPS, response rate, source performance and performance score
- Inventory: material master, stores, stock movements, stock requests, audit trail and Telegram notifications
- Recipes: F&B recipe cards and automatic ingredient stock consumption

Required Render environment variable for encrypted integration secrets:
- `APP_ENCRYPTION_KEY` — use a long random value and keep it secret.

Recommended deliverability setup:
- SendGrid: verify sender/domain and configure SPF/DKIM before production sending.
- WhatsApp: use explicit opt-in and approved WhatsApp templates for business-initiated messages.
- SMS/Instagram: use consent and suppression controls; do not use the platform for unsolicited bulk messaging.

For Instagram webhook, configure Meta to call:
`https://YOUR-DOMAIN/api/integrations/instagram/webhook?hotelId=HOTEL_ID`
using the Verify Token stored in the Integrations menu.

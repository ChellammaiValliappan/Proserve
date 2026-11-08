# Deployment & release process

## How releases work

1. Every change is committed to the **`dev`** branch → Netlify builds the **dev server** automatically (free).
2. The owner tests the dev server as a partner and as admin.
3. When the owner says "dev looks good", `dev` is merged into **`main`** → Netlify deploys **production** (15 credits).
4. Database changes are applied to the Neon `dev` branch first, then to `main` at release time.

A failed build never replaces the live site — the previous version stays up.

## Netlify setup (one time)

1. Netlify → *Add new project* → *Import an existing project* → GitHub → `ChellammaiValliappan/Proserve`.
2. Production branch: `main`. Build command and publish folder come from `netlify.toml`.
3. *Project configuration → Build & deploy → Branches and deploy contexts*: **Branch deploys: Let me add individual branches → `dev`**.
4. *Deploy Previews*: set to **none** (avoids extra builds; we use the dev branch instead).
5. Environment variables (Project configuration → Environment variables), mark secrets as **secret**:

| Variable | Production context | Branch deploys (dev) |
|---|---|---|
| `APP_ENV` | `production` | `dev` |
| `DATABASE_URL` | Neon `main` branch URL (pooled) | Neon `dev` branch URL (pooled) |
| `JWT_SECRET` | long random value | *different* long random value |
| `OTP_MODE` | `msg91` | `dev` |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | from MSG91 | – |
| `PAYMENT_MODE` | `razorpay` | `mock` (or `razorpay` with **test** keys) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | live keys | test keys (optional) |
| `RAZORPAY_WEBHOOK_SECRET` | from Razorpay webhook settings | test webhook secret (optional) |

Razorpay webhook URL: `https://<your-domain>/api/payments/webhook` with events `payment.captured`, `payment.failed`, `order.paid`.

## Database migrations

Migrations live in `db/migrations/*.sql` and are tracked in the `schema_migrations` table.
Run against a branch with `DATABASE_URL=<branch url> npm run db:migrate`.

## Costs (as of Nov 2026)

- Netlify Free: 300 credits/month hard limit. Production deploy 15 credits; branch deploys free; functions 10 credits/GB-hour; 2 credits per 10k requests; 20 credits/GB bandwidth. If the limit is hit, sites pause until next month — upgrade to Personal before launch if traffic grows.
- Neon Free: 0.5 GB storage, scale-to-zero compute; enough for thousands of orders.
- Razorpay: per-transaction fee only. MSG91: pay per SMS (DLT registration needed in India).

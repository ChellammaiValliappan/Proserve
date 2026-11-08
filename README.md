# ProServe Grocery Partner

Wholesale grocery ordering for ProServe partners (homemakers and small resellers), in Tamil and English.

- **Partner app** (mobile-first web app, installable on Android home screen): register with mobile + OTP → browse → cart → pay (UPI / card / net banking) → next-day delivery → track, reorder, cancel, complain.
- **Admin portal** at `/admin`: dashboard, orders & delivery, products/pricing/stock, partners, complaints, reports, configuration, team & audit log.

## Environments

| Environment | Git branch | URL | Database | Cost |
|---|---|---|---|---|
| **Dev / test** | `dev` | `https://dev--<site>.netlify.app` | Neon branch `dev` | Free (branch deploys cost 0 Netlify credits) |
| **Production** | `main` | `https://<site>.netlify.app` (or custom domain) | Neon branch `main` | Free plan: 300 credits/month, each production deploy = 15 credits |

**Rule:** all work goes to `dev` first. Code is merged to `main` only after the owner approves the dev site — that is the only thing that triggers a production deploy.

## Tech (chosen for low cost)

- React + Vite single-page app (≈75 KB gzipped for partners; admin code loads only on `/admin`)
- One Netlify Function (`netlify/functions/api.mts`) serves the whole API (`server/`)
- Neon serverless Postgres (free tier, scales to zero when idle)
- Netlify Blobs for product photos
- Razorpay for payments (no monthly fee, per-transaction only), MSG91 for OTP SMS

## Local development

```bash
cp .env.example .env          # point DATABASE_URL at a local Postgres
npm install
npm run db:migrate
npm run admin:create -- you@example.com "Your Name" 'a-long-password'
npm run dev:api               # API on :8888
npm run dev                   # app on :5173 (proxies /api)
npm test                      # end-to-end API tests
```

In dev, `OTP_MODE=dev` shows the OTP on screen and `PAYMENT_MODE=mock` simulates payments. **Both are refused by the server when `APP_ENV=production`.**

## Folder map

```
src/reseller   Partner app screens (Tamil/English)
src/admin      Admin portal
server/        API: auth, OTP, orders, payments, admin routes
shared/rules.ts  Pricing tiers, delivery fee, delivery date (used by app + API)
db/migrations  Database schema + seed data
tests/         End-to-end API tests (run in GitHub Actions on every push)
docs/          Deployment, security and go-live checklist
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/SECURITY.md](docs/SECURITY.md).

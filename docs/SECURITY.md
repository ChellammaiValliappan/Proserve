# Security measures

## Accounts & sessions
- Partners log in with mobile + 4-digit OTP (5-minute expiry, max 5 wrong tries, stored only as a salted hash). OTP requests are rate-limited per phone and per IP.
- Admins log in with email + password (scrypt hashed), rate-limited, with `admin` / `staff` roles. Changing a password or disabling an account signs out every session.
- Sessions are signed tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies – page scripts can't read them. Partner and admin sessions are separate; a partner cookie can never open admin APIs.
- Blocking a partner signs them out immediately.

## Orders & money
- Prices, stock, delivery fee and tier are always recalculated on the server; tampered totals are rejected (`PRICE_CHANGED`).
- Each "Place order" carries a one-time key, so double taps can't create duplicate orders.
- Stock is reserved with a conditional update, so it never goes below zero even with simultaneous orders. Unpaid orders release stock after 30 minutes.
- Payments are confirmed only after verifying Razorpay's HMAC signature (checkout) or webhook signature; amounts are cross-checked.
- "Payment deducted but order not confirmed" is handled by the webhook and an admin "Check payment with Razorpay" button.
- Dev-only shortcuts (on-screen OTP, simulated payments) are refused by the server in production.
- Partners can only see their own orders and complaints.

## Platform
- All SQL is parameterised; inputs are validated with strict schemas and length limits.
- Strict security headers: CSP, HSTS, no framing, no sniffing; API responses are `no-store`.
- Cross-site request protection: state-changing API calls must come from the app's own origin.
- Secrets live only in Netlify environment variables (never in Git). `.env` is git-ignored.
- Every admin change (prices, stock, settings, refunds, blocks) is written to an audit log.
- GitHub Actions runs the test suite on every push; Dependabot watches for vulnerable packages.
- The dev server is excluded from search engines and shows a "DEV / TEST" banner.

## Recommended owner actions
- Keep the GitHub repository **private**.
- Turn on two-factor authentication for GitHub, Netlify, Neon and Razorpay.
- Use a strong unique admin password; create separate `staff` accounts for warehouse staff.

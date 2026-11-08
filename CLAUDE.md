# Working rules for this repository (set by the owner)

1. **Backup:** all code lives in GitHub `ChellammaiValliappan/Proserve`. Commit and push to the `dev` branch regularly – after every meaningful change, never leave work only on a local machine.
2. **Dev first:** all changes go to `dev`. Netlify deploys `dev` to the dev server for free (`https://dev--proserve-partner.netlify.app`).
3. **Production only on approval:** never push, merge or deploy to `main` unless the owner has explicitly said the dev server looks good for resellers and admin. Each production deploy costs Netlify credits (free plan: 300/month, 15 per deploy). Do not use `netlify deploy --prod` or the Netlify MCP `deploy-site` tool.
4. **Cost-effective:** stay on free tiers (Netlify Free, Neon Free). Don't add paid services without asking.
5. **Security:** never commit secrets (`.env` is git-ignored; secrets live in Netlify env vars per context). Keep server-side validation, parameterised SQL, rate limits and the production guards on dev-only OTP/payment modes. Run `npm test` and `npm run typecheck` before pushing.
6. **Database changes:** add a new numbered file in `db/migrations/`; apply to Neon branch `dev` first, to `main` only at release.

Neon project: `proserve` (`mute-frost-98439238`), branches `main` (production) and `dev`.
Netlify project: `proserve-partner` (site id `8914494c-6008-43aa-b242-936968826f59`).

# Fairshare

A polished Splitwise-style expense sharing app built with React, TypeScript, and Firebase.

## Run locally

```bash
npm install
npm run dev
```

The app runs in demo mode with local persistence when Firebase variables are absent.

## Connect Firebase

1. Create a Firebase project.
2. Enable Authentication with Email/Password and Google sign-in.
3. Create a Firestore database.
4. Copy `.env.example` to `.env.local` and add the web app credentials.
5. Deploy the included rules with `firebase deploy --only firestore:rules`.

Each signed-in user gets a synced workspace at `workspaces/{uid}`.

## Email invitations with Cloudflare Workers

Friend invitations are sent through the Worker in `worker/`. This keeps the Resend API key out of the browser and avoids requiring Firebase's Blaze plan.

```bash
cd worker
npm install
npx wrangler login
```

The production KV namespace is already configured in `worker/wrangler.toml`. For a different Cloudflare account, create a replacement with `npx wrangler kv namespace create RATE_LIMITS`. Store the Resend key and deploy:

```bash
npx wrangler secret put RESEND_API_KEY
npm run deploy
```

The deployed Worker is:

```text
https://fairshare-invites.keshavdial.workers.dev
```

Set that URL as `VITE_INVITE_API_URL` in `.env.local` and in the GitHub repository variables.

Restart Vite after changing `.env.local`. For real recipients, verify a sending domain in Resend and replace `RESEND_FROM_EMAIL` in `worker/wrangler.toml`; the `onboarding@resend.dev` sender is only suitable for Resend's limited testing flow.

## GitHub Pages deployment

Pushes to `main` deploy the production build through `.github/workflows/deploy-pages.yml`. The app uses the `/splitwise/` production base path and is expected at:

```text
https://keshav.ai/splitwise/
```

The GitHub repository variables listed in `.env.example` must be configured. Firebase Authentication must authorize both `keshav.ai` and `www.keshav.ai` for Google sign-in.

## Scripts

- `npm run dev` — start Vite
- `npm run build` — type-check and build
- `npm run lint` — lint TypeScript

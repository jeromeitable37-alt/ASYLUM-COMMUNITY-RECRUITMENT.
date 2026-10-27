# ASYLUM COMMUNITY RECRUITMENT

Official ASY Community recruitment site for Call of Duty: Mobile.

## Current recruitment features

- Casual and Referral application routes
- Eligibility declarations for age, Legendary Series, Facebook name, ASY-tag agreement, and roster-photo agreement
- Application tracking using the application code and the same contact email
- Recruiter-controlled intake open/closed switch and application cap
- Private, step-by-step evidence uploads for CODM, TikTok, follow proof, Membership Form, Discord nickname, roster photo, and referral conversation proof
- Recruiter approval / correction notes per evidence item, with later steps locked until all required items in the current step are approved
- Recruiter dashboard showing referral information and eligibility confirmations
- Screening guide, official links, and support chat
- Teams, scrims, and player-report tools are shown as planned modules only; those workflows are not active yet

## Stack

- React + TypeScript + Vite
- Supabase Auth, Postgres, and private Storage
- Supabase Edge Function: `asy-recruitment-evidence`
- Vercel serverless routes for Discord notifications and optional AI support

## Environment variables

Configure these in **Vercel → Project → Settings → Environment Variables**. Keep values private and never commit them to GitHub.

- `OPENAI_API_KEY` (optional): enables generated AI replies from the support chat. Without it, the website uses the curated FAQ fallback.
- `DISCORD_WEBHOOK_URL` (optional): enables Discord recruitment notifications.

The private upload Edge Function uses Supabase's server-side secret variables in the Supabase runtime, not in the browser. Do not add a Supabase service-role/secret key to frontend code or commit it to this repository.

## Development

```bash
npm install
npm run dev
```

The existing production Supabase project already contains the recruitment tables, intake enforcement, evidence workflow, private `asy-recruitment-private` Storage bucket, and RLS policies. If deploying this source to a different Supabase project, apply the corresponding schema and security policies before enabling the screening workflow.

The hero and brand marks currently load the original logo from the existing public AppDeploy asset URL. For a completely self-contained repository, place the original file at `public/resources/asylum-community-logo.png` and change the image references in `src/App.tsx` back to `/resources/asylum-community-logo.png`.

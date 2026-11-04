# ASYLUM COMMUNITY RECRUITMENT

Official ASY Community recruitment site for Call of Duty: Mobile.

## Current recruitment features

- Casual and Referral application routes
- Eligibility declarations for age, Legendary Series, Facebook name, ASY-tag agreement, and roster-photo agreement
- Application tracking using the application code and the same contact email
- Recruiter-controlled intake open/closed switch and application cap
- Private screenshot uploads for CODM, TikTok, follow proof, Discord nickname, roster photo and (for Referral) Membership Form / referral conversation, with all proof slots available together
- Applicants may replace uploaded screenshots while awaiting verification; recruiters may request targeted corrections, then verify all required screenshots **once** with a staff-protected database function. Age/details checks and final MGC / Screening GC review remain required.
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

## One-click screenshot verification

Screenshot upload steps do not require recruiter approval between CODM and TikTok/Discord/roster fields. The private `asy-recruitment-evidence` Edge Function lets the applicant upload or replace any screenshot while their application is in an active pre-final-review workflow state. Each required proof is marked `pending` until a recruiter either requests a correction or clicks **Verify all screenshots & continue to Final Review**.

That one-click action calls `public.asy_verify_all_screening_proofs(uuid)` from the logged-in recruiter account. The database function verifies recruiter identity, age/details review, required file uploads, and no outstanding corrections. Only then does it mark all required proofs approved and advance the application to `final_review`. It does **not** accept the applicant or grant Screening GC access; the later Membership Form / MGC manual check remains separate.

This release includes migration `20261104053927_one_final_screenshot_verification_without_stage_locks.sql` and the deployed Edge Function version 12. Screenshot corrections and re-uploads are stored in the private bucket, not the public Google Sheet.

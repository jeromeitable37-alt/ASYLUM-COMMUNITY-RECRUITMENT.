# ASYLUM COMMUNITY RECRUITMENT

Official ASy community recruitment site for Call of Duty: Mobile.

## Features

- Recruitment application form
- Application status tracking
- Public community roster
- Protected recruiter dashboard
- Neon red ASY emblem hero UI

## Tech stack

- React + TypeScript + Vite
- Supabase authentication and database
- Vercel serverless API route for Discord webhook notifications

## Development

```bash
npm install
npm run dev
```

The Vercel API route in `api/notify-discord.ts` sends Discord recruitment notifications. In Vercel, add `DISCORD_WEBHOOK_URL` under Project Settings → Environment Variables (Production, Preview as needed). Do not commit the webhook URL to this repository. `backend/index.ts` is the original AppDeploy-runtime route and is not used by Vercel.

The hero and brand marks currently load the logo from the existing public AppDeploy asset URL. To make the repository fully self-contained, add the original PNG at `public/resources/asylum-community-logo.png` and switch the image references in `src/App.tsx` back to the local `/resources/asylum-community-logo.png` path.
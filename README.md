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
- AppDeploy API route for Discord webhook notifications

## Development

```bash
npm install
npm run dev
```

The backend route in `backend/index.ts` uses the AppDeploy SDK and requires the AppDeploy runtime. Configure the `DISCORD_WEBHOOK_URL` secret in AppDeploy if Discord notifications are needed.

The public logo asset lives at `public/resources/asylum-community-logo.png`.
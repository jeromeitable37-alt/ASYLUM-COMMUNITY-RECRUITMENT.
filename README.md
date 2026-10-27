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

The hero and brand marks currently load the logo from the existing public AppDeploy asset URL. To make the repository fully self-contained, add the original PNG at `public/resources/asylum-community-logo.png` and switch the image references in `src/App.tsx` back to the local `/resources/asylum-community-logo.png` path.
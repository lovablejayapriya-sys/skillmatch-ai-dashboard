# SkillMatch AI

Public, session-only resume screening demo built with TanStack Start, Supabase Storage, and Groq.

## Local setup

Copy `.env.example` to `.env` and fill every value. Never commit `.env` because it contains server credentials.

```bash
bun install
bun run dev
```

## Vercel deployment

1. Import the repository into Vercel.
2. Add every variable listed in `.env.example` under Project Settings → Environment Variables.
3. Deploy. `vercel.json` uses Bun and the project build command.

`VITE_*` values are public. `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` must remain server-only.

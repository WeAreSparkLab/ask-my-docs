# Supabase setup

This project is designed to live inside a Supabase project shared with other apps, so everything
it creates is prefixed `amd_` (tables, functions, indexes, policies) and the Edge Function is
named `amd-embed`.

1. **Database:** open Dashboard > SQL Editor, paste the contents of
   [`ask-my-docs/setup.sql`](ask-my-docs/setup.sql), and run it once.
   (`supabase db push` is intentionally not used: a shared project has other apps' migration history.)
2. **Edge Function:**
   ```
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase secrets set EMBED_SECRET=your-random-string
   npx supabase functions deploy amd-embed --no-verify-jwt
   ```
3. **Auth:** keep email confirmation on. Under Authentication > URL Configuration add
   `http://localhost:5173` (and later your Vercel URL) as redirect URLs.

Note: Supabase Auth users are shared across all apps in a project. That is fine for this demo; a
production app would use its own project.

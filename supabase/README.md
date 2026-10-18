# Supabase setup

1. Create a free project at https://supabase.com (note the project ref, and keep the DB password safe).
2. Install the CLI (`npm i -D supabase` or see the Supabase docs), then from the repo root:
   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push                      # applies supabase/migrations/*
   npx supabase secrets set EMBED_SECRET=<random string>   # openssl rand -hex 32
   npx supabase functions deploy embed --no-verify-jwt
   ```
3. Auth: keep email confirmation on. Under Authentication > URL Configuration set the Site URL
   to your Vercel URL (and add `http://localhost:5173` as a redirect URL for local dev).

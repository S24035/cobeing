# Supabase Setup Steps (Phase 1)

This guide assumes:
- Project created in Supabase
- Domain already connected: cobeing.app / api.cobeing.app

## 1) Apply SQL schema
1. Supabase → SQL Editor
2. Open `docs/SUPABASE_SCHEMA.sql`
3. Paste and run
4. Confirm tables + policies created

## 2) Store secrets (server)
Set env vars on server:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY  (server-only, do not expose)

## 3) Verify RLS
- Open Table Editor → RLS enabled
- Test with anon key (should deny) and auth key (allow)

## 4) Next API work
- Implement /api/sync (GET/POST)
- Implement /api/me (GET/POST)
- Implement /api/account/delete

## 5) DNS notes
- cobeing.app → Vercel
- api.cobeing.app → API host (switch later when ready)

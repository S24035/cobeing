# API Contract (Phase 0)

Base URL: https://<api-host>
Auth: Bearer <supabase_jwt> for user requests
Service role only for server-side operations

## Auth
POST /auth/apple
- Exchange Apple identity token to Supabase session
- Body: { identityToken, fullName?, email? }
- Response: { access_token, refresh_token, user, profile }

## Profile
GET /me
- Response: { profile, subscription }

POST /me
- Body: { nickname?, ai_name?, persona? }
- Response: { profile }

## Sync (delta)
GET /sync?since=<iso>
- Response: {
  server_time,
  since,
  next_since,
  tasks: [],
  task_templates: [],
  diary_entries: [],
  calendar_events: [],
  chat_messages: []
}

POST /sync
- Body: {
  client_time,
  items: {
    tasks: [],
    task_templates: [],
    diary_entries: [],
    calendar_events: [],
    chat_messages: []
  }
}
- Response: { ok: true, server_time }

Conflict rule: last-write-wins by updated_at. deleted_at indicates soft delete.

## AI Chat
POST /ai/chat
- Enforces limits based on subscription_status + usage_counters
- Body: { messages: [], model?, max_tokens? }
- Response: { reply, usage }

Limits:
- Free: 5 calls/day, 800 tokens/call, 30k tokens/month
- Paid: 100 calls/day, 1200 tokens/call, 300k tokens/month

## IAP
POST /iap/verify
- Body: { receipt, product_id, transaction_id }
- Response: { status, current_period_end }

## Account deletion
POST /account/delete
- Deletes all user rows and auth user

## Webhook (server only)
POST /iap/webhook
- App Store Server Notifications
- Updates subscription_status and usage_counters

## Sync Strategy Notes
- Client stores last_sync timestamp per table
- For initial sync, since=0
- Upload local changes before fetching remote delta
- Use client IDs (text) as primary keys across devices

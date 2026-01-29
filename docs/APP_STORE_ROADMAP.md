# App Store Roadmap (SwiftUI + WKWebView)

This document is the Phase 0 plan and checklist for the first App Store release.
Scope: chat, tasks, diary, calendar, profile, sync, subscriptions.

## Phase 0: Decisions (done)
- Backend: Supabase
- iOS shell: SwiftUI + WKWebView
- Auth: Sign in with Apple
- Price: JPY 980 / month
- Free: 5 AI calls/day
- Paid: 100 AI calls/day

## Phase 1: Foundation (estimated 3-7 days)
1) Create Supabase project
2) Apply SQL schema + RLS policies
3) Create service roles and secrets
4) Implement server-side rate limiting + usage counters
5) Set up environment secrets (server)

Checklist:
- [ ] Supabase project created
- [ ] SQL schema applied
- [ ] RLS policies validated
- [ ] Service role key stored in server env
- [ ] Public anon key stored in iOS env

## Phase 2: Auth + Sync (estimated 7-14 days)
1) Sign in with Apple (iOS)
2) Exchange Apple identity token -> Supabase auth
3) Profile creation on first login
4) Sync endpoints (GET/POST /sync)
5) Local cache + conflict rule (last-write-wins)

Checklist:
- [ ] Apple sign-in works on device
- [ ] Supabase auth session created
- [ ] Profile row auto-created
- [ ] Sync endpoints return delta
- [ ] Offline cache works

## Phase 3: Subscriptions (estimated 5-10 days)
1) StoreKit 2 product configuration
2) Receipt validation
3) Server-side subscription status table
4) Limit enforcement in /ai/chat

Checklist:
- [ ] IAP products configured in App Store Connect
- [ ] Server verifies receipts
- [ ] subscription_status updated
- [ ] Feature gates enforced server-side

## Phase 4: App Store compliance (estimated 3-7 days)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Account deletion flow
- [ ] App Privacy answers
- [ ] Screenshot set
- [ ] Metadata

## Phase 5: TestFlight + Review (estimated 3-10 days)
- [ ] Internal TestFlight
- [ ] Bug fixes
- [ ] Submission

## Risk notes
- Most rework happens if auth/sync/limits are added after feature changes.
- Enforce limits server-side to keep costs bounded.

# Guild iPhone app (Expo)

Parent-first native app for booking privates, realtime alerts, inbox, and Guild Market.

## Location

- App: [`apps/mobile`](../apps/mobile)
- Bundle ID: `com.wrestlingguild.app`
- Scheme: `guild://`

## Backend pieces (this repo)

| Piece | Path |
|-------|------|
| Bearer JWT on API clients | [`lib/supabase/server.ts`](../lib/supabase/server.ts) |
| Push token register | `POST/DELETE /api/devices/push-token` |
| Expo push on notify | [`lib/expo-push.ts`](../lib/expo-push.ts) + [`lib/notifications.ts`](../lib/notifications.ts) |
| Parent coaches / bookings | `/api/mobile/coaches`, `/api/mobile/bookings` |
| Token table | `supabase/migrations/20260731120000_user_push_tokens.sql` |
| Notifications realtime | `supabase/migrations/20260731130000_notifications_realtime.sql` |
| Universal links | [`public/.well-known/apple-app-site-association`](../public/.well-known/apple-app-site-association) |

Apply both migrations on Supabase before testing push/realtime.

## Local setup

```bash
cd apps/mobile
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npm start
# press i for iOS simulator (push requires a physical device)
```

Send `x-tenant-slug: guild` is automatic from the app API client. Point `EXPO_PUBLIC_API_URL` at production or a tunnel to local Next (`http://localhost:3000` on simulator).

## TestFlight / EAS

1. Apple Developer Program membership + App Store Connect app for `com.wrestlingguild.app`.
2. Install EAS CLI: `npm i -g eas-cli` and `eas login`.
3. In `apps/mobile`: `eas init` — replace `REPLACE_WITH_EAS_PROJECT_ID` in `app.json`.
4. Replace `TEAMID` in `public/.well-known/apple-app-site-association` with your Apple Team ID; redeploy web.
5. Build internal TestFlight: `npm run eas:build:ios` (preview profile) or `eas build --platform ios --profile production`.
6. Submit: `eas submit --platform ios --latest`.
7. Invite 5–10 wrestling parents; verify push on booking confirmed + new message.

### Push checklist

- Physical iPhone (not simulator) for APNs
- Notification permission granted in Account → Enable push alerts
- Row in `user_push_tokens` for the user
- Trigger any `createNotification` (e.g. market offer / booking) and confirm device alert

## Phases

1. **Done in repo:** scaffold, auth, Find / Bookings / Inbox / Alerts / Market browse, push + realtime plumbing.
2. **Checkout:** booking still opens mobile web Stripe Checkout; Payment Sheet later.
3. **Coach app:** same binary, role-based home (Phase 3).

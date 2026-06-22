# Password reset email — Supabase dashboard setup

Isabella (and others) hit "invalid link" loops when the recovery email uses PKCE-only links opened in a **different browser** than forgot-password (e.g. request in Safari, open link in Gmail in-app).

## 1. Redirect URLs (Supabase → Authentication → URL Configuration)

Add every production origin you use (wildcards cover query strings):

- `https://www.wrestlingguild.com/auth/confirm**`
- `https://www.wrestlingguild.com/reset-password**`
- `https://wrestlingguild.com/auth/confirm**` (if apex is used)
- `https://wrestlingguild.com/reset-password**`
- `http://localhost:3000/auth/confirm**` (local dev)
- `http://localhost:3000/reset-password**`

## 2. Recovery email template (Supabase → Authentication → Email Templates → Reset password)

Replace the link body so it hits our confirm route with **TokenHash** (works in any browser):

```html
<h2>Reset your password</h2>
<p>Tap below to choose a new password for The Guild:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Freset-password">Reset password</a></p>
<p>If the button does not work, copy this URL into your browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Freset-password</p>
<p>This link expires after use. If you did not request a reset, you can ignore this email.</p>
```

**Site URL** in Supabase must match how users browse (prefer `https://www.wrestlingguild.com` if that is canonical).

## 3. After changing the template

Request a **new** reset link — old emails still use the previous template.

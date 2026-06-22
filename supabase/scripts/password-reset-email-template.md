# Password reset (production)

The app sends reset links via **Resend** (`/api/auth/forgot-password`) using Supabase admin `generateLink` — not Supabase’s built-in SMTP (2 emails/hour project-wide).

Required in production:

- `RESEND_API_KEY`
- `EMAIL_FROM` (verified domain in Resend)
- `NEXT_PUBLIC_APP_URL` (canonical origin, e.g. `https://www.wrestlingguild.com`)

Redirect URLs in Supabase → Authentication → URL Configuration (see section 1 below).

## 1. Redirect URLs (Supabase → Authentication → URL Configuration)

Add every production origin you use (wildcards cover query strings):

- `https://www.wrestlingguild.com/auth/confirm**`
- `https://www.wrestlingguild.com/reset-password**`
- `https://wrestlingguild.com/auth/confirm**` (if apex is used)
- `https://wrestlingguild.com/reset-password**`
- `http://localhost:3000/auth/confirm**` (local dev)
- `http://localhost:3000/reset-password**`

## 2. Recovery email (handled by app + Resend)

Forgot-password on the site uses `/api/auth/forgot-password`, which emails a link like:

`https://www.wrestlingguild.com/auth/confirm?token_hash=…&type=recovery&next=/reset-password`

You do **not** need to customize Supabase’s “Reset password” email template for users to receive links — unless you disable the app route. Optional: disable Supabase’s automatic recovery emails in dashboard if duplicates occur.

Legacy Supabase template (only if sending via Supabase SMTP instead of Resend):

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

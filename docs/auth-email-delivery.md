# WhyNavo Auth Email Delivery

WhyNavo uses Supabase Auth for email and password accounts. Public signup should not rely on Supabase's default email sender because it is intended for testing and has strict delivery limits.

Production email delivery can be configured in either of these ways:

1. Supabase Custom SMTP
2. Supabase Send Email Hook with a provider such as Resend

## Production Sender

The official production configuration is:

- Web app: `https://whynavo.com/`
- Email provider: Resend
- Verified sender domain: `auth.whynavo.com`
- Sender: `WhyNavo <account@auth.whynavo.com>`
- Supabase Send Email Hook: enabled and signed with `SEND_EMAIL_HOOK_SECRET`
- Confirmation template: branded bilingual WhyNavo template tracked in `docs/supabase-confirm-signup-email.html`
- Password reset template: branded bilingual WhyNavo template tracked in `docs/supabase-reset-password-email.html`

Cloudflare DNS publishes DKIM, SPF, return-path MX, and DMARC records for the sender domain. The Resend key is restricted to sending from `auth.whynavo.com`; the independent Cloudflare DNS token is restricted to the `whynavo.com` zone. Both values are encrypted GitHub Secrets and are never embedded in the web or extension bundle.

The Supabase built-in sender remains a test-only fallback and is not used for public registration. The repository workflow `.github/workflows/configure-production-email.yml` deploys the reviewed Hook, applies the Auth URLs and templates, and fails unless the expected sender, signature secret, and production URL are present.

Configure Supabase Auth URL settings as follows:

```txt
Site URL: https://whynavo.com/
Additional Redirect URL: https://whynavo.com/
```

For public registration, keep email confirmation enabled and require at least 12 characters with an uppercase letter, a lowercase letter, and a number. Signed-in password changes must also require the current password. WhyNavo provides password-reset and signed-in password-update controls in the account dialog.

The branded confirmation template is deployed to Supabase Auth and tracked at:

```txt
docs/supabase-confirm-signup-email.html
```

Use this subject:

```txt
Verify your WhyNavo email / 验证 WhyNavo 邮箱
```

The branded password reset template is tracked at:

```txt
docs/supabase-reset-password-email.html
```

Use this subject:

```txt
Reset your WhyNavo password / 重置 WhyNavo 密码
```

## Send Email Hook

The repository also includes a ready-to-deploy Send Email Hook at:

```txt
supabase/functions/send-auth-email/index.ts
```

Required Supabase Edge Function secrets:

```txt
RESEND_API_KEY
SEND_EMAIL_HOOK_SECRET
AUTH_EMAIL_FROM
AUTH_EMAIL_PUBLIC_APP_URL
```

Production values:

```txt
AUTH_EMAIL_FROM=WhyNavo <account@auth.whynavo.com>
AUTH_EMAIL_PUBLIC_APP_URL=https://whynavo.com/
```

Do not commit these values. Set them only in Supabase Secrets.

The function verification mode is fixed in `supabase/config.toml` so a normal all-functions deploy remains consistent:

```sh
supabase functions deploy send-auth-email
```

The Supabase Auth "Send Email" hook points to the deployed function URL. With the hook enabled, Supabase delegates Auth email delivery to the signed Hook instead of using the built-in SMTP sender.

The Hook does not place the Supabase one-time verification endpoint directly in the email. It places the endpoint in the URL fragment of `https://whynavo.com/confirm.html`; URL fragments are not sent to Cloudflare. The static page validates the exact Supabase project, endpoint, action, token shape, and redirect origin, then proceeds only after a trusted user click. This follows Supabase's documented mitigation for email-provider link prefetch. Disable click/open tracking in the email provider because rewritten authentication links are unsupported.

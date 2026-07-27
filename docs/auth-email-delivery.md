# WhyNavo Auth Email Delivery

WhyNavo uses Supabase Auth for email and password accounts. Public signup should not rely on Supabase's default email sender because it is intended for testing and has strict delivery limits.

Production email delivery can be configured in either of these ways:

1. Supabase Custom SMTP
2. Supabase Send Email Hook with a provider such as Resend

## Temporary Free Hosting Path

The public web app currently uses:

- Web app: `https://whynavo.pages.dev/`
- Email provider: Supabase built-in Auth sender
- Custom SMTP: disabled until an owned domain is available
- Send Email Hook: disabled until an owned sender domain is available
- Confirmation template: branded bilingual WhyNavo template tracked in `docs/supabase-confirm-signup-email.html`
- Password reset template: branded bilingual WhyNavo template tracked in `docs/supabase-reset-password-email.html`

`pages.dev` is a shared Cloudflare domain. A Pages project can use it for hosting and Auth redirects, but the project cannot provision a sender mailbox or the required DNS records under that shared domain. Supabase's built-in sender is a test-only path: it sends only to pre-authorized project-team addresses, is currently limited to two messages per hour, and must not be presented as public registration.

Configure Supabase Auth URL settings as follows:

```txt
Site URL: https://whynavo.pages.dev/
Additional Redirect URL: https://whynavo.pages.dev/
```

For public registration, keep email confirmation enabled and require at least 12 characters with an uppercase letter, a lowercase letter, and a number. Signed-in password changes must also require the current password. WhyNavo provides password-reset and signed-in password-update controls in the account dialog.

When an owned domain is purchased, configure Resend or another provider with DKIM, SPF, return-path, and DMARC records, then enable Supabase Custom SMTP.

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

## Optional Send Email Hook

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

Example values after an owned email domain is available:

```txt
AUTH_EMAIL_FROM=WhyNavo <no-reply@YOUR_DOMAIN>
AUTH_EMAIL_PUBLIC_APP_URL=https://whynavo.pages.dev/
```

Do not commit these values. Set them only in Supabase Secrets.

Deploy the function after the email provider and verified sender are ready. The function verification mode is also fixed in `supabase/config.toml` so a normal all-functions deploy remains consistent:

```sh
supabase functions deploy send-auth-email
```

Then enable the Supabase Auth "Send Email" hook and point it to the deployed function URL. With the hook enabled, Supabase delegates Auth email delivery to the hook instead of using the built-in SMTP sender.

The Hook does not place the Supabase one-time verification endpoint directly in the email. It places the endpoint in the URL fragment of `https://whynavo.pages.dev/confirm.html`; URL fragments are not sent to Cloudflare. The static page validates the exact Supabase project, endpoint, action, token shape, and redirect origin, then proceeds only after a trusted user click. This follows Supabase's documented mitigation for email-provider link prefetch. Disable click/open tracking in the email provider because rewritten authentication links are unsupported.

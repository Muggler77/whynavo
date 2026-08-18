# WhyNavo Website Deployment

The public marketing website is intentionally deployed separately from the
hosted WhyNavo app.

## Domain responsibilities

- `www.whynavo.com` -> Cloudflare Pages project `whynavo-site`
- `whynavo.com` -> existing WhyNavo app/PWA and authentication origin
- `auth.whynavo.com` -> transactional email sender DNS only

Do not redirect the root app origin to the marketing site. Browser IndexedDB,
PWA state, authentication callbacks, email confirmation, CAPTCHA, and the
current update manifest depend on the existing root origin.

## One-time Cloudflare setup

1. Create a Pages project named `whynavo-site` in the same Cloudflare account.
2. Add `www.whynavo.com` as a custom domain for that project.
3. Keep the existing root-domain Pages project and its `whynavo.com` binding unchanged.
4. Create a scoped API token with Pages deployment permission for the account.
5. Add these GitHub repository secrets:

   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

6. Add these GitHub repository variables:

   - `WHYNAVO_SITE_DEPLOY_ENABLED=true`
   - `WHYNAVO_CHROME_STORE_APPROVED=false`
   - `WHYNAVO_CHROME_STORE_URL=` (leave empty until the store listing is approved)

The deployment workflow does not require a database password, Supabase
service key, email credential, or user data.

## Build and deploy

```text
npm ci
npm run build:site
npm run verify:site
```

The independent workflow in
[`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml)
publishes only `site/dist` to `whynavo-site`.

While the Chrome Web Store listing is pending, the desktop CTA points to the
latest GitHub Release and the primary CTA points to `https://whynavo.com/`.
After approval, set `WHYNAVO_CHROME_STORE_APPROVED=true` and add the exact
store URL. The next site deployment changes the CTA without changing the app,
authentication or data origin.

## Final checks

- Open `https://www.whynavo.com/en/` and `/zh-cn/`.
- Confirm `https://whynavo.com/` still opens the app.
- Test the email confirmation and CAPTCHA pages on the root origin.
- Check the website sitemap in Search Console after DNS and TLS settle.
- Keep the root app and the website as separate rollback targets.

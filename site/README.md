# WhyNavo Website

This is the independent bilingual marketing site for WhyNavo.

- `www.whynavo.com` is the planned public website and SEO origin.
- `whynavo.com` remains the hosted app, PWA, authentication callback, CAPTCHA page, and local web-data origin.
- `site/dist` is generated and intentionally ignored by Git.

Build locally with:

```text
npm run build:site
npm run verify:site
```

The website build defaults to the web app and GitHub Release paths while the Chrome Web Store listing is pending. After the listing is approved, set `CHROME_STORE_APPROVED=true` and `CHROME_STORE_URL` in the website deployment environment to activate the store CTA without changing the app origin.

The Cloudflare Pages workflow deploys this site to the separate `whynavo-site` project. It does not deploy or mutate the existing WhyNavo app project.

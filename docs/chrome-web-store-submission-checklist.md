# Chrome Web Store Submission Checklist

## Package

- [ ] `npm run build` passes.
- [ ] `node scripts/verify-extension-package.mjs` passes.
- [ ] The archive contains `manifest.json` at its root.
- [ ] The archive contains no `_headers`, `CNAME`, wildcard-prefixed file,
  `.env`, source map, private key, or local database.
- [ ] The package version matches the intended public release.
- [ ] The package is tested in a clean Chrome profile and as an unpacked
  extension before upload.

## Listing

- [ ] Use the exact copy in `docs/chrome-web-store-listing.md`.
- [ ] Link the privacy policy to `https://whynavo.com/privacy.html`.
- [ ] Link support to `https://whynavo.com/terms.html` until a dedicated
  support site exists.
- [ ] Upload only clean screenshots without personal data.
- [ ] Use the WhyNavo icon assets from `extension/public/icons/`.
- [ ] Explain `search`, `alarms`, `storage`, optional `notifications`, and
  optional `geolocation` exactly as listed.

## Final release controls

- [ ] Confirm the public release archive checksum.
- [ ] Confirm the published release contains the same package as the local
  `extension/dist` directory.
- [ ] Verify registration, email confirmation, login, logout, local-only mode,
  sync, import, export, reminders, and account deletion.
- [ ] Do not submit as a broadly promoted product until a production email
  sender/domain and an exercised encrypted off-site backup are active.

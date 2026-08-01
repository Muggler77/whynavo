# Chrome Web Store Listing

This document is the reviewed submission copy for WhyNavo. It is intentionally
separate from the product UI so the store listing can be updated without adding
promotional or implementation-only text to the extension.

## Product identity

- Store name: `WhyNavo - Local-first New Tab`
- Short name: `WhyNavo`
- Category: Productivity
- Language: English; Simplified Chinese
- Primary support page: `https://whynavo.com/support.html`
- Privacy policy: `https://whynavo.com/privacy.html`
- Release package: the zip produced by `npm run build` from `extension/dist`

## Short description

`A calm, local-first new tab for shortcuts, notes, tasks, widgets, and optional account sync.`

## Detailed description

WhyNavo turns a new tab into a focused personal workspace without forcing your
data into a remote account.

### What it includes

- A clean new-tab canvas for websites, folders, widgets, notes, tasks,
  countdowns, calendar entries, and wallpapers.
- Local-first storage in the browser profile. The extension works before sign-in
  and keeps the local data on the current device.
- Optional account sign-in and multi-device synchronization. Cloud sync is
  opt-in and protected by account-scoped access policies.
- Import and export for WhyNavo JSON, WeTab `.data`, browser bookmark HTML, and
  CSV shortcut lists.
- Customizable spaces, navigation pages, icon choices, text icons, local image
  icons, wallpaper choices, search engine, language, and widget layout.
- Recurring task reminders through Chrome's local alarm and notification
  permissions, enabled only when the user requests them.
- Responsive web support for desktop, tablet, and mobile browsers through the
  official hosted app.

### Privacy by design

WhyNavo does not require an account for local use. Notes, tasks, shortcuts,
layout, and settings stay in the browser profile unless the user signs in and
chooses to synchronize. Private local images are not uploaded as part of normal
sync. See the full privacy policy before installing.

### Important limitations

The extension does not read the content of other web pages. It uses only the
permissions needed for the new-tab surface, local reminders, optional weather
and account features, and the reviewed public services listed in the privacy
policy.

## Permission justifications

| Permission | Why it is needed |
| --- | --- |
| `alarms` | Schedules recurring local task checks while the new-tab page is closed. |
| `storage` | Stores the small local reminder schedule used by the background service worker. |
| Optional `notifications` | Shows a reminder only after the user enables a task reminder. |
| Optional `geolocation` | Lets the user choose current location for weather; it is never requested automatically. |
| Host access to Open-Meteo | Retrieves weather and city data after the user enables the weather widget. |
| Host access to Have I Been Pwned | Performs a privacy-preserving password range check during account registration and password replacement. Only a five-character SHA-1 prefix leaves the device. |
| Host access to Supabase | Performs opt-in account authentication and account-scoped synchronization. |
| Host access to the WhyNavo Pages app | Loads the reviewed CAPTCHA frame and hosted web version used by the product. |

The extension has no content scripts, no `search` or `tabs` permission, no
browsing history permission, no `favicon` permission, and no broad
`http://*/*` access. Baidu and Google searches open ordinary HTTPS result URLs.

## Store privacy answers

- Does the extension handle user data? Yes.
- Data categories: website addresses and names, user-generated notes and task
  content, settings and layout, and account email when the user signs in.
- Is data sold? No.
- Is data used for advertising? No.
- Is data transferred for purposes unrelated to the extension's core function?
  No.
- Is data transferred securely? Local data remains in the browser profile;
  optional sync uses authenticated HTTPS requests and account-scoped database
  policies.
- Does the extension use remote code? No. The extension package contains the
  application code and does not download executable JavaScript at runtime.
- Does the extension use an account? Only for optional synchronization.

## Reviewer notes

1. Install the uploaded zip as a Manifest V3 package.
2. Open a new tab and verify that the local workspace is available before sign-in.
3. The account panel links to the hosted privacy and terms pages.
4. The optional notification and geolocation permissions are requested only
   after the corresponding feature is enabled.
5. The web app and browser extension use separate build outputs; Cloudflare
   Pages-only files are not present in the extension zip.

## Screenshot set

Use `docs/images/whynavo-0.9.18-store-home.png` for the initial listing. It was
captured from the production build in a temporary clean Chrome profile at the
required 1280x800 size. Do not include screenshots containing personal
shortcuts, account email addresses, private notes, or local file paths.

# Security Policy

## Supported Version

Security fixes are shipped for the latest whytab release. The hosted web app updates automatically; unpacked browser-extension users must replace the release files and reload the extension.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability or include user data, credentials, tokens, exported backups, email addresses, or screenshots containing private information.

Use GitHub's private vulnerability reporting feature on this repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the affected version, impact, and minimum steps needed to reproduce it.

The maintainer will acknowledge a valid private report within 72 hours when operationally possible, investigate it privately, and publish or mitigate critical account-isolation, credential, or silent-data-loss issues before public technical details are shared.

## Scope

High-priority reports include:

- Access to another account's synchronized data
- Authentication or Row Level Security bypass
- Leakage of service-role, email-provider, Cloudflare, or GitHub secrets
- Cross-site scripting or unsafe URL execution
- Account deletion failures
- Data corruption or silent loss during upgrade or multi-device synchronization

Public Supabase project URLs, publishable client keys, and Cloudflare Turnstile site keys are browser-visible configuration and are not secrets.

# Persian dashboard localization — beta / فارسی آزمایشی

> **Status: BETA — NOT A COMPLETE TRANSLATION.** This change does not alter TG Bot Studio backend, Telegram bot runtime, existing bot tokens or database schemas.

This owner fork remains anchored to upstream commit `aadeb562a1e047b271ceab144b6b220343ed2837` (the version initially installed on the shared VPS).

## What is implemented

- A fifth dashboard language: `fa`, shown as **فارسی (آزمایشی)** in the existing language menu.
- Locale catalogs `src/client/src/i18n/locales/fa.json` and `modules.fa.json` with identical key structures to English and all interpolation tokens preserved.
- Genuine RTL treatment for the dashboard using HTML `dir=rtl`, MUI theme direction, Emotion's RTL Stylis cache, and the self-hosted Vazirmatn variable font. Returning to English/Turkish/German/Russian returns to LTR.
- Explicit LTR direction for code, JSON, URL and numeric form fields.
- Existing locale parity and interpolation tests extended to Persian.

## Coverage — do not misrepresent

**301 of 1,697** string leaves have Persian translations at the initial milestone: 227 dashboard strings (including navigation, login, security, key actions) and 74 module names/descriptions for 37 modules. Remaining strings are retained in English so feature labels remain functional and existing key references never break. Much of the per-module configuration, help documentation, workflows and reporting will therefore still appear in English. Translation quality and visual QA for every screen are **not yet signed off**.

Completing localization requires translation of all remaining labels and docs; review of placeholders, Telegram commands and technical identifiers; and visual QA of mobile/desktop pages, dialogs, overlays, dashboards and complex forms. The `fa` language code should only be renamed `فارسی` (remove beta) after 100% coverage and QA.

## Building and testing

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build
```

The upstream GitHub CI runs these commands on Linux and Windows. Changes affecting translations or MUI direction should never be released before CI succeeds.

## Shared VPS safety

The current third-service deployment is separate from WorldFeed and TCS. **Do not run the original TG Bot Studio installer a second time**, reset the existing database or swap the whole source tree on the VPS. Any optional Persian beta preview/release must be scoped to the already-installed Studio's **static frontend assets**, keep all production secrets and database intact, take a private snapshot of the previous assets and restore them if any health, static asset or authentication check fails. Confirm WorldFeed/TCS and the shared Caddy are unaffected.

No bot token, private master key, VPS SSH key, IP certificate or production database belongs in this repository.

## Upstream contribution

After all strings and RTL screens are reviewed, submit a PR to `sametcn99/tg-bot-studio` so Persian can become an upstream-maintained language instead of a long-lived private patch.

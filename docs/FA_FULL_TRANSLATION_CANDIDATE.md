# Persian catalog — full-coverage machine translation candidate

**Status: candidate, not human-reviewed production localization.** The earlier 301 hand-translated entries are preserved, except one existing translation of module rules.description that omitted the required {rules} token; this was repaired. All remaining natural-language strings received Persian drafts via translation of the public English catalog, followed by focused manual review of 31 higher-impact UI strings.

| Metric | Count |
| --- | ---: |
| Shell locale leaves | 1001 |
| Module registry leaves | 696 |
| Already translated (initial) | 301 |
| Previously untranslated human-language candidates | 1389 |
| Newly changed candidates | 1384 |
| Technical examples/identifiers with no Persian characters | 5 |
| Manual critical-string refinements | 32 |

Technical-only exceptions are expected: support.mediaTypePlaceholder, broadcast.buttonsExample, flows.triggerStart, scanAccounts.wizard.apiHash, scheduler.fields.buttons.help. Literal JSON examples, Telegram slash commands, names, URLs and interpolation placeholders remain in their original syntax. Catalog key parity, placeholder tokens and newline counts were validated before commit.

## Required acceptance gates

1. Full human Persian linguistic QA on all automatically translated strings, with particular attention to authorizations, bans, permissions, payment, subscriber data and documentation of all 37 modules.
2. CI format/lint/typecheck/tests/build/Docker packaging and responsive RTL screen tests.
3. External HTTPS and authentication checks, full backup, atomic frontend-only rollback, and confirmation that TCS/WorldFeed/Caddy remain unaffected.
4. Do not mark the language production-final or deploy until these checks have passed.

No backend, bots, databases, secrets, shared VPS services, or Mini App source are changed in this candidate.

# Telegram-native operator UI / UX

This is the native Telegram presentation for the existing TG Bot Studio
operator client. It is not a second control plane or a separate database.
The operator bot and Mini App consume the current installed Studio services.

## Design contract

Implementation follows the official references:

- [Telegram Mini Apps – Designing Mini Apps](https://core.telegram.org/bots/webapps#designing-mini-apps): responsive mobile-first layout, dynamic light/dark theme, safe area, accessible labels and smooth UI.
- [Telegram Mini Apps – BackButton](https://core.telegram.org/bots/webapps#backbutton): show only on nested screens, navigate back within Studio, remove handlers on unmount.
- [Telegram Bot Guidelines – Inline keyboards](https://core.telegram.org/bots/guidelines): edit navigation messages in place rather than adding unnecessary messages.
- [Telegram Bot API – CallbackQuery / MenuButtonWebApp](https://core.telegram.org/bots/api): answer every callback promptly, use dedicated per-user private-chat menu buttons, keep callback data short.

### Telegram Mini App (React)

- The full existing dashboard remains authoritative: all legacy routes, modules,
  editors, flows, CRM, broadcasts, security and Mini Apps work through the
  same backend and authenticated session.
- Dedicated operator shell is rendered **only** for an actual Telegram launch
  with WebApp initData and the `tg_admin=1` launch marker. An untrusted query
  flag alone cannot authorize admin API access.
- Compact header, live active-bot status, refresh action, four large bottom
  navigation targets, searchable module drawer, dynamic category labels and
  disabled/loading/empty/error states.
- The searchable module list is fetched from
  `GET /api/bots/:botId/modules` on bot selection, drawer opening, periodic
  visible refresh and app resume. Display translations use the local
  i18n catalog when available; unknown **server** module keys/categories
  remain visible and open a safe live-core module inspector, which supports\n  toggling state without guessing unknown configuration fields. Local static
  metadata never determines whether a module exists or is enabled.
- The Telegram native back button, selection haptic feedback (only after a
  user action), current theme colors, bottom navigation, dynamic viewport,
  content-safe-area insets and 44px touch targets are respected.
- Telegram SDK is loaded only for the opt-in operator launch. Ordinary desktop
  dashboard views remain unchanged. Prefers reduced animation where requested.
- Operator login exchanges signed initData for a revocable HttpOnly cookie;
  the JWT is **not** returned to client JavaScript for Telegram logins.

### Private management bot

- Each screen is read from current `BotsService`. Bot metrics, bot list,
  category counts, module names, enablement and descriptions are *not*
  duplicated into bot configuration.
- Commands: `/start`, `/bots`, `/status`, `/panel`, `/help`.
- Hierarchical inline-keyboard navigation: overview, paginated bots, bot
  detail, paginated module categories, paginated modules, module detail.
- Sensitive module toggles have a separate confirmation step and one-time
  owner-bound callback; callbacks expire in 15 minutes.
- In-chat navigation edits the current menu instead of flooding chat history.
  Expired/inaccessible messages recover with a new menu.
- Native Telegram **Menu** WebApp button is registered only for approved
  users, including when they first send `/start`.

### Source-of-truth boundaries

These parts are **dynamic**: installed bots, runtime state, counters, the
server's module catalog and enablement flags, and the content of normal Studio
features over their existing APIs.

The existing dashboard still ships **client-side page definitions, forms and
field metadata** for known modules. A future backend-only module appears in
the operator catalog automatically and gets a safe server-backed detail/toggle
page, but its future bespoke visual editor will not be invented automatically. New front-end UI definitions will be necessary
for new bespoke module types. Telegram itself also has platform limits for
complex drag-and-drop, downloads, external auth and some browser integrations.

This update does **not** claim that all Telegram clients render identically
or that human UX validation has been completed on every supported device.
The Persian dashboard catalog is still subject to human linguistic review.

## Product architecture: stable shell + live core + owner preferences

The operator client deliberately separates three layers:

1. **Stable, user-centered shell:** four predictable bottom destinations
   (overview, selected bot, modules, Mini Apps), accessible touch targets,
   screen readers, contextual BackButton, Telegram light/dark theme and
   safe-area insets. The bot chat uses concise inline-keyboard hierarchy and
   answers callbacks before slow server requests.
2. **Dynamic, core-sourced capabilities:** bot lists, runtime states,
   statistics, categories, module descriptors, enablement flags, and features
   of the full dashboard come from the **existing** Studio API/SQLite.
   A route/bot switch refreshes the selected core entity. New server categories
   appear automatically. Unknown module types receive only a safe generic
   details/toggle view until an appropriate editor exists.
3. **Optional, owner-scoped personalization:** each authenticated, Telegram-
   verified operator can star up to 20 module keys and enable compact display.
   The favorites are stored in the existing `system_settings` table under
   operator-specific keys and are shared by the private management bot and
   its Mini App. Favorites are filtered against the **live module catalog**,
   so an obsolete favorite never invents a missing module. These preferences
   affect presentation only; they cannot configure or authorize modules.

### API and security contract

- `GET /api/operator/preferences`: return the current signed operator's
  `{ compactMode, favoriteModules }` (defaults: false, []).
- `PUT /api/operator/preferences`: strictly validate and save those two
  presentation-only fields for the current operator.
- Both routes require a revocable Studio JWT session created by a signed
  Telegram operator launch. A normal master-key dashboard session is **not**
  a Telegram operator identity and cannot access these routes.
- Operator identity is derived from the server's session record and verified
  against the active token fingerprint and numeric allowlist; **never** from
  a client-provided operator ID.
- Server-side owner preferences persist independently without a schema
  migration, separate database, or extra polling process.

### Remaining platform and product limits

A truly arbitrary future module cannot gain a custom visual editor without
a supported declarative schema or a frontend editor implementation. Mini App
WebView behaviors still vary by device; the final device/browser acceptance
checks below are required before calling a live installation production-
verified. No source-level check proves successful VPS deployment.

## Quality gates / acceptance checklist

Automated:

- Prettier, ESLint, TypeScript server + dashboard + end-user Mini App.
- Bun tests: signed Telegram initData, age/allowlist protections, dynamic
  module categories, paging and bidi-control sanitization.
- Full app build, Docker build, Prisma migration consistency in CI.

Before live deployment (manual, with a **distinct** BotFather bot token):

1. Test Android and iOS Telegram, mobile and desktop Telegram clients; verify
   light/dark and live theme changes, large font / small viewport, both text
   directions, WebApp back navigation and safe areas.
2. Test an empty Studio, one bot, many bots, many modules, new module category,
   module removal, retry on API failure and offline/online transitions.
3. Test non-allowlisted Telegram accounts, expired WebApp data, duplicate
   callback taps and confirmation cancellation, then check audit records.
4. Validate features that use file pickers, media, wide tables or visual
   flow builders; use external browser fallback where Telegram WebView limits
   a complex workflow.
5. Back up the existing Studio SQLite volume and environment, then redeploy
   **only** the existing Studio container; verify WorldFeed, TCS, proxy routes
   and other services remain healthy. Never create a second Studio instance.

See [Telegram Operator Client setup](TELEGRAM_OPERATOR_CLIENT.md).

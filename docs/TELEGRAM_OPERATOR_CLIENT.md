# Integrated Telegram Operator Client

This feature runs a **dedicated private Telegram management bot** inside the existing
TG Bot Studio process. It reuses the installed Studio database, backend API,
dashboard UI, sessions and module services. It does **not** create a second
Studio deployment, copy data, or change existing managed bot tokens.

## Capabilities

- Private chat: /start, /bots, /status, /panel, paginated module browser,
  confirmation-gated enable/disable switches; all actions use the current
  BotsService and are reflected immediately in the web dashboard.
- Telegram Mini App: launches the **existing full React dashboard** from the
  admin bot. All native dashboard routes, forms, and visual builders remain
  available there (subject to normal Telegram WebView platform limitations).
- Persian-first operator UI: Persian chat messages, and the existing Persian
  dashboard catalog is selected for first-time Telegram operator launches.
  **The dashboard's Persian translation remains a candidate pending human QA.**
- Security: validated Telegram WebApp initData (BotFather token HMAC),
  5-minute max age, explicit numeric Telegram user allowlist, revocable
  HttpOnly/SameSite session cookie, no credentials in links, no group commands,
  one-use sensitive callbacks and confirmation before switching modules.

## Configuration on the existing Studio service

1. Create a **new** management bot via @BotFather. Never reuse the token of
   any bot managed by Studio or polled by another service.
2. Set the existing HTTPS public domain in APP_URL, e.g.
   `APP_URL=https://studio.example.com`.
3. Configure two secrets in the **existing Studio service**:
   `ADMIN_CLIENT_BOT_TOKEN=<new BotFather token>` and
   `ADMIN_CLIENT_USER_IDS=<your numeric Telegram user ID>`.
   Multiple administrators are comma-separated numbers.
4. Apply the audited change to the **existing deployment only** (single instance).
   After a successful health check, open the new bot in a private chat and
   send `/start`. The **داشبورد کامل** WebApp button opens the same Studio
   dashboard without re-entering the master key.
5. Test a non-allowlisted account, a stale WebApp launch, a module toggle,
   a persistent session and logout. Confirm no other VPS services changed.

Without **both** environment variables the operator feature is disabled. An
HTTP-only APP_URL never produces a WebApp button. Do not paste tokens, server
IP addresses, SSH secrets or administrator IDs into GitHub, PRs or chat logs.

## Architecture and rollback

- Server: `src/server/operator-client/*`, registered by `AppModule`.
- Auth: `POST /api/auth/telegram-login` accepts raw signed Telegram
  `X-Telegram-Init-Data` header. Unlike a username, the identity is HMAC
  verified against ADMIN_CLIENT_BOT_TOKEN and ADMIN_CLIENT_USER_IDS.
- Dashboard: `/?tg_admin=1` (or any existing dashboard route with that query)
  uses the existing login/session/authorization model and remains accessible
  as the normal web dashboard.
- The existing SQLite file, migrations, business modules and bot runtime are
  unchanged. The new bot is a separate polling client **within the same
  single-instance Studio process**.
- Rollback: unset the two new environment variables to disable the client,
  or revert the code revision. Do not delete SQLite data. Back up the existing
  data volume and environment privately before any production rollout.

## Operational caveats

Telegram webview navigation, downloads and long drag-and-drop editors may feel
different from a desktop browser. Use a standard browser for workflows Telegram
cannot support, rather than duplicating the backend. There is currently no
Telegram chat command for destructive operations such as bot deletion or
database restore; those remain in the authenticated dashboard.

If a token is lost or compromised, revoke it in BotFather, remove access to
the old operator and revoke active sessions under Security. Review alerting
and key-rotation procedures before enabling this on a public VPS.

### Verification

CI on pull requests runs Prettier, ESLint, server/client type checking, Bun
tests, Prisma migration drift checks, production build and Docker image build.
Run live end-to-end tests against a **staging** instance with a separate
BotFather token before exposing it on the shared production VPS.

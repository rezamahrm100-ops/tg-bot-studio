# Existing-service deployment (Docker Compose / Coolify)

This guide is for updating an **existing** TG Bot Studio instance, including
the integrated private Telegram operator bot and operator Mini App. It does
not install a second instance and does not manage unrelated applications.

> **Release boundary:** Passing GitHub CI is not proof of deployment.
> Telegram client QA, the real BotFather token, the administrator allowlist,
> the existing HTTPS domain, and VPS/Coolify access are still needed.
> Treat production changes as incomplete until the live health and Telegram
> acceptance checks below pass.

## Before changing anything

1. Identify the *existing* Studio service, its source revision, deployment
   method (Coolify or plain Compose), domain, proxy routing, and persistent
   data volume. Do not assume the working directory or proxy layout.
2. Confirm that WorldFeed, TCS and any other services on the VPS are healthy,
   and record their baseline. This deployment must not redeploy them.
3. Confirm that only **one** TG Bot Studio process polls each bot token.
   SQLite is single-writer and Telegram long polling conflicts across replicas.
4. Back up the existing SQLite data volume and the environment settings in a
   restricted, off-repository location. Record the exact last-known-good source
   revision and verify that the backup can be restored. SQLite hot copying is
   unsafe without a consistent snapshot: prefer the Studio's own SQLite backup
   mechanism or a cold volume backup taken after stopping only Studio.
5. Confirm that the existing public domain serves HTTPS with valid TLS.
   Do not change shared host ports, reverse-proxy rules, or unrelated volumes.

## Enable the management bot on the existing Studio service

Create a **separate** Telegram bot using [@BotFather](https://t.me/BotFather).
Never reuse a token of a bot already running inside Studio, WorldFeed, TCS,
or another polling process.

Configure these variables in the existing Studio service's private
environment/secrets store (not in Git, an issue, or a chat message):

| Variable | Requirement |
| --- | --- |
| `APP_URL` | Existing externally reachable **HTTPS** Studio origin, e.g. `https://studio.example.com`; no extra path |
| `ADMIN_CLIENT_BOT_TOKEN` | New dedicated BotFather token |
| `ADMIN_CLIENT_USER_IDS` | Comma-separated **numeric Telegram user IDs** allowed to manage Studio |
| `ADMIN_MASTER_KEY` | Existing strong Studio admin secret; preserve it |
| `JWT_SECRET` | Existing long, strong session-signing secret; preserve it |

If either operator-specific variable is unset, the operator client stays
disabled. Keep the existing Studio database, domain, and credentials intact.
Do not print the environment during verification.

## Option A: existing Coolify service

1. Open the *already deployed* TG Bot Studio service, not a new application.
   Verify the Git source points at this repository's reviewed `master` and
   the internal application port remains `3000`.
2. Verify the existing volume mapping preserves `/app/data`; the supplied
   Compose definition uses the named volume `tg_bot_studio_data`.
   Do not remove, rename, or replace an existing production volume.
3. Set the three operator values above in the service's private environment
   settings, preserving the existing production `ADMIN_MASTER_KEY` and
   `JWT_SECRET`. Ensure `APP_URL` is the existing HTTPS origin.
4. After verified backups and checks, redeploy **only** the existing Studio
   application. Do not alter WorldFeed, TCS, proxies, or sibling services.
5. Check the Studio health endpoint and its deployment logs without exposing
   tokens. If the deployment is unhealthy, stop further changes and follow
   the rollback procedure below.

## Option B: existing plain Docker Compose service

Run these operations only in the **verified existing Studio checkout**; do
not create a second Compose project and do not run them from an unrelated
directory. Keep private credentials out of command output and shell history.

```bash
# Inspect the current instance first, without dumping its environment:
docker compose ps
docker compose config -q

# After recording the last-known-good revision and taking a verified backup:
git fetch origin master
git checkout master
git pull --ff-only origin master

# Rebuild and replace only the existing Studio service:
docker compose up -d --build --no-deps studio

# Local process/health checks:
docker compose ps studio
docker compose exec -T studio bun -e "await fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
```

Do not add host port `3000:3000` when the existing reverse proxy already
routes to the service. Do not use `docker compose down -v`, `prune --volumes`,
or `docker compose up --scale studio=2`.

## Acceptance checks on the deployed instance

- Existing Studio HTTPS URL responds, and `/api/health` returns success.
- Existing bots and modules remain present; there is exactly one poller for
  the dedicated management token.
- Only an allowlisted Telegram account can use the operator bot in a
  **private** chat. Verify `/start`, `/bots`, `/status`, `/panel`, and
  `/help`. A non-allowlisted account must be denied.
- The **full dashboard** opens through the Telegram Mini App without asking
  for the Studio master key; module changes reflect the *same* live backend.
- Test at least Android and iOS Telegram, light/dark themes, Persian RTL,
  navigation BackButton, safe-area insets, bot switching, error states,
  and long content/visual editor fallbacks.
- Test a confirmed module enable/disable with a **noncritical test bot**.
  Verify the one-time confirmation behavior and audit events. Do not begin
  with destructive production changes.
- Recheck WorldFeed, TCS and other baseline VPS services after redeployment.
- Do not call the operator client production-verified until these checks
  have passed. CI alone verifies source and build, not real Telegram behavior.

## Rollback

If verification fails, disable the new operator integration by removing
`ADMIN_CLIENT_BOT_TOKEN` and `ADMIN_CLIENT_USER_IDS` from the existing
Studio service and redeploying only that service. This disables the
management bot without removing Studio data.

For a code rollback, first establish whether a newer migration ran.
Rebuild the recorded last-known-good revision only if its database schema
is compatible; otherwise restore the matching consistent database backup
and environment values following the documented Studio backup procedure.
Never wipe the named volume to recover from a deploy error.

## Notes

- The operator bot is a client of the existing NestJS/SQLite application,
  not a second database or a separate admin service.
- Known modules retain their existing UI editors; unknown server-provided
  modules appear in a safe generic inspector but do not acquire new bespoke
  editors automatically.
- Telegram WebView may restrict downloads, third-party authentication, or
  complex drag-and-drop; use the standard authenticated browser dashboard
  when a feature cannot operate in the Telegram client.
- This guide cannot validate a server from GitHub. A production deployment
  requires authorized access to the existing VPS/Coolify service.

More detail: [Telegram Operator Client](docs/TELEGRAM_OPERATOR_CLIENT.md) and
[Telegram-native UX](docs/TELEGRAM_OPERATOR_UX.md).

# Agent API for ChatGPT and WICC

TG Bot Studio already exposes the same REST controllers that power its dashboard. The API root is `/api` and the route reference is `/api/docs`. This integration adds dedicated, opt-in machine credentials rather than sharing an administrator's master key or browser session.

## Server configuration

Generate two independent, high-entropy secrets (at least 32 characters; 32 random bytes or more recommended). Configure these **only in the existing Studio server's deployment environment**:

- `STUDIO_AGENT_READ_TOKEN`: read-only `GET` / `HEAD`.
- `STUDIO_AGENT_WRITE_TOKEN`: read and write bot/template operations.

Both are optional; if absent, agent authentication is disabled. Use HTTPS between the remote runner and Studio. Send the selected key as `X-Studio-Agent-Token` on requests. Never commit the value, paste it into an issue, put it in a URL or print it in logs.

Existing routes are reused: `/api/bots`, `/api/bots/:id`, `/api/bots/:id/modules`, `/api/bots/:id/modules/:moduleKey`, and bot-scoped module controllers such as scheduling, flows, autoresponders and broadcasts. `/api/templates` is also supported. These are the only agent-accessible API roots. Authentication, sessions, backup, metrics, and the Mini App public endpoints retain their existing mechanisms; agent credentials do not unlock them.

## Examples

```bash
# Read through a TLS-secured Studio deployment.
curl --fail-with-body \
  -H "X-Studio-Agent-Token: $STUDIO_AGENT_READ_TOKEN" \
  "https://studio.example.org/api/bots"

# Module configuration: the same endpoint used by the dashboard.
curl --fail-with-body -X PUT \
  -H "X-Studio-Agent-Token: $STUDIO_AGENT_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"enabled":true}' \
  "https://studio.example.org/api/bots/BOT_ID/modules/MODULE_KEY"
```

## WICC integration

The private `rezamahrm100-ops/windows-command-center` workflow `.github/workflows/tg-studio-agent-api.yml` is triggered only by an owner comment in the existing private Issue #9, on the reviewed `main` branch, and executes on the existing `wicc-interactive` self-hosted runner.

The WICC repository requires two **GitHub Actions secrets**, which must be provisioned without copying values into issue comments:

- `TG_STUDIO_BASE_URL`: HTTPS origin only, e.g. `https://studio.example.org`
- `TG_STUDIO_AGENT_TOKEN`: equal to the dedicated `STUDIO_AGENT_WRITE_TOKEN` from the Studio server

The WICC bridge accepts strict JSON commands with `mode`, `method`, `path`, and optional `body`. Writes require explicit confirmation; `preview` validates locally without any network or Studio mutation. Sensitive input fields are rejected. No arbitrary shell, host administration or browser execution is supported.

**Operational completion is not established by merging code.** Confirm the WICC runner actually executes, the Studio deployment has received the new server code and key, and a GET to `/api/bots` returns a real authenticated success. Test writes on a non-production bot before managing live resources.

## Boundaries

The GitHub-comment transport is intentionally not a channel for BotFather tokens, credentials, private file contents, or other secrets. Multipart uploads/downloads and the dashboard's privileged security/backup UI are outside the issue-comment bridge; use Studio's authenticated direct API or dashboard under the existing approvals for those operations. The server agent key may be rotated or removed at any time.

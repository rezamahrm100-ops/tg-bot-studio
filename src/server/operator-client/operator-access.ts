import { createHash } from 'node:crypto';
import { validateInitData } from '../common/utils/telegram.util';

/**
 * Telegram operator access is strictly opt-in: both a distinct BotFather token
 * and a nonempty allowlist of numeric Telegram user IDs must be configured.
 */
export function allowedOperatorIds(raw: string | undefined): ReadonlySet<number> {
  const value = (raw ?? '').replace(/\s+/g, '');
  if (!value || !/^[1-9]\d*(,[1-9]\d*)*$/.test(value)) return new Set();
  const ids = value.split(',').map(Number);
  return ids.every((id) => Number.isSafeInteger(id)) ? new Set(ids) : new Set();
}

/**
 * Verifies a *fresh*, Telegram-signed WebApp launch from the dedicated
 * operator bot. Never trust initDataUnsafe, query parameters or a user ID
 * supplied independently by the browser.
 */
export function authorizedOperatorId(
  initData: string,
  token: string | undefined = process.env.ADMIN_CLIENT_BOT_TOKEN,
  allowedIds: string | undefined = process.env.ADMIN_CLIENT_USER_IDS,
): number | null {
  const ids = allowedOperatorIds(allowedIds);
  if (!token || ids.size === 0 || !initData || initData.length > 8192) return null;

  const params = new URLSearchParams(initData);
  if (params.getAll('hash').length !== 1 || params.getAll('auth_date').length !== 1) return null;
  const authDate = Number(params.get('auth_date'));
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Restrict administrative exchanges to a five-minute window and reject
  // tokens allegedly issued far in the future (clock skew allowance: 60s).
  if (!Number.isSafeInteger(authDate) || authDate < nowSeconds - 300 || authDate > nowSeconds + 60) {
    return null;
  }

  const result = validateInitData(initData, token, 300);
  if (!result.valid || !Number.isSafeInteger(result.userId) || !ids.has(result.userId!)) {
    return null;
  }
  return result.userId!;
}

/** Fingerprint the configured token without persisting or echoing the credential. */
export function operatorTokenFingerprint(): string | null {
  const token = process.env.ADMIN_CLIENT_BOT_TOKEN?.trim();
  return token ? createHash('sha256').update(token).digest('hex').slice(0, 16) : null;
}

/** Revoking an operator ID or rotating the token invalidates their sessions. */
export function isCurrentOperator(id: number, fingerprint: string): boolean {
  return operatorTokenFingerprint() === fingerprint &&
    allowedOperatorIds(process.env.ADMIN_CLIENT_USER_IDS).has(id);
}

/** Open the existing dashboard as a Telegram Mini App, never an HTTP URL. */
export function operatorWebAppUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.pathname = '/';
    url.search = '?tg_admin=1';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

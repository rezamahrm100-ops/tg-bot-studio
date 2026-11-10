import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { allowedOperatorIds, authorizedOperatorId } from './operator-access';

const token = '123456:operator-bot-test-token';
const owner = 123456789;

function signedLaunch(authDate: number, id: number = owner): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    user: JSON.stringify({ id, first_name: 'Operator' }),
    query_id: 'AAEAAAE',
  });
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('Telegram operator authorization', () => {
  test('fails closed when allowlist is absent or malformed', () => {
    expect(allowedOperatorIds(undefined).size).toBe(0);
    expect(allowedOperatorIds('123456789,not-an-id').size).toBe(0);
    expect(allowedOperatorIds('123456789, 987654321').has(987654321)).toBe(true);
  });

  test('accepts only a fresh correctly signed launch from an allowed Telegram user', () => {
    const payload = signedLaunch(Math.floor(Date.now() / 1000));
    expect(authorizedOperatorId(payload, token, String(owner))).toBe(owner);
    expect(authorizedOperatorId(payload, token, '99999999')).toBeNull();
    expect(authorizedOperatorId(payload, 'different:bot-token', String(owner))).toBeNull();
    expect(authorizedOperatorId(payload, token, '')).toBeNull();
  });

  test('rejects a modified signature or user identity', () => {
    const payload = signedLaunch(Math.floor(Date.now() / 1000));
    expect(
      authorizedOperatorId(payload.replace('Operator', 'Attacker'), token, String(owner)),
    ).toBeNull();
    const other = signedLaunch(Math.floor(Date.now() / 1000), owner + 1);
    expect(authorizedOperatorId(other, token, String(owner))).toBeNull();
  });

  test('rejects stale and future-dated launches', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(authorizedOperatorId(signedLaunch(now - 301), token, String(owner))).toBeNull();
    expect(authorizedOperatorId(signedLaunch(now + 61), token, String(owner))).toBeNull();
  });

  test('rejects duplicate auth_date or hash values', () => {
    const payload = signedLaunch(Math.floor(Date.now() / 1000));
    expect(authorizedOperatorId(payload + '&auth_date=1', token, String(owner))).toBeNull();
    expect(authorizedOperatorId(payload + '&hash=deadbeef', token, String(owner))).toBeNull();
  });
});

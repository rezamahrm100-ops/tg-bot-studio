import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const read = 'r'.repeat(48);
const write = 'w'.repeat(48);
const previousRead = process.env.STUDIO_AGENT_READ_TOKEN;
const previousWrite = process.env.STUDIO_AGENT_WRITE_TOKEN;

function context(method: string, path: string, key: string): ExecutionContext {
  const request = {
    method,
    originalUrl: path,
    url: path,
    headers: { 'x-studio-agent-token': key },
  };
  return {
    getHandler: () => function endpoint() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const guard = new JwtAuthGuard({
  getAllAndOverride: () => false,
} as unknown as Reflector);

describe('agent tokens reuse protected bot REST APIs', () => {
  beforeAll(() => {
    process.env.STUDIO_AGENT_READ_TOKEN = read;
    process.env.STUDIO_AGENT_WRITE_TOKEN = write;
  });

  afterAll(() => {
    if (previousRead === undefined) delete process.env.STUDIO_AGENT_READ_TOKEN;
    else process.env.STUDIO_AGENT_READ_TOKEN = previousRead;
    if (previousWrite === undefined) delete process.env.STUDIO_AGENT_WRITE_TOKEN;
    else process.env.STUDIO_AGENT_WRITE_TOKEN = previousWrite;
  });

  test('read credential is accepted on bots and templates', () => {
    expect(guard.canActivate(context('GET', '/api/bots', read))).toBe(true);
    expect(guard.canActivate(context('GET', '/api/templates', read))).toBe(true);
  });

  test('read credential cannot mutate state', () => {
    expect(() => guard.canActivate(context('DELETE', '/api/bots/abc', read))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context('PUT', '/api/bots/abc/modules/xyz', read))).toThrow(
      ForbiddenException,
    );
  });

  test('write credential can manage modules via existing controller', () => {
    expect(guard.canActivate(context('PUT', '/api/bots/abc/modules/x', write))).toBe(true);
  });

  test('auth, backup and unrecognized API roots are forbidden', () => {
    for (const path of ['/api/auth/sessions', '/api/backup', '/api/metrics', '/api/tma']) {
      expect(() => guard.canActivate(context('GET', path, write))).toThrow(ForbiddenException);
    }
  });

  test('invalid and short secrets fail closed', () => {
    expect(() => guard.canActivate(context('GET', '/api/bots', 'wrong'.repeat(10)))).toThrow(
      UnauthorizedException,
    );
    process.env.STUDIO_AGENT_READ_TOKEN = 'short';
    expect(() => guard.canActivate(context('GET', '/api/bots', 'short'))).toThrow(
      UnauthorizedException,
    );
    process.env.STUDIO_AGENT_READ_TOKEN = read;
  });

  test('encoded path variants are denied', () => {
    expect(() => guard.canActivate(context('GET', '/api/bots/%2e%2e/auth', write))).toThrow(
      ForbiddenException,
    );
  });
});

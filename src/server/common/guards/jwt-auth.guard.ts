import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Match high-entropy service credentials in constant time without echoing them. */
function matchesCredential(candidate: string, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || candidate.length < 32) return false;
  const a = createHash('sha256').update(candidate, 'utf8').digest();
  const b = createHash('sha256').update(configured, 'utf8').digest();
  return timingSafeEqual(a, b);
}

type AgentAccess = 'read' | 'write';

/**
 * Existing JWT guard with optional agent credentials for the bot-management
 * and template-management APIs. Dashboard sessions are unchanged.
 * Agent authentication is disabled unless a 32+ character key is configured.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('StudioAgentAuth');

  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const supplied = req.headers['x-studio-agent-token'];
    if (supplied !== undefined) {
      if (typeof supplied !== 'string' || supplied.length > 512) {
        throw new UnauthorizedException('Invalid agent credential');
      }
      const path = (req.originalUrl ?? req.url).split('?')[0];
      // Explicit allowlist; auth, backup, metrics and public TMA are excluded.
      if (
        !/^\/api\/(?:bots(?:\/|$)|templates(?:\/|$))/.test(path) ||
        /[%\\]/.test(path) ||
        path.includes('//') ||
        path.includes('/../')
      ) {
        throw new ForbiddenException('Agent access is not permitted for this API');
      }
      let access: AgentAccess | null = null;
      if (matchesCredential(supplied, process.env.STUDIO_AGENT_WRITE_TOKEN)) {
        access = 'write';
      } else if (matchesCredential(supplied, process.env.STUDIO_AGENT_READ_TOKEN)) {
        access = 'read';
      }
      if (!access) throw new UnauthorizedException('Invalid agent credential');
      if (access === 'read' && !['GET', 'HEAD'].includes(req.method)) {
        throw new ForbiddenException('Agent credential is read-only');
      }
      // Business controllers do not require a persisted dashboard session.
      (req as Request & { user?: { sessionId: string; agentAccess: AgentAccess } }).user = {
        sessionId: 'studio-agent:' + access,
        agentAccess: access,
      };
      this.logger.log('Agent request ' + req.method + ' ' + path + ' access=' + access);
      return true;
    }
    return super.canActivate(context);
  }
}

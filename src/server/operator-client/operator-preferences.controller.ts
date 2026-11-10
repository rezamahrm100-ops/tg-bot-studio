import { Controller, Get, Put, Body, UnauthorizedException } from '@nestjs/common';
import { CurrentSession } from '../common/decorators/current-session.decorator';
import { PrismaService } from '../database/prisma.service';
import { isCurrentOperator } from './operator-access';
import { OperatorPreferencesService } from './operator-preferences';

/**
 * Authenticated Telegram-operator preferences. The operator identity is
 * resolved from the verified, revocable Studio session -- never from a
 * user-supplied Telegram ID, URL parameter or browser storage.
 */
@Controller('operator/preferences')
export class OperatorPreferencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: OperatorPreferencesService,
  ) {}

  private async operatorId(sessionId: string): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userAgent: true },
    });
    const match = /^studio-operator:([1-9]\d*):([a-f0-9]{16});/.exec(session?.userAgent ?? '');
    const operatorId = match ? Number(match[1]) : 0;
    if (!match || !Number.isSafeInteger(operatorId) || !isCurrentOperator(operatorId, match[2])) {
      throw new UnauthorizedException('Active Telegram operator session required');
    }
    return operatorId;
  }

  @Get()
  async get(@CurrentSession() session: { sessionId: string }) {
    return this.preferences.get(await this.operatorId(session.sessionId));
  }

  @Put()
  async save(@CurrentSession() session: { sessionId: string }, @Body() input: unknown) {
    return this.preferences.save(await this.operatorId(session.sessionId), input);
  }
}

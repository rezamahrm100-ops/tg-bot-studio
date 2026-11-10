import { Module } from '@nestjs/common';
import { BotsModule } from '../bots/bots.module';
import { OperatorClientService } from './operator-client.service';
import { OperatorPreferencesService } from './operator-preferences';
import { OperatorPreferencesController } from './operator-preferences.controller';

/** Opt-in Telegram operator surface sharing the existing Studio services. */
@Module({
  imports: [BotsModule],
  controllers: [OperatorPreferencesController],
  providers: [OperatorPreferencesService, OperatorClientService],
})
export class OperatorClientModule {}

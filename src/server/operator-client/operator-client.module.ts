import { Module } from '@nestjs/common';
import { BotsModule } from '../bots/bots.module';
import { OperatorClientService } from './operator-client.service';

/** Opt-in Telegram operator surface sharing the existing Studio services. */
@Module({
  imports: [BotsModule],
  providers: [OperatorClientService],
})
export class OperatorClientModule {}

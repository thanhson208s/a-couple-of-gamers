import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { GuardsModule } from '../../common/guards/guards.module';
import { MatchesModule } from '../matches/matches.module';
import { AuthModule } from '../auth/auth.module';
import { DevController } from './dev.controller';

@Module({
  imports: [
    GuardsModule,
    AuthModule,
    MatchesModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', 'public', 'dev'),
      serveRoot: '/dev',
    }),
  ],
  controllers: [DevController],
})
export class DevModule {}

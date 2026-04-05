import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', '..', 'public', 'admin'),
      serveRoot: '/admin',
    }),
  ],
  controllers: [AdminController],
})
export class AdminModule {}

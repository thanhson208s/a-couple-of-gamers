import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { GuardsModule } from '../../common/guards/guards.module';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../../common/redis/redis.module';
import { FirebaseModule } from '../../common/firebase/firebase.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    GuardsModule,
    UsersModule,
    RedisModule,
    FirebaseModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, GuardsModule],
})
export class AuthModule {}

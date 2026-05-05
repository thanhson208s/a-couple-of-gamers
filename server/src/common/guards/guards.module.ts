import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthGuard } from './admin-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RcAuthGuard } from './rc-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AdminAuthGuard, DevAuthGuard, JwtAuthGuard, RcAuthGuard],
  exports: [JwtModule, AdminAuthGuard, DevAuthGuard, JwtAuthGuard, RcAuthGuard],
})
export class GuardsModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, AuthGuard, AuthorizationService],
  exports: [AuthService, AuthTokenService, AuthGuard, AuthorizationService],
})
export class AuthModule {}

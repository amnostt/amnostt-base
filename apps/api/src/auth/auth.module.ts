import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthorizationService } from './authorization.service';
import { RegistrationThrottleGuard } from './registration-throttle.guard';
import { LoginThrottleGuard } from './login-throttle.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthGuard,
    AuthorizationService,
    RegistrationThrottleGuard,
    LoginThrottleGuard,
  ],
  exports: [AuthService, AuthTokenService, AuthGuard, AuthorizationService],
})
export class AuthModule {}

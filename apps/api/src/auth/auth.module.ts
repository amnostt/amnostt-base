import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthorizationService } from './authorization.service';
import { RegistrationThrottleGuard } from './registration-throttle.guard';
import { LoginThrottleGuard } from './login-throttle.guard';
import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordRecoveryThrottleGuard } from './password-recovery-throttle.guard';
import { PasswordResetThrottleGuard } from './password-reset-throttle.guard';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleTokenVerifier } from './google-token-verifier';

@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthGuard,
    AuthorizationService,
    RegistrationThrottleGuard,
    LoginThrottleGuard,
    PasswordRecoveryService,
    PasswordRecoveryThrottleGuard,
    PasswordResetThrottleGuard,
    GoogleIdentityService,
    GoogleTokenVerifier,
  ],
  exports: [AuthService, AuthTokenService, AuthGuard, AuthorizationService],
})
export class AuthModule {}

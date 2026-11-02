import { Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { MailModule } from './mail/mail.module';

function getPositiveInteger(
  configService: ConfigService,
  name: string,
): number {
  const value = configService.getOrThrow<string>(name);
  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
}

function getPositiveIntegerOrDefault(
  configService: ConfigService,
  name: string,
  fallback: number,
): number {
  const value = configService.get<string>(name);
  return value === undefined || value.trim() === ''
    ? fallback
    : getPositiveInteger(configService, name);
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'registration-ip',
          limit: getPositiveInteger(
            configService,
            'AUTH_REGISTRATION_IP_LIMIT',
          ),
          ttl:
            getPositiveInteger(
              configService,
              'AUTH_REGISTRATION_IP_TTL_SECONDS',
            ) * 1000,
        },
        {
          name: 'registration-email',
          limit: getPositiveInteger(
            configService,
            'AUTH_REGISTRATION_EMAIL_LIMIT',
          ),
          ttl:
            getPositiveInteger(
              configService,
              'AUTH_REGISTRATION_EMAIL_TTL_SECONDS',
            ) * 1000,
        },
        {
          name: 'login-ip',
          limit: getPositiveInteger(configService, 'AUTH_LOGIN_IP_LIMIT'),
          ttl:
            getPositiveInteger(configService, 'AUTH_LOGIN_IP_TTL_SECONDS') *
            1000,
        },
        {
          name: 'login-email',
          limit: getPositiveInteger(configService, 'AUTH_LOGIN_EMAIL_LIMIT'),
          ttl:
            getPositiveInteger(configService, 'AUTH_LOGIN_EMAIL_TTL_SECONDS') *
            1000,
        },
        {
          name: 'password-recovery-ip',
          limit: getPositiveIntegerOrDefault(
            configService,
            'AUTH_PASSWORD_RECOVERY_IP_LIMIT',
            5,
          ),
          ttl:
            getPositiveIntegerOrDefault(
              configService,
              'AUTH_PASSWORD_RECOVERY_IP_TTL_SECONDS',
              900,
            ) * 1000,
        },
        {
          name: 'password-recovery-email',
          limit: getPositiveIntegerOrDefault(
            configService,
            'AUTH_PASSWORD_RECOVERY_EMAIL_LIMIT',
            3,
          ),
          ttl:
            getPositiveIntegerOrDefault(
              configService,
              'AUTH_PASSWORD_RECOVERY_EMAIL_TTL_SECONDS',
              900,
            ) * 1000,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    TasksModule,
    MailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

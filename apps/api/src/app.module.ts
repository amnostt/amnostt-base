import { Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';

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
      ],
    }),
    PrismaModule,
    AuthModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

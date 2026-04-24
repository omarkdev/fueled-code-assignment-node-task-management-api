import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsModule } from 'nestjs-cls';
import { redisStore } from 'cache-manager-redis-yet';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { ActivitiesModule } from './activities/activities.module';
import { CacheShutdownService } from './common/cache-shutdown.service';
import { CLS_USER_ID_KEY, UUID_V4 } from './common/constants';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    EventEmitterModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          const raw = req.headers['x-user-id'];
          const userId = Array.isArray(raw) ? raw[0] : raw;
          if (typeof userId === 'string' && UUID_V4.test(userId)) {
            cls.set(CLS_USER_ID_KEY, userId);
          }
        },
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        return {
          store: await redisStore({
            url,
            socket: {
              tls: url.startsWith('rediss://'),
              rejectUnauthorized: false,
            },
            pingInterval: 5 * 1000,
          }),
        };
      },
    }),
    PrismaModule,
    TasksModule,
    ProjectsModule,
    UsersModule,
    EmailModule,
    ActivitiesModule,
  ],
  providers: [
    CacheShutdownService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}

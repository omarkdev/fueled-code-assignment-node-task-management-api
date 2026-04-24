import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Task Management API')
    .setDescription('Tasks, projects, and activity-log endpoints.')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-User-Id', in: 'header' }, 'user-id')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/docs`);
}

bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ValidationFailedException, toValidationDetails } from './common/validation.exception';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({ origin: env.frontendOrigin, credentials: true });

  // Every backend route lives under /api — the frontend's own routes never do, so a hard
  // navigation to e.g. /findings/:id can't collide with the API route of the same shape.
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: (errors) => new ValidationFailedException(toValidationDetails(errors)),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(env.port);
  // eslint-disable-next-line no-console
  console.log(`IdentityHub API listening on port ${env.port}`);
}

bootstrap();

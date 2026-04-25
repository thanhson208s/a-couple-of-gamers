import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Hard exit after 30s if graceful shutdown stalls
  process.on('SIGTERM', () => {
    setTimeout(() => process.exit(1), 30_000).unref();
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

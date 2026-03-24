import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security: Global request body size limits (OWASP compliance)
  // Prevent DoS attacks via large payloads
  // Limit applies to: JSON, URL-encoded, and raw request bodies
  app.use(express.json({ limit: '2mb' })); // 2MB for JSON payloads
  app.use(express.urlencoded({ limit: '2mb', extended: true })); // 2MB for form data
  app.use(express.raw({ limit: '2mb' })); // 2MB for raw bodies

  // Enable CORS for Flutter app
  app.enableCors({
    origin: true, // Allow all origins in development
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe with class-transformer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('P2P Electric Motorbike Rental System API')
    .setDescription(
      `
      API documentation for the Peer-to-Peer Electric Motorbike Rental System.
      
      ## Features
      - User Authentication (Register/Login)
      - JWT-based Authorization
      - Role-based Access Control (RENTER, OWNER, ADMIN)
      
      ## Authentication
      Most endpoints require a valid JWT token in the Authorization header:
      \`Authorization: Bearer <token>\`
      `,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Start server
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

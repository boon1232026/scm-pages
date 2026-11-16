import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";
import { API_PREFIX } from "@scm/contracts";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  // URI versioning "1" (Nest prepends 'v') + global prefix "api" => /api/v1/* (contracts API_PREFIX)
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  const origins = config.get("CORS_ORIGINS").split(",").map((o: string) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  const swagger = new DocumentBuilder()
    .setTitle("Social Commerce Manager API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup("api/docs", app, doc);

  const port = config.get("API_PORT");
  await app.listen(port);
  new Logger("Bootstrap").log(`API listening on http://localhost:${port}${API_PREFIX}`);
}

void bootstrap();

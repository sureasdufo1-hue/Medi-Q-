import "reflect-metadata";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { NestFactory } from "@nestjs/core";
import { parseAppConfig } from "./config/app-config.js";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const config = parseAppConfig(process.env);
  const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), { logger: false });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  await app.listen(config.apiPort, "0.0.0.0");
}

bootstrap().catch(() => {
  process.stderr.write("api_startup=FAILED\n");
  process.exitCode = 1;
});

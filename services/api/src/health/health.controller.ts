import { Controller, Get, Header, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { HealthService } from "./health.service.js";
import { PublicRoute } from "../authentication/public-route.decorator.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  live(): { status: "alive" } {
    return { status: "alive" };
  }

  @Get("ready")
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<{ status: "ready" | "not_ready" }> {
    const ready = await this.healthService.isReady();
    reply.code(ready ? 200 : 503);
    return { status: ready ? "ready" : "not_ready" };
  }
}

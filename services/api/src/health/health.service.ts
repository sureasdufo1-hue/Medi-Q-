import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/app-config.js";
import { APP_CONFIG } from "./health.tokens.js";
import { RuntimeDatabaseService } from "../database/runtime-database.service.js";

const PROBE_TIMEOUT_MS = 1_500;

@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: RuntimeDatabaseService,
  ) {}

  async isReady(): Promise<boolean> {
    const results = await Promise.all([
      this.checkDatabase(),
      this.checkOrthanc(this.config.orthancAUrl, this.config.orthancAUsername, this.config.orthancAPassword),
      this.checkOrthanc(this.config.orthancBUrl, this.config.orthancBUsername, this.config.orthancBPassword),
    ]);
    return results.every(Boolean);
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      const result = await this.database.query("SELECT 1 AS ready");
      return result.rows[0]?.ready === 1;
    } catch {
      return false;
    }
  }

  private async checkOrthanc(url: string, username: string, password: string): Promise<boolean> {
    try {
      const credentials = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
      const response = await fetch(`${url}/system`, {
        headers: { authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const isHealthy = response.status === 200;
      await response.body?.cancel();
      return isHealthy;
    } catch {
      return false;
    }
  }
}

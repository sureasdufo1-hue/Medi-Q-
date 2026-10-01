import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import type { AppConfig } from "../config/app-config.js";
import { APP_CONFIG } from "../health/health.tokens.js";

const DATABASE_TIMEOUT_MS = 1_500;

@Injectable()
export class RuntimeDatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
      query_timeout: DATABASE_TIMEOUT_MS,
    });
  }

  connect() {
    return this.pool.connect();
  }

  query(queryText: string) {
    return this.pool.query(queryText);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

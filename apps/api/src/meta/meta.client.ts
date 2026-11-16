import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetaClient as BaseMetaClient } from "@scm/meta";
import type { Env } from "../config/env";

export { MetaApiError } from "@scm/meta";

@Injectable()
export class MetaClient extends BaseMetaClient {
  constructor(config: ConfigService<Env, true>) {
    const logger = new Logger(MetaClient.name);
    super(
      {
        appId: config.get("META_APP_ID") ?? "",
        appSecret: config.get("META_APP_SECRET") ?? "",
        graphVersion: config.get("META_GRAPH_API_VERSION"),
      },
      (e) => logger.warn(`Meta API error status=${e.status} code=${e.fbCode} sub=${e.fbSubcode} msg=${e.message}`),
    );
  }
}

import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetaClient, TokenCrypto } from "@scm/meta";

export const META_CLIENT = "META_CLIENT";
export const TOKEN_CRYPTO = "TOKEN_CRYPTO";

export const metaProviders: Provider[] = [
  {
    provide: META_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      new MetaClient({
        appId: config.get<string>("META_APP_ID") ?? "",
        appSecret: config.get<string>("META_APP_SECRET") ?? "",
        graphVersion: config.get<string>("META_GRAPH_API_VERSION") ?? "v25.0",
      }),
  },
  {
    provide: TOKEN_CRYPTO,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => new TokenCrypto(config.get<string>("TOKEN_ENCRYPTION_KEY") ?? ""),
  },
];

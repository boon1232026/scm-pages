import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TokenCrypto } from "@scm/meta";
import type { Env } from "../config/env";

/** AES-256-GCM encryption for Meta access tokens at rest (shared impl: @scm/meta). */
@Injectable()
export class TokenCryptoService extends TokenCrypto {
  constructor(config: ConfigService<Env, true>) {
    super(String(config.get("TOKEN_ENCRYPTION_KEY")));
  }
}

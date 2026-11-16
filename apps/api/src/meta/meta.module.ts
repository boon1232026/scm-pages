import { Module } from "@nestjs/common";
import { MetaClient } from "./meta.client";
import { TokenCryptoService } from "./crypto.service";

@Module({
  providers: [MetaClient, TokenCryptoService],
  exports: [MetaClient, TokenCryptoService],
})
export class MetaModule {}

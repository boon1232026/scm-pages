import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config/env";

@Injectable()
export class S3Service {
  readonly client: S3Client;
  readonly bucket: string;
  private readonly publicUrl?: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get("S3_BUCKET");
    this.publicUrl = config.get("S3_PUBLIC_URL");
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT"),
      region: config.get("S3_REGION"),
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY"),
        secretAccessKey: config.get("S3_SECRET_KEY"),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE"),
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  presignPut(key: string, mimeType: string, ttlSeconds = 900) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: ttlSeconds },
    );
  }

  /** Public URL where Meta can fetch the object (bucket must allow anonymous GET or use publicUrl base). */
  objectUrl(key: string): string {
    if (this.publicUrl) return `${this.publicUrl.replace(/\/$/, "")}/${key}`;
    const endpoint = (this.client.config.endpoint as unknown as { toString(): string }).toString().replace(/\/$/, "");
    return `${endpoint}/${this.bucket}/${key}`;
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  readonly bucket: string;
  private readonly publicUrl?: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>("S3_BUCKET") ?? "scm-media";
    this.publicUrl = config.get<string>("S3_PUBLIC_URL");
    this.client = new S3Client({
      endpoint: config.get<string>("S3_ENDPOINT"),
      region: config.get<string>("S3_REGION") ?? "us-east-1",
      credentials: {
        accessKeyId: config.get<string>("S3_ACCESS_KEY") ?? "",
        secretAccessKey: config.get<string>("S3_SECRET_KEY") ?? "",
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      forcePathStyle: config.get<string>("S3_FORCE_PATH_STYLE") === "true",
    });
  }

  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return this.objectUrl(key);
  }

  objectUrl(key: string): string {
    if (this.publicUrl) return `${this.publicUrl.replace(/\/$/, "")}/${key}`;
    const ep = this.client.config.endpoint;
    const base = typeof ep === "string" ? ep : ep?.toString?.() ?? "";
    return `${base.replace(/\/$/, "")}/${this.bucket}/${key}`;
  }
}

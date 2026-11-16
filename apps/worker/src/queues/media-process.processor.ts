import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import { Queue, type Job } from "bullmq";
import sharp from "sharp";
import { QUEUE_NAMES } from "./queue-names";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3.service";

export interface MediaProcessJobData {
  mediaId: string;
  workspaceId: string;
}

const MAX_EDGE = 2048; // Facebook-friendly max dimension
const THUMB_EDGE = 320;

/**
 * Validates + normalizes an uploaded image:
 * re-encode (strips polyglot payloads), cap at 2048px, generate a 320px webp
 * thumbnail, fill width/height, status -> ready. Failures -> status failed.
 */
@Processor(QUEUE_NAMES.mediaProcess, { concurrency: 6 })
export class MediaProcessProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MediaProcessProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(QUEUE_NAMES.mediaProcess) private readonly queue: Queue<MediaProcessJobData>,
  ) {
    super();
  }

  /** Re-enqueue assets stuck in `processing` (jobs lost on worker restart). */
  async onModuleInit() {
    const stale = await this.prisma.mediaAsset.findMany({
      where: { status: "processing", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true, workspaceId: true },
    });
    for (const m of stale) {
      await this.queue.add("process", { mediaId: m.id, workspaceId: m.workspaceId });
    }
    if (stale.length) this.logger.warn(`re-enqueued ${stale.length} stuck media asset(s)`);
  }

  async process(job: Job<MediaProcessJobData>): Promise<void> {
    const { mediaId, workspaceId } = job.data;
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.workspaceId !== workspaceId) {
      this.logger.warn(`media ${mediaId} gone — dropping job`);
      return;
    }
    if (asset.status === "ready") return; // idempotent

    try {
      const raw = await this.s3.download(asset.storageKey);
      const img = sharp(raw, { failOn: "error" });
      const meta = await img.metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      const needsResize = Math.max(width, height) > MAX_EDGE;
      const pipeline = needsResize
        ? img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        : img;
      const normalized = await pipeline
        .toFormat(asset.mimeType === "image/png" ? "png" : "jpeg", { quality: 85 })
        .toBuffer();
      const finalMeta = await sharp(normalized).metadata();

      const thumb = await sharp(normalized)
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();

      const baseKey = asset.storageKey.replace(/\/[^/]+$/, "");
      if (needsResize) {
        await this.s3.upload(asset.storageKey, normalized, asset.mimeType);
      }
      const thumbKey = `${baseKey}/thumb.webp`;
      const thumbUrl = await this.s3.upload(thumbKey, thumb, "image/webp");

      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: "ready",
          width: finalMeta.width ?? width,
          height: finalMeta.height ?? height,
          thumbnailUrl: thumbUrl,
          sizeBytes: normalized.length,
        },
      });
      this.logger.log(`media ${mediaId} processed (${finalMeta.width}x${finalMeta.height})`);
    } catch (e) {
      this.logger.error(`media ${mediaId} processing failed: ${e}`);
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: "failed" },
      });
      throw e;
    }
  }
}

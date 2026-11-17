import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Service } from "./s3.service";
import { QueueService } from "../queue/queue.service";
import type { CreateUploadInput, MediaAsset } from "@scm/contracts";

@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit() {
    try {
      await this.s3.ensureBucket();
    } catch {
      /* S3 may be unavailable in some envs — uploads will error explicitly */
    }
  }

  async createUpload(
    workspaceId: string,
    uploaderId: string,
    input: { fileName: string; mimeType: string; sizeBytes: number; category?: string; productId?: string },
  ) {
    const id = crypto.randomUUID();
    const key = `${workspaceId}/${id}/${input.fileName.replace(/[^\w.\-ก-๙]/g, "_")}`;
    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        workspaceId,
        uploaderId,
        storageKey: key,
        url: this.s3.objectUrl(key),
        kind: "image",
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        name: input.fileName,
        category: input.category ?? null,
        productId: input.productId ?? null,
        status: "processing",
      },
    });
    const uploadUrl = await this.s3.presignPut(key, input.mimeType);
    return {
      mediaId: asset.id,
      uploadUrl,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }

  async createUploadsBatch(workspaceId: string, uploaderId: string, files: CreateUploadInput[]) {
    // Each ticket uses the same workspace-bound record and signed PUT as the single-file flow.
    const tickets = await Promise.all(files.map((file) => this.createUpload(workspaceId, uploaderId, file)));
    return { tickets };
  }

  async completeUploadsBatch(workspaceId: string, mediaIds: string[]) {
    // Do not let an incomplete PUT hide successful files in the same batch.
    const results = await Promise.all(mediaIds.map(async (mediaId) => {
      try {
        const asset = await this.complete(workspaceId, mediaId);
        return { mediaId, asset };
      } catch (e) {
        return { mediaId, error: e instanceof Error ? e.message : "Upload completion failed" };
      }
    }));
    return { results };
  }

  /**
   * Called after the client PUTs bytes to S3. Verifies the object exists, marks
   * the asset ready immediately (publish no longer waits on the worker), then
   * enqueues background normalization + thumbnail generation.
   */
  async complete(workspaceId: string, mediaId: string) {
    const asset = await this.findInWorkspace(workspaceId, mediaId);
    try {
      await this.s3.head(asset.storageKey);
    } catch {
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "failed" } });
      throw new NotFoundException("upload incomplete — file not found in storage, please attach again");
    }
    const ready = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "ready" },
    });
    await this.queue.enqueueMediaProcess({ mediaId: asset.id, workspaceId });
    return this.toDto(ready);
  }

  async list(workspaceId: string, q?: { category?: string; search?: string; cursor?: string; productId?: string }) {
    const take = 25;
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(q?.category && { category: q.category }),
        ...(q?.productId && { productId: q.productId }),
        ...(q?.search && {
          OR: [
            { name: { contains: q.search, mode: "insensitive" } },
            { tags: { has: q.search } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(q?.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const nextCursor = rows.length > take ? rows[take - 1]!.id : null;
    return { items: rows.slice(0, take).map(this.toDto), nextCursor };
  }

  async update(
    workspaceId: string,
    mediaId: string,
    data: { name?: string; category?: string | null; tags?: string[]; productId?: string | null },
  ) {
    const asset = await this.findInWorkspace(workspaceId, mediaId);
    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.productId !== undefined && { productId: data.productId }),
      },
    });
    return this.toDto(updated);
  }

  async remove(workspaceId: string, mediaId: string) {
    const asset = await this.findInWorkspace(workspaceId, mediaId);
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { deletedAt: new Date() },
    });
  }

  async findInWorkspace(workspaceId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, workspaceId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException({ code: "NOT_FOUND", message: "Media not found" });
    return asset;
  }

  /** Guards used by posts/comments composition. */
  async assertReadyForUse(workspaceId: string, mediaIds: string[]) {
    if (!mediaIds.length) return;
    const found = await this.prisma.mediaAsset.findMany({
      where: { id: { in: mediaIds }, workspaceId, deletedAt: null },
    });
    if (found.length !== mediaIds.length) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "One or more media assets not found" });
    }
    const notReady = found.filter((m) => m.status !== "ready");
    if (notReady.length) {
      throw new BadRequestException({
        code: "MEDIA_NOT_READY",
        message: `Media still processing: ${notReady.map((m) => m.name).join(", ")}`,
      });
    }
  }

  private toDto(m: {
    id: string; url: string; thumbnailUrl: string | null; kind: string; mimeType: string;
    sizeBytes: number; width: number | null; height: number | null; name: string;
    category: string | null; tags: string[]; status: string; productId: string | null;
  }): MediaAsset {
    return {
      id: m.id,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      kind: m.kind as MediaAsset["kind"],
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      width: m.width,
      height: m.height,
      name: m.name,
      category: m.category,
      tags: m.tags,
      status: m.status as MediaAsset["status"],
      productId: m.productId,
    };
  }
}

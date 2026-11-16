import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface TemplateDto {
  id: string;
  kind: "post" | "comment";
  name: string;
  body: string;
  mediaIds: string[];
  createdAt: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, kind?: "post" | "comment"): Promise<TemplateDto[]> {
    if (kind === "comment") {
      const rows = await this.prisma.commentTemplate.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((t) => ({ id: t.id, kind: "comment" as const, name: t.name, body: t.body, mediaIds: t.mediaId ? [t.mediaId] : [], createdAt: t.createdAt.toISOString() }));
    }
    if (kind === "post") {
      const rows = await this.prisma.postTemplate.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((t) => ({ id: t.id, kind: "post" as const, name: t.name, body: t.body, mediaIds: t.mediaIds, createdAt: t.createdAt.toISOString() }));
    }
    const [posts, comments]: [TemplateDto[], TemplateDto[]] = await Promise.all([
      this.list(workspaceId, "post"),
      this.list(workspaceId, "comment"),
    ]);
    return [...posts, ...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(workspaceId: string, userId: string, input: { name: string; kind: "post" | "comment"; body: string; mediaIds: string[] }) {
    if (input.kind === "comment") {
      const t = await this.prisma.commentTemplate.create({
        data: { workspaceId, name: input.name, body: input.body, mediaId: input.mediaIds[0] ?? null, createdBy: userId },
      });
      return { id: t.id, kind: "comment" as const, name: t.name, body: t.body, mediaIds: t.mediaId ? [t.mediaId] : [], createdAt: t.createdAt.toISOString() };
    }
    const t = await this.prisma.postTemplate.create({
      data: { workspaceId, name: input.name, body: input.body, mediaIds: input.mediaIds, createdBy: userId },
    });
    return { id: t.id, kind: "post" as const, name: t.name, body: t.body, mediaIds: t.mediaIds, createdAt: t.createdAt.toISOString() };
  }

  async update(workspaceId: string, id: string, input: { name?: string; body?: string; mediaIds?: string[] }) {
    const post = await this.prisma.postTemplate.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (post) {
      const t = await this.prisma.postTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.body !== undefined && { body: input.body }),
          ...(input.mediaIds !== undefined && { mediaIds: input.mediaIds }),
        },
      });
      return { id: t.id, kind: "post" as const, name: t.name, body: t.body, mediaIds: t.mediaIds, createdAt: t.createdAt.toISOString() };
    }
    const comment = await this.prisma.commentTemplate.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!comment) throw new NotFoundException({ code: "NOT_FOUND", message: "Template not found" });
    const t = await this.prisma.commentTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.mediaIds !== undefined && { mediaId: input.mediaIds[0] ?? null }),
      },
    });
    return { id: t.id, kind: "comment" as const, name: t.name, body: t.body, mediaIds: t.mediaId ? [t.mediaId] : [], createdAt: t.createdAt.toISOString() };
  }

  async remove(workspaceId: string, id: string) {
    const r1 = await this.prisma.postTemplate.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    const r2 = await this.prisma.commentTemplate.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!r1.count && !r2.count) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Template not found" });
    }
  }
}

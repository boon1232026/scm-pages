import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ConfigurationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, kind?: "post" | "comment" | "campaign") {
    return this.prisma.configuration.findMany({
      where: { workspaceId, ...(kind && { kind }) },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, kind: true, updatedAt: true },
    });
  }

  async get(workspaceId: string, id: string) {
    const c = await this.prisma.configuration.findFirst({ where: { id, workspaceId } });
    if (!c) throw new NotFoundException({ code: "NOT_FOUND", message: "Configuration not found" });
    return { id: c.id, name: c.name, kind: c.kind, payload: c.payload, updatedAt: c.updatedAt.toISOString() };
  }

  /** Upsert by (workspaceId,name,kind) — saving with an existing name updates it. */
  async save(workspaceId: string, userId: string, input: { name: string; kind: "post" | "comment" | "campaign"; payload: Record<string, unknown> }) {
    const c = await this.prisma.configuration.upsert({
      where: { workspaceId_name_kind: { workspaceId, name: input.name, kind: input.kind } },
      create: {
        workspaceId, name: input.name, kind: input.kind,
        payload: input.payload as object, createdBy: userId, updatedBy: userId,
      },
      update: { payload: input.payload as object, updatedBy: userId },
    });
    return { id: c.id, name: c.name, kind: c.kind, payload: c.payload, updatedAt: c.updatedAt.toISOString() };
  }

  async remove(workspaceId: string, id: string) {
    const r = await this.prisma.configuration.deleteMany({ where: { id, workspaceId } });
    if (!r.count) throw new NotFoundException({ code: "NOT_FOUND", message: "Configuration not found" });
  }
}

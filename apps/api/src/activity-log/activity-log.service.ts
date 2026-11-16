import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface LogEntry {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget audit record — never throws into request path. */
  async log(entry: LogEntry): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          workspaceId: entry.workspaceId,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? {}) as object,
          ip: entry.ip ?? null,
        },
      });
    } catch {
      /* audit logging must not break the request */
    }
  }

  async list(workspaceId: string, opts?: { entityType?: string; actorId?: string; limit?: number }) {
    return this.prisma.activityLog.findMany({
      where: {
        workspaceId,
        ...(opts?.entityType && { entityType: opts.entityType }),
        ...(opts?.actorId && { actorId: opts.actorId }),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 50, 200),
    });
  }
}

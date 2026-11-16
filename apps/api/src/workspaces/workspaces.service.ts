import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomBytes, createHash } from "crypto";
import type { WorkspaceRole } from "@scm/contracts";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    }));
  }

  async create(userId: string, name: string) {
    const slug = await this.uniqueSlug(name);
    const ws = await this.prisma.workspace.create({
      data: {
        name,
        slug,
        ownerId: userId,
        members: { create: { userId, role: "owner" } },
      },
    });
    return { id: ws.id, name: ws.name, slug: ws.slug, role: "owner" as const };
  }

  async get(workspaceId: string) {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
    });
    if (!ws) throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found" });
    return { id: ws.id, name: ws.name, slug: ws.slug, plan: ws.plan, settings: ws.settings };
  }

  async update(workspaceId: string, name: string) {
    await this.get(workspaceId);
    const ws = await this.prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
    return { id: ws.id, name: ws.name, slug: ws.slug };
  }

  async remove(workspaceId: string) {
    await this.get(workspaceId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });
  }

  async listMembers(workspaceId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role,
    }));
  }

  async invite(workspaceId: string, inviterId: string, email: string, role: WorkspaceRole) {
    const normalized = email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      const member = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existing.id } },
      });
      if (member) throw new ConflictException({ code: "CONFLICT", message: "Already a member" });
      await this.prisma.workspaceMember.create({
        data: { workspaceId, userId: existing.id, role, invitedBy: inviterId },
      });
      return { added: true as const, userId: existing.id };
    }
    const token = randomBytes(32).toString("base64url");
    await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email: normalized,
        role,
        invitedBy: inviterId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return { added: false as const, invitationToken: token };
  }

  async acceptInvitation(userId: string, token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inv = await this.prisma.workspaceInvitation.findUnique({ where: { tokenHash } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invitation invalid or expired" });
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Invitation is for a different email" });
    }
    await this.prisma.$transaction([
      this.prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
        create: { workspaceId: inv.workspaceId, userId, role: inv.role, invitedBy: inv.invitedBy },
        update: { role: inv.role },
      }),
      this.prisma.workspaceInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    return { workspaceId: inv.workspaceId };
  }

  async changeRole(workspaceId: string, targetUserId: string, role: WorkspaceRole, actorId: string) {
    if (targetUserId === actorId) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Cannot change your own role" });
    }
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (ws.ownerId === targetUserId) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Cannot change the workspace owner" });
    }
    await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role },
    });
    return { userId: targetUserId, role };
  }

  async removeMember(workspaceId: string, targetUserId: string, actorId: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (ws.ownerId === targetUserId) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Cannot remove the workspace owner" });
    }
    if (targetUserId !== actorId) {
      // removing others requires admin — enforced by @RequireRole("admin") on the route
    }
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9ก-๙]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "workspace";
    let slug = base;
    for (let i = 2; await this.prisma.workspace.findUnique({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }
}

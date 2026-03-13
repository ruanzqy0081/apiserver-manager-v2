import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllUsers,
  getAllVipUsers,
  getActivityByUser,
  getUserById,
  getVipUser,
  logActivity,
  removeVipUser,
  updateUserProfile,
  upsertVipUser,
} from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const VIP_DEFAULTS: Record<string, { keyLimit: number; dailyLimit: number }> = {
  vip1: { keyLimit: 200, dailyLimit: 1000 },
  vip2: { keyLimit: 500, dailyLimit: 2000 },
  vip3: { keyLimit: 1000, dailyLimit: 5000 },
  vip4: { keyLimit: 999999, dailyLimit: 10000 },
};

export const vipUsersRouter = router({
  // Admin: list all users with VIP info
  listAll: adminProcedure.query(async () => {
    const allUsers = await getAllUsers();
    const allVip = await getAllVipUsers();
    const vipMap = new Map(allVip.map((v) => [v.userId, v]));
    return allUsers.map((u) => ({ ...u, vip: vipMap.get(u.id) ?? null }));
  }),

  // Admin: promote user to VIP
  promote: adminProcedure
    .input(z.object({
      userId: z.number(),
      vipLevel: z.enum(["vip1", "vip2", "vip3", "vip4"]),
      expiresAt: z.string().optional(),
      keyLimit: z.number().optional(),
      dailyLimit: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      const defaults = VIP_DEFAULTS[input.vipLevel];
      await upsertVipUser({
        userId: input.userId,
        vipLevel: input.vipLevel,
        keyLimit: input.keyLimit ?? defaults.keyLimit,
        dailyLimit: input.dailyLimit ?? defaults.dailyLimit,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });
      await logActivity({ userId: ctx.user.id, action: "promote_vip", details: `User ${input.userId} → ${input.vipLevel}`, entityType: "user", entityId: input.userId });
      return { success: true };
    }),

  // Admin: demote user from VIP
  demote: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeVipUser(input.userId);
      await logActivity({ userId: ctx.user.id, action: "demote_vip", details: `User ${input.userId}`, entityType: "user", entityId: input.userId });
      return { success: true };
    }),

  // Admin: update VIP limits
  updateLimits: adminProcedure
    .input(z.object({
      userId: z.number(),
      keyLimit: z.number().min(1),
      dailyLimit: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const vip = await getVipUser(input.userId);
      if (!vip) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não é VIP" });
      await upsertVipUser({ ...vip, keyLimit: input.keyLimit, dailyLimit: input.dailyLimit, expiresAt: vip.expiresAt ?? undefined });
      await logActivity({ userId: ctx.user.id, action: "update_vip_limits", entityType: "user", entityId: input.userId });
      return { success: true };
    }),

  // Get current user's VIP info
  myVip: protectedProcedure.query(({ ctx }) => getVipUser(ctx.user.id)),

  // Get user activity
  activity: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const targetId = input.userId && ctx.user.role === "admin" ? input.userId : ctx.user.id;
      return getActivityByUser(targetId);
    }),

  // Update profile
  updateProfile: protectedProcedure
    .input(z.object({
      username: z.string().max(64).optional(),
      avatarUrl: z.string().url().optional(),
      language: z.enum(["pt", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateUserProfile(ctx.user.id, input);
      await logActivity({ userId: ctx.user.id, action: "update_profile" });
      return { success: true };
    }),
});

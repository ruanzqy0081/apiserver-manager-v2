import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  activateKey,
  countKeysByOwner,
  createKey,
  extendKey,
  getAllKeys,
  getKeyAliasesByOwner,
  getKeyById,
  getKeysByOwner,
  getKeysByPackage,
  getPackageById,
  getVipUser,
  logActivity,
  updateKeyStatus,
  createKeyAlias,
  deleteKeyAlias,
} from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const VIP_KEY_LIMITS: Record<string, number> = {
  vip1: 200,
  vip2: 500,
  vip3: 1000,
  vip4: Infinity,
};

function generateKeyValue(alias: string | undefined, duration: string): string {
  const prefix = alias ? alias.toUpperCase() : "APISERVER";
  const durationLabel = duration.toUpperCase();
  const unique = nanoid(12).toUpperCase();
  return `${prefix}-${durationLabel}-${unique}`;
}

export const keysRouter = router({
  list: protectedProcedure
    .input(z.object({ packageId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") {
        if (input?.packageId) return getKeysByPackage(input.packageId);
        return getAllKeys();
      }
      if (input?.packageId) return getKeysByPackage(input.packageId);
      return getKeysByOwner(ctx.user.id);
    }),

  generate: protectedProcedure
    .input(z.object({
      packageId: z.number(),
      duration: z.enum(["day", "week", "month", "year"]),
      alias: z.string().optional(),
      quantity: z.number().min(1).max(100).default(1),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await getPackageById(input.packageId);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package não encontrado" });
      if (ctx.user.role !== "admin" && pkg.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      if (ctx.user.role !== "admin") {
        const vip = await getVipUser(ctx.user.id);
        const limit = vip ? VIP_KEY_LIMITS[vip.vipLevel] ?? 200 : 200;
        const current = await countKeysByOwner(ctx.user.id);
        if (current + input.quantity > limit) {
          throw new TRPCError({ code: "FORBIDDEN", message: `Limite de keys atingido (${limit})` });
        }
      }

      const generated: string[] = [];
      for (let i = 0; i < input.quantity; i++) {
        const keyValue = generateKeyValue(input.alias, input.duration);
        await createKey({
          packageId: input.packageId,
          ownerId: ctx.user.id,
          keyValue,
          alias: input.alias,
          duration: input.duration,
          note: input.note,
        });
        generated.push(keyValue);
      }
      await logActivity({ userId: ctx.user.id, action: "generate_keys", details: `${input.quantity}x ${input.duration} keys para package ${input.packageId}`, entityType: "key" });
      return { success: true, keys: generated };
    }),

  activate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const key = await getKeyById(input.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && key.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await activateKey(input.id, key.duration);
      await logActivity({ userId: ctx.user.id, action: "activate_key", entityType: "key", entityId: input.id });
      return { success: true };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const key = await getKeyById(input.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && key.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await updateKeyStatus(input.id, "revoked");
      await logActivity({ userId: ctx.user.id, action: "revoke_key", entityType: "key", entityId: input.id });
      return { success: true };
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const key = await getKeyById(input.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && key.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await updateKeyStatus(input.id, "paused");
      await logActivity({ userId: ctx.user.id, action: "pause_key", entityType: "key", entityId: input.id });
      return { success: true };
    }),

  extend: protectedProcedure
    .input(z.object({ id: z.number(), duration: z.enum(["day", "week", "month", "year"]) }))
    .mutation(async ({ ctx, input }) => {
      const key = await getKeyById(input.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && key.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await extendKey(input.id, input.duration);
      await logActivity({ userId: ctx.user.id, action: "extend_key", details: `+${input.duration}`, entityType: "key", entityId: input.id });
      return { success: true };
    }),

  // Key Aliases
  listAliases: protectedProcedure.query(({ ctx }) => getKeyAliasesByOwner(ctx.user.id)),

  createAlias: protectedProcedure
    .input(z.object({ alias: z.string().min(2).max(16).regex(/^[A-Z0-9]+$/i, "Apenas letras e números") }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getKeyAliasesByOwner(ctx.user.id);
      if (ctx.user.role !== "admin" && existing.length >= 3) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Máximo de 3 aliases permitidos" });
      }
      await createKeyAlias(ctx.user.id, input.alias.toUpperCase());
      return { success: true };
    }),

  deleteAlias: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteKeyAlias(input.id);
      return { success: true };
    }),

  adminList: adminProcedure.query(() => getAllKeys()),
});

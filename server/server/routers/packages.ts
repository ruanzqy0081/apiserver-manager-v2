import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  countPackagesByOwner,
  createPackage,
  deletePackage,
  getAllPackages,
  getPackageById,
  getPackagesByOwner,
  logActivity,
  updatePackage,
} from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const MAX_PACKAGES_PER_USER = 3;

export const packagesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") return getAllPackages();
    return getPackagesByOwner(ctx.user.id);
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const pkg = await getPackageById(input.id);
    if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package não encontrado" });
    if (ctx.user.role !== "admin" && pkg.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return pkg;
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      version: z.string().default("1.0.0"),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        const count = await countPackagesByOwner(ctx.user.id);
        if (count >= MAX_PACKAGES_PER_USER) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Limite de ${MAX_PACKAGES_PER_USER} packages atingido. Exclua um para criar outro.`,
          });
        }
      }
      const token = `pkg_${nanoid(32)}`;
      await createPackage({ ...input, ownerId: ctx.user.id, token });
      await logActivity({ userId: ctx.user.id, action: "create_package", details: `Package: ${input.name}`, entityType: "package" });
      return { success: true, token };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      version: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["active", "paused", "updating", "deleted"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await getPackageById(input.id);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && pkg.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updatePackage(id, data);
      await logActivity({ userId: ctx.user.id, action: "update_package", details: `Package ID: ${id}`, entityType: "package", entityId: id });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await getPackageById(input.id);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && pkg.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await deletePackage(input.id);
      await logActivity({ userId: ctx.user.id, action: "delete_package", details: `Package: ${pkg.name}`, entityType: "package", entityId: input.id });
      return { success: true };
    }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["active", "paused", "updating"]) }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await getPackageById(input.id);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && pkg.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await updatePackage(input.id, { status: input.status });
      await logActivity({ userId: ctx.user.id, action: `set_package_status_${input.status}`, entityType: "package", entityId: input.id });
      return { success: true };
    }),

  adminList: adminProcedure.query(() => getAllPackages()),
});

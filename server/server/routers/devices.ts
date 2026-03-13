import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createDevice,
  createNotification,
  deleteDevice,
  getAllDevices,
  getDeviceByUdid,
  getDeviceById,
  getDevicesByUser,
  logActivity,
  updateDevice,
} from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

export const devicesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") return getAllDevices();
    return getDevicesByUser(ctx.user.id);
  }),

  register: protectedProcedure
    .input(z.object({
      udid: z.string().min(8).max(128),
      name: z.string().max(128).optional(),
      packageId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getDeviceByUdid(input.udid);
      if (existing) {
        await updateDevice(existing.id, { lastSeen: new Date(), status: "online" });
        return { success: true, deviceId: existing.id, isNew: false };
      }
      await createDevice({ ...input, userId: ctx.user.id });
      await logActivity({ userId: ctx.user.id, action: "register_device", details: `UDID: ${input.udid}`, entityType: "device" });
      await createNotification({
        userId: ctx.user.id,
        type: "new_device",
        title: "Novo dispositivo registrado",
        message: `UDID: ${input.udid}${input.name ? ` (${input.name})` : ""}`,
      });
      const newDevice = await getDeviceByUdid(input.udid);
      return { success: true, deviceId: newDevice?.id, isNew: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().max(128).optional(),
      status: z.enum(["online", "offline", "banned"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const device = await getDeviceById(input.id);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && device.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updateDevice(id, data);
      await logActivity({ userId: ctx.user.id, action: "update_device", entityType: "device", entityId: id });
      return { success: true };
    }),

  ban: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await updateDevice(input.id, { status: "banned" });
      await logActivity({ userId: ctx.user.id, action: "ban_device", entityType: "device", entityId: input.id });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const device = await getDeviceById(input.id);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && device.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await deleteDevice(input.id);
      await logActivity({ userId: ctx.user.id, action: "delete_device", entityType: "device", entityId: input.id });
      return { success: true };
    }),

  heartbeat: protectedProcedure
    .input(z.object({ udid: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const device = await getDeviceByUdid(input.udid);
      if (device) {
        await updateDevice(device.id, { status: "online", lastSeen: new Date() });
      }
      return { success: true };
    }),
});

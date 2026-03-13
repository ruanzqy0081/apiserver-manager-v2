import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { packagesRouter } from "./routers/packages";
import { keysRouter } from "./routers/keys";
import { devicesRouter } from "./routers/devices";
import { vipUsersRouter } from "./routers/vipUsers";
import { dylibRouter } from "./routers/dylib";
import { notificationsRouter } from "./routers/notifications";
import { dashboardRouter } from "./routers/dashboard";
import { createDevice, getDeviceByUdid, updateDevice, getPackageByToken } from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    testLogin: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(({ input }) => {
        // Credenciais de teste: admin/admin123
        if (input.username === "admin" && input.password === "admin123") {
          return { success: true };
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });
      }),
  }),

  // Rotas públicas para a dylib
  publicApi: router({
    registerDevice: publicProcedure
      .input(z.object({
        token: z.string(),
        udid: z.string(),
        name: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          // Verificar se o token é válido
          const pkg = await getPackageByToken(input.token);
          if (!pkg) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Token inválido" });
          }

          // Verificar se o device já existe
          const existing = await getDeviceByUdid(input.udid);
          if (existing) {
            await updateDevice(existing.id, { lastSeen: new Date(), status: "online" });
            return { success: true, deviceId: existing.id, isNew: false };
          }

          // Registrar novo device
          await createDevice({
            udid: input.udid,
            name: input.name || `Device ${input.udid.substring(0, 8)}`,
            userId: pkg.ownerId,
            packageId: pkg.id,
          });

          const newDevice = await getDeviceByUdid(input.udid);
          return { success: true, deviceId: newDevice?.id, isNew: true };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao registrar device" });
        }
      }),

    validateKey: publicProcedure
      .input(z.object({
        token: z.string(),
        udid: z.string(),
        key: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          // Verificar se o token é válido
          const pkg = await getPackageByToken(input.token);
          if (!pkg) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Token inválido" });
          }

          // TODO: Implementar validação de key
          // Por enquanto, retornar sucesso
          return { valid: true, message: "Key válida" };
        } catch (error) {
          return { valid: false, message: "Erro ao validar key" };
        }
      }),
  }),

  packages: packagesRouter,
  keys: keysRouter,
  devices: devicesRouter,
  vipUsers: vipUsersRouter,
  dylib: dylibRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;

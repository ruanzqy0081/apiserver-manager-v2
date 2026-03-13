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
import { createDevice, getDeviceByUdid, updateDevice, getPackageByToken, getDb } from "./db";
import { keys } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
          const db = await getDb();
          if (!db) throw new Error("DB not available");

          // 1. Verificar se o token é válido
          const pkg = await getPackageByToken(input.token);
          if (!pkg) {
            return { valid: false, message: "Token de pacote inválido" };
          }

          // 2. Buscar a key
          const keyResult = await db.select().from(keys).where(eq(keys.keyValue, input.key)).limit(1);
          const key = keyResult[0];

          if (!key) {
            return { valid: false, message: "Chave não encontrada" };
          }

          if (key.packageId !== pkg.id) {
            return { valid: false, message: "Chave não pertence a este pacote" };
          }

          if (key.status === "revoked") return { valid: false, message: "Chave revogada" };
          if (key.status === "paused") return { valid: false, message: "Chave pausada" };
          if (key.status === "expired" || (key.expiresAt && key.expiresAt < new Date())) {
            return { valid: false, message: "Chave expirada" };
          }

          // 3. Verificar dispositivo
          const device = await getDeviceByUdid(input.udid);
          if (!device) {
            return { valid: false, message: "Dispositivo não registrado" };
          }

          if (device.status === "banned") {
            return { valid: false, message: "Dispositivo banido" };
          }

          // 4. Vincular ou Validar dispositivo na key
          if (!key.deviceId) {
            // Primeira ativação da key
            const now = new Date();
            const expiresAt = new Date(now);
            if (key.duration === "day") expiresAt.setDate(expiresAt.getDate() + 1);
            else if (key.duration === "week") expiresAt.setDate(expiresAt.getDate() + 7);
            else if (key.duration === "month") expiresAt.setMonth(expiresAt.getMonth() + 1);
            else if (key.duration === "year") expiresAt.setFullYear(expiresAt.getFullYear() + 1);

            await db.update(keys).set({
              status: "active",
              deviceId: device.id,
              activatedAt: now,
              expiresAt: expiresAt
            }).where(eq(keys.id, key.id));
            
            return { 
              valid: true, 
              message: "Chave ativada com sucesso!",
              expiresAt: expiresAt.toISOString(),
              duration: key.duration
            };
          } else if (key.deviceId !== device.id) {
            return { valid: false, message: "Chave já vinculada a outro dispositivo" };
          }

          return { 
            valid: true, 
            message: "Acesso validado",
            expiresAt: key.expiresAt?.toISOString(),
            duration: key.duration
          };
        } catch (error) {
          console.error("[validateKey] Error:", error);
          return { valid: false, message: "Erro interno no servidor" };
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

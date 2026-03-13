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

  packages: packagesRouter,
  keys: keysRouter,
  devices: devicesRouter,
  vipUsers: vipUsersRouter,
  dylib: dylibRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;

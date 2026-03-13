import { z } from "zod";
import {
  countUnreadNotifications,
  getNotificationsByUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const notificationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getNotificationsByUser(ctx.user.id)),

  unreadCount: protectedProcedure.query(({ ctx }) => countUnreadNotifications(ctx.user.id)),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx: _ctx, input }) => {
      await markNotificationRead(input.id);
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.id);
    return { success: true };
  }),
});

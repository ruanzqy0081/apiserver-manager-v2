import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Helper: create a mock context ────────────────────────────────────────────
type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides?: Partial<AuthUser>): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const user: AuthUser = {
    id: 1,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe("auth.me", () => {
  it("returns the current user", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).not.toBeNull();
    expect(me?.name).toBe("Test User");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const { ctx, clearedCookies } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true, path: "/" });
  });
});

// ─── Packages ─────────────────────────────────────────────────────────────────
describe("packages.list", () => {
  it("returns an array (may be empty without DB)", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    // Without a real DB the helper returns [] gracefully
    const result = await caller.packages.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Keys ─────────────────────────────────────────────────────────────────────
describe("keys.list", () => {
  it("returns an array", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.keys.list({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("keys.listAliases", () => {
  it("returns an array", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.keys.listAliases();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Devices ──────────────────────────────────────────────────────────────────
describe("devices.list", () => {
  it("returns an array", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.devices.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────
describe("notifications.list", () => {
  it("returns an array", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notifications.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("notifications.unreadCount", () => {
  it("returns a number", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const count = await caller.notifications.unreadCount();
    expect(typeof count).toBe("number");
  });
});

// ─── Dylib ────────────────────────────────────────────────────────────────────
describe("dylib.history", () => {
  it("returns an array", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dylib.history({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
describe("dashboard.stats", () => {
  it("returns stats object with numeric fields", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();
    expect(stats).toHaveProperty("totalPackages");
    expect(stats).toHaveProperty("activeKeys");
    expect(stats).toHaveProperty("totalDevices");
    expect(stats).toHaveProperty("totalVipUsers");
    expect(typeof stats.totalPackages).toBe("number");
  });
});

// ─── VIP Users ────────────────────────────────────────────────────────────────
describe("vipUsers.myVip", () => {
  it("returns null, undefined, or a vip object", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const vip = await caller.vipUsers.myVip();
    // Without a real DB, getVipUser returns undefined; with DB it returns null or a VIP record
    expect(vip === null || vip === undefined || typeof vip === "object").toBe(true);
  });
});

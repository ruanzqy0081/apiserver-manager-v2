import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityLog,
  devices,
  dylibBuilds,
  InsertUser,
  keyAliases,
  keys,
  notifications,
  packages,
  users,
  vipUsers,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserProfile(id: number, data: { username?: string; avatarUrl?: string; language?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, id));
}

// ─── VIP Users ────────────────────────────────────────────────────────────────

export async function getVipUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vipUsers).where(eq(vipUsers.userId, userId)).limit(1);
  return result[0];
}

export async function getAllVipUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vipUsers).orderBy(desc(vipUsers.createdAt));
}

export async function upsertVipUser(data: {
  userId: number;
  vipLevel: "vip1" | "vip2" | "vip3" | "vip4";
  keyLimit: number;
  dailyLimit: number;
  expiresAt?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(vipUsers)
    .values(data)
    .onDuplicateKeyUpdate({ set: { vipLevel: data.vipLevel, keyLimit: data.keyLimit, dailyLimit: data.dailyLimit, expiresAt: data.expiresAt } });
}

export async function removeVipUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vipUsers).where(eq(vipUsers.userId, userId));
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function getPackagesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(packages).where(eq(packages.ownerId, ownerId)).orderBy(desc(packages.createdAt));
}

export async function getAllPackages() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(packages).orderBy(desc(packages.createdAt));
}

export async function getPackageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(packages).where(eq(packages.id, id)).limit(1);
  return result[0];
}

export async function getPackageByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(packages).where(eq(packages.token, token)).limit(1);
  return result[0];
}

export async function createPackage(data: {
  ownerId: number;
  name: string;
  version: string;
  description?: string;
  token: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(packages).values(data);
  return result;
}

export async function updatePackage(id: number, data: Partial<{ name: string; version: string; description: string; status: "active" | "paused" | "updating" | "deleted" }>) {
  const db = await getDb();
  if (!db) return;
  await db.update(packages).set(data).where(eq(packages.id, id));
}

export async function deletePackage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(packages).set({ status: "deleted" }).where(eq(packages.id, id));
}

export async function countPackagesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(packages).where(and(eq(packages.ownerId, ownerId), sql`status != 'deleted'`));
  return Number(result[0]?.count ?? 0);
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export async function getKeysByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keys).where(eq(keys.ownerId, ownerId)).orderBy(desc(keys.createdAt));
}

export async function getKeysByPackage(packageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keys).where(eq(keys.packageId, packageId)).orderBy(desc(keys.createdAt));
}

export async function getAllKeys() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keys).orderBy(desc(keys.createdAt));
}

export async function getKeyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(keys).where(eq(keys.id, id)).limit(1);
  return result[0];
}

export async function createKey(data: {
  packageId: number;
  ownerId: number;
  keyValue: string;
  alias?: string;
  duration: "day" | "week" | "month" | "year";
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(keys).values(data);
}

export async function updateKeyStatus(id: number, status: "active" | "inactive" | "expired" | "revoked" | "paused") {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { status };
  if (status === "active") {
    updateData.activatedAt = new Date();
  }
  await db.update(keys).set(updateData).where(eq(keys.id, id));
}

export async function activateKey(id: number, duration: "day" | "week" | "month" | "year") {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const expiresAt = new Date(now);
  if (duration === "day") expiresAt.setDate(expiresAt.getDate() + 1);
  else if (duration === "week") expiresAt.setDate(expiresAt.getDate() + 7);
  else if (duration === "month") expiresAt.setMonth(expiresAt.getMonth() + 1);
  else if (duration === "year") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await db.update(keys).set({ status: "active", activatedAt: now, expiresAt }).where(eq(keys.id, id));
}

export async function extendKey(id: number, duration: "day" | "week" | "month" | "year") {
  const db = await getDb();
  if (!db) return;
  const key = await getKeyById(id);
  if (!key) return;
  const base = key.expiresAt && key.expiresAt > new Date() ? new Date(key.expiresAt) : new Date();
  if (duration === "day") base.setDate(base.getDate() + 1);
  else if (duration === "week") base.setDate(base.getDate() + 7);
  else if (duration === "month") base.setMonth(base.getMonth() + 1);
  else if (duration === "year") base.setFullYear(base.getFullYear() + 1);
  await db.update(keys).set({ expiresAt: base }).where(eq(keys.id, id));
}

export async function countKeysByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(keys).where(eq(keys.ownerId, ownerId));
  return Number(result[0]?.count ?? 0);
}

export async function countActiveKeys() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(keys).where(eq(keys.status, "active"));
  return Number(result[0]?.count ?? 0);
}

export async function getExpiringKeys(withinHours: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const future = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  return db.select().from(keys).where(and(eq(keys.status, "active"), gte(keys.expiresAt, now), lt(keys.expiresAt, future)));
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export async function getAllDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).orderBy(desc(devices.createdAt));
}

export async function getDevicesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.createdAt));
}

export async function getDeviceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return result[0];
}

export async function getDeviceByUdid(udid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(devices).where(eq(devices.udid, udid)).limit(1);
  return result[0];
}

export async function createDevice(data: { udid: string; name?: string; userId?: number; packageId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(devices).values(data);
}

export async function updateDevice(id: number, data: Partial<{ name: string; userId: number; packageId: number; status: "online" | "offline" | "banned"; lastSeen: Date }>) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set(data).where(eq(devices.id, id));
}

export async function deleteDevice(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(devices).where(eq(devices.id, id));
}

export async function countDevices() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(devices);
  return Number(result[0]?.count ?? 0);
}

// ─── Dylib Builds ─────────────────────────────────────────────────────────────

export async function getDylibBuildsByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dylibBuilds).where(eq(dylibBuilds.ownerId, ownerId)).orderBy(desc(dylibBuilds.createdAt));
}

export async function getDylibBuildsByPackage(packageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dylibBuilds).where(eq(dylibBuilds.packageId, packageId)).orderBy(desc(dylibBuilds.createdAt));
}

export async function createDylibBuild(data: { packageId: number; ownerId: number; fileName: string; s3Url: string; s3Key: string; version: string; sizeBytes?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(dylibBuilds).values(data);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotificationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function createNotification(data: {
  userId: number;
  type: "key_expiring" | "new_device" | "limit_reached" | "package_update" | "system";
  title: string;
  message: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
}

export async function countUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return Number(result[0]?.count ?? 0);
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export async function logActivity(data: { userId: number; action: string; details?: string; entityType?: string; entityId?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLog).values(data);
}

export async function getActivityByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLog).where(eq(activityLog.userId, userId)).orderBy(desc(activityLog.createdAt)).limit(100);
}

export async function getAllActivity() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(200);
}

// ─── Key Aliases ──────────────────────────────────────────────────────────────

export async function getKeyAliasesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keyAliases).where(eq(keyAliases.ownerId, ownerId)).orderBy(desc(keyAliases.createdAt));
}

export async function createKeyAlias(ownerId: number, alias: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(keyAliases).values({ ownerId, alias });
}

export async function deleteKeyAlias(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(keyAliases).where(eq(keyAliases.id, id));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return { totalPackages: 0, activeKeys: 0, totalDevices: 0, totalVipUsers: 0, expiringKeys: 0 };

  const [pkgCount, activeKeyCount, deviceCount, vipCount, expiringCount] = await Promise.all([
    isAdmin
      ? db.select({ count: sql<number>`count(*)` }).from(packages).where(sql`status != 'deleted'`)
      : db.select({ count: sql<number>`count(*)` }).from(packages).where(and(eq(packages.ownerId, userId), sql`status != 'deleted'`)),
    isAdmin
      ? db.select({ count: sql<number>`count(*)` }).from(keys).where(eq(keys.status, "active"))
      : db.select({ count: sql<number>`count(*)` }).from(keys).where(and(eq(keys.ownerId, userId), eq(keys.status, "active"))),
    db.select({ count: sql<number>`count(*)` }).from(devices),
    db.select({ count: sql<number>`count(*)` }).from(vipUsers),
    (() => {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return db.select({ count: sql<number>`count(*)` }).from(keys).where(and(eq(keys.status, "active"), gte(keys.expiresAt, now), lt(keys.expiresAt, in24h)));
    })(),
  ]);

  return {
    totalPackages: Number(pkgCount[0]?.count ?? 0),
    activeKeys: Number(activeKeyCount[0]?.count ?? 0),
    totalDevices: Number(deviceCount[0]?.count ?? 0),
    totalVipUsers: Number(vipCount[0]?.count ?? 0),
    expiringKeys: Number(expiringCount[0]?.count ?? 0),
  };
}

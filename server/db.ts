import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { AurevionSession, InsertAurevionFeedback, InsertUser, aurevionFeedback, aurevionSessions, users } from "../drizzle/schema.js";
import { ENV } from './_core/env.js';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      const client = await mysql.createPool({
        host: u.hostname,
        port: Number(u.port || 4000),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: decodeURIComponent(u.pathname.slice(1)),
        ssl: { rejectUnauthorized: true },
      });
      _db = drizzle({ client });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}


export async function getAurevionSession(sessionKey: string): Promise<AurevionSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aurevionSessions).where(eq(aurevionSessions.sessionKey, sessionKey)).limit(1);
  return result[0];
}

export async function createAurevionSession(sessionKey: string): Promise<AurevionSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(aurevionSessions).values({ sessionKey, contextJson: "[]" });
  return getAurevionSession(sessionKey);
}

export async function updateAurevionSession(
  id: number,
  values: Partial<Pick<AurevionSession, "plan" | "messagesUsed" | "imagesUsed" | "windowStartedAt" | "lastRequestAt" | "contextJson">>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aurevionSessions).set(values).where(eq(aurevionSessions.id, id));
}

export async function setAurevionSessionPlan(sessionKey: string, plan: "free" | "pro"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aurevionSessions).set({ plan }).where(eq(aurevionSessions.sessionKey, sessionKey));
}

export async function getAurevionSessionStats() {
  const db = await getDb();
  if (!db) return { sessions: 0, freeSessions: 0, proSessions: 0, totalMessages: 0 };
  const rows = await db.select().from(aurevionSessions);
  return {
    sessions: rows.length,
    freeSessions: rows.filter(row => row.plan === "free").length,
    proSessions: rows.filter(row => row.plan === "pro").length,
    totalMessages: rows.reduce((total, row) => total + row.messagesUsed, 0),
  };
}

export async function createAurevionFeedback(values: InsertAurevionFeedback) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const result = await db.insert(aurevionFeedback).values(values);
  return { id: Number(result[0].insertId), status: values.status ?? "new" };
}

// TODO: add feature queries here as your schema grows.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { AurevionSession, InsertAurevionFeedback, InsertUser, aurevionFeedback, aurevionSessions, users } from "../drizzle/schema.js";
import { ENV } from './_core/env.js';

let _db: ReturnType<typeof drizzle> | null = null;
let _schemaReady: Promise<void> | null = null;

async function ensureOperationalSchema(pool: mysql.Pool) {
  const statements = [
    "CREATE TABLE IF NOT EXISTS `users` (`id` int AUTO_INCREMENT NOT NULL, `openId` varchar(64) NOT NULL, `name` text, `email` varchar(320), `loginMethod` varchar(64), `role` enum('user','admin') NOT NULL DEFAULT 'user', `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, `lastSignedIn` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `users_id` PRIMARY KEY(`id`), CONSTRAINT `users_openId_unique` UNIQUE(`openId`))",
    "CREATE TABLE IF NOT EXISTS `aurevion_sessions` (`id` int AUTO_INCREMENT NOT NULL, `sessionKey` varchar(128) NOT NULL, `consentVersion` varchar(64), `consentLocale` varchar(8), `consentAcceptedAt` timestamp NULL, `plan` enum('free','pro') NOT NULL DEFAULT 'free', `messagesUsed` int NOT NULL DEFAULT 0, `imagesUsed` int NOT NULL DEFAULT 0, `windowStartedAt` timestamp NOT NULL DEFAULT (now()), `lastRequestAt` timestamp, `contextJson` text NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `aurevion_sessions_id` PRIMARY KEY(`id`), CONSTRAINT `aurevion_sessions_sessionKey_unique` UNIQUE(`sessionKey`))",
    "ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentVersion` varchar(64) NULL",
    "ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentLocale` varchar(8) NULL",
    "ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentAcceptedAt` timestamp NULL",
    "ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `imagesUsed` int NOT NULL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS `wallets` (`id` int AUTO_INCREMENT NOT NULL, `sessionKey` varchar(128) NOT NULL, `balance` decimal(12,2) NOT NULL DEFAULT 0.00, `currency` varchar(3) NOT NULL DEFAULT 'SAR', `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `wallets_id` PRIMARY KEY(`id`), CONSTRAINT `wallets_sessionKey_unique` UNIQUE(`sessionKey`))",
    "CREATE TABLE IF NOT EXISTS `wallet_ledger` (`id` int AUTO_INCREMENT NOT NULL, `walletId` int NOT NULL, `reference` varchar(128) NOT NULL, `type` enum('credit','debit','refund','hold','release') NOT NULL, `amount` decimal(12,2) NOT NULL, `description` varchar(255), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `wallet_ledger_id` PRIMARY KEY(`id`), CONSTRAINT `wallet_ledger_reference_unique` UNIQUE(`reference`))",
    "CREATE TABLE IF NOT EXISTS `payments` (`id` int AUTO_INCREMENT NOT NULL, `sessionKey` varchar(128) NOT NULL, `cartId` varchar(64) NOT NULL, `tranRef` varchar(128), `amount` decimal(12,2) NOT NULL, `currency` varchar(3) NOT NULL, `status` enum('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending', `redirectUrl` text, `rawResponse` text, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `payments_id` PRIMARY KEY(`id`), CONSTRAINT `payments_cartId_unique` UNIQUE(`cartId`))",
    "CREATE TABLE IF NOT EXISTS `ai_usage` (`id` int AUTO_INCREMENT NOT NULL, `sessionKey` varchar(128) NOT NULL, `operation` varchar(32) NOT NULL, `provider` varchar(64) NOT NULL, `model` varchar(128), `amount` decimal(12,2) NOT NULL, `requestId` varchar(128), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `ai_usage_id` PRIMARY KEY(`id`), CONSTRAINT `ai_usage_requestId_unique` UNIQUE(`requestId`))",
    "CREATE TABLE IF NOT EXISTS `pricing` (`id` int AUTO_INCREMENT NOT NULL, `operation` varchar(32) NOT NULL, `price` decimal(12,2) NOT NULL, `currency` varchar(3) NOT NULL DEFAULT 'SAR', `active` int NOT NULL DEFAULT 1, CONSTRAINT `pricing_id` PRIMARY KEY(`id`), CONSTRAINT `pricing_operation_unique` UNIQUE(`operation`))",
    "CREATE TABLE IF NOT EXISTS `aurevion_feedback` (`id` int AUTO_INCREMENT NOT NULL, `category` enum('support','bug','safety','feedback') NOT NULL, `message` text NOT NULL, `sessionId` varchar(128), `userEmail` varchar(320), `status` enum('new','reviewing','resolved') NOT NULL DEFAULT 'new', `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `aurevion_feedback_id` PRIMARY KEY(`id`))",
  ];
  for (const statement of statements) {
    try { await pool.query(statement); }
    catch (error) { console.error("[Database] Schema statement failed:", error); throw error; }
  }
}

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
        connectionLimit: 5,
        enableKeepAlive: true,
        connectTimeout: 10_000,
        ssl: { rejectUnauthorized: true },
      });
      _schemaReady = ensureOperationalSchema(client).catch((error) => {
        _schemaReady = null;
        throw error;
      });
      await _schemaReady;
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

export async function getAurevionConsent(sessionKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    consentVersion: aurevionSessions.consentVersion,
    consentLocale: aurevionSessions.consentLocale,
    consentAcceptedAt: aurevionSessions.consentAcceptedAt,
  }).from(aurevionSessions).where(eq(aurevionSessions.sessionKey, sessionKey)).limit(1);
  return result[0];
}

export async function saveAurevionConsent(sessionKey: string, values: { version: string; locale: "ar" | "en"; acceptedAt: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getAurevionSession(sessionKey);
  const consent = { consentVersion: values.version, consentLocale: values.locale, consentAcceptedAt: new Date(values.acceptedAt) };
  if (existing) {
    await db.update(aurevionSessions).set(consent).where(eq(aurevionSessions.sessionKey, sessionKey));
  } else {
    await db.insert(aurevionSessions).values({ sessionKey, contextJson: "[]", ...consent });
  }
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

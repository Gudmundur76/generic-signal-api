import { eq, gte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, subscribers, InsertSubscriber, patentAlerts, InsertPatentAlert, PatentAlert } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
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

// ── Subscriber helpers ──────────────────────────────────────────────────────

export async function addSubscriber(email: string): Promise<{ created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.insert(subscribers).values({ email, status: "active" });
    return { created: true };
  } catch (err: unknown) {
    // MySQL duplicate key error code 1062
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ER_DUP_ENTRY") {
      return { created: false };
    }
    throw err;
  }
}

export async function getActiveSubscribers(): Promise<{ id: number; email: string }[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(eq(subscribers.status, "active"));
}

// ── Patent Alert helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns up to 10 patent alerts created in the last 7 days, newest first.
 * Returns an empty array if the table is empty — no fallback to sample data.
 */
export async function getRecentAlerts(): Promise<PatentAlert[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(patentAlerts)
    .where(gte(patentAlerts.createdAt, since))
    .orderBy(desc(patentAlerts.createdAt))
    .limit(10);
}

/**
 * Upserts a patent alert by patentNumber (insert or update on duplicate key).
 */
export async function upsertPatentAlert(alert: InsertPatentAlert): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(patentAlerts)
    .values(alert)
    .onDuplicateKeyUpdate({
      set: {
        title: alert.title,
        assignee: alert.assignee,
        status: alert.status,
        expiryDate: alert.expiryDate,
        distressScore: alert.distressScore,
        niche: alert.niche,
        claims: alert.claims,
        verificationStatus: alert.verificationStatus,
        patentUrl: alert.patentUrl,
      },
    });
}

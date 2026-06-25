import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

export const subscribers = mysqlTable("subscribers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "unsubscribed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Subscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = typeof subscribers.$inferInsert;

// ── Partner Portal ────────────────────────────────────────────────────────────

export const partners = mysqlTable("partners", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  institution: varchar("institution", { length: 255 }).notNull(),
  /** Comma-separated therapeutic areas */
  therapeuticAreas: text("therapeuticAreas").notNull(),
  tier: mysqlEnum("tier", ["explorer", "developer", "accelerator"]).default("explorer").notNull(),
  agreementAccepted: int("agreementAccepted").default(0).notNull(),
  agreementAcceptedAt: timestamp("agreementAcceptedAt"),
  candidatesDelivered: int("candidatesDelivered").default(0).notNull(),
  positiveValidations: int("positiveValidations").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;

// ── Candidate Deliveries ──────────────────────────────────────────────────────

export const deliveries = mysqlTable("deliveries", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: varchar("candidateId", { length: 64 }).notNull(),
  partnerId: int("partnerId").notNull(),
  gene: varchar("gene", { length: 32 }).notNull(),
  therapeuticArea: varchar("therapeuticArea", { length: 64 }).notNull(),
  noveltyScore: int("noveltyScore").notNull(),
  compositeScore: int("compositeScore").notNull(),
  fto: mysqlEnum("fto", ["CLEAR", "RISK", "BLOCKED"]).notNull(),
  status: mysqlEnum("status", ["sent", "opened", "validated_positive", "validated_negative", "no_response", "partnership_initiated", "bounced"]).default("sent").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  followUpDueAt: timestamp("followUpDueAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = typeof deliveries.$inferInsert;

// ── Royalty Tracking ──────────────────────────────────────────────────────────

export const milestones = mysqlTable("milestones", {
  id: int("id").autoincrement().primaryKey(),
  partnerId: int("partnerId").notNull(),
  candidateId: varchar("candidateId", { length: 64 }).notNull(),
  milestoneType: varchar("milestoneType", { length: 64 }).notNull(),
  paymentAmount: int("paymentAmount"),
  expectedDate: timestamp("expectedDate"),
  achievedDate: timestamp("achievedDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = typeof milestones.$inferInsert;

export const royaltyEvents = mysqlTable("royaltyEvents", {
  id: int("id").autoincrement().primaryKey(),
  partnerId: int("partnerId").notNull(),
  candidateId: varchar("candidateId", { length: 64 }).notNull(),
  netSales: int("netSales").notNull(),
  royaltyRate: int("royaltyRate").notNull(), // stored as basis points e.g. 300 = 3%
  royaltyAmount: int("royaltyAmount").notNull(),
  currency: mysqlEnum("currency", ["USD", "EUR", "GBP"]).default("USD").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});
export type RoyaltyEvent = typeof royaltyEvents.$inferSelect;
export type InsertRoyaltyEvent = typeof royaltyEvents.$inferInsert;
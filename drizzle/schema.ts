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

// ── Patent Alerts ─────────────────────────────────────────────────────────────
export const patentAlerts = mysqlTable("patentAlerts", {
  id: int("id").autoincrement().primaryKey(),
  patentNumber: varchar("patentNumber", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  assignee: varchar("assignee", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["EXPIRING", "ABANDONED", "RE_EXAM_NARROWED"]).notNull(),
  expiryDate: varchar("expiryDate", { length: 16 }),
  distressScore: int("distressScore").notNull().default(0),
  niche: varchar("niche", { length: 64 }),
  claims: text("claims"),            // JSON array stored as text
  verificationStatus: varchar("verificationStatus", { length: 32 }).default("Pending").notNull(),
  patentUrl: varchar("patentUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PatentAlert = typeof patentAlerts.$inferSelect;
export type InsertPatentAlert = typeof patentAlerts.$inferInsert;

// ── Autonomous Distribution Loop ──────────────────────────────────────────────

export const distributionEvents = mysqlTable("distributionEvents", {
  id: int("id").autoincrement().primaryKey(),
  signalSource: varchar("signalSource", { length: 64 }).notNull(), // 'patent_cliff' | 'molecular_distress'
  gene: varchar("gene", { length: 32 }).notNull(),
  patentNumber: varchar("patentNumber", { length: 32 }),
  sequence: text("sequence").notNull(),
  compositeScore: int("compositeScore").notNull(), // 0–100 integer
  partnerId: int("partnerId").notNull(),
  status: mysqlEnum("status", ["delivered", "failed", "held"]).default("delivered").notNull(),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DistributionEvent = typeof distributionEvents.$inferSelect;
export type InsertDistributionEvent = typeof distributionEvents.$inferInsert;

export const approvalRequests = mysqlTable("approvalRequests", {
  id: int("id").autoincrement().primaryKey(),
  gene: varchar("gene", { length: 32 }).notNull(),
  patentNumber: varchar("patentNumber", { length: 32 }),
  reason: varchar("reason", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  confidence: int("confidence").notNull(), // stored as integer 0–100
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = typeof approvalRequests.$inferInsert;
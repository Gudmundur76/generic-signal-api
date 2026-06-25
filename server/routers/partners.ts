/**
 * server/routers/partners.ts
 *
 * tRPC routes for the self-serve partner portal.
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  partners,
  deliveries,
  royaltyEvents,
} from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireDb() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const THERAPEUTIC_AREAS = [
  "cardiovascular",
  "oncology",
  "neurology",
  "immunology",
  "rare_disease",
  "metabolic",
  "infectious_disease",
  "ophthalmology",
  "respiratory",
  "hematology",
] as const;

const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  institution: z.string().min(2).max(255),
  therapeuticAreas: z.array(z.enum(THERAPEUTIC_AREAS)).min(1).max(10),
  tier: z.enum(["explorer", "developer", "accelerator"]).default("explorer"),
  agreementAccepted: z.boolean().refine((v) => v === true, {
    message: "You must accept the partner agreement",
  }),
});

const deliverySchema = z.object({
  candidateId: z.string().max(64),
  partnerId: z.number().int().positive(),
  gene: z.string().max(32),
  therapeuticArea: z.string().max(64),
  noveltyScore: z.number().int().min(0).max(100),
  compositeScore: z.number().int().min(0).max(100),
  fto: z.enum(["CLEAR", "RISK", "BLOCKED"]),
});

const royaltySchema = z.object({
  partnerId: z.number().int().positive(),
  candidateId: z.string().max(64),
  netSales: z.number().int().positive(),
  royaltyRateBps: z.number().int().min(1).max(2000),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const partnersRouter = router({
  /** Public: self-serve signup with one-click agreement */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const areasStr = input.therapeuticAreas.join(",");
      const now = new Date();

      const existing = await d
        .select({ id: partners.id })
        .from(partners)
        .where(eq(partners.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          message: "This email is already registered as a partner.",
          partnerId: null as number | null,
        };
      }

      const result = await d.insert(partners).values({
        name: input.name,
        email: input.email,
        institution: input.institution,
        therapeuticAreas: areasStr,
        tier: input.tier,
        agreementAccepted: 1,
        agreementAcceptedAt: now,
        candidatesDelivered: 0,
        positiveValidations: 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        success: true,
        message:
          "Welcome to the partner network. Your first candidate will arrive within 24 hours.",
        partnerId: (result as unknown as { insertId: number }).insertId,
      };
    }),

  /** Admin: list all partners */
  list: protectedProcedure
    .input(
      z.object({
        area: z.enum(THERAPEUTIC_AREAS).optional(),
        tier: z.enum(["explorer", "developer", "accelerator"]).optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const d = await requireDb();
      const rows = await d
        .select()
        .from(partners)
        .orderBy(desc(partners.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows
        .filter((p) => {
          if (input.area && !p.therapeuticAreas.includes(input.area)) return false;
          if (input.tier && p.tier !== input.tier) return false;
          return true;
        })
        .map((p) => ({
          ...p,
          therapeuticAreas: p.therapeuticAreas.split(","),
        }));
    }),

  /** Admin: aggregate stats */
  stats: protectedProcedure.query(async () => {
    const d = await requireDb();

    const [partnerRow] = await d
      .select({ count: sql<number>`count(*)` })
      .from(partners);

    const [deliveryRow] = await d
      .select({ count: sql<number>`count(*)` })
      .from(deliveries);

    const [positiveRow] = await d
      .select({ count: sql<number>`count(*)` })
      .from(deliveries)
      .where(eq(deliveries.status, "validated_positive"));

    const [royaltyRow] = await d
      .select({ total: sql<number>`coalesce(sum(royaltyAmount), 0)` })
      .from(royaltyEvents);

    return {
      totalPartners: Number(partnerRow?.count ?? 0),
      totalDeliveries: Number(deliveryRow?.count ?? 0),
      positiveValidations: Number(positiveRow?.count ?? 0),
      totalRoyaltiesUSD: Number(royaltyRow?.total ?? 0),
    };
  }),

  /** Admin: log a candidate delivery */
  recordDelivery: protectedProcedure
    .input(deliverySchema)
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const followUpDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const result = await d.insert(deliveries).values({
        candidateId: input.candidateId,
        partnerId: input.partnerId,
        gene: input.gene,
        therapeuticArea: input.therapeuticArea,
        noveltyScore: input.noveltyScore,
        compositeScore: input.compositeScore,
        fto: input.fto,
        status: "sent",
        sentAt: now,
        followUpDueAt,
        updatedAt: now,
      });

      await d
        .update(partners)
        .set({ candidatesDelivered: sql`candidatesDelivered + 1` })
        .where(eq(partners.id, input.partnerId));

      return {
        success: true,
        deliveryId: (result as unknown as { insertId: number }).insertId,
      };
    }),

  /** Admin: update delivery status */
  updateStatus: protectedProcedure
    .input(
      z.object({
        deliveryId: z.number().int().positive(),
        status: z.enum([
          "sent",
          "opened",
          "validated_positive",
          "validated_negative",
          "no_response",
          "partnership_initiated",
          "bounced",
        ]),
      })
    )
    .mutation(async ({ input }) => {
      const d = await requireDb();

      await d
        .update(deliveries)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(deliveries.id, input.deliveryId));

      if (input.status === "validated_positive") {
        const [delivery] = await d
          .select({ partnerId: deliveries.partnerId })
          .from(deliveries)
          .where(eq(deliveries.id, input.deliveryId))
          .limit(1);
        if (delivery) {
          await d
            .update(partners)
            .set({ positiveValidations: sql`positiveValidations + 1` })
            .where(eq(partners.id, delivery.partnerId));
        }
      }

      return { success: true };
    }),

  /** Admin: record a royalty payment event */
  recordRoyalty: protectedProcedure
    .input(royaltySchema)
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const royaltyAmount = Math.round(
        (input.netSales * input.royaltyRateBps) / 10000
      );

      const result = await d.insert(royaltyEvents).values({
        partnerId: input.partnerId,
        candidateId: input.candidateId,
        netSales: input.netSales,
        royaltyRate: input.royaltyRateBps,
        royaltyAmount,
        currency: input.currency,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        recordedAt: new Date(),
      });

      return {
        success: true,
        royaltyAmount,
        eventId: (result as unknown as { insertId: number }).insertId,
      };
    }),

  /** Admin: royalty summary per partner */
  royaltySummary: protectedProcedure.query(async () => {
    const d = await requireDb();
    const rows = await d
      .select({
        partnerId: royaltyEvents.partnerId,
        totalRoyalties: sql<number>`sum(royaltyAmount)`,
        eventCount: sql<number>`count(*)`,
      })
      .from(royaltyEvents)
      .groupBy(royaltyEvents.partnerId)
      .orderBy(desc(sql`sum(royaltyAmount)`));

    return rows.map((r) => ({
      partnerId: r.partnerId,
      totalRoyaltiesUSD: Number(r.totalRoyalties),
      eventCount: Number(r.eventCount),
    }));
  }),

  /** Public: list deliveries for a partner by email */
  myDeliveries: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const [partner] = await d
        .select({ id: partners.id })
        .from(partners)
        .where(eq(partners.email, input.email))
        .limit(1);

      if (!partner) return [];

      return d
        .select()
        .from(deliveries)
        .where(eq(deliveries.partnerId, partner.id))
        .orderBy(desc(deliveries.sentAt))
        .limit(50);
    }),
});

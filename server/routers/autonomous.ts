/**
 * server/routers/autonomous.ts
 *
 * tRPC procedures for the Autonomous Distribution Loop admin panel.
 *
 *   autonomous.run      — manually trigger the loop (admin only)
 *   autonomous.approvals — list pending approval requests (admin only)
 *   autonomous.approve  — approve a held candidate (admin only)
 *   autonomous.reject   — reject a held candidate (admin only)
 *   autonomous.events   — list recent distribution events (admin only)
 *   autonomous.status   — get loop config + last-run stats (admin only)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runAutonomousDistributionLoop,
  getPendingApprovals,
  approveRequest,
  rejectRequest,
  AutonomousConfig,
} from "../lib/autonomousLoop";
import { getRecentDistributionEvents } from "../db";

// ── Admin guard ───────────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ── Last run cache (in-memory, reset on server restart) ───────────────────────

let lastRunResult: Awaited<ReturnType<typeof runAutonomousDistributionLoop>> | null = null;
let isRunning = false;

// ── Router ────────────────────────────────────────────────────────────────────

export const autonomousRouter = router({
  /**
   * Manually trigger the autonomous distribution loop.
   * Returns immediately if a run is already in progress.
   */
  run: adminProcedure.mutation(async () => {
    if (isRunning) {
      return {
        started: false,
        message: "Loop is already running — wait for it to complete.",
        lastResult: lastRunResult,
      };
    }

    isRunning = true;
    try {
      lastRunResult = await runAutonomousDistributionLoop();
      return {
        started: true,
        message: "Loop completed.",
        lastResult: lastRunResult,
      };
    } finally {
      isRunning = false;
    }
  }),

  /**
   * List all pending approval requests.
   */
  approvals: adminProcedure.query(async () => {
    return getPendingApprovals();
  }),

  /**
   * Approve a held candidate and re-queue it for design + delivery.
   */
  approve: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await approveRequest(input.id);
      return { success: true, id: input.id };
    }),

  /**
   * Reject a held candidate.
   */
  reject: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await rejectRequest(input.id);
      return { success: true, id: input.id };
    }),

  /**
   * List the most recent distribution events (default: last 10).
   */
  events: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return getRecentDistributionEvents(input.limit);
    }),

  /**
   * Return loop configuration and current run status.
   */
  status: adminProcedure.query(() => {
    return {
      isRunning,
      config: {
        schedule: AutonomousConfig.schedule,
        minSignalConfidence: AutonomousConfig.minSignalConfidence,
        minCompositeScore: AutonomousConfig.minCompositeScore,
        maxDeliveriesPerRun: AutonomousConfig.maxDeliveriesPerRun,
        autoDesignGenes: [...AutonomousConfig.autoDesignGenes],
        requireApproval: { ...AutonomousConfig.requireApproval },
      },
      lastResult: lastRunResult,
    };
  }),
});

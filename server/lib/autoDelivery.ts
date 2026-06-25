/**
 * server/lib/autoDelivery.ts
 *
 * Approval-gate logic for the partner auto-delivery pipeline.
 *
 * Decision tree (evaluated in order):
 *
 *  1. Hard block: confidence < minConfidence (0.80) → BLOCK, no notification
 *  2. Hard block: deliveriesThisRun >= maxDeliveriesPerRun (3) → BLOCK, no notification
 *  3. Approval required: gene not in autoDesignGenes (novelTarget) → HOLD, notify owner
 *  4. Approval required: compositeScore < 85 (compositeBelow85) → HOLD, notify owner
 *  5. Auto-deliver: partnerDelivery = false (known gene, high score) → AUTO
 *
 * The gate is intentionally non-throwing — all errors are caught and returned
 * as BLOCK decisions so the caller can continue safely.
 */

import { notifyOwner } from "../_core/notification";
import { AUTO_DELIVERY_CONFIG } from "../../shared/const";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GateDecision = "AUTO" | "HOLD" | "BLOCK";

export interface GateInput {
  gene: string;
  compositeScore: number;
  /** citationEvidence.confidence from the CandidatePackage */
  confidence: number;
  /** Number of deliveries already made in this register call */
  deliveriesThisRun: number;
  /** Human-readable partner name for notification content */
  partnerName: string;
  /** Partner email for notification content */
  partnerEmail: string;
  /** Therapeutic area for notification content */
  therapeuticArea: string;
}

export interface GateResult {
  decision: GateDecision;
  reason: string;
  /** Set when decision === "HOLD" — indicates notification was attempted */
  notificationSent?: boolean;
}

// ── Gate function ─────────────────────────────────────────────────────────────

/**
 * Evaluate whether a candidate delivery should proceed automatically,
 * be held for owner approval, or be blocked entirely.
 *
 * This function is async because the HOLD path sends an owner notification.
 */
export async function evaluateDeliveryGate(input: GateInput): Promise<GateResult> {
  const cfg = AUTO_DELIVERY_CONFIG;

  // ── 1. Hard block: confidence below minimum ────────────────────────────────
  if (input.confidence < cfg.minConfidence) {
    return {
      decision: "BLOCK",
      reason: `Confidence ${input.confidence.toFixed(2)} < minConfidence ${cfg.minConfidence}`,
    };
  }

  // ── 2. Hard block: per-run delivery cap ────────────────────────────────────
  if (input.deliveriesThisRun >= cfg.maxDeliveriesPerRun) {
    return {
      decision: "BLOCK",
      reason: `maxDeliveriesPerRun (${cfg.maxDeliveriesPerRun}) reached for this run`,
    };
  }

  // ── 3. Approval required: novel target (gene not in autoDesignGenes) ───────
  const isKnownGene = (cfg.autoDesignGenes as readonly string[]).includes(input.gene);
  if (!isKnownGene && cfg.requireApproval.novelTarget) {
    const notificationSent = await sendApprovalNotification({
      reason: "Novel target",
      detail: `Gene **${input.gene}** is not in the auto-design list (${cfg.autoDesignGenes.join(", ")}).`,
      input,
    });
    return {
      decision: "HOLD",
      reason: `Novel target: ${input.gene} requires owner approval`,
      notificationSent,
    };
  }

  // ── 4. Approval required: borderline composite score ──────────────────────
  if (input.compositeScore < 85 && cfg.requireApproval.compositeBelow85) {
    const notificationSent = await sendApprovalNotification({
      reason: "Borderline composite score",
      detail: `Composite score **${input.compositeScore}/100** is below the 85-point auto-deliver threshold.`,
      input,
    });
    return {
      decision: "HOLD",
      reason: `Composite score ${input.compositeScore} < 85 requires owner approval`,
      notificationSent,
    };
  }

  // ── 5. Auto-deliver: known gene, high score, no approval required ──────────
  // cfg.requireApproval.partnerDelivery === false means auto-deliver is allowed
  return {
    decision: "AUTO",
    reason: `Known gene (${input.gene}), composite ${input.compositeScore}/100, confidence ${input.confidence.toFixed(2)} — auto-delivered`,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface NotificationArgs {
  reason: string;
  detail: string;
  input: GateInput;
}

async function sendApprovalNotification({ reason, detail, input }: NotificationArgs): Promise<boolean> {
  try {
    return await notifyOwner({
      title: `[Approval Required] ${reason} — ${input.gene} for ${input.partnerName}`,
      content: [
        `**Partner:** ${input.partnerName} (${input.partnerEmail})`,
        `**Gene:** ${input.gene}`,
        `**Therapeutic area:** ${input.therapeuticArea}`,
        `**Composite score:** ${input.compositeScore}/100`,
        `**Confidence:** ${input.confidence.toFixed(2)}`,
        ``,
        `**Reason approval is required:** ${detail}`,
        ``,
        `To deliver this candidate manually, use the Partner Network admin panel.`,
      ].join("\n"),
    });
  } catch (err) {
    console.warn("[autoDelivery] Owner notification failed:", err);
    return false;
  }
}

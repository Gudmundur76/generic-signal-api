/**
 * autoDelivery.test.ts — Sprint 8 tests
 *
 * Tests for the evaluateDeliveryGate() approval-gate logic.
 *
 * Test 1: AUTO — known gene, composite >= 85, confidence >= 0.80
 * Test 2: HOLD — novel gene (not in autoDesignGenes) → notifies owner
 * Test 3: HOLD — compositeScore < 85 → notifies owner
 * Test 4: BLOCK — maxDeliveriesPerRun (3) reached
 * Test 5: BLOCK — confidence < minConfidence (0.80)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateDeliveryGate } from "./lib/autoDelivery";
import { AUTO_DELIVERY_CONFIG } from "../shared/const";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<Parameters<typeof evaluateDeliveryGate>[0]> = {}) {
  return {
    gene: "PCSK9",                // known gene
    compositeScore: 90,           // above 85
    confidence: 0.92,             // above 0.80
    deliveriesThisRun: 0,
    partnerName: "Test Partner",
    partnerEmail: "partner@test.com",
    therapeuticArea: "cardiovascular",
    ...overrides,
  };
}

// Mock notifyOwner so we can assert it was called without hitting the network
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { notifyOwner } from "./_core/notification";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateDeliveryGate — AUTO_DELIVERY_CONFIG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: AUTO — known gene, high score, sufficient confidence
  it("Test 1: AUTO — known gene with composite >= 85 and confidence >= 0.80", async () => {
    const result = await evaluateDeliveryGate(baseInput());

    expect(result.decision).toBe("AUTO");
    expect(result.reason).toContain("PCSK9");
    // No approval notification should be sent for an auto-deliver case
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  // Test 2: HOLD — novel gene (not in autoDesignGenes)
  it("Test 2: HOLD — novel gene not in autoDesignGenes → owner notified", async () => {
    const result = await evaluateDeliveryGate(baseInput({
      gene: "ANGPTL3",  // not in ['PCSK9', 'LPA', 'APOE']
      compositeScore: 92,
      confidence: 0.91,
    }));

    expect(result.decision).toBe("HOLD");
    expect(result.reason).toContain("ANGPTL3");
    expect(result.reason.toLowerCase()).toContain("novel");
    expect(result.notificationSent).toBe(true);
    expect(notifyOwner).toHaveBeenCalledOnce();

    const call = (notifyOwner as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.title).toContain("Approval Required");
    expect(call.title).toContain("ANGPTL3");
    expect(call.content).toContain("ANGPTL3");
    expect(call.content).toContain("Test Partner");
  });

  // Test 3: HOLD — compositeScore < 85
  it("Test 3: HOLD — compositeScore < 85 → owner notified", async () => {
    const result = await evaluateDeliveryGate(baseInput({
      gene: "PCSK9",    // known gene — but score is borderline
      compositeScore: 78,
      confidence: 0.88,
    }));

    expect(result.decision).toBe("HOLD");
    expect(result.reason).toContain("78");
    expect(result.reason).toContain("85");
    expect(result.notificationSent).toBe(true);
    expect(notifyOwner).toHaveBeenCalledOnce();

    const call = (notifyOwner as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.title).toContain("Approval Required");
    expect(call.content).toContain("78/100");
  });

  // Test 4: BLOCK — maxDeliveriesPerRun reached
  it("Test 4: BLOCK — deliveriesThisRun >= maxDeliveriesPerRun (3)", async () => {
    const result = await evaluateDeliveryGate(baseInput({
      deliveriesThisRun: AUTO_DELIVERY_CONFIG.maxDeliveriesPerRun, // 3
    }));

    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("maxDeliveriesPerRun");
    expect(result.reason).toContain("3");
    // No notification for hard blocks
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  // Test 5: BLOCK — confidence below minConfidence
  it("Test 5: BLOCK — confidence < minConfidence (0.80)", async () => {
    const result = await evaluateDeliveryGate(baseInput({
      confidence: 0.65,
    }));

    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("0.65");
    expect(result.reason).toContain("minConfidence");
    // No notification for hard blocks
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  // Bonus: verify AUTO_DELIVERY_CONFIG shape matches the spec
  it("AUTO_DELIVERY_CONFIG matches the specified shape", () => {
    expect(AUTO_DELIVERY_CONFIG.autoDesignGenes).toContain("PCSK9");
    expect(AUTO_DELIVERY_CONFIG.autoDesignGenes).toContain("LPA");
    expect(AUTO_DELIVERY_CONFIG.autoDesignGenes).toContain("APOE");
    expect(AUTO_DELIVERY_CONFIG.maxDeliveriesPerRun).toBe(3);
    expect(AUTO_DELIVERY_CONFIG.minConfidence).toBe(0.80);
    expect(AUTO_DELIVERY_CONFIG.requireApproval.novelTarget).toBe(true);
    expect(AUTO_DELIVERY_CONFIG.requireApproval.compositeBelow85).toBe(true);
    expect(AUTO_DELIVERY_CONFIG.requireApproval.partnerDelivery).toBe(false);
  });
});

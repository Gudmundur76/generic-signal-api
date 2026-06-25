export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * Auto-delivery approval-gate configuration.
 *
 * autoDesignGenes   — genes that may be delivered automatically (no approval needed)
 * maxDeliveriesPerRun — hard cap on deliveries per register call
 * minConfidence     — minimum citationEvidence.confidence to proceed at all
 * requireApproval   — per-trigger flags:
 *   novelTarget       — gene not in autoDesignGenes → owner must approve
 *   compositeBelow85  — compositeScore < 85 → owner must approve
 *   partnerDelivery   — high-score known gene → auto-deliver (false = no approval needed)
 */
export const AUTO_DELIVERY_CONFIG = {
  autoDesignGenes: ['PCSK9', 'LPA', 'APOE'] as readonly string[],
  maxDeliveriesPerRun: 3,
  minConfidence: 0.80,
  requireApproval: {
    novelTarget: true,
    compositeBelow85: true,
    partnerDelivery: false,
  },
} as const;

export type AutoDeliveryConfig = typeof AUTO_DELIVERY_CONFIG;

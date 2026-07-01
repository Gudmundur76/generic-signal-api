export async function mragentIngest(payload: {
  episode_id: string;
  text: string;
  origin: string;
  tags: string[];
  citation: any;
}) {
  // Mock or real implementation for MRAgent ingest
  console.log(`[mragent] Ingesting episode ${payload.episode_id}`);
}

export async function processClaimVerdict(
  claimId: string,
  claimText: string,
  verdict: string,
  targetGene: string,
  compoundType: string,
  primaryCitation: any
) {
  // After verdict assignment
  await mragentIngest({
    episode_id: `ttruthdesk:claim:${claimId}`,
    text: `VERDICT: ${verdict}\nCLAIM: ${claimText}`,
    origin: 'ttruthdesk',
    tags: [targetGene, compoundType],
    citation: primaryCitation
  });
}

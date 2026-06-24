import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dna,
  FlaskConical,
  Atom,
  Zap,
  ArrowLeft,
  Play,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYER_ICONS: Record<string, React.ReactNode> = {
  dna: <Dna className="w-4 h-4" />,
  small_molecule: <Atom className="w-4 h-4" />,
  protein: <FlaskConical className="w-4 h-4" />,
  rna: <Zap className="w-4 h-4" />,
};

const LAYER_LABELS: Record<string, string> = {
  dna: "DNA / CRISPR",
  small_molecule: "Small Molecule",
  protein: "Protein",
  rna: "RNA / siRNA",
};

const LAYER_COLORS: Record<string, string> = {
  dna: "border-blue-500 bg-blue-50",
  small_molecule: "border-red-500 bg-red-50",
  protein: "border-green-500 bg-green-50",
  rna: "border-purple-500 bg-purple-50",
};

const CLAIM_ICONS = {
  Supported: <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />,
  Contradicted: <AlertCircle className="w-3.5 h-3.5 text-red-600" />,
  Ambiguous: <HelpCircle className="w-3.5 h-3.5 text-yellow-600" />,
};

const CLAIM_COLORS = {
  Supported: "text-green-700 bg-green-50 border-green-200",
  Contradicted: "text-red-700 bg-red-50 border-red-200",
  Ambiguous: "text-yellow-700 bg-yellow-50 border-yellow-200",
};

const PATENT_COLORS = {
  CLEAR: "bg-green-100 text-green-800 border-green-300",
  RISK: "bg-yellow-100 text-yellow-800 border-yellow-300",
  BLOCKED: "bg-red-100 text-red-800 border-red-300",
};

// GenScript cart base URL — pre-fills sequence in the synthesis order form
function genscriptUrl(sequence: string, layer: string): string {
  const encoded = encodeURIComponent(sequence);
  if (layer === "dna" || layer === "rna") {
    return `https://www.genscript.com/gene-synthesis.html?sequence=${encoded}`;
  }
  if (layer === "small_molecule") {
    return `https://www.genscript.com/custom-peptide-synthesis.html?smiles=${encoded}`;
  }
  return `https://www.genscript.com/protein-expression.html?sequence=${encoded}`;
}

// ---------------------------------------------------------------------------
// Evidence trail sub-component
// ---------------------------------------------------------------------------

function EvidenceTrail({
  runId,
  layer,
}: {
  runId: string;
  layer: string;
}) {
  const { data } = trpc.design.getVerification.useQuery(
    { runId, layer: layer as "dna" | "small_molecule" | "protein" | "rna" },
    { enabled: !!runId }
  );

  if (!data) return <div className="text-xs text-gray-400 font-mono py-2">Loading evidence…</div>;

  const LEVEL_LABELS: Record<string, string> = {
    pQTL: "L1 — Protein QTL (deCODE)",
    GWAS: "L2 — GWAS Association",
    clinical: "L3 — Clinical Evidence",
    structural: "L4 — Structural Biology",
    citation: "L5 — Citation Verification",
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
          Evidence Trail — L1 to L5
        </span>
        <span className="text-xs font-bold text-black">
          Overall confidence: {(data.overallConfidence * 100).toFixed(0)}%
        </span>
      </div>
      {data.claims.map((claim, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 p-2.5 border rounded-none text-xs ${
            CLAIM_COLORS[claim.status]
          }`}
        >
          <div className="mt-0.5 flex-shrink-0">{CLAIM_ICONS[claim.status]}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold mb-0.5">
              {LEVEL_LABELS[claim.type] ?? claim.type}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">
                Confidence: {(claim.confidence * 100).toFixed(0)}%
              </span>
              {claim.sources.map((src, j) => (
                <span key={j} className="font-mono bg-white/60 px-1.5 py-0.5 border border-current/20 rounded-none">
                  {src}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer result card
// ---------------------------------------------------------------------------

function LayerCard({
  result,
  runId,
  isRecommended,
}: {
  result: {
    layer: string;
    sequence: string;
    score: number;
    novelty: boolean;
    patent: "CLEAR" | "RISK" | "BLOCKED";
    generation: number;
  };
  runId: string;
  isRecommended: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border-l-4 ${LAYER_COLORS[result.layer]} border rounded-none p-4 relative`}
    >
      {isRecommended && (
        <div className="absolute top-3 right-3 text-xs font-mono bg-red-600 text-white px-2 py-0.5 uppercase tracking-widest">
          Recommended
        </div>
      )}

      {/* Layer header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="text-gray-700">{LAYER_ICONS[result.layer]}</div>
        <span className="font-bold text-sm text-black">
          {LAYER_LABELS[result.layer]}
        </span>
        <span className="text-xs font-mono text-gray-400">
          Gen {result.generation}
        </span>
      </div>

      {/* Sequence */}
      <div className="bg-white border border-gray-200 p-2 mb-3 font-mono text-xs text-gray-800 break-all leading-relaxed">
        {result.sequence}
      </div>

      {/* Score row */}
      <div className="flex items-center gap-4 mb-3">
        <div>
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wide">Score</div>
          <div className="text-2xl font-black text-black leading-none">{result.score}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wide">Novelty</div>
          <div className="text-sm font-bold">
            {result.novelty ? (
              <span className="text-green-700">✓ Novel</span>
            ) : (
              <span className="text-yellow-700">Pending</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wide">Patent</div>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 border rounded-none ${
              PATENT_COLORS[result.patent]
            }`}
          >
            {result.patent}
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        <a
          href={genscriptUrl(result.sequence, result.layer)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-mono bg-black text-white px-3 py-1.5 hover:bg-red-600 transition-colors uppercase tracking-widest"
        >
          <ShoppingCart className="w-3 h-3" />
          Order Synthesis
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-mono text-gray-500 hover:text-black transition-colors px-2 py-1.5 border border-gray-200 hover:border-black"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Hide Evidence
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Show Evidence L1–L5
            </>
          )}
        </button>
      </div>

      {/* Evidence trail */}
      {expanded && <EvidenceTrail runId={runId} layer={result.layer} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DesignTarget() {
  const params = useParams<{ target: string }>();
  const targetName = params.target?.toUpperCase() ?? "PCSK9";

  const { data: targets } = trpc.design.getTargets.useQuery();
  const target = targets?.find((t) => t.name === targetName);

  const [runId, setRunId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const evolveMutation = trpc.design.evolve.useMutation({
    onSuccess: (data) => {
      setRunId(data.runId);
      setPolling(true);
    },
  });

  const progressQuery = trpc.design.getProgress.useQuery(
    { runId: runId! },
    { enabled: !!runId && polling, refetchInterval: polling ? 1200 : false }
  );

  const resultsQuery = trpc.design.getResults.useQuery(
    { runId: runId! },
    { enabled: !!runId }
  );

  // Stop polling when converged
  useEffect(() => {
    if (progressQuery.data?.converged) {
      setPolling(false);
    }
  }, [progressQuery.data?.converged]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleRunEvolution = () => {
    if (!target) return;
    evolveMutation.mutate({
      target: targetName as "PCSK9" | "LPA" | "APOE",
      layers: target.layers,
    });
  };

  const progress = progressQuery.data;
  const results = resultsQuery.data;
  const converged = progress?.converged ?? false;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-black">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <Link href="/design">
            <button className="flex items-center gap-1.5 text-xs font-mono text-gray-500 hover:text-black transition-colors mb-4 uppercase tracking-widest">
              <ArrowLeft className="w-3.5 h-3.5" />
              All Targets
            </button>
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-red-600" />
                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                  Evolva · {target?.gene ?? targetName}
                </span>
              </div>
              <h1 className="text-5xl font-black tracking-tight text-black leading-none">
                {targetName}
              </h1>
              {target && (
                <p className="mt-2 text-sm text-gray-600 max-w-2xl leading-relaxed">
                  {target.description}
                </p>
              )}
            </div>
            {target && (
              <div className="hidden md:grid grid-cols-2 gap-4 text-right">
                <div className="bg-gray-50 p-3 text-right">
                  <div className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                    deCODE Assoc.
                  </div>
                  <div className="text-3xl font-black text-black">
                    {target.deCODEAssociations}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 text-right">
                  <div className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                    p-value
                  </div>
                  <div className="text-3xl font-black text-black">
                    {target.pValue.toExponential(0)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Run evolution button */}
        {!runId && (
          <div className="border border-black p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-black mb-1">
                Ready to evolve {targetName}
              </div>
              <div className="text-xs text-gray-500 font-mono">
                {target?.layers.length ?? 0} layers ·{" "}
                {target?.layers.map((l) => LAYER_LABELS[l]).join(", ")}
              </div>
            </div>
            <Button
              onClick={handleRunEvolution}
              disabled={evolveMutation.isPending || !target}
              className="rounded-none bg-red-600 hover:bg-red-700 text-white font-mono text-xs uppercase tracking-widest gap-2 px-6"
            >
              {evolveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run Evolution
            </Button>
          </div>
        )}

        {/* Progress bar */}
        {runId && progress && (
          <div className="border border-black p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                  Evolution Progress
                </span>
                <div className="text-sm font-bold text-black mt-0.5">
                  Generation {progress.generation} / {progress.maxGenerations}
                  {converged && (
                    <span className="ml-2 text-green-700 font-mono text-xs">
                      ✓ Converged
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                  Best Score
                </div>
                <div className="text-2xl font-black text-black leading-none">
                  {progress.bestScore}
                </div>
              </div>
            </div>
            <Progress
              value={progress.progressPct}
              className="h-2 rounded-none bg-gray-100"
            />
            {!converged && (
              <div className="flex items-center gap-1.5 mt-2 text-xs font-mono text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Evolving…
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results && results.layers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-black">Evolution Results</h2>
                <div className="text-xs font-mono text-gray-500 mt-0.5">
                  Cross-layer coherence:{" "}
                  <span className="font-bold text-black">{results.coherence}%</span>
                  {" · "}
                  Recommended:{" "}
                  <span className="font-bold text-black">
                    {LAYER_LABELS[results.recommendedLayer]}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {results.layers.map((layer) => (
                <LayerCard
                  key={layer.layer}
                  result={layer}
                  runId={results.runId}
                  isRecommended={layer.layer === results.recommendedLayer}
                />
              ))}
            </div>
          </div>
        )}

        {/* Run again */}
        {converged && (
          <div className="border-t border-gray-100 pt-6 flex justify-end">
            <Button
              onClick={() => {
                setRunId(null);
                setPolling(false);
              }}
              variant="outline"
              className="rounded-none border-black font-mono text-xs uppercase tracking-widest gap-2"
            >
              <Play className="w-3.5 h-3.5" />
              Run Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dna, FlaskConical, Atom, Zap, ArrowRight, Activity } from "lucide-react";

const LAYER_ICONS: Record<string, React.ReactNode> = {
  dna: <Dna className="w-3.5 h-3.5" />,
  small_molecule: <Atom className="w-3.5 h-3.5" />,
  protein: <FlaskConical className="w-3.5 h-3.5" />,
  rna: <Zap className="w-3.5 h-3.5" />,
};

const LAYER_LABELS: Record<string, string> = {
  dna: "DNA",
  small_molecule: "Small Molecule",
  protein: "Protein",
  rna: "RNA",
};

const DISEASE_COLORS: Record<string, string> = {
  "cardiovascular disease": "bg-red-50 text-red-700 border-red-200",
  "coronary artery disease": "bg-orange-50 text-orange-700 border-orange-200",
  "Alzheimer's disease / dyslipidaemia": "bg-purple-50 text-purple-700 border-purple-200",
};

export default function Design() {
  const { data: targets, isLoading } = trpc.design.getTargets.useQuery();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-black">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 bg-red-600 rounded-none" />
                <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  Evolva · Molecular Design
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-black leading-none">
                Autonomous
                <br />
                Molecular Evolution
              </h1>
              <p className="mt-3 text-gray-600 max-w-xl text-sm leading-relaxed">
                Select a validated target from the deCODE genetics cohort. The evolution
                engine scores candidates across DNA, small molecule, protein, and RNA layers
                — verified against 65+ sources before dispatch.
              </p>
            </div>
            <div className="hidden md:flex flex-col items-end gap-1 text-right">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Powered by</span>
              <span className="text-sm font-bold text-black">deCODE Genetics</span>
              <span className="text-sm font-bold text-black">citation.is</span>
              <span className="text-sm font-bold text-black">notus.is</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target grid */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 bg-gray-50 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {targets?.map((target) => (
              <Card
                key={target.name}
                className="border border-black rounded-none hover:shadow-lg transition-shadow duration-200 group"
              >
                <CardHeader className="pb-3 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-red-600" />
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                          {target.gene}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-black tracking-tight">
                        {target.name}
                      </h2>
                    </div>
                    <Activity className="w-5 h-5 text-gray-300 group-hover:text-red-600 transition-colors" />
                  </div>
                  <span
                    className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 border rounded-none ${
                      DISEASE_COLORS[target.disease] ?? "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {target.disease}
                  </span>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* deCODE stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-2.5">
                      <div className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-0.5">
                        Associations
                      </div>
                      <div className="text-xl font-black text-black">
                        {target.deCODEAssociations}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-2.5">
                      <div className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-0.5">
                        p-value
                      </div>
                      <div className="text-xl font-black text-black">
                        {target.pValue.toExponential(0)}
                      </div>
                    </div>
                  </div>

                  {/* Layers */}
                  <div>
                    <div className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-2">
                      Available Layers
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {target.layers.map((layer) => (
                        <Badge
                          key={layer}
                          variant="outline"
                          className="rounded-none border-black text-black text-xs font-mono gap-1 px-2 py-0.5"
                        >
                          {LAYER_ICONS[layer]}
                          {LAYER_LABELS[layer]}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Approved drugs */}
                  {target.approvedDrugs.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-1">
                        Approved Drugs
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {target.approvedDrugs.map((drug) => (
                          <span
                            key={drug}
                            className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 font-mono"
                          >
                            {drug}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <Link href={`/design/${target.name}`}>
                    <Button className="w-full rounded-none bg-black text-white hover:bg-red-600 transition-colors font-mono text-xs uppercase tracking-widest gap-2 mt-2">
                      Run Evolution
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Bottom legend */}
        <div className="mt-12 pt-8 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
          {Object.entries(LAYER_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-7 h-7 border border-black flex items-center justify-center text-black">
                {LAYER_ICONS[key]}
              </div>
              <div>
                <div className="text-xs font-bold text-black">{label}</div>
                <div className="text-xs text-gray-400 font-mono">Layer</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

const AREAS = [
  { id: "cardiovascular", label: "Cardiovascular" },
  { id: "oncology", label: "Oncology" },
  { id: "neurology", label: "Neurology" },
  { id: "immunology", label: "Immunology" },
  { id: "rare_disease", label: "Rare Disease" },
  { id: "metabolic", label: "Metabolic" },
  { id: "infectious_disease", label: "Infectious Disease" },
  { id: "ophthalmology", label: "Ophthalmology" },
  { id: "respiratory", label: "Respiratory" },
  { id: "hematology", label: "Hematology" },
] as const;

type AreaId = (typeof AREAS)[number]["id"];

const TIERS = [
  {
    id: "explorer" as const,
    label: "Explorer",
    royalty: "0.5%",
    desc: "Receive candidates, validate, monitor. No development commitment.",
  },
  {
    id: "developer" as const,
    label: "Developer",
    royalty: "2%",
    desc: "Active development programme. Priority candidate delivery.",
  },
  {
    id: "accelerator" as const,
    label: "Accelerator",
    royalty: "3%",
    desc: "Full co-development. Dedicated candidate stream + weekly briefings.",
  },
];

export default function PartnerPortal() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [institution, setInstitution] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<AreaId[]>([]);
  const [tier, setTier] = useState<"explorer" | "developer" | "accelerator">("explorer");
  const [agreed, setAgreed] = useState(false);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [firstGene, setFirstGene] = useState<string | null>(null);
  const [firstArea, setFirstArea] = useState<string | null>(null);

  const register = trpc.partners.register.useMutation({
    onSuccess(data) {
      if (data.success) {
        setPartnerId(data.partnerId);
        setFirstGene(data.firstCandidateGene ?? null);
        setFirstArea(data.firstCandidateArea ?? null);
        setStep("success");
      } else {
        // Duplicate email — guide the partner back to the dashboard
        toast.error(
          "This email is already registered. Check your inbox for your candidate package, or visit the dashboard to track your deliveries.",
          {
            duration: 8000,
            action: {
              label: "Go to dashboard",
              onClick: () => window.location.href = "/dashboard",
            },
          }
        );
      }
    },
    onError(err) {
      toast.error(err.message);
    },
  });

  function toggleArea(id: AreaId) {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please accept the partner agreement to continue.");
      return;
    }
    if (selectedAreas.length === 0) {
      toast.error("Please select at least one therapeutic area.");
      return;
    }
    register.mutate({
      name,
      email,
      institution,
      therapeuticAreas: selectedAreas,
      tier,
      agreementAccepted: true,
    });
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold">You're in the network.</h1>
          <p className="text-zinc-400 text-lg">
            {firstGene
              ? <>
                  Your first drug candidate (<strong className="text-white">{firstGene}</strong>,{" "}
                  {firstArea?.replace(/_/g, " ")}) has been queued for delivery. No cost. No commitment.
                </>
              : <>Your first drug candidate will arrive within 24 hours. No cost. No commitment.</>
            }
            {" "}Royalties only if a drug reaches commercial sales.
          </p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left space-y-2">
            <p className="text-sm text-zinc-500">Partner ID</p>
            <p className="font-mono text-white">#{partnerId}</p>
            <p className="text-sm text-zinc-500 mt-2">Registered email</p>
            <p className="text-white">{email}</p>
          </div>
          <p className="text-sm text-zinc-500">
            Check your inbox. We'll send the candidate package directly to {email}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-600 rounded-sm" />
          <span className="font-bold text-sm tracking-wide">GENERIC SIGNAL</span>
        </a>
        <span className="text-xs text-zinc-500">Partner Network</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <div className="space-y-4">
          <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">
            FREE ACCESS
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Receive novel drug candidates.<br />
            <span className="text-zinc-400">Pay nothing until market.</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Our AI pipeline generates patent-ready drug candidates daily using human genetic
            data. We deliver them to partners at no cost. You develop them. We collect a small
            royalty only if a drug reaches commercial sales.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { n: "01", title: "Sign up", desc: "Select your therapeutic areas. Accept the standard agreement. Done." },
            { n: "02", title: "Receive candidates", desc: "Novel sequences, FTO: CLEAR, deCODE genetic evidence, provisional patent draft. Delivered to your inbox." },
            { n: "03", title: "Develop & share upside", desc: "Validate, develop, commercialise. We receive royalties only when a drug reaches market." },
          ].map((s) => (
            <div key={s.n} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
              <span className="text-red-500 font-mono text-sm">{s.n}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-zinc-400 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Tier selection */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Choose your tier</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTier(t.id)}
                className={`text-left rounded-xl border p-5 space-y-2 transition-all duration-150 ${
                  tier === t.id
                    ? "border-red-500 bg-red-500/10"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-red-400 font-mono text-sm">{t.royalty}</span>
                </div>
                <p className="text-zinc-400 text-sm">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-300">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Dr. Jane Smith"
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@institution.edu"
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="institution" className="text-zinc-300">Institution / Company</Label>
              <Input
                id="institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                required
                placeholder="University of Iceland / Alvotech / GenScript ProBio"
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Therapeutic areas */}
          <div className="space-y-3">
            <Label className="text-zinc-300">Therapeutic areas <span className="text-zinc-500">(select all that apply)</span></Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {AREAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleArea(a.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all duration-150 ${
                    selectedAreas.includes(a.id)
                      ? "border-red-500 bg-red-500/10 text-red-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agreement */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base text-white">Standard Partner Agreement</CardTitle>
              <CardDescription className="text-zinc-400">
                Read and accept before joining the network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-400">
              <p><strong className="text-zinc-200">1. Candidate delivery.</strong> We deliver drug candidates to you at no cost and no obligation. Candidates include sequence data, patent draft, genetic evidence, and FTO status.</p>
              <p><strong className="text-zinc-200">2. Royalties.</strong> If you commercialise a drug developed from a delivered candidate, you pay us royalties on net sales at the rate corresponding to your tier (Explorer: 0.5%, Developer: 2%, Accelerator: 3%).</p>
              <p><strong className="text-zinc-200">3. No exclusivity.</strong> We may deliver the same candidate to multiple partners. First to file a full utility patent application gains exclusivity in that jurisdiction.</p>
              <p><strong className="text-zinc-200">4. Diligence.</strong> You agree to run at least one validation experiment within 12 months of receiving a candidate, or candidate rights revert to us.</p>
              <p><strong className="text-zinc-200">5. No warranty.</strong> Candidates are provided as-is. We make no representation as to patentability, safety, or efficacy. Attorney review is required before filing.</p>
              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="agreement"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5 border-zinc-600"
                />
                <Label htmlFor="agreement" className="text-zinc-300 cursor-pointer leading-relaxed">
                  I have read and accept the Standard Partner Agreement. I understand that royalties are payable only upon commercial sales.
                </Label>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={register.isPending || !agreed}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 text-base transition-all active:scale-[0.98]"
          >
            {register.isPending ? "Registering…" : "Join the Partner Network →"}
          </Button>
        </form>
      </div>
    </div>
  );
}

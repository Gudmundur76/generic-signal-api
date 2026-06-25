import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-zinc-700 text-zinc-300",
  opened: "bg-blue-900/40 text-blue-300",
  validated_positive: "bg-green-900/40 text-green-300",
  validated_negative: "bg-red-900/40 text-red-300",
  no_response: "bg-yellow-900/40 text-yellow-300",
  partnership_initiated: "bg-purple-900/40 text-purple-300",
  bounced: "bg-zinc-800 text-zinc-500",
};

export default function RoyaltyDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "partners" | "deliveries" | "royalties">("overview");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Data queries
  const stats = trpc.partners.stats.useQuery(undefined, { enabled: !!user });
  const partners = trpc.partners.list.useQuery({ limit: 200 }, { enabled: !!user && activeTab === "partners" });
  const deliveriesQuery = trpc.partners.listDeliveries.useQuery(
    { limit: 200 },
    { enabled: !!user && activeTab === "deliveries" }
  );
  const royaltySummary = trpc.partners.royaltySummary.useQuery(undefined, { enabled: !!user && activeTab === "royalties" });

  const updateStatus = trpc.partners.updateStatus.useMutation({
    onSuccess() {
      toast.success("Status updated");
      deliveriesQuery.refetch();
      stats.refetch();
      setUpdatingId(null);
    },
    onError(err) { toast.error(err.message); setUpdatingId(null); },
  });

  // Record royalty form state
  const [royaltyForm, setRoyaltyForm] = useState({
    partnerId: "",
    candidateId: "",
    netSales: "",
    royaltyRateBps: "200",
    currency: "USD" as "USD" | "EUR" | "GBP",
    periodStart: "",
    periodEnd: "",
  });

  const recordRoyalty = trpc.partners.recordRoyalty.useMutation({
    onSuccess(data) {
      toast.success(`Royalty recorded: ${fmt(data.royaltyAmount)}`);
      royaltySummary.refetch();
      stats.refetch();
    },
    onError(err) { toast.error(err.message); },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-zinc-400">Admin access required.</p>
          <Link href="/"><Button variant="outline" className="border-zinc-700">← Back to home</Button></Link>
        </div>
      </div>
    );
  }

  const s = stats.data;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-600 rounded-sm" />
            <span className="font-bold text-sm tracking-wide">GENERIC SIGNAL</span>
          </a>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400 text-sm">Royalty Dashboard</span>
        </div>
        <span className="text-xs text-zinc-500">{user.name}</span>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit">
          {(["overview", "partners", "deliveries", "royalties"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 capitalize ${
                activeTab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">Partner Network Overview</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Partners", value: s?.totalPartners ?? "—", color: "text-white" },
                { label: "Candidates Delivered", value: s?.totalDeliveries ?? "—", color: "text-blue-400" },
                { label: "Positive Validations", value: s?.positiveValidations ?? "—", color: "text-green-400" },
                { label: "Total Royalties", value: s ? fmt(s.totalRoyaltiesUSD) : "—", color: "text-red-400" },
              ].map((m) => (
                <Card key={m.label} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-6">
                    <p className="text-zinc-500 text-sm">{m.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${m.color}`}>{m.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Conversion funnel */}
            {s && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-base text-white">Conversion Funnel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Partners signed", value: s.totalPartners, max: s.totalPartners },
                    { label: "Candidates delivered", value: s.totalDeliveries, max: s.totalPartners * 10 },
                    { label: "Positive validations", value: s.positiveValidations, max: s.totalDeliveries },
                    { label: "Royalty events", value: 0, max: s.positiveValidations },
                  ].map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">{row.label}</span>
                        <span className="text-white font-mono">{row.value}</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 rounded-full transition-all duration-500"
                          style={{ width: row.max > 0 ? `${Math.min(100, (row.value / row.max) * 100)}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Partners */}
        {activeTab === "partners" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Partners ({partners.data?.length ?? 0})</h2>
              <Link href="/partners">
                <Button className="bg-red-600 hover:bg-red-700 text-white text-sm">
                  + New Partner Signup
                </Button>
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left py-3 pr-4">Name</th>
                    <th className="text-left py-3 pr-4">Institution</th>
                    <th className="text-left py-3 pr-4">Tier</th>
                    <th className="text-left py-3 pr-4">Areas</th>
                    <th className="text-right py-3 pr-4">Delivered</th>
                    <th className="text-right py-3">Positive</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.data?.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-medium text-white">{p.name}</p>
                          <p className="text-zinc-500 text-xs">{p.email}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{p.institution}</td>
                      <td className="py-3 pr-4">
                        <Badge className={
                          p.tier === "accelerator" ? "bg-red-900/40 text-red-300 border-red-800" :
                          p.tier === "developer" ? "bg-blue-900/40 text-blue-300 border-blue-800" :
                          "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }>
                          {p.tier}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-zinc-400 text-xs">
                        {(p.therapeuticAreas as string[]).slice(0, 3).join(", ")}
                        {(p.therapeuticAreas as string[]).length > 3 && ` +${(p.therapeuticAreas as string[]).length - 3}`}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-zinc-300">{p.candidatesDelivered}</td>
                      <td className="py-3 text-right font-mono text-green-400">{p.positiveValidations}</td>
                    </tr>
                  ))}
                  {!partners.data?.length && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-600">
                        No partners yet. <Link href="/partners" className="text-red-400 hover:underline">Open the partner portal →</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Deliveries */}
        {activeTab === "deliveries" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold">Candidate Deliveries ({deliveriesQuery.data?.length ?? 0})</h2>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">Filter:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="all">All statuses</option>
                  <option value="sent">Sent</option>
                  <option value="opened">Opened</option>
                  <option value="validated_positive">Validated positive</option>
                  <option value="validated_negative">Validated negative</option>
                  <option value="no_response">No response</option>
                  <option value="partnership_initiated">Partnership initiated</option>
                  <option value="bounced">Bounced</option>
                </select>
              </div>
            </div>

            {deliveriesQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left py-3 pr-3">ID</th>
                      <th className="text-left py-3 pr-3">Gene</th>
                      <th className="text-left py-3 pr-3">Area</th>
                      <th className="text-left py-3 pr-3">Partner</th>
                      <th className="text-right py-3 pr-3">Novelty</th>
                      <th className="text-right py-3 pr-3">Composite</th>
                      <th className="text-left py-3 pr-3">FTO</th>
                      <th className="text-left py-3 pr-3">Sent</th>
                      <th className="text-left py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deliveriesQuery.data ?? [])
                      .filter((d) => statusFilter === "all" || d.status === statusFilter)
                      .map((d) => (
                        <tr key={d.id} className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors">
                          <td className="py-3 pr-3 font-mono text-zinc-500 text-xs">#{d.id}</td>
                          <td className="py-3 pr-3 font-semibold text-white">{d.gene}</td>
                          <td className="py-3 pr-3 text-zinc-400 text-xs">{d.therapeuticArea.replace(/_/g, " ")}</td>
                          <td className="py-3 pr-3 font-mono text-zinc-400 text-xs">#{d.partnerId}</td>
                          <td className="py-3 pr-3 text-right font-mono text-zinc-300">{d.noveltyScore}</td>
                          <td className="py-3 pr-3 text-right font-mono text-zinc-300">{d.compositeScore}</td>
                          <td className="py-3 pr-3">
                            <span className={`text-xs font-medium ${
                              d.fto === "CLEAR" ? "text-green-400" :
                              d.fto === "RISK" ? "text-yellow-400" : "text-red-400"
                            }`}>{d.fto}</span>
                          </td>
                          <td className="py-3 pr-3 text-zinc-500 text-xs whitespace-nowrap">
                            {fmtDate(d.sentAt instanceof Date ? d.sentAt.toISOString() : String(d.sentAt))}
                          </td>
                          <td className="py-3">
                            <select
                              value={d.status}
                              disabled={updatingId === d.id}
                              onChange={(e) => {
                                setUpdatingId(d.id);
                                updateStatus.mutate({ deliveryId: d.id, status: e.target.value as typeof d.status });
                              }}
                              className={`text-xs rounded px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer ${
                                STATUS_COLORS[d.status] ?? "bg-zinc-700 text-zinc-300"
                              } border-transparent`}
                            >
                              {["sent","opened","validated_positive","validated_negative","no_response","partnership_initiated","bounced"].map((s) => (
                                <option key={s} value={s} className="bg-zinc-900 text-white">{s.replace(/_/g, " ")}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))
                    }
                    {!(deliveriesQuery.data?.length) && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-zinc-600">
                          No deliveries yet. Register a partner to trigger the first candidate delivery.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Royalties */}
        {activeTab === "royalties" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Royalty Tracker</h2>

            {/* Summary table */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base text-white">Royalties by Partner</CardTitle>
              </CardHeader>
              <CardContent>
                {royaltySummary.data?.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="text-left py-2 pr-4">Partner ID</th>
                        <th className="text-right py-2 pr-4">Events</th>
                        <th className="text-right py-2">Total Royalties (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {royaltySummary.data.map((r) => (
                        <tr key={r.partnerId} className="border-b border-zinc-900">
                          <td className="py-2 pr-4 font-mono text-zinc-300">#{r.partnerId}</td>
                          <td className="py-2 pr-4 text-right text-zinc-400">{r.eventCount}</td>
                          <td className="py-2 text-right font-mono text-green-400">{fmt(r.totalRoyaltiesUSD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-zinc-600 text-sm text-center py-8">No royalty events recorded yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Record royalty form */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base text-white">Record Royalty Event</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    recordRoyalty.mutate({
                      partnerId: parseInt(royaltyForm.partnerId),
                      candidateId: royaltyForm.candidateId,
                      netSales: parseInt(royaltyForm.netSales),
                      royaltyRateBps: parseInt(royaltyForm.royaltyRateBps),
                      currency: royaltyForm.currency,
                      periodStart: new Date(royaltyForm.periodStart).toISOString(),
                      periodEnd: new Date(royaltyForm.periodEnd).toISOString(),
                    });
                  }}
                >
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Partner ID</Label>
                    <Input value={royaltyForm.partnerId} onChange={(e) => setRoyaltyForm(f => ({ ...f, partnerId: e.target.value }))}
                      placeholder="123" required className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Candidate ID</Label>
                    <Input value={royaltyForm.candidateId} onChange={(e) => setRoyaltyForm(f => ({ ...f, candidateId: e.target.value }))}
                      placeholder="cand_PCSK9_001" required className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Net Sales (USD)</Label>
                    <Input type="number" value={royaltyForm.netSales} onChange={(e) => setRoyaltyForm(f => ({ ...f, netSales: e.target.value }))}
                      placeholder="500000000" required className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Royalty Rate (basis points)</Label>
                    <Select value={royaltyForm.royaltyRateBps} onValueChange={(v) => setRoyaltyForm(f => ({ ...f, royaltyRateBps: v }))}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 bps = 0.5% (Explorer)</SelectItem>
                        <SelectItem value="200">200 bps = 2% (Developer)</SelectItem>
                        <SelectItem value="300">300 bps = 3% (Accelerator)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Period Start</Label>
                    <Input type="date" value={royaltyForm.periodStart} onChange={(e) => setRoyaltyForm(f => ({ ...f, periodStart: e.target.value }))}
                      required className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Period End</Label>
                    <Input type="date" value={royaltyForm.periodEnd} onChange={(e) => setRoyaltyForm(f => ({ ...f, periodEnd: e.target.value }))}
                      required className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={recordRoyalty.isPending}
                      className="bg-red-600 hover:bg-red-700 text-white w-full">
                      {recordRoyalty.isPending ? "Recording…" : "Record Royalty Event"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

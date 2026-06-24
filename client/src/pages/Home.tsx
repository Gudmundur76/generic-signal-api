import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Utility ──────────────────────────────────────────────────────────────────
function distressBadgeColor(score: number) {
  if (score >= 80) return "bg-[#E30613] text-white";
  if (score >= 60) return "bg-black text-white";
  return "bg-[#1a1a1a] text-white";
}

// ── Components ────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="border-b border-black bg-white sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-[#E30613]" />
          <span className="font-bold text-[13px] tracking-[0.15em] uppercase text-black">
            Generic Signal
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.12em] uppercase font-medium text-black">
          <a href="#how-it-works" className="hover:text-[#E30613] transition-colors">How It Works</a>
          <a href="#alerts" className="hover:text-[#E30613] transition-colors">Sample Alerts</a>
          <a href="#pricing" className="hover:text-[#E30613] transition-colors">Pricing</a>
        </div>
        <a
          href="#subscribe"
          className="bg-black text-white text-[11px] tracking-[0.15em] uppercase font-bold px-4 py-2 hover:bg-[#E30613] transition-colors"
        >
          Subscribe
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="bg-white border-b border-black">
      <div className="max-w-[1200px] mx-auto px-6 py-24 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-start">
        <div>
          {/* Red accent bar */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-[3px] bg-[#E30613]" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-[#E30613]">
              Patent Intelligence
            </span>
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-black leading-[1.05] tracking-[-0.02em] text-black max-w-[700px]">
            Know Which Drug Patents Expire Before Your Competitors
          </h1>
          <p className="mt-6 text-[16px] leading-[1.7] text-[#333] max-w-[520px]">
            Generic Signal monitors 65+ verified patent databases and delivers
            distress-scored alerts every Monday — before the cliff becomes public knowledge.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a
              href="#subscribe"
              className="inline-block bg-[#E30613] text-white text-[12px] tracking-[0.15em] uppercase font-bold px-8 py-4 hover:bg-black transition-colors"
            >
              Get Free Alerts
            </a>
            <a
              href="#alerts"
              className="inline-block border border-black text-black text-[12px] tracking-[0.15em] uppercase font-bold px-8 py-4 hover:bg-black hover:text-white transition-colors"
            >
              See Sample
            </a>
          </div>
        </div>
        {/* Stat block */}
        <div className="border border-black p-8 min-w-[220px]">
          <div className="space-y-6">
            {[
              { value: "65+", label: "Verified Sources" },
              { value: "Weekly", label: "Alert Cadence" },
              { value: "100%", label: "Verified Signals" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[2rem] font-black text-black leading-none">{s.value}</div>
                <div className="text-[11px] tracking-[0.15em] uppercase text-[#666] mt-1">{s.label}</div>
                <div className="w-full h-[1px] bg-black mt-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="bg-black text-white border-b border-[#333]">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-12 items-start">
          <div className="w-1 bg-[#E30613] self-stretch min-h-[120px] hidden md:block" />
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase font-bold text-[#E30613] mb-4">
              The Problem
            </p>
            <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-black leading-[1.1] max-w-[640px]">
              By the time a patent cliff is public knowledge, the opportunity is gone.
            </h2>
            <p className="mt-6 text-[15px] leading-[1.8] text-[#aaa] max-w-[560px]">
              Generic manufacturers, investors, and business development teams lose months
              of lead time because patent expiry data is buried across USPTO, EPO, WIPO,
              and dozens of national registries — unscored, unverified, and unstructured.
            </p>
            <p className="mt-4 text-[15px] leading-[1.8] text-[#aaa] max-w-[560px]">
              Generic Signal solves this with a single, distress-scored weekly digest —
              verified against 65 sources, delivered before your competitors act.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Deep Patent Monitoring",
      body: "Our pipeline indexes USPTO, EPO, WIPO, and 62 national registries in real time, flagging patents within 24 months of expiry.",
    },
    {
      number: "02",
      title: "Molecular Scoring",
      body: "Each signal is scored 0–100 using structural similarity, assignee distress indicators, litigation status, and generic entry barriers.",
    },
    {
      number: "03",
      title: "Verified Weekly Alerts",
      body: "Every Monday, verified signals arrive in your inbox — patent number, assignee, expiry date, distress score, and a direct link to the filing.",
    },
  ];

  return (
    <section id="how-it-works" className="bg-white border-b border-black">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-4 h-4 bg-[#E30613]" />
          <h2 className="text-[11px] tracking-[0.2em] uppercase font-bold text-black">
            How It Works
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-black">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`p-8 ${i < steps.length - 1 ? "border-b md:border-b-0 md:border-r border-black" : ""}`}
            >
              <div className="text-[3rem] font-black text-[#E30613] leading-none mb-6">
                {step.number}
              </div>
              <h3 className="text-[15px] font-bold tracking-[-0.01em] text-black mb-3">
                {step.title}
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#555]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AlertCard({ alert }: {
  alert: {
    patentNumber: string;
    title: string;
    assignee: string;
    expiryDate: string;
    distressScore: number;
    niche: string;
    patentUrl: string;
  };
}) {
  return (
    <div className="border border-black bg-white hover:border-[#E30613] transition-colors group">
      <div className="border-b border-black px-6 py-4 flex items-center justify-between">
        <span className={`text-[10px] tracking-[0.15em] uppercase font-bold px-3 py-1 ${distressBadgeColor(alert.distressScore)}`}>
          {alert.distressScore}/100
        </span>
        <span className="text-[10px] tracking-[0.12em] uppercase text-[#888]">
          {alert.niche.replace(/_/g, " ")}
        </span>
      </div>
      <div className="px-6 py-5">
        <h3 className="font-bold text-[14px] text-black leading-snug mb-4 group-hover:text-[#E30613] transition-colors">
          {alert.title}
        </h3>
        <dl className="space-y-2">
          <div className="flex justify-between text-[12px]">
            <dt className="text-[#888] tracking-[0.08em] uppercase">Patent</dt>
            <dd>
              <a
                href={alert.patentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-bold text-black hover:text-[#E30613] underline"
              >
                {alert.patentNumber}
              </a>
            </dd>
          </div>
          <div className="flex justify-between text-[12px]">
            <dt className="text-[#888] tracking-[0.08em] uppercase">Assignee</dt>
            <dd className="font-medium text-black text-right max-w-[180px]">{alert.assignee}</dd>
          </div>
          <div className="flex justify-between text-[12px]">
            <dt className="text-[#888] tracking-[0.08em] uppercase">Expires</dt>
            <dd className="font-bold text-[#E30613]">{alert.expiryDate}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function SampleAlerts() {
  const { data, isLoading } = trpc.alerts.latest.useQuery();

  return (
    <section id="alerts" className="bg-[#f8f8f8] border-b border-black">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="flex items-start justify-between mb-12 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-4 h-4 bg-[#E30613]" />
              <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-black">
                Sample Alerts
              </span>
            </div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-black">
              This Week's Expiring Patents
            </h2>
          </div>
          <div className="text-[11px] tracking-[0.1em] uppercase text-[#888] self-end">
            {data ? `${data.count} signals · ${new Date(data.generatedAt).toLocaleDateString()}` : "Loading…"}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-black">
            {[1, 2, 3].map(i => (
              <div key={i} className={`p-8 animate-pulse ${i < 3 ? "border-b md:border-b-0 md:border-r border-black" : ""}`}>
                <div className="h-4 bg-[#ddd] mb-4 w-2/3" />
                <div className="h-3 bg-[#eee] mb-2 w-full" />
                <div className="h-3 bg-[#eee] w-4/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data?.alerts.map(alert => (
              <AlertCard key={alert.patentNumber} alert={alert} />
            ))}
          </div>
        )}

        <p className="mt-8 text-[12px] text-[#888] leading-relaxed">
          Pro subscribers receive full claim analysis, molecular scoring breakdown, and API access.
          Free tier includes the weekly digest above.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  const freeTier = [
    "Weekly patent expiry digest",
    "3 distress-scored signals per week",
    "Patent number + assignee + expiry date",
    "Email delivery every Monday",
  ];
  const proTier = [
    "Everything in Free",
    "Full claim analysis per patent",
    "Molecular scoring breakdown",
    "Litigation & IPR status flags",
    "API access (JSON)",
    "Slack / webhook delivery",
    "Unlimited historical archive",
  ];

  return (
    <section id="pricing" className="bg-white border-b border-black">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-4 h-4 bg-[#E30613]" />
          <h2 className="text-[11px] tracking-[0.2em] uppercase font-bold text-black">
            Pricing
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-black max-w-[800px]">
          {/* Free */}
          <div className="p-8 border-b md:border-b-0 md:border-r border-black">
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-[#888] mb-4">Free</div>
            <div className="text-[3rem] font-black text-black leading-none mb-1">$0</div>
            <div className="text-[12px] text-[#888] mb-8">Forever free</div>
            <ul className="space-y-3">
              {freeTier.map(f => (
                <li key={f} className="flex items-start gap-3 text-[13px] text-[#333]">
                  <div className="w-3 h-3 bg-black mt-[3px] flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="#subscribe"
              className="mt-8 block text-center border border-black text-black text-[11px] tracking-[0.15em] uppercase font-bold px-6 py-3 hover:bg-black hover:text-white transition-colors"
            >
              Get Started Free
            </a>
          </div>
          {/* Pro */}
          <div className="p-8 bg-black text-white">
            <div className="text-[11px] tracking-[0.2em] uppercase font-bold text-[#E30613] mb-4">Pro</div>
            <div className="text-[3rem] font-black text-white leading-none mb-1">$99<span className="text-[1.2rem] font-bold text-[#888]">/mo</span></div>
            <div className="text-[12px] text-[#888] mb-8">billed monthly</div>
            <ul className="space-y-3">
              {proTier.map(f => (
                <li key={f} className="flex items-start gap-3 text-[13px] text-[#ccc]">
                  <div className="w-3 h-3 bg-[#E30613] mt-[3px] flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => toast.info("Pro subscriptions launching soon — join the waitlist below.")}
              className="mt-8 block w-full text-center bg-[#E30613] text-white text-[11px] tracking-[0.15em] uppercase font-bold px-6 py-3 hover:bg-white hover:text-black transition-colors cursor-pointer"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Subscribe() {
  const [email, setEmail] = useState("");
  const subscribe = trpc.alerts.subscribe.useMutation({
    onSuccess: data => {
      toast.success(data.message);
      setEmail("");
    },
    onError: () => {
      toast.error("Something went wrong. Please try again.");
    },
  });

  return (
    <section id="subscribe" className="bg-[#E30613] border-b border-black">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-center">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase font-bold text-white/70 mb-3">
              Free Weekly Digest
            </p>
            <h2 className="text-[clamp(1.5rem,3vw,2.5rem)] font-black text-white leading-[1.1]">
              Get the next alert before your competitors.
            </h2>
            <p className="mt-4 text-[15px] text-white/80 max-w-[480px]">
              Every Monday. No noise. Just the patents that matter — scored, verified, and delivered.
            </p>
          </div>
          <div className="min-w-[320px]">
            <form
              onSubmit={e => {
                e.preventDefault();
                if (email) subscribe.mutate({ email });
              }}
              className="flex flex-col gap-3"
            >
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="border-2 border-white bg-transparent text-white placeholder:text-white/50 px-4 py-3 text-[14px] outline-none focus:bg-white/10 transition-colors"
              />
              <button
                type="submit"
                disabled={subscribe.isPending}
                className="bg-black text-white text-[11px] tracking-[0.15em] uppercase font-bold px-6 py-4 hover:bg-white hover:text-black transition-colors disabled:opacity-60"
              >
                {subscribe.isPending ? "Subscribing…" : "Subscribe Free"}
              </button>
            </form>
            <p className="mt-3 text-[11px] text-white/60">
              No spam. Unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-black text-white border-t border-[#333]">
      <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#E30613]" />
          <span className="text-[12px] tracking-[0.15em] uppercase font-bold">Generic Signal</span>
        </div>
        <p className="text-[12px] text-[#666]">
          Patent intelligence for pharmaceutical professionals. Verified against 65 sources.
        </p>
        <p className="text-[11px] text-[#444] tracking-[0.1em] uppercase">
          © {new Date().getFullYear()} Generic Signal
        </p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <SampleAlerts />
      <Pricing />
      <Subscribe />
      <Footer />
    </div>
  );
}

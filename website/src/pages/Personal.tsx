import type { CSSProperties } from "react";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { APP_LIVE } from "@/lib/config";
import { ROUTES, useGo } from "@/lib/nav";
import { SIGNUP_STEPS, TIERS, type Tier } from "@/lib/content";
import { FeatureGrid } from "@/components/site/FeatureGrid";

const TIER_LOOK: Record<Tier["style"], { card: string; rule: string; tick: string; chip: string; card_style?: CSSProperties; chip_style?: CSSProperties }> = {
  light: {
    card: "bg-white text-ink border-[1.5px] border-line",
    rule: "border-line",
    tick: "text-brand-text",
    chip: "text-[#3A2600]",
    chip_style: { background: "linear-gradient(90deg,#F5C24B,#E0A526)" },
  },
  deep: {
    card: "text-white",
    rule: "border-white/[.18]",
    tick: "text-brand-hover",
    chip: "bg-brand text-brand-on",
    card_style: { background: "linear-gradient(150deg,#0a7a5a,#065f46 45%,#022c22)" },
  },
  soft: { card: "bg-soft text-ink", rule: "border-line", tick: "text-brand-text", chip: "bg-white text-ink-muted" },
};

export function Personal() {
  const go = useGo();
  return (
    <>
      <section className="wrap grid-fit animate-rise-fast items-center gap-14 pb-20 pt-[72px]" style={{ ["--min" as string]: "440px" }}>
        <div className="flex flex-col items-start gap-[22px]">
          <div className="kicker">Personal</div>
          <h1 className="h1-page">Your bank account, in the palm of your hand.</h1>
          <p className="lead">Open an account in the app, pay your bills today, and add your palm at an agent when you're ready to pay at shops.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => go(null, "download")} className="btn-green">
              {APP_LIVE ? "Get the app" : "Get early access"}
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(ROUTES.help, "find-agent")}
              className="flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-ink px-[26px] text-base font-bold"
            >
              <MapPin size={18} />
              Find an agent
            </button>
          </div>
        </div>
        <div className="relative aspect-[5/4] overflow-hidden rounded-[40px_40px_40px_200px] bg-soft">
          <img src="/web/palm-woman.jpg" alt="A customer paying with her palm" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "70% 40%" }} />
        </div>
      </section>

      <section className="bg-soft">
        <div className="wrap py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-3">
            <div className="kicker">Open an account</div>
            <h2 className="h2">Five steps, about five minutes.</h2>
            <p className="m-0 text-lg leading-[1.6] text-ink-muted">No branch, no paperwork. Have your phone and your NIN ready.</p>
          </div>
          <div className="grid-fit mt-11 gap-3.5" style={{ ["--min" as string]: "200px" }}>
            {SIGNUP_STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3 rounded-[22px] border border-line-2 bg-white p-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">{s.n}</div>
                  <div className="h-0.5 flex-1 bg-line" />
                  <s.icon size={20} className="text-brand-text" />
                </div>
                <div className="text-lg font-extrabold">{s.title}</div>
                <div className="text-[15px] leading-[1.5] text-ink-muted">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap py-24">
        <div className="flex max-w-[680px] flex-col gap-3">
          <div className="kicker">Account levels</div>
          <h2 className="h2">Start in the app. Add your palm when you're ready.</h2>
        </div>
        <div className="grid-fit mt-11 gap-5" style={{ ["--min" as string]: "300px" }}>
          {TIERS.map((t) => {
            const look = TIER_LOOK[t.style];
            return (
              <div key={t.tier} className={`flex flex-col gap-[18px] rounded-[28px] p-8 ${look.card}`} style={look.card_style}>
                <div className="flex items-center justify-between gap-2.5">
                  <div className="text-sm font-bold opacity-80">{t.tier}</div>
                  <div className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${look.chip}`} style={look.chip_style}>
                    {t.chip}
                  </div>
                </div>
                <div className="text-[28px] font-extrabold tracking-[-.025em]">{t.name}</div>
                <div className="text-[15px] leading-[1.55] opacity-[.82]">{t.how}</div>
                <div className={`grid grid-cols-2 gap-2.5 border-y py-4 ${look.rule}`}>
                  <div>
                    <div className="text-[22px] font-extrabold tabular-nums">{t.per}</div>
                    <div className="text-[13px] opacity-70">per payment</div>
                  </div>
                  <div>
                    <div className="text-[22px] font-extrabold tabular-nums">{t.day}</div>
                    <div className="text-[13px] opacity-70">a day</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {t.perks.map((p) => (
                    <div key={p} className="flex gap-2.5 text-[15px] leading-[1.4]">
                      <Check size={17} strokeWidth={2.5} className={`mt-px flex-none ${look.tick}`} />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="wrap">
        <div className="rounded-[36px] bg-soft p-[clamp(32px,5vw,64px)]">
          <div className="mb-[34px] flex flex-col gap-2.5">
            <div className="kicker">In the app</div>
            <h2 className="m-0 text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-.03em]">What you can do</h2>
          </div>
          <FeatureGrid min="300px" />
        </div>
      </section>
    </>
  );
}

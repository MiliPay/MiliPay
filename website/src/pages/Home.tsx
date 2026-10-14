import { ArrowRight, Check, Hand, Lock } from "lucide-react";
import { APP_LIVE } from "@/lib/config";
import { ROUTES, useGo } from "@/lib/nav";
import { HOME_FAQS, MOCK_TX, PALM_STEPS, SECURITY, SERVICE_TILES } from "@/lib/content";
import { FaqList } from "@/components/site/Faq";
import { FeatureGrid } from "@/components/site/FeatureGrid";

const AUDIENCES = [
  { kicker: "Personal", title: "Pay at shops and pay your bills", body: "Open an account in the app, then add your palm at an agent to pay at any MiliPay terminal.", cta: "Explore personal", img: "/web/palm-woman.jpg", pos: "45% 55%", to: ROUTES.personal },
  { kicker: "Business", title: "Take palm payments at your till", body: "A faster checkout with no cards or phones, paid straight from your customer’s bank.", cta: "Explore business", img: "/web/shop-owner.jpg", pos: "45% 35%", to: ROUTES.business },
  { kicker: "Agents", title: "Earn by registering palms", body: "Help people in your area add their palm and move to Tier 2, and earn on every registration.", cta: "Become an agent", img: "/web/agent-help.jpg", pos: "50% 50%", to: ROUTES.agents },
];

const TEASERS = [
  { kicker: "For business", title: "Faster checkout at your till", body: "Apply for a MiliPay terminal and let customers pay with their palm.", cta: "Explore business", img: "/web/shop-owner.jpg", pos: "55% 40%", bg: "bg-soft", to: ROUTES.business },
  { kicker: "For agents", title: "Earn by registering palms", body: "Become a MiliPay agent and help people in your community move to Tier 2.", cta: "Become an agent", img: "/web/agent-help.jpg", pos: "50% 55%", bg: "bg-brand/10", to: ROUTES.agents },
];

function PhoneMock() {
  return (
    <div className="relative h-[620px] w-[300px] max-w-[calc(100vw-48px)] rounded-[46px] bg-ink p-2.5 shadow-[0_30px_80px_rgba(2,44,34,.35)]">
      <div className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-[37px] bg-soft px-4 pb-4 pt-11 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand/[.14] font-bold text-brand-text">AO</div>
          <div>
            <div className="text-[11px] text-ink-muted">Good morning</div>
            <div className="text-[15px] font-extrabold">Adaeze</div>
          </div>
        </div>
        <div className="flex flex-col gap-3.5 rounded-[20px] p-4 text-white" style={{ background: "linear-gradient(145deg,#0a7a5a,#065f46 45%,#022c22)" }}>
          <div className="flex items-center justify-between">
            <div className="font-bold">GTBank</div>
            <div className="rounded-full bg-white/[.16] px-2 py-[3px] text-[10px] font-bold">Paying from</div>
          </div>
          <div>
            <div className="text-[11px] opacity-75">Available balance</div>
            <div className="text-2xl font-extrabold tabular-nums">₦248,500.00</div>
          </div>
          <div className="text-[11px] tracking-[.08em] opacity-75">0123 •••• 6789</div>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl bg-white p-3">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-brand-hover" style={{ background: "linear-gradient(150deg,#0a7a5a,#022c22)" }}>
            <Hand size={17} />
          </div>
          <div className="flex-1">
            <div className="font-bold">Palm Pay</div>
            <div className="text-[11px] text-ink-muted">Pays from GTBank ••6789</div>
          </div>
          <div className="rounded-full bg-brand/[.14] px-2 py-[3px] text-[10px] font-bold text-brand-text">Active</div>
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-white px-2 py-3">
          {SERVICE_TILES.map((v) => (
            <div key={v.label} className="flex flex-col items-center gap-[5px]">
              <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl" style={{ background: v.bg, color: v.fg }}>
                <v.icon size={18} />
              </div>
              <div className="text-[10px] font-semibold">{v.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-white px-3 py-1">
          {MOCK_TX.map((t, i) => (
            <div key={t.title} className={`flex items-center gap-2.5 py-[9px] ${i ? "border-t border-line-2" : ""}`}>
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px]" style={{ background: t.bg, color: t.fg }}>
                <t.icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.title}</div>
                <div className="text-[10px] text-ink-muted">{t.sub}</div>
              </div>
              <div className="font-bold tabular-nums">{t.amt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const go = useGo();
  return (
    <>
      <section className="overflow-hidden text-white" style={{ background: "radial-gradient(120% 90% at 85% 10%,#0a7a5a 0%,#065f46 35%,#022c22 75%)" }}>
        <div className="wrap grid-fit items-center gap-16 pb-[104px] pt-[88px]" style={{ ["--min" as string]: "440px" }}>
          <div className="flex animate-rise flex-col items-start gap-[26px]">
            <div className="flex items-center gap-2 rounded-full border border-[rgba(51,224,181,.4)] px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-[.06em] text-brand-hover">
              <Hand size={15} />
              Palm payments for Nigeria
            </div>
            <h1 className="m-0 text-[clamp(46px,7vw,84px)] font-extrabold leading-none tracking-[-.035em]">Pay with your palm.</h1>
            <p className="pretty m-0 max-w-[540px] text-[clamp(18px,1.6vw,21px)] leading-[1.55] text-white/[.82]">
              MiliPay links your palm to your bank account, so you can pay at any MiliPay terminal with nothing in your hands. The app covers the rest:
              airtime, data, electricity and cable TV.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => go(null, "download")} className="btn-green">
                {APP_LIVE ? "Get the app" : "Get early access"}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => go(ROUTES.home, "how")}
                className="flex h-14 cursor-pointer items-center rounded-full border-[1.5px] border-white/40 px-[26px] text-base font-bold transition-colors hover:border-white"
              >
                See how it works
              </button>
            </div>
          </div>

          <div className="flex justify-center py-10">
            <div className="relative aspect-square w-[min(100%,460px)]">
              <div className="absolute -inset-[28px] rounded-full border border-[rgba(51,224,181,.14)] sm:-inset-[56px]" />
              <div className="absolute -inset-[14px] rounded-full border border-[rgba(51,224,181,.3)] sm:-inset-[26px]" />
              <div className="absolute -inset-[14px] animate-ring rounded-full border-2 border-[rgba(51,224,181,.5)] sm:-inset-[26px]" />
              <div className="absolute inset-0 overflow-hidden rounded-full bg-white/[.06]">
                <img
                  src="/web/palm-woman.jpg"
                  alt="A customer paying with their palm at a shop till"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: "62% 50%" }}
                />
              </div>
              <div className="absolute bottom-7 left-0 flex max-w-[calc(100%-8px)] animate-rise-late items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-ink shadow-[0_20px_50px_rgba(0,0,0,.28)] sm:-left-6">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand text-brand-on">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Paid with palm · Lekki Fresh Mart</div>
                  <div className="text-xl font-extrabold tracking-[-.01em] tabular-nums">₦12,450.00</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap pb-10 pt-24">
        <div className="flex max-w-[720px] flex-col gap-3">
          <div className="kicker">What MiliPay does</div>
          <h2 className="h2">One account for paying at shops, paying bills and getting paid.</h2>
        </div>
        <div className="grid-fit mt-12 gap-6" style={{ ["--min" as string]: "320px" }}>
          {AUDIENCES.map((a) => (
            <button key={a.kicker} type="button" onClick={() => go(a.to)} className="group flex cursor-pointer flex-col gap-[18px] text-left transition-transform hover:-translate-y-[3px]">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] bg-soft">
                <img src={a.img} alt={a.title} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: a.pos }} />
              </div>
              <div className="flex flex-col gap-2 px-1">
                <div className="text-[13px] font-bold uppercase tracking-[.06em] text-ink-muted">{a.kicker}</div>
                <div className="text-2xl font-extrabold tracking-[-.02em]">{a.title}</div>
                <div className="pretty text-base leading-[1.55] text-ink-muted">{a.body}</div>
                <div className="mt-1 flex items-center gap-2 font-bold text-brand-text group-hover:text-deep-2">
                  {a.cta}
                  <ArrowRight size={17} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="how" className="wrap py-20">
        <div className="rounded-[36px] bg-soft p-[clamp(32px,5vw,64px)]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[620px] flex-col gap-3">
              <div className="kicker">How palm pay works</div>
              <h2 className="h2">Three steps, then just your hand.</h2>
            </div>
            <button type="button" onClick={() => go(ROUTES.personal)} className="link-arrow">
              More for customers
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="grid-fit mt-11 gap-5" style={{ ["--min" as string]: "260px" }}>
            {PALM_STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3.5 rounded-3xl border border-line-2 bg-white p-7">
                <div className="flex items-center justify-between">
                  <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand/[.12] text-brand-text">
                    <s.icon size={24} />
                  </div>
                  <div className="text-[44px] font-extrabold tracking-[-.04em] text-line tabular-nums">{s.n}</div>
                </div>
                <div className="text-[21px] font-extrabold tracking-[-.015em]">{s.title}</div>
                <div className="pretty text-base leading-[1.55] text-ink-muted">{s.body}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-2.5 text-[15px] leading-[1.5] text-ink-muted">
            <Lock size={16} className="mt-0.5 flex-none text-brand-text" />
            <div>For bigger payments the terminal also asks for your 4-digit PIN. You choose the amount in the app.</div>
          </div>
        </div>
      </section>

      <section className="wrap grid-fit items-center gap-16 pb-24 pt-10" style={{ ["--min" as string]: "460px" }}>
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <div className="kicker">The MiliPay app</div>
            <h2 className="h2">Everything else, in one app.</h2>
            <p className="m-0 max-w-[520px] text-lg leading-[1.6] text-ink-muted">
              Pay bills in a few taps, see every payment as it happens, and stay in control of your palm.
            </p>
          </div>
          <FeatureGrid min="230px" />
        </div>
        <div className="flex justify-center">
          <div className="relative py-4 sm:p-10">
            <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle,rgba(0,200,150,.18),transparent 68%)" }} />
            <PhoneMock />
          </div>
        </div>
      </section>

      <section id="security" className="bg-deep-3 text-white">
        <div className="wrap py-24">
          <div className="flex max-w-[680px] flex-col gap-3">
            <div className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-hover">Security</div>
            <h2 className="h2">Built so that only you can pay.</h2>
          </div>
          <div className="grid-fit mt-12 gap-px overflow-hidden rounded-[28px] bg-white/[.12]" style={{ ["--min" as string]: "300px" }}>
            {SECURITY.map((x) => (
              <div key={x.title} className="flex flex-col gap-3 bg-deep-3 px-7 py-[30px]">
                <x.icon size={26} className="text-brand-hover" />
                <div className="text-[19px] font-bold">{x.title}</div>
                <div className="pretty text-[15px] leading-[1.55] text-white/[.72]">{x.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap grid-fit gap-6 pt-24" style={{ ["--min" as string]: "460px" }}>
        {TEASERS.map((t) => (
          <div key={t.kicker} className={`flex flex-col overflow-hidden rounded-[32px] ${t.bg}`}>
            <div className="relative aspect-video">
              <img src={t.img} alt={t.title} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: t.pos }} />
            </div>
            <div className="flex flex-col items-start gap-3 p-8">
              <div className="kicker">{t.kicker}</div>
              <div className="text-[28px] font-extrabold leading-[1.15] tracking-[-.025em]">{t.title}</div>
              <div className="text-base leading-[1.55] text-ink-muted">{t.body}</div>
              <button type="button" onClick={() => go(t.to)} className="btn-dark mt-2 h-[50px] px-[22px]">
                {t.cta}
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="wrap grid-fit gap-12 pt-24" style={{ ["--min" as string]: "380px" }}>
        <div className="flex flex-col items-start gap-3.5">
          <div className="kicker">Questions</div>
          <h2 className="m-0 text-[clamp(32px,4vw,44px)] font-extrabold leading-[1.1] tracking-[-.03em]">Common questions</h2>
          <button type="button" onClick={() => go(ROUTES.help)} className="link-arrow mt-1.5">
            All help topics
            <ArrowRight size={17} />
          </button>
        </div>
        <FaqList items={HOME_FAQS} />
      </section>
    </>
  );
}

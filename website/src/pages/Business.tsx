import { ArrowRight } from "lucide-react";
import { MERCHANT_FIELDS } from "@rules";
import { useGo } from "@/lib/nav";
import { sendMerchantLead } from "@/lib/api";
import { BIZ_BENEFITS, BIZ_START, TILL_STEPS } from "@/lib/content";
import { LeadForm, type FieldUi } from "@/components/site/LeadForm";

const UI: Record<string, FieldUi> = {
  biz: { label: "Business name", placeholder: "e.g. Lekki Fresh Mart", wide: true },
  rc: { label: "CAC number", placeholder: "RC or BN number" },
  type: { label: "Type of business", placeholder: "Choose" },
  contact: { label: "Your name", placeholder: "Full name" },
  phone: { label: "Phone number", placeholder: "0803 123 4567" },
  email: { label: "Email", placeholder: "you@business.com" },
  state: { label: "State", placeholder: "Choose" },
  tills: { label: "Number of tills", placeholder: "Choose" },
  bank: { label: "Settlement bank", placeholder: "Choose your bank" },
};

export function Business() {
  const go = useGo();
  return (
    <>
      <section className="bg-deep-3 text-white">
        <div className="wrap grid-fit animate-rise-fast items-center gap-14 py-20" style={{ ["--min" as string]: "440px" }}>
          <div className="flex flex-col items-start gap-[22px]">
            <div className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-hover">For business</div>
            <h1 className="h1-page">Take payments with a wave of the hand.</h1>
            <p className="m-0 max-w-[540px] text-[19px] leading-[1.6] text-white/80">
              Customers pay at your till with their palm. No cards to swipe, no phones to unlock, and the money comes straight from their bank.
            </p>
            <button type="button" onClick={() => go(null, "merchant-form")} className="btn-green">
              Apply for a terminal
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="relative aspect-[5/4] overflow-hidden rounded-[200px_40px_40px_40px] bg-white/[.06]">
            <img
              src="/web/shop-owner.jpg"
              alt="A cashier at a till with a MiliPay palm terminal"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "45% 40%" }}
            />
          </div>
        </div>
      </section>

      <section className="wrap py-24">
        <div className="flex max-w-[640px] flex-col gap-3">
          <div className="kicker">Why MiliPay</div>
          <h2 className="h2">A faster till and fewer problems at it.</h2>
        </div>
        <div className="grid-fit mt-11 gap-5" style={{ ["--min" as string]: "260px" }}>
          {BIZ_BENEFITS.map((b) => (
            <div key={b.title} className="flex flex-col gap-3 rounded-3xl border border-line p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-brand/[.12] text-brand-text">
                <b.icon size={22} />
              </div>
              <div className="text-[19px] font-extrabold">{b.title}</div>
              <div className="text-[15px] leading-[1.55] text-ink-muted">{b.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-soft">
        <div className="wrap py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-3">
            <div className="kicker">At your till</div>
            <h2 className="h2">What happens when a customer pays</h2>
          </div>
          <div className="grid-fit mt-11 overflow-hidden rounded-[28px] border border-line-2 bg-white" style={{ ["--min" as string]: "240px" }}>
            {TILL_STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3 border-b border-r border-line-2 px-[26px] py-[30px]">
                <div className="text-[15px] font-extrabold text-brand-text tabular-nums">{s.n}</div>
                <div className="text-lg font-extrabold">{s.title}</div>
                <div className="text-[15px] leading-[1.55] text-ink-muted">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="merchant-form" className="wrap grid-fit items-start gap-14 pt-24" style={{ ["--min" as string]: "420px" }}>
        <div className="flex flex-col gap-[22px]">
          <div className="flex flex-col gap-3">
            <div className="kicker">Get started</div>
            <h2 className="h2">Apply for a MiliPay terminal</h2>
          </div>
          {BIZ_START.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-[1.5px] border-ink font-extrabold">{s.n}</div>
              <div className="flex flex-col gap-1 pt-1.5">
                <div className="text-[17px] font-bold">{s.title}</div>
                <div className="text-[15px] leading-[1.5] text-ink-muted">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-[28px] border border-line bg-white p-[clamp(24px,4vw,40px)] shadow-[0_20px_60px_rgba(10,40,30,.08)]">
          <LeadForm
            rules={MERCHANT_FIELDS}
            ui={UI}
            send={sendMerchantLead}
            privacyNote="We only use these details to review your application and contact you."
            thanks={(v) => ({
              title: `Thanks, ${(v.contact ?? "").trim().split(" ")[0]}.`,
              body: `We've got your application for ${v.biz}. Our team will call you on ${v.phone} within 2 working days.`,
            })}
          />
        </div>
      </section>
    </>
  );
}

import { ArrowRight, Check } from "lucide-react";
import { AGENT_FIELDS } from "@rules";
import { useGo } from "@/lib/nav";
import { sendAgentApplication } from "@/lib/api";
import { AGENT_REQ, AGENT_ROLE } from "@/lib/content";
import { LeadForm, type FieldUi } from "@/components/site/LeadForm";

const UI: Record<string, FieldUi> = {
  name: { label: "Full name", placeholder: "As on your NIN", wide: true },
  phone: { label: "Phone number", placeholder: "0803 123 4567" },
  email: { label: "Email", placeholder: "you@example.com" },
  state: { label: "State", placeholder: "Choose" },
  area: { label: "Town or area", placeholder: "e.g. Yaba" },
  place: { label: "Where will you work?", placeholder: "Choose", wide: true },
};

export function Agents() {
  const go = useGo();
  return (
    <>
      <section className="wrap grid-fit animate-rise-fast items-center gap-14 pb-20 pt-[72px]" style={{ ["--min" as string]: "440px" }}>
        <div className="flex flex-col items-start gap-[22px]">
          <div className="kicker">Agents</div>
          <h1 className="h1-page">Bring palm payments to your community.</h1>
          <p className="lead">
            MiliPay agents register customers' palms and help them move to Tier 2. You earn a commission for every successful registration.
          </p>
          <button type="button" onClick={() => go(null, "agent-form")} className="btn-green">
            Apply to be an agent
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="relative aspect-[5/4] overflow-hidden rounded-[40px_200px_40px_40px] bg-soft">
          <img
            src="/web/agent-help.jpg"
            alt="A MiliPay agent capturing a customer's palm on a tablet"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "50% 45%" }}
          />
        </div>
      </section>

      <section className="bg-soft">
        <div className="wrap py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-3">
            <div className="kicker">The role</div>
            <h2 className="h2">What MiliPay agents do</h2>
          </div>
          <div className="grid-fit mt-11 gap-5" style={{ ["--min" as string]: "280px" }}>
            {AGENT_ROLE.map((r) => (
              <div key={r.title} className="flex flex-col gap-3 rounded-3xl border border-line-2 bg-white p-7">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand/[.12] text-brand-text">
                  <r.icon size={24} />
                </div>
                <div className="text-xl font-extrabold">{r.title}</div>
                <div className="text-[15px] leading-[1.55] text-ink-muted">{r.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agent-form" className="wrap grid-fit items-start gap-14 pt-24" style={{ ["--min" as string]: "420px" }}>
        <div className="flex flex-col gap-[22px]">
          <div className="flex flex-col gap-3">
            <div className="kicker">Who can apply</div>
            <h2 className="h2">Apply to be an agent</h2>
          </div>
          <div className="flex flex-col gap-3.5">
            {AGENT_REQ.map((r) => (
              <div key={r} className="flex gap-3 text-[17px] leading-[1.45]">
                <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-brand text-brand-on">
                  <Check size={15} strokeWidth={3} />
                </div>
                {r}
              </div>
            ))}
          </div>
          <div className="text-[15px] leading-[1.55] text-ink-muted">After you apply, our team calls you to check your details and book your training.</div>
        </div>
        <div className="rounded-[28px] border border-line bg-white p-[clamp(24px,4vw,40px)] shadow-[0_20px_60px_rgba(10,40,30,.08)]">
          <LeadForm
            rules={AGENT_FIELDS}
            ui={UI}
            send={sendAgentApplication}
            thanks={(v) => ({
              title: `Thanks, ${(v.name ?? "").trim().split(" ")[0]}.`,
              body: `We'll call you on ${v.phone} within 3 working days to talk about becoming a MiliPay agent in ${v.area}.`,
            })}
          />
        </div>
      </section>
    </>
  );
}

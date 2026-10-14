import { useEffect, useState } from "react";
import { Loader2, Mail, MapPin, MessageCircle, Search } from "lucide-react";
import { ALL_STATES } from "@rules";
import { SUPPORT_EMAIL } from "@/lib/config";
import { useGo } from "@/lib/nav";
import { agentsIn, type AgentLocation } from "@/lib/api";
import { FAQ_CATS, filterFaqs, type FaqCat } from "@/lib/content";
import { FaqList } from "@/components/site/Faq";

function FindAgent() {
  const [state, setState] = useState("Lagos");
  const [rows, setRows] = useState<AgentLocation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    agentsIn(state).then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.agents);
      else {
        setRows([]);
        setFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [state]);

  return (
    <section id="find-agent" className="bg-deep-3 text-white">
      <div className="wrap grid-fit items-start gap-12 py-[88px]" style={{ ["--min" as string]: "380px" }}>
        <div className="flex flex-col gap-4">
          <div className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-hover">Find an agent</div>
          <h2 className="h2">Add your palm near you</h2>
          <p className="m-0 text-[17px] leading-[1.6] text-white/75">Bring your NIN. It takes about 5 minutes and moves you to Tier 2.</p>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Your state"
            className="h-14 max-w-[360px] rounded-2xl border-[1.5px] border-white/25 bg-white/[.06] px-3.5 text-base text-white"
          >
            {ALL_STATES.map((s) => (
              <option key={s} value={s} className="text-ink">
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2.5" aria-live="polite">
          {rows === null ? (
            <div className="flex items-center gap-3 px-1 py-4 text-white/70">
              <Loader2 size={18} className="animate-spin" />
              Looking for agents in {state}…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-[20px] border border-white/10 bg-white/[.07] px-5 py-[18px] text-[15px] leading-[1.55] text-white/80">
              {failed
                ? "We couldn't load the agent list just now. Please try again in a moment."
                : `There are no MiliPay agents listed in ${state} yet. We're adding more every week; chat with us in the app and we'll point you to the nearest one.`}
            </div>
          ) : (
            rows.map((g) => (
              <div key={`${g.name}-${g.address}`} className="flex items-center gap-4 rounded-[20px] border border-white/10 bg-white/[.07] px-5 py-[18px]">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand text-brand-on">
                  <MapPin size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold">{g.name}</div>
                  <div className="text-sm text-white/70">{g.address}</div>
                </div>
                {g.hours && <div className="whitespace-nowrap text-[13px] font-semibold text-brand-hover">{g.hours}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function Help() {
  const go = useGo();
  const [cat, setCat] = useState<"All" | FaqCat>("All");
  const [query, setQuery] = useState("");
  const rows = filterFaqs(cat, query);

  return (
    <>
      <section className="bg-soft">
        <div className="mx-auto flex max-w-[880px] animate-rise-fast flex-col items-center gap-5 px-6 pb-16 pt-20 text-center">
          <h1 className="m-0 text-[clamp(40px,5.5vw,64px)] font-extrabold leading-[1.05] tracking-[-.035em]">How can we help?</h1>
          <label className="flex h-16 w-full max-w-[640px] items-center gap-3 rounded-full border-[1.5px] border-line bg-white px-6 shadow-[0_10px_30px_rgba(10,40,30,.06)]">
            <Search size={22} className="text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. limits, palm, refund"
              aria-label="Search help"
              className="h-full min-w-0 flex-1 border-none bg-transparent text-[17px] outline-none"
            />
          </label>
          <div className="flex flex-wrap justify-center gap-2">
            {FAQ_CATS.map((c) => {
              const on = cat === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCat(c)}
                  className={`flex h-10 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-sm font-bold ${
                    on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[880px] px-6 pb-20 pt-12">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-[17px] text-ink-muted">No answers match "{query}". Try another word, or chat with us in the app.</div>
        ) : (
          // Remount when the filter changes so no answer stays open from the old list.
          <FaqList key={`${cat}|${query}`} items={rows} showCat initialOpen={cat === "All" && !query ? 0 : null} />
        )}
      </section>

      <FindAgent />

      <section className="wrap grid-fit gap-5 py-[88px]" style={{ ["--min" as string]: "320px" }}>
        <div className="flex gap-[18px] rounded-[28px] border border-line p-8">
          <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-brand/[.12] text-brand-text">
            <MessageCircle size={24} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-xl font-extrabold">Chat in the app</div>
            <div className="text-[15px] leading-[1.55] text-ink-muted">Open Me, then Help &amp; support. Our team is there 24 hours a day.</div>
            <button type="button" onClick={() => go(null, "download")} className="cursor-pointer self-start font-bold text-brand-text hover:text-deep-2">
              Open the app
            </button>
          </div>
        </div>
        <div className="flex gap-[18px] rounded-[28px] border border-line p-8">
          <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-brand/[.12] text-brand-text">
            <Mail size={24} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-xl font-extrabold">Email us</div>
            <div className="text-[15px] leading-[1.55] text-ink-muted">For anything that isn’t urgent. We reply within one working day.</div>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="self-start font-bold text-brand-text hover:text-deep-2">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

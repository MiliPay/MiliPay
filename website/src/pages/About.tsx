import { ABOUT_COLS, STACK } from "@/lib/content";

export function About() {
  return (
    <>
      <section className="wrap animate-rise-fast pb-16 pt-24">
        <div className="kicker">About MiliPay</div>
        <h1 className="m-0 mt-4 max-w-[1000px] text-[clamp(40px,6vw,76px)] font-extrabold leading-[1.03] tracking-[-.035em]" style={{ textWrap: "balance" }}>
          We're building a way for anyone to pay with nothing but their hand.
        </h1>
      </section>

      <section className="wrap pb-[88px]">
        <div className="relative mx-auto aspect-square max-w-[760px] overflow-hidden rounded-[40px] bg-soft">
          <img src="/web/palm-woman.jpg" alt="A customer paying with her palm" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </section>

      <section className="wrap grid-fit gap-10 pb-24" style={{ ["--min" as string]: "320px" }}>
        {ABOUT_COLS.map((c) => (
          <div key={c.title} className="flex flex-col gap-3 border-t-2 border-ink pt-6">
            <div className="text-[22px] font-extrabold tracking-[-.015em]">{c.title}</div>
            <div className="pretty text-base leading-[1.65] text-ink-muted">{c.body}</div>
          </div>
        ))}
      </section>

      <section className="bg-soft">
        <div className="wrap py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-3">
            <div className="kicker">Under the hood</div>
            <h2 className="h2">How it fits together</h2>
          </div>
          <div className="grid-fit mt-11 gap-5" style={{ ["--min" as string]: "260px" }}>
            {STACK.map((s) => (
              <div key={s.title} className="flex flex-col gap-2.5 rounded-3xl border border-line-2 bg-white p-7">
                <s.icon size={26} className="text-brand-text" />
                <div className="text-lg font-extrabold">{s.title}</div>
                <div className="text-[15px] leading-[1.55] text-ink-muted">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

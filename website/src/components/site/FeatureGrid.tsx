import { FEATURES } from "@/lib/content";

/** The six app features (Home's app section and Personal's "What you can do"). */
export function FeatureGrid({ min }: { min: string }) {
  return (
    <div className="grid-fit gap-x-7 gap-y-[22px]" style={{ ["--min" as string]: min }}>
      {FEATURES.map((f) => (
        <div key={f.title} className="flex gap-3.5">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px]" style={{ background: f.bg, color: f.fg }}>
            <f.icon size={21} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[17px] font-bold">{f.title}</div>
            <div className="text-[15px] leading-[1.5] text-ink-muted">{f.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Item {
  cat?: string;
  q: string;
  a: string;
}

/** The FAQ accordion. One answer open at a time; `showCat` adds the category column (Help page). */
export function FaqList({ items, showCat = false, initialOpen = 0 }: { items: Item[]; showCat?: boolean; initialOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(initialOpen);
  return (
    <div className="border-t border-line">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="border-b border-line">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full cursor-pointer items-center gap-4 py-[22px] text-left"
            >
              {showCat && (
                <span className="hidden w-24 flex-none text-xs font-bold uppercase tracking-[.06em] text-brand-text sm:block">{f.cat}</span>
              )}
              <span className="flex-1 text-lg font-bold">{f.q}</span>
              <ChevronDown size={22} className={`flex-none transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className={`animate-rise-short pb-6 pr-10 text-base leading-[1.6] text-ink-muted ${showCat ? "sm:pl-28" : ""}`}>{f.a}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

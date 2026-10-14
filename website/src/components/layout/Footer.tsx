import { SUPPORT_EMAIL } from "@/lib/config";
import { ROUTES, useGo } from "@/lib/nav";

const COLS: { title: string; links: [string, string, string?][] }[] = [
  { title: "Personal", links: [["How palm pay works", ROUTES.home, "how"], ["Account levels", ROUTES.personal], ["Find an agent", ROUTES.help, "find-agent"]] },
  { title: "Business", links: [["Take palm payments", ROUTES.business], ["Apply for a terminal", ROUTES.business, "merchant-form"]] },
  { title: "Agents", links: [["Become an agent", ROUTES.agents], ["Apply", ROUTES.agents, "agent-form"]] },
  { title: "Company", links: [["About", ROUTES.about], ["Help", ROUTES.help], ["Security", ROUTES.home, "security"]] },
];

export function Footer() {
  const go = useGo();
  return (
    <footer className="bg-night text-white">
      <div className="wrap pb-10 pt-[72px]">
        <div className="grid-fit gap-10" style={{ ["--min" as string]: "170px" }}>
          <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
            <img src="/brand/logo-white.png" alt="MiliPay" className="h-9 w-auto self-start" />
            <div className="max-w-[320px] text-[15px] leading-[1.6] text-white/[.62]">Palm payments linked straight to your bank account.</div>
          </div>
          {COLS.map((c) => (
            <div key={c.title} className="flex flex-col gap-3">
              <div className="text-sm font-bold">{c.title}</div>
              {c.links.map(([label, to, anchor]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => go(to, anchor)}
                  className="cursor-pointer text-left text-sm text-white/[.62] transition-colors hover:text-brand-hover"
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-wrap justify-between gap-4 border-t border-white/10 pt-6 text-[13px] text-white/50">
          <div>© {new Date().getFullYear()} MiliPay Technologies. All rights reserved.</div>
          <div className="flex flex-wrap gap-5">
            <div>Privacy policy</div>
            <div>Terms of use</div>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white/50 hover:text-brand-hover">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

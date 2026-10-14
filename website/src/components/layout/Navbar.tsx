import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, MapPin, Menu, X } from "lucide-react";
import { APP_LIVE } from "@/lib/config";
import { NAV, ROUTES, useGo } from "@/lib/nav";

/** Sticky header. Full nav at 980px and up; below that, a menu button and a full-width list. */
export function Navbar() {
  const go = useGo();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Choosing a page closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  const cta = APP_LIVE ? "Get the app" : "Get early access";
  const toDownload = () => {
    setOpen(false);
    go(null, "download");
  };
  const toFindAgent = () => {
    setOpen(false);
    go(ROUTES.help, "find-agent");
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2.5 bg-brand-text px-6 py-2.5 text-center text-sm text-white">
        <div>Open a MiliPay account from your phone in about 5 minutes.</div>
        <button type="button" onClick={() => go(ROUTES.personal)} className="cursor-pointer font-bold underline">
          See how
        </button>
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-white/[.94] backdrop-blur-md">
        <div className="wrap flex min-h-[72px] items-center gap-2.5 min-[980px]:gap-7">
          <button type="button" onClick={() => go(ROUTES.home)} className="flex-none cursor-pointer" aria-label="MiliPay home">
            <img src="/brand/logo.png" alt="MiliPay" className="h-[34px] w-auto" />
          </button>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 min-[980px]:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `border-b-2 px-3 pb-[22px] pt-6 text-[15px] font-semibold transition-colors hover:text-brand-text ${
                    isActive ? "border-brand text-brand-text" : "border-transparent text-ink"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden flex-none items-center gap-4 min-[980px]:flex">
            <button type="button" onClick={toFindAgent} className="flex cursor-pointer items-center gap-1.5 text-[15px] font-semibold hover:text-brand-text">
              <MapPin size={17} />
              Find an agent
            </button>
            <button type="button" onClick={toDownload} className="btn-dark h-11 px-5 text-[15px]">
              {cta}
            </button>
          </div>

          <div className="flex-1 min-[980px]:hidden" />
          <button type="button" onClick={toDownload} className="btn-dark h-10 px-4 text-sm min-[980px]:hidden">
            {cta}
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl border border-line min-[980px]:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="flex animate-rise-short flex-col border-t border-line bg-white px-6 pb-5 pt-2 min-[980px]:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={() =>
                  `flex min-h-[52px] items-center justify-between border-b border-line-3 text-[17px] font-semibold ${
                    pathname === n.to ? "text-brand-text" : "text-ink"
                  }`
                }
              >
                {n.label}
                <ChevronRight size={18} />
              </NavLink>
            ))}
            <button
              type="button"
              onClick={toFindAgent}
              className="mt-4 flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-full border-[1.5px] border-ink text-base font-bold"
            >
              <MapPin size={18} />
              Find an agent
            </button>
          </div>
        )}
      </header>
    </>
  );
}

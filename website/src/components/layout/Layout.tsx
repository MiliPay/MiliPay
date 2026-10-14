import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ANCHOR_OFFSET } from "@/lib/nav";
import { DownloadBand } from "@/components/site/DownloadBand";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/**
 * A new page starts at the top; a link to a section smooth-scrolls to it,
 * clear of the sticky header. Keyed on the navigation itself, so pressing
 * "Get early access" twice scrolls twice.
 */
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - ANCHOR_OFFSET, behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [pathname, hash, key]);
  return null;
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <ScrollManager />
      <Navbar />
      <main className="flex-1">
        <Outlet />
        <DownloadBand />
      </main>
      <Footer />
    </div>
  );
}

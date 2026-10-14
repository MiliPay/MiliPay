import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const ROUTES = {
  home: "/",
  personal: "/personal",
  business: "/business",
  agents: "/agents",
  help: "/help",
  about: "/about",
} as const;

export const NAV: { to: string; label: string }[] = [
  { to: ROUTES.personal, label: "Personal" },
  { to: ROUTES.business, label: "Business" },
  { to: ROUTES.agents, label: "Agents" },
  { to: ROUTES.help, label: "Help" },
  { to: ROUTES.about, label: "About" },
];

/** The header's offset when a link lands on an anchor. */
export const ANCHOR_OFFSET = 90;

/**
 * Go to a page, or to a section on it. A new page starts at the top; an
 * anchor smooth-scrolls (ScrollManager in Layout does the scrolling).
 */
export function useGo() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (to: string | null, anchor?: string) => navigate(`${to ?? pathname}${anchor ? `#${anchor}` : ""}`),
    [navigate, pathname],
  );
}

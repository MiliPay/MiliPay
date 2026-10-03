import { useEffect, useState } from "react";
import { supabase } from "@milipay/shared/lib/supabase";

/**
 * Settings › Security "Sign out after 15 minutes idle": when it's on, sign
 * out after `minutes` without a key press, click, scroll or touch. Activity
 * in any tab of the same portal counts, through localStorage.
 */
const KEY = "milipay.lastActivity";

export function useIdleSignOut(active: boolean, onIdle: () => void, minutes = 15) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!active) return;
    let live = true;
    supabase
      .rpc("staff_sign_in_rules")
      .then(({ data }) => live && setEnabled(Boolean((data as { idleSignOut?: boolean } | null)?.idleSignOut)), () => {});
    return () => {
      live = false;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !enabled) return;
    const limit = minutes * 60_000;
    const touch = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        // storage blocked: this tab's own timer still runs
      }
      last = Date.now();
    };
    let last = Date.now();
    touch();
    const events = ["keydown", "pointerdown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      let shared = last;
      try {
        shared = Math.max(last, Number(localStorage.getItem(KEY)) || 0);
      } catch {
        // ignore
      }
      if (Date.now() - shared >= limit) onIdle();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [active, enabled, minutes, onIdle]);
}

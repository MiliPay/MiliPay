import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@milipay/shared/lib/supabase";
import { groupResults, type Group, type SearchResult } from "./searchResults";

/**
 * The admin top-bar search (design handoff "Global search"): customers by
 * name, phone or last 4 of the NIN; sign-ups; transaction references;
 * merchants; POS terminals; tickets. Results are grouped; Enter opens the
 * first one and Esc closes. Ctrl+K (⌘K on a Mac) jumps here.
 */

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const isMac = useMemo(() => typeof navigator !== "undefined" && /mac/i.test(navigator.platform), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      setFailed(false);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_search", { p_q: term });
      if (!live) return;
      setSearching(false);
      setFailed(Boolean(error));
      setGroups(error ? [] : groupResults((data ?? {}) as SearchResult));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const close = () => {
    setOpen(false);
    setQ("");
  };
  const go = (to: string) => {
    close();
    inputRef.current?.blur();
    navigate(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && groups[0]?.items[0]) go(groups[0].items[0].to);
  };

  const term = q.trim();
  const showPanel = open && term.length >= 2;

  return (
    <div className="relative hidden w-[440px] min-w-0 md:block">
      <div
        className={clsx(
          "flex h-[38px] items-center gap-2.5 rounded-[10px] border bg-field px-3 text-faint",
          open ? "border-brand" : "border-line",
        )}
      >
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Search customers, sign-ups, references, merchants, terminals, tickets"
          aria-label="Search the console"
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none"
        />
        <span className="rounded-[5px] border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted">{isMac ? "⌘K" : "Ctrl K"}</span>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[480px] animate-rise-in overflow-y-auto rounded-card border border-line bg-panel p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.18)]">
          {groups.length === 0 && (
            <div className="p-3.5 text-[13px] text-muted">
              {searching ? "Searching…" : failed ? "Search isn't available right now." : `Nothing matches "${term}".`}
            </div>
          )}
          {groups.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.label}>
                <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">
                  <Icon size={12} aria-hidden="true" />
                  {g.label}
                </div>
                {g.items.map((r) => (
                  <button
                    key={r.to + r.title}
                    type="button"
                    onMouseDown={() => go(r.to)}
                    className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-muted">{r.sub}</span>
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" className="text-muted" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

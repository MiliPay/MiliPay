import { useEffect, useState } from "react";
import { fetchReplies, type SavedReply } from "@milipay/shared/features/support/desk";

/**
 * Support › Saved replies (design handoff, MiliPay Support "replies"): the
 * team's shared replies, and how often each was used this week. {first},
 * {amount} and {bank} fill in from the ticket when one is used.
 */
export default function SavedRepliesPage() {
  const [rows, setRows] = useState<SavedReply[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReplies().then(setRows, (e) => setError(e instanceof Error ? e.message : "Could not load saved replies."));
  }, []);

  return (
    <div className="flex max-w-[1100px] animate-fade-in flex-col gap-[18px] px-4 py-[26px] sm:px-7">
      <div>
        <div className="text-2xl font-bold tracking-[-.02em]">Saved replies</div>
        <div className="mt-1 text-muted">Shared by the whole team. {"{first}"}, {"{amount}"} and {"{bank}"} fill in from the ticket.</div>
      </div>
      {error && <div className="rounded-[10px] bg-fail-soft p-3 text-[13px] text-fail">{error}</div>}
      {!rows && !error && <div className="text-[13px] text-muted">Loading…</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows?.map((m) => (
          <div key={m.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
            <div className="flex items-center gap-2">
              <div className="flex-1 font-bold">{m.title}</div>
              <div className="rounded-[5px] bg-chip px-[7px] py-0.5 text-[11px] font-semibold text-muted">{m.tag}</div>
            </div>
            <div className="text-[13px] leading-normal text-muted">{m.body}</div>
            <div className="text-xs text-faint">
              Used {m.uses} {m.uses === 1 ? "time" : "times"} this week
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

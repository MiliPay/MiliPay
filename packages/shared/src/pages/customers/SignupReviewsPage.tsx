import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, RotateCcw, ScanFace, ShieldAlert, XCircle } from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { formatDate, formatTimestamp } from "@milipay/shared/lib/utils/format";
import {
  decideSignupReview,
  fetchSignupReviews,
  reviewReasonText,
  type ReviewDecision,
  type SignupReview,
} from "@milipay/shared/features/signupReviews/api";

function Match({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? "bg-status-ok/10 text-status-ok" : "bg-status-fail/10 text-status-fail"
      }`}
    >
      {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function Photo({ url, label }: { url: string | null; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-1.5">
      {url ? (
        <img src={url} alt={label} className="h-28 w-24 rounded-lg border border-ledger-line object-cover" />
      ) : (
        <div className="flex h-28 w-24 items-center justify-center rounded-lg border border-dashed border-ledger-line text-ink-faint">
          <ScanFace className="h-6 w-6" />
        </div>
      )}
      <figcaption className="text-[11px] text-ink-faint">{label}</figcaption>
    </figure>
  );
}

/**
 * Admin › Customers › Sign-up reviews: self sign-ups Smile ID flagged, or
 * that failed three selfies. An administrator compares the selfie with the
 * NIMC photo and decides: approve (only against a NIMC record for the NIN
 * and birthday the customer typed), another try, or reject with a reason.
 * The customer is texted either way.
 */
export default function SignupReviewsPage() {
  const [items, setItems] = useState<SignupReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SignupReview | null>(null);
  const [reason, setReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchSignupReviews());
    } catch (err: any) {
      setError(err?.message || "Could not load sign-up reviews.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: SignupReview, decision: ReviewDecision, why?: string) => {
    setBusyId(item.id);
    setNotice(null);
    setError(null);
    try {
      const r = await decideSignupReview(item.id, decision, why);
      const what = decision === "approve" ? "approved" : decision === "retry" ? "given another try" : "rejected";
      setNotice(
        `${item.phone} ${what}. ${r.customerTold ? "They have been texted." : "The text could not be sent — tell them another way."}`,
      );
      setRejecting(null);
      setReason("");
      await load();
    } catch (err: any) {
      if (decision === "reject") setRejectError(err?.message || "Could not save the decision.");
      else setError(err?.message || "Could not save the decision.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Sign-up reviews</h1>
        <p className="text-ink-muted mt-1 text-xs sm:text-sm">
          Customers who signed up in the app and need a person to check their identity: Smile ID flagged them, or three selfies failed.
        </p>
      </div>

      {notice && <p className="mb-4 rounded-lg border border-status-ok/25 bg-status-ok/10 p-3 text-sm text-status-ok">{notice}</p>}
      {error && <p className="mb-4 rounded-lg border border-status-fail/25 bg-status-fail/10 p-3 text-sm text-status-fail">{error}</p>}

      {items === null ? (
        <LoadingState title="Loading sign-up reviews" />
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-status-ok" />
          <p className="mt-3 font-semibold text-ink">Nothing waiting</p>
          <p className="mt-1 text-sm text-ink-muted">Every self sign-up has been decided.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const s = item.smile;
            const canApprove = !!s && s.ninMatches && s.dobMatches && !!s.fullName;
            const busy = busyId === item.id;
            return (
              <Card key={item.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-ink">{item.phone}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-warn/10 px-2 py-0.5 text-[11px] font-semibold text-status-warn">
                        <ShieldAlert className="h-3 w-3" />
                        {reviewReasonText(item.reason)}
                      </span>
                    </div>
                    <p className="text-ink-muted">
                      NIN ••••{item.ninLast4 ?? "—"} · born {item.dateOfBirth ? formatDate(item.dateOfBirth) : "—"} (as typed)
                    </p>
                    <p className="text-ink-muted">Selfie attempts: {item.selfieAttempts}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                      <Clock className="h-3.5 w-3.5" />
                      Waiting since {formatTimestamp(item.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex gap-3">
                      <Photo url={s?.photoUrl ?? null} label="NIMC photo" />
                      <Photo url={s?.selfieUrl ?? null} label="Selfie" />
                    </div>
                    <div className="min-w-0 space-y-2 text-sm">
                      {s ? (
                        <>
                          <p className="font-semibold text-ink">{s.fullName ?? "No name on the NIMC record"}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Match ok={s.ninMatches} label="NIN matches" />
                            <Match ok={s.dobMatches} label={`Birthday ${s.dateOfBirth ? formatDate(s.dateOfBirth) : "unknown"}`} />
                          </div>
                          <p className="text-xs text-ink-muted">
                            Smile ID: {s.status ?? "—"}
                            {s.reason ? ` · ${s.reason.replace(/_/g, " ")}` : ""}
                            {s.riskLevel ? ` · risk ${s.riskLevel}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-ink-muted">No Smile ID result was received for this sign-up.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ledger-line pt-4">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setRejectError(null);
                      setReason("");
                      setRejecting(item);
                    }}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(item, "retry")}>
                    <RotateCcw className="h-4 w-4" /> Another try
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || !canApprove}
                    isLoading={busy}
                    title={canApprove ? "Let them finish signing up" : "Only possible when the NIMC record matches the NIN and birthday they typed"}
                    onClick={() => void decide(item, "approve")}
                  >
                    <CheckCircle className="h-4 w-4" /> Approve
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {rejecting && (
        <Modal isOpen={!!rejecting} onClose={() => busyId === null && setRejecting(null)} title="Reject this sign-up">
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {rejecting.phone} will be texted that we couldn't verify their identity, with your reason. They can contact support.
            </p>
            <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The selfie doesn't match the NIN photo" />
            {rejectError && <p className="text-sm font-medium text-status-fail">{rejectError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRejecting(null)} disabled={busyId !== null}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void decide(rejecting, "reject", reason)} isLoading={busyId === rejecting.id} disabled={reason.trim().length < 3}>
                Reject and text them
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

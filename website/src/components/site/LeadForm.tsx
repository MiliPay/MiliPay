import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { checkForm, type FieldRule } from "@rules";
import { failed, type ApiResult } from "@/lib/api";

export interface FieldUi {
  label: string;
  placeholder: string;
  /** Spans the whole row. */
  wide?: boolean;
}

interface Props {
  rules: FieldRule[];
  ui: Record<string, FieldUi>;
  send: (values: Record<string, string>) => Promise<ApiResult>;
  privacyNote?: string;
  thanks: (values: Record<string, string>) => { title: string; body: ReactNode };
}

/** The design's application card: inline validation, then a success state. */
export function LeadForm({ rules, ui, send, privacyNote, thanks }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Record<string, string> | null>(null);

  const set = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = async () => {
    if (busy) return;
    const checked = checkForm(rules, values);
    if ("errors" in checked) return setErrors(checked.errors);
    setBusy(true);
    setFailure("");
    const res = await send(checked.values);
    setBusy(false);
    if (!failed(res)) return setSent({ ...values });
    if (res.errors) setErrors(res.errors);
    setFailure(res.message);
  };

  const reset = () => {
    setSent(null);
    setValues({});
    setErrors({});
  };

  if (sent) {
    const t = thanks(sent);
    return (
      <div className="flex animate-rise-fast flex-col items-center gap-3 py-[30px] text-center" role="status">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand text-brand-on">
          <Check size={34} strokeWidth={3} />
        </div>
        <div className="text-[26px] font-extrabold tracking-[-.02em]">{t.title}</div>
        <div className="max-w-[360px] text-base leading-[1.55] text-ink-muted">{t.body}</div>
        <button type="button" onClick={reset} className="mt-2 cursor-pointer font-bold text-brand-text hover:text-deep-2">
          Send another application
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid-fit gap-4" style={{ ["--min" as string]: "220px" }}>
        {rules.map((r) => {
          const f = ui[r.key];
          const err = errors[r.key];
          const v = values[r.key] ?? "";
          const id = `f-${r.key}`;
          const base = `h-[52px] rounded-[14px] border-[1.5px] bg-field text-base outline-none focus:border-brand focus:bg-white ${err ? "border-danger" : "border-line"}`;
          return (
            <div key={r.key} className="flex flex-col gap-1.5" style={f.wide ? { gridColumn: "1 / -1" } : undefined}>
              <label htmlFor={id} className="text-sm font-bold">
                {f.label}
              </label>
              {r.kind === "select" ? (
                <select
                  id={id}
                  value={v}
                  onChange={(e) => set(r.key, e.target.value)}
                  aria-invalid={!!err}
                  className={`${base} px-3 ${v ? "text-ink" : "text-ink-faint"}`}
                >
                  <option value="">{f.placeholder}</option>
                  {r.options?.map((o) => (
                    <option key={o} value={o} className="text-ink">
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  value={v}
                  onChange={(e) => set(r.key, e.target.value)}
                  placeholder={f.placeholder}
                  inputMode={r.kind === "tel" ? "tel" : r.kind === "email" ? "email" : "text"}
                  type={r.kind === "email" ? "email" : r.kind === "tel" ? "tel" : "text"}
                  autoComplete={r.kind === "tel" ? "tel" : r.kind === "email" ? "email" : undefined}
                  aria-invalid={!!err}
                  className={`${base} px-3.5`}
                />
              )}
              {err && <div className="text-[13px] text-danger">{err}</div>}
            </div>
          );
        })}
      </div>
      {privacyNote && (
        <div className="mt-[18px] flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-muted">
          <Lock size={14} className="mt-0.5 flex-none" />
          <div>{privacyNote}</div>
        </div>
      )}
      {failure && <div className="mt-4 text-sm text-danger">{failure}</div>}
      <button type="submit" disabled={busy} className={`btn-dark h-14 w-full text-base disabled:opacity-70 ${privacyNote ? "mt-5" : "mt-6"}`}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        Send application
        {!busy && <ArrowRight size={18} />}
      </button>
    </form>
  );
}

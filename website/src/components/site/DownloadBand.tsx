import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Check, Loader2, Play, Smartphone } from "lucide-react";
import { WAITLIST_ERROR, shownPhone, waitlistPhone } from "@rules";
import { APP_LIVE, STORE_LINKS } from "@/lib/config";
import { failed, joinWaitlist } from "@/lib/api";

const STORES = [
  { icon: Smartphone, name: "App Store", href: STORE_LINKS.appStore },
  { icon: Play, name: "Google Play", href: STORE_LINKS.googlePlay },
];

/** "MiliPay is coming to your phone." On every page; every "Get early access" scrolls here. */
export function DownloadBand() {
  const { pathname } = useLocation();
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    const local = waitlistPhone(phone);
    if (!local) return setErr(WAITLIST_ERROR);
    setBusy(true);
    const res = await joinWaitlist(phone, pathname);
    setBusy(false);
    if (failed(res)) setErr(res.errors?.phone ?? res.message);
    else setSent(local);
  };

  return (
    <section id="download" className="wrap py-24">
      <div
        className="relative grid items-center gap-10 overflow-hidden rounded-[40px] p-[clamp(36px,6vw,72px)] text-white"
        style={{
          background: "radial-gradient(120% 120% at 100% 0%,#0a7a5a,#065f46 40%,#022c22 80%)",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))",
        }}
      >
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[420px] w-[420px] rounded-full border border-[rgba(51,224,181,.25)]" />
        <div className="pointer-events-none absolute -right-[60px] -top-[60px] h-[300px] w-[300px] rounded-full border border-[rgba(51,224,181,.35)]" />

        <div className="relative flex flex-col gap-3.5">
          <div className="flex items-center gap-2 self-start rounded-full border border-[rgba(51,224,181,.45)] px-3 py-[5px] text-xs font-bold uppercase tracking-[.06em] text-brand-hover">
            <span className="h-[7px] w-[7px] rounded-full bg-brand-hover" />
            {APP_LIVE ? "Available now" : "Coming soon"}
          </div>
          <h2 className="m-0 text-[clamp(32px,4.4vw,52px)] font-extrabold leading-[1.05] tracking-[-.03em]">
            {APP_LIVE ? "Get MiliPay on your phone." : "MiliPay is coming to your phone."}
          </h2>
          <p className="m-0 max-w-[480px] text-lg leading-[1.6] text-white/80">
            {APP_LIVE
              ? "Download the app on iPhone or Android and open an account in about 5 minutes."
              : "The app is launching soon on iPhone and Android. Leave your number and we'll text you the day it's ready."}
          </p>
        </div>

        <div className="relative flex min-w-0 flex-col gap-3.5">
          {!APP_LIVE &&
            (sent ? (
              <div
                className="flex animate-rise-short items-center gap-3 rounded-[18px] border border-[rgba(51,224,181,.4)] bg-white/10 px-[18px] py-4"
                role="status"
              >
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand text-brand-on">
                  <Check size={18} strokeWidth={3} />
                </div>
                <div className="text-[15px] leading-[1.45]">
                  You're on the list. We'll text <b>{shownPhone(sent)}</b> when MiliPay is live.
                </div>
              </div>
            ) : (
              <form
                noValidate
                className="flex flex-col gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <div className="flex flex-wrap gap-2.5">
                  <label
                    className={`flex h-[60px] flex-[1_1_220px] items-center gap-2.5 rounded-[18px] border-2 bg-white px-[18px] text-ink ${err ? "border-[#FF5C5C]" : "border-transparent"}`}
                  >
                    <span className="font-bold text-ink-muted">+234</span>
                    <span className="h-6 w-px bg-line" />
                    <input
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/[^0-9 ]/g, "").slice(0, 13));
                        setErr("");
                      }}
                      inputMode="tel"
                      autoComplete="tel-national"
                      aria-label="Your phone number"
                      aria-invalid={!!err}
                      placeholder="803 123 4567"
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-[17px] font-semibold text-ink outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex h-[60px] flex-none cursor-pointer items-center gap-2 rounded-[18px] bg-brand px-6 text-base font-bold text-brand-on transition-colors hover:bg-brand-hover disabled:opacity-70"
                  >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                    Notify me
                  </button>
                </div>
                {err && <div className="text-sm text-[#FFB4B4]">{err}</div>}
              </form>
            ))}

          <div className="flex flex-wrap gap-2.5">
            {STORES.map((s) =>
              APP_LIVE && s.href ? (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-14 min-w-[190px] items-center gap-3 rounded-2xl border-[1.5px] border-white/60 px-[18px] text-white hover:border-white"
                >
                  <s.icon size={22} />
                  <div>
                    <div className="text-[11px] text-white/60">Get it on</div>
                    <div className="text-base font-extrabold">{s.name}</div>
                  </div>
                </a>
              ) : (
                <div
                  key={s.name}
                  className="flex h-14 min-w-[190px] cursor-default items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-white/35 px-[18px] text-white/85"
                >
                  <s.icon size={22} />
                  <div>
                    <div className="text-[11px] text-white/60">Coming soon to</div>
                    <div className="text-base font-extrabold">{s.name}</div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

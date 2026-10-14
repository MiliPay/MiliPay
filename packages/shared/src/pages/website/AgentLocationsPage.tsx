import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock, EyeOff, MapPin, Pencil, Plus, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { Drawer } from "@milipay/shared/components/ui/Drawer";
import { Input } from "@milipay/shared/components/ui/Input";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  WEBSITE_STATES,
  fetchAgentLocations,
  locationErrors,
  locationsInState,
  moveId,
  reorderAgentLocations,
  saveAgentLocation,
  setAgentLocationActive,
  type AgentLocation,
  type AgentLocationList,
  type LocationInput,
} from "@milipay/shared/features/website/admin";
import { EmptyState } from "./EmptyState";

/**
 * Website → Agent locations: the shops "Find an agent" lists, by state. Only
 * listed ones are on the website, top first. Every change is audited; hiding
 * or relisting one needs a reason.
 */

export default function AgentLocationsPage() {
  const { flash } = useToast();
  const [data, setData] = useState<AgentLocationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AgentLocation | "new" | null>(null);
  const [dialog, setDialog] = useState<Omit<ReasonDialogProps, "open" | "onClose"> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchAgentLocations();
      setData(d);
      setError(null);
      setState((s) => s ?? WEBSITE_STATES.find((x) => d.states[x]) ?? "Lagos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agent locations.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inState = useMemo(() => (data && state ? locationsInState(data.rows, state) : []), [data, state]);
  const shown = order ? order.map((id) => inState.find((l) => l.id === id)).filter((l): l is AgentLocation => Boolean(l)) : inState;
  const total = data ? Object.values(data.states).reduce((n, s) => n + s.active, 0) : null;

  const pickState = (s: string) => {
    setOrder(null);
    setState(s);
  };

  const move = (index: number, dir: -1 | 1) => setOrder(moveId(shown.map((l) => l.id), index, dir));

  const saveOrder = async () => {
    if (!order || !state) return;
    setSaving(true);
    try {
      await reorderAgentLocations(state, order);
      flash(`Order saved for ${state} · logged`);
      setOrder(null);
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save the order.", "fail");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (l: AgentLocation) =>
    setDialog({
      title: `${l.active ? "Hide" : "Relist"} ${l.name}?`,
      body: l.active
        ? `It comes off "Find an agent" for ${l.state} right away. You can relist it later.`
        : `It shows on "Find an agent" for ${l.state} again, in its place in the list.`,
      icon: l.active ? EyeOff : RotateCcw,
      tone: l.active ? "fail" : "ok",
      confirmLabel: l.active ? "Hide from website" : "Relist",
      noteRequired: true,
      notePlaceholder: "Reason (required)",
      onConfirm: async (note) => {
        await setAgentLocationActive(l.id, !l.active, note);
        setDialog(null);
        flash(`${l.name} ${l.active ? "hidden" : "relisted"} · logged`);
        await load();
      },
    });

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Agent locations</h1>
          <div className="mt-1 text-muted">
            Where the website's "Find an agent" sends people.{" "}
            {total !== null && (total === 0 ? "Nothing is listed yet, so every state says no agents are listed." : `${total} listed across the country.`)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-3.5 font-bold text-brand-ink"
        >
          <Plus size={16} aria-hidden="true" />
          Add location
        </button>
      </div>

      {error && <div className="rounded-card border border-line bg-panel p-12 text-center text-fail shadow-card">{error}</div>}

      {!error && (
        <div className="grid gap-[18px] lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[.06em] text-faint">States</div>
            <label className="block p-3 lg:hidden">
              <span className="sr-only">State</span>
              <select
                value={state ?? ""}
                onChange={(e) => pickState(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-line bg-field px-3 text-fg outline-none focus:border-brand"
              >
                {WEBSITE_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {data?.states[s] ? ` (${data.states[s].active})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="hidden max-h-[640px] overflow-y-auto py-1.5 lg:block">
              {WEBSITE_STATES.map((s) => {
                const c = data?.states[s];
                const on = s === state;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickState(s)}
                    className={clsx(
                      "flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[13.5px]",
                      on ? "bg-brand-soft font-semibold text-brand-text" : "hover:bg-hover",
                      !c && !on && "text-muted",
                    )}
                  >
                    {s}
                    {c && <span className="rounded-full bg-chip px-[7px] py-px text-[11px] font-semibold text-muted">{c.active}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{state ?? "—"}</div>
                <div className="text-xs text-muted">Listed ones show on the website in this order, top first.</div>
              </div>
              {order && (
                <>
                  <button
                    type="button"
                    onClick={() => setOrder(null)}
                    disabled={saving}
                    className="flex h-9 items-center rounded-[9px] border border-line px-3 text-[13px] font-semibold hover:bg-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveOrder()}
                    disabled={saving}
                    className="flex h-9 items-center rounded-[9px] bg-brand px-3 text-[13px] font-bold text-brand-ink disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save order"}
                  </button>
                </>
              )}
            </div>

            {!data && <div className="p-12 text-center text-muted">Loading…</div>}
            {data && shown.length === 0 && (
              <EmptyState
                icon={MapPin}
                title={`No agents listed in ${state}`}
                body="The website tells people in this state that no agents are listed yet. Add a shop to change that."
                action={
                  <button
                    type="button"
                    onClick={() => setEditing("new")}
                    className="flex h-9 items-center gap-2 rounded-[9px] border border-line px-3 text-[13px] font-semibold hover:bg-hover"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add a location in {state}
                  </button>
                }
              />
            )}
            {shown.map((l, i) => (
              <div key={l.id} className="flex items-center gap-3 border-b border-line2 px-5 py-3">
                <div className="flex flex-none flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${l.name} up`}
                    disabled={i === 0 || saving}
                    onClick={() => move(i, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${l.name} down`}
                    disabled={i === shown.length - 1 || saving}
                    onClick={() => move(i, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="w-6 flex-none text-center text-[13px] font-semibold tabular-nums text-faint">{i + 1}</div>
                <div className={clsx("min-w-0 flex-1", !l.active && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.name}</span>
                    {l.active ? <Pill tone="ok">Listed</Pill> : <Pill tone="muted">Hidden</Pill>}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">{l.address}</div>
                  {l.hours && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                      <Clock size={12} aria-hidden="true" />
                      {l.hours}
                    </div>
                  )}
                </div>
                <div className="flex flex-none flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(l)}
                    className="flex h-[30px] items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-hover"
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(l)}
                    className={clsx(
                      "flex h-[30px] items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-hover",
                      l.active ? "text-fail" : "text-brand-text",
                    )}
                  >
                    {l.active ? <EyeOff size={13} aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
                    {l.active ? "Hide" : "Relist"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <LocationDrawer
          location={editing === "new" ? null : editing}
          defaultState={state ?? "Lagos"}
          onClose={() => setEditing(null)}
          onSaved={async (saved, isNew) => {
            setEditing(null);
            setOrder(null);
            flash(`${saved.name.trim()} ${isNew ? "added to the website" : "saved"} · logged`);
            setState(saved.state);
            await load();
          }}
        />
      )}
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}

function LocationDrawer({
  location,
  defaultState,
  onClose,
  onSaved,
}: {
  location: AgentLocation | null;
  defaultState: string;
  onClose: () => void;
  onSaved: (v: LocationInput, isNew: boolean) => Promise<void>;
}) {
  const [v, setV] = useState<LocationInput>({
    name: location?.name ?? "",
    address: location?.address ?? "",
    state: location?.state ?? defaultState,
    hours: location?.hours ?? "",
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = locationErrors(v);
  const invalid = Object.keys(errors).length > 0;
  const show = (k: keyof LocationInput) => (touched ? errors[k] : undefined);

  const save = async () => {
    setTouched(true);
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveAgentLocation(location?.id ?? null, v);
      await onSaved(v, !location);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  const set = (k: keyof LocationInput) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      label={location ? `Edit ${location.name}` : "Add agent location"}
      header={
        <>
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-brand-soft text-brand-text">
            <MapPin size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{location ? "Edit location" : "Add location"}</div>
            <div className="text-xs text-muted">Shown on the website's "Find an agent"</div>
          </div>
        </>
      }
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-[42px] flex-1 items-center justify-center rounded-[10px] border border-line bg-panel font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || (touched && invalid)}
            className="flex h-[42px] flex-1 items-center justify-center rounded-[10px] border border-brand bg-brand font-bold text-brand-ink disabled:opacity-45"
          >
            {busy ? "Saving…" : location ? "Save changes" : "Add to website"}
          </button>
        </div>
      }
    >
      <Input label="Shop name" name="loc-name" required value={v.name} onChange={set("name")} error={show("name")} placeholder="e.g. Chidi's Phone Accessories" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="loc-address" className="text-xs font-semibold text-muted">
          Address <span className="text-warn">*</span>
        </label>
        <textarea
          id="loc-address"
          rows={3}
          value={v.address}
          onChange={set("address")}
          aria-invalid={Boolean(show("address"))}
          placeholder="Shop 14, Computer Village, Ikeja"
          className={clsx(
            "w-full resize-none rounded-[10px] border bg-field px-3 py-2.5 text-sm leading-[1.45] text-fg outline-none focus:border-brand",
            show("address") ? "border-fail" : "border-line",
          )}
        />
        {show("address") && <p className="text-xs text-fail">{show("address")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="loc-state" className="text-xs font-semibold text-muted">
          State <span className="text-warn">*</span>
        </label>
        <select
          id="loc-state"
          value={v.state}
          onChange={set("state")}
          className="h-11 w-full rounded-[10px] border border-line bg-field px-3 text-sm text-fg outline-none focus:border-brand"
        >
          {WEBSITE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {location && v.state !== location.state && <p className="text-xs text-muted">It moves to the bottom of {v.state}'s list.</p>}
      </div>
      <Input
        label="Opening hours"
        name="loc-hours"
        value={v.hours}
        onChange={set("hours")}
        error={show("hours")}
        hint="Optional. As people should read it, e.g. Mon to Sat, 8am to 7pm."
      />
      {error && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{error}</div>}
    </Drawer>
  );
}

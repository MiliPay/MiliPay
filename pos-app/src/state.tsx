import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, PosError, type Approved, type Me, type Shift, type Tx } from "./api";
import { loadToken, saveToken } from "./hardware";
import type { Outcome, ThemeName } from "./core";

/**
 * The terminal is one flow, like the prototype: a screen, the device's
 * sign-in, the cashier on shift, and the sale in progress. No URL routing:
 * a till has no links to follow.
 */

export type Screen =
  | "splash" | "signin" | "setpin" | "lock" | "home" | "amount" | "method" | "palm" | "pin" | "qr" | "card"
  | "result" | "history" | "tx" | "refund" | "eod" | "settings";

export interface Sale {
  amount: number;
  /** Optional last 4 digits of the customer's phone, to narrow the match. */
  hint: string;
  /** The palm templates, kept so a PIN prompt doesn't need a second scan. */
  capture: { irFeatures: string; rgbFeatures: string | null } | null;
  reference: string;
  customerFirst: string | null;
  threshold: number | null;
  /** After the amount screen, go straight to QR (the Home shortcut). */
  toQr: boolean;
}

export type Result = { ok: true; approved: Approved } | { ok: false; outcome: Outcome };

interface State {
  screen: Screen;
  theme: ThemeName;
  token: string | null;
  setupGrant: string | null;
  me: Me | null;
  shift: Shift | null;
  sale: Sale;
  result: Result | null;
  tx: Tx | null;
  busy: string | null;
  online: boolean;
  paper: boolean;
}

const newSale = (): Sale => ({
  amount: 0, hint: "", capture: null, customerFirst: null, threshold: null, toQr: false,
  reference: `MILI-TX-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
});

interface Store extends State {
  set: (patch: Partial<State>) => void;
  go: (screen: Screen) => void;
  setSale: (patch: Partial<Sale>) => void;
  startSale: (toQr?: boolean) => void;
  /** Show the heartbeat loader while `fn` runs. */
  wait: <T>(text: string, fn: () => Promise<T>) => Promise<T>;
  signedIn: (token: string, setupGrant: string | null) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  /** The device token and cashier session, for api calls. */
  auth: () => { token: string; session: string };
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    screen: "splash", theme: "light", token: null, setupGrant: null, me: null, shift: null, sale: newSale(),
    result: null, tx: null, busy: null, online: true, paper: true,
  });
  const ref = useRef(state);
  ref.current = state;

  const set = useCallback((patch: Partial<State>) => setState((s) => ({ ...s, ...patch })), []);

  const refreshMe = useCallback(async () => {
    const token = ref.current.token;
    if (!token) return null;
    try {
      const me = await api.me(token);
      set({ me });
      return me;
    } catch (err) {
      // A terminal that's been signed out elsewhere logs in again.
      if (err instanceof PosError && err.status === 401) {
        await saveToken(null);
        set({ token: null, me: null, shift: null, screen: "signin" });
      }
      return null;
    }
  }, [set]);

  // The device token survives restarts: after the splash, a set-up terminal
  // goes to the PIN login, a new one to first login.
  useEffect(() => {
    loadToken().then((token) => {
      if (token) setState((s) => ({ ...s, token }));
    });
  }, []);

  const store = useMemo<Store>(() => ({
    ...state,
    set,
    go: (screen) => set({ screen }),
    setSale: (patch) => setState((s) => ({ ...s, sale: { ...s.sale, ...patch } })),
    startSale: (toQr = false) => set({ sale: { ...newSale(), toQr }, result: null, screen: "amount" }),
    wait: async (text, fn) => {
      set({ busy: text });
      try {
        return await fn();
      } finally {
        set({ busy: null });
      }
    },
    signedIn: async (token, setupGrant) => {
      await saveToken(token);
      set({ token, setupGrant });
    },
    refreshMe,
    signOut: async () => {
      await saveToken(null);
      set({ token: null, me: null, shift: null, setupGrant: null, screen: "signin" });
    },
    auth: () => {
      const { token, shift } = ref.current;
      if (!token || !shift) throw new PosError("Unlock the terminal with your PIN.", 401, "CASHIER_LOCKED");
      return { token, session: shift.session };
    },
  }), [state, set, refreshMe]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

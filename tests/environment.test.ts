import { describe, expect, it } from "vitest";
import {
  checkEnvironmentCoherence,
  disabledMessage,
  isSandboxUrl,
  readFulfilmentEnvironment,
  resolveFulfilmentMode,
} from "../supabase/functions/_shared/environment";

/**
 * This module decides whether MiliPay is allowed to spend its own money at
 * VTPass and BigiSub. Zero imports, so Node can run it.
 */

describe("resolveFulfilmentMode", () => {
  it("defaults to disabled when unset", () => {
    // An unset variable must never mean "spend money". A fresh deploy, a
    // dropped secret and a typo all land here.
    expect(resolveFulfilmentMode(undefined)).toBe("disabled");
    expect(resolveFulfilmentMode(null)).toBe("disabled");
    expect(resolveFulfilmentMode("")).toBe("disabled");
  });

  it("defaults to disabled for anything it does not recognise", () => {
    expect(resolveFulfilmentMode("yes")).toBe("disabled");
    expect(resolveFulfilmentMode("true")).toBe("disabled");
    expect(resolveFulfilmentMode("production")).toBe("disabled");
    expect(resolveFulfilmentMode("LIVE!")).toBe("disabled");
  });

  it("accepts the two real modes, case and whitespace insensitively", () => {
    expect(resolveFulfilmentMode("live")).toBe("live");
    expect(resolveFulfilmentMode("  LIVE  ")).toBe("live");
    expect(resolveFulfilmentMode("Simulated")).toBe("simulated");
  });
});

describe("isSandboxUrl", () => {
  it("recognises the hosts that are definitely not production", () => {
    expect(isSandboxUrl("https://sandbox.vtpass.com/api")).toBe(true);
    expect(isSandboxUrl("https://staging.example.com")).toBe(true);
    expect(isSandboxUrl("http://localhost:54321")).toBe(true);
    expect(isSandboxUrl("http://127.0.0.1:8000")).toBe(true);
  });

  it("does not flag production hosts", () => {
    expect(isSandboxUrl("https://vtpass.com/api")).toBe(false);
    expect(isSandboxUrl("https://api.bigisub.ng")).toBe(false);
    expect(isSandboxUrl("https://api.withmono.com")).toBe(false);
  });

  it("treats an unset URL as not-sandbox rather than throwing", () => {
    expect(isSandboxUrl(undefined)).toBe(false);
    expect(isSandboxUrl(null)).toBe(false);
    expect(isSandboxUrl("")).toBe(false);
  });
});

describe("checkEnvironmentCoherence", () => {
  it("refuses live fulfilment pointed at a sandbox gateway", () => {
    // This is the dangerous combination: Mono debits the customer's real bank
    // account while the operator call goes to a test gateway that credits
    // nobody. Money taken, nothing delivered.
    const result = checkEnvironmentCoherence({
      mode: "live",
      vtpassBaseUrl: "https://sandbox.vtpass.com/api",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("VTPASS_BASE_URL");
  });

  it("names every sandboxed provider, not just the first", () => {
    const result = checkEnvironmentCoherence({
      mode: "live",
      vtpassBaseUrl: "https://sandbox.vtpass.com/api",
      bigisubBaseUrl: "https://staging.bigisub.ng",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("VTPASS_BASE_URL");
    expect(result.reason).toContain("BIGISUB_BASE_URL");
  });

  it("allows live fulfilment against production gateways", () => {
    expect(
      checkEnvironmentCoherence({
        mode: "live",
        vtpassBaseUrl: "https://vtpass.com/api",
        bigisubBaseUrl: "https://api.bigisub.ng",
        monoBaseUrl: "https://api.withmono.com",
      }).ok,
    ).toBe(true);
  });

  it("does not object to a sandbox URL when fulfilment is off", () => {
    // Harmless: disabled and simulated make no provider calls at all.
    expect(
      checkEnvironmentCoherence({ mode: "disabled", vtpassBaseUrl: "https://sandbox.vtpass.com/api" }).ok,
    ).toBe(true);
    expect(
      checkEnvironmentCoherence({ mode: "simulated", vtpassBaseUrl: "https://sandbox.vtpass.com/api" }).ok,
    ).toBe(true);
  });

  it("never leaks a credential in the reason string", () => {
    const result = checkEnvironmentCoherence({
      mode: "live",
      vtpassBaseUrl: "https://sandbox.vtpass.com/api?apikey=SUPERSECRET",
    });
    expect(result.reason).not.toContain("SUPERSECRET");
  });
});

describe("readFulfilmentEnvironment", () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

  it("is closed and coherent on a completely empty environment", () => {
    const result = readFulfilmentEnvironment(env({}));
    expect(result.mode).toBe("disabled");
    expect(result.coherence.ok).toBe(true);
  });

  it("catches the current repo state: live mode against the sandbox URL", () => {
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
      }),
    );
    expect(result.mode).toBe("live");
    expect(result.coherence.ok).toBe(false);
  });
});

describe("disabledMessage", () => {
  it("tells the customer no payment was taken", () => {
    // The whole point of failing before the debit is that we can say this
    // truthfully.
    expect(disabledMessage("disabled")).toMatch(/no payment was taken/i);
  });

  it("distinguishes test mode from an outage", () => {
    expect(disabledMessage("simulated")).toMatch(/test mode/i);
  });
});

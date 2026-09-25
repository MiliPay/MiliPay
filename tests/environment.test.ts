import { describe, expect, it } from "vitest";
import {
  checkEnvironmentCoherence,
  classifyGatewayUrl,
  classifyMonoKey,
  disabledMessage,
  isSandboxUrl,
  readFulfilmentEnvironment,
  resolveDeployment,
  resolveFulfilmentMode,
} from "../supabase/functions/_shared/environment";

/**
 * This module decides whether MiliPay is allowed to move money. Zero imports,
 * so Node can run it.
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

  it("accepts the real modes, case and whitespace insensitively", () => {
    expect(resolveFulfilmentMode("live")).toBe("live");
    expect(resolveFulfilmentMode("  LIVE  ")).toBe("live");
    expect(resolveFulfilmentMode("Simulated")).toBe("simulated");
  });
});

describe("resolveDeployment", () => {
  it("defaults to sandbox, so production is always a deliberate act", () => {
    expect(resolveDeployment(undefined)).toBe("sandbox");
    expect(resolveDeployment(null)).toBe("sandbox");
    expect(resolveDeployment("")).toBe("sandbox");
    expect(resolveDeployment("prod")).toBe("sandbox");
    expect(resolveDeployment("PRODUCTION!")).toBe("sandbox");
  });

  it("accepts production exactly", () => {
    expect(resolveDeployment("production")).toBe("production");
    expect(resolveDeployment("  Production  ")).toBe("production");
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

describe("classifyGatewayUrl", () => {
  it("separates the two VTPass faces", () => {
    expect(classifyGatewayUrl("https://sandbox.vtpass.com/api")).toBe("sandbox");
    expect(classifyGatewayUrl("https://vtpass.com/api")).toBe("production");
  });

  it("calls an unset URL unknown rather than production", () => {
    // Guessing here would let a dropped variable pass as a deliberate
    // production choice, which is the failure direction that costs money.
    expect(classifyGatewayUrl(undefined)).toBe("unknown");
    expect(classifyGatewayUrl("")).toBe("unknown");
    expect(classifyGatewayUrl("   ")).toBe("unknown");
  });
});

describe("classifyMonoKey", () => {
  it("reads the prefix, because Mono has no sandbox host", () => {
    // Test and live both go to api.withmono.com. The key is the only thing
    // that says which face you are talking to.
    expect(classifyMonoKey("test_sk_abc123")).toBe("sandbox");
    expect(classifyMonoKey("live_sk_abc123")).toBe("production");
  });

  it("is unknown for a format it cannot place", () => {
    expect(classifyMonoKey("abc123")).toBe("unknown");
    expect(classifyMonoKey(undefined)).toBe("unknown");
    expect(classifyMonoKey("")).toBe("unknown");
  });
});

describe("checkEnvironmentCoherence", () => {
  it("ALLOWS a fully sandboxed deployment to actually run", () => {
    // The MVP configuration: both legs on test credentials, no real money
    // anywhere, but the whole flow genuinely executing. The previous version
    // refused this, which left no way to prove the flow end to end.
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "sandbox",
      gatewayBaseUrl: "https://sandbox.vtpass.com/api",
      monoSecretKey: "test_sk_abc123",
    });
    expect(result.ok).toBe(true);
  });

  it("allows a fully production deployment", () => {
    expect(
      checkEnvironmentCoherence({
        mode: "live",
        declared: "production",
        gatewayBaseUrl: "https://vtpass.com/api",
        monoSecretKey: "live_sk_abc123",
      }).ok,
    ).toBe(true);
  });

  it("refuses production Mono against a sandbox gateway", () => {
    // Real bank debits, test fulfilment: money taken, nothing delivered.
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "sandbox",
      gatewayBaseUrl: "https://sandbox.vtpass.com/api",
      monoSecretKey: "live_sk_abc123",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("MONO_SECRET_KEY");
  });

  it("refuses a sandbox Mono against a production gateway", () => {
    // The mirror image, and just as expensive: MiliPay's own wallet is spent
    // for real while nobody is ever charged.
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "production",
      gatewayBaseUrl: "https://vtpass.com/api",
      monoSecretKey: "test_sk_abc123",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("MONO_SECRET_KEY");
  });

  it("names the gateway variable it was actually given", () => {
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "production",
      gatewayBaseUrl: "https://sandbox.vtpass.com/api",
      gatewayVariable: "VTPASS_BASE_URL",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("VTPASS_BASE_URL");
  });

  it("reports every disagreement, not just the first", () => {
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "production",
      gatewayBaseUrl: "https://sandbox.vtpass.com/api",
      gatewayVariable: "VTPASS_BASE_URL",
      monoSecretKey: "test_sk_abc123",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("VTPASS_BASE_URL");
    expect(result.reason).toContain("MONO_SECRET_KEY");
  });

  it("lets an unclassifiable provider pass rather than blocking a valid setup", () => {
    // Unknown is not disagreement. A Mono key whose format we cannot place
    // must not lock someone out of their own deployment.
    expect(
      checkEnvironmentCoherence({
        mode: "live",
        declared: "sandbox",
        gatewayBaseUrl: "https://sandbox.vtpass.com/api",
        monoSecretKey: "some-other-format",
      }).ok,
    ).toBe(true);
  });

  it("does not object to anything while fulfilment is off", () => {
    // disabled and simulated make no provider calls at all.
    for (const mode of ["disabled", "simulated"] as const) {
      expect(
        checkEnvironmentCoherence({
          mode,
          declared: "production",
          gatewayBaseUrl: "https://sandbox.vtpass.com/api",
          monoSecretKey: "test_sk_abc123",
        }).ok,
      ).toBe(true);
    }
  });

  it("never leaks a credential in the reason string", () => {
    const result = checkEnvironmentCoherence({
      mode: "live",
      declared: "production",
      gatewayBaseUrl: "https://sandbox.vtpass.com/api?token=SUPERSECRET",
      // secret-scan: allow (next line) — a FAKE key, invented so the test can
      // prove the refusal message never echoes a credential back.
      monoSecretKey: "test_sk_SUPERSECRETKEY", // secret-scan: allow — fake fixture
    });
    expect(result.ok).toBe(false);
    expect(result.reason).not.toContain("SUPERSECRET");
    expect(result.reason).not.toContain("SUPERSECRETKEY");
  });
});

describe("readFulfilmentEnvironment", () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

  it("is closed and coherent on a completely empty environment", () => {
    const result = readFulfilmentEnvironment(env({}));
    expect(result.mode).toBe("disabled");
    expect(result.declared).toBe("sandbox");
    expect(result.coherence.ok).toBe(true);
  });

  it("clears the MVP configuration end to end", () => {
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        MILIPAY_ENVIRONMENT: "sandbox",
        VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
        MONO_SECRET_KEY: "test_sk_abc123", // secret-scan: allow — fake fixture, only its test_ prefix matters
      }),
    );
    expect(result.mode).toBe("live");
    expect(result.coherence.ok).toBe(true);
  });

  it("judges the deployment by VTPass alone, ignoring a leftover BigiSub URL", () => {
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        MILIPAY_ENVIRONMENT: "sandbox",
        VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
        // Left over from before BigiSub was parked, and pointing at
        // PRODUCTION. Nothing calls BigiSub, so it must not be what decides
        // whether this deployment is coherent.
        BIGISUB_BASE_URL: "https://api.bigisub.ng",
        MONO_SECRET_KEY: "test_sk_abc123", // secret-scan: allow — fake fixture, only its test_ prefix matters
      }),
    );
    expect(result.coherence.ok).toBe(true);
    expect(result.coherence.detail?.gateway).toBe("sandbox");
  });

  it("never falls back to BigiSub when VTPass is not configured", () => {
    // This used to fall back to BIGISUB_BASE_URL and refuse the deployment
    // over a URL no request goes to. With VTPass unset the gateway is simply
    // unknown here — and vtu-service refuses every purchase on its own when
    // vtpass.isConfigured() is false, so nothing can be dispensed.
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        MILIPAY_ENVIRONMENT: "sandbox",
        BIGISUB_BASE_URL: "https://api.bigisub.ng",
      }),
    );
    expect(result.coherence.detail?.gateway).toBe("unknown");
    expect(result.coherence.reason ?? "").not.toContain("BIGISUB");
  });

  it("names VTPASS_BASE_URL when VTPass itself disagrees with the declaration", () => {
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        MILIPAY_ENVIRONMENT: "sandbox",
        VTPASS_BASE_URL: "https://vtpass.com/api",
        MONO_SECRET_KEY: "test_sk_abc123", // secret-scan: allow — fake fixture, only its test_ prefix matters
      }),
    );
    expect(result.coherence.ok).toBe(false);
    expect(result.coherence.reason).toContain("VTPASS_BASE_URL");
  });

  it("catches a production key smuggled into a sandbox deployment", () => {
    const result = readFulfilmentEnvironment(
      env({
        VTU_FULFILMENT_MODE: "live",
        MILIPAY_ENVIRONMENT: "sandbox",
        VTPASS_BASE_URL: "https://sandbox.vtpass.com/api",
        MONO_SECRET_KEY: "live_sk_abc123", // secret-scan: allow — fake fixture, only its live_ prefix matters
      }),
    );
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

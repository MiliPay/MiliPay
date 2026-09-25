import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FulfilmentError,
  extractToken,
  isConfigured,
  listVariations,
  normalizeNigerianPhone,
  pay,
  payPayload,
  requery,
  requestId,
  resolveServiceId,
  verifyMerchant,
  walletBalance,
} from "../supabase/functions/_shared/vtpass";
import { statusForVtpassResponse } from "../supabase/functions/_shared/vtu-state";

/**
 * The VTPass adapter, tested as a CONTRACT: what we send and how we read what
 * comes back.
 *
 * The transport tests below stand in for fetch, and that is deliberate and
 * limited. They prove the request is built the way VTPass documents it and
 * that each documented response is read the right way. They do NOT prove
 * VTPass behaves as documented — only the real sandbox run does that, and
 * nothing here replaces it. The response bodies are taken from VTPass's own
 * documentation, not invented.
 */

// ─────────────────────────────────────────────────────────────
// Pure parts
// ─────────────────────────────────────────────────────────────

describe("requestId", () => {
  it("starts with YYYYMMDDHHII in Lagos time, which is UTC+1 all year", () => {
    // 23:30 UTC is 00:30 the NEXT day in Lagos. Using UTC would stamp
    // yesterday, and VTPass requires the stamp to be today.
    expect(requestId("MP-BIL-ABC", "2026-09-25T23:30:00Z").slice(0, 12)).toBe("202609260030");
    expect(requestId("MP-BIL-ABC", "2026-01-05T08:07:00Z").slice(0, 12)).toBe("202601050907");
  });

  it("is the same every time for the same transaction", () => {
    // This is what lets requery() ask about the purchase pay() made, and what
    // lets VTPass recognise a replay instead of treating it as a new sale.
    const issuedAt = "2026-09-25T10:15:42.123Z";
    const reference = "MP-BIL-MFX2K9QZ-1A2B3C4D";
    expect(requestId(reference, issuedAt)).toBe(requestId(reference, issuedAt));
    expect(requestId(reference, new Date(issuedAt))).toBe(requestId(reference, issuedAt));
  });

  it("differs between transactions in the same minute", () => {
    const at = "2026-09-25T10:15:00Z";
    expect(requestId("MP-BIL-MFX2K9QZ-1A2B3C4D", at)).not.toBe(
      requestId("MP-BIL-MFX2K9QZ-9F8E7D6C", at),
    );
  });

  it("keeps only alphanumerics from the reference, lowercased, at most 12", () => {
    const id = requestId("MP-BIL-MFX2K9QZ-1A2B3C4D", "2026-09-25T10:15:00Z");
    expect(id).toMatch(/^\d{12}[a-z0-9]{1,12}$/);
    expect(id.slice(12)).toBe("k9qz1a2b3c4d");
  });

  it("refuses to build an id without a real timestamp", () => {
    // Defaulting to "now" would give every call a different id: no
    // deduplication at VTPass and a requery about a purchase it never saw.
    for (const bad of ["", "not a date", "2026-13-45"]) {
      expect(() => requestId("MP-BIL-X", bad), bad).toThrow(FulfilmentError);
    }
  });
});

describe("normalizeNigerianPhone", () => {
  it("turns international forms into the local 0-prefixed form", () => {
    expect(normalizeNigerianPhone("+2348011111111")).toBe("08011111111");
    expect(normalizeNigerianPhone("2348011111111")).toBe("08011111111");
    expect(normalizeNigerianPhone("0801 111 1111")).toBe("08011111111");
  });

  it("leaves the sandbox's scenario numbers alone", () => {
    // 201000000000 must not be read as a +234 number and rewritten.
    for (const n of ["08011111111", "201000000000", "300000000000", "400000000000"]) {
      expect(normalizeNigerianPhone(n), n).toBe(n);
    }
  });

  it("returns an empty string for nothing", () => {
    expect(normalizeNigerianPhone(undefined)).toBe("");
    expect(normalizeNigerianPhone("")).toBe("");
  });
});

describe("resolveServiceId", () => {
  it("maps each network to VTPass's serviceIDs — 9mobile is 'etisalat'", () => {
    expect(resolveServiceId("airtime", "mtn")).toBe("mtn");
    expect(resolveServiceId("data", "mtn")).toBe("mtn-data");
    expect(resolveServiceId("airtime", "9mobile")).toBe("etisalat");
    expect(resolveServiceId("data", "9mobile")).toBe("etisalat-data");
    expect(resolveServiceId("data", " GLO ")).toBe("glo-data");
  });

  it("maps billers", () => {
    expect(resolveServiceId("power", "ikedc")).toBe("ikeja-electric");
    expect(resolveServiceId("power", "phed")).toBe("portharcourt-electric");
    expect(resolveServiceId("cable", "dstv")).toBe("dstv");
    expect(resolveServiceId("cable", "startimes")).toBe("startimes");
  });

  it("returns null rather than guessing", () => {
    // Falling through to the raw key is how a request reaches a service that
    // does not exist, and a customer is charged for it.
    expect(resolveServiceId("airtime", "unknown-network")).toBeNull();
    expect(resolveServiceId("power", "mtn")).toBeNull();
    expect(resolveServiceId("cable", "ikedc")).toBeNull();
    expect(resolveServiceId("internet", "mtn")).toBeNull();
  });
});

describe("payPayload — the exact body sent to /pay", () => {
  const base = {
    reference: "MP-BIL-MFX2K9QZ-1A2B3C4D",
    issuedAt: "2026-09-25T10:15:00Z",
    phone: "08011111111",
  };

  it("airtime: exactly the documented body — request_id, serviceID, amount, phone", () => {
    // No billersCode, no variation, no subscription type: airtime's
    // documented purchase body has none of them.
    const body = payPayload({
      ...base, serviceType: "airtime", serviceId: "mtn", billersCode: "08011111111", baseAmount: 200,
    });
    expect(body).toEqual({
      request_id: requestId(base.reference, base.issuedAt),
      serviceID: "mtn",
      amount: 200,
      phone: "08011111111",
    });
  });

  it("every non-airtime service carries billersCode, which each requires", () => {
    for (const [serviceType, serviceId] of [["data", "mtn-data"], ["power", "ikeja-electric"], ["cable", "dstv"]]) {
      const body = payPayload({ ...base, serviceType, serviceId, billersCode: "X-IDENT", baseAmount: 1000, variationCode: "v" });
      expect(body.billersCode, serviceType).toBe("X-IDENT");
    }
  });

  it("data: carries the variation code", () => {
    const body = payPayload({
      ...base, serviceType: "data", serviceId: "mtn-data", billersCode: "08011111111",
      baseAmount: 1000, variationCode: "mtn-10mb-100",
    });
    expect(body.variation_code).toBe("mtn-10mb-100");
    expect(body).not.toHaveProperty("subscription_type");
  });

  it("power: the meter type IS the variation code", () => {
    const prepaid = payPayload({
      ...base, serviceType: "power", serviceId: "ikeja-electric", billersCode: "1111111111111",
      baseAmount: 1000, meterType: "prepaid",
    });
    expect(prepaid.variation_code).toBe("prepaid");
    expect(prepaid.billersCode).toBe("1111111111111");

    const postpaid = payPayload({
      ...base, serviceType: "power", serviceId: "ikeja-electric", billersCode: "1010101010101",
      baseAmount: 1000, meterType: "postpaid",
    });
    expect(postpaid.variation_code).toBe("postpaid");

    const unspecified = payPayload({
      ...base, serviceType: "power", serviceId: "ikeja-electric", billersCode: "1111111111111",
      baseAmount: 1000,
    });
    expect(unspecified.variation_code).toBe("prepaid");
  });

  it("DStv and GOtv: sends subscription_type, which they require", () => {
    // Without it VTPass rejects the purchase — every DStv and GOtv sale would
    // have been refunded.
    for (const serviceId of ["dstv", "gotv"]) {
      const body = payPayload({
        ...base, serviceType: "cable", serviceId, billersCode: "1212121212",
        baseAmount: 5000, variationCode: `${serviceId}-padi`,
      });
      expect(body.subscription_type, serviceId).toBe("change");
      expect(body.variation_code, serviceId).toBe(`${serviceId}-padi`);
    }
  });

  it("StarTimes: does NOT send subscription_type, which it does not take", () => {
    const body = payPayload({
      ...base, serviceType: "cable", serviceId: "startimes", billersCode: "1212121212",
      baseAmount: 1500, variationCode: "nova",
    });
    expect(body).not.toHaveProperty("subscription_type");
  });
});

describe("extractToken — prepaid electricity", () => {
  it("reads IKEDC's documented shape: token in purchased_code, units on their own", () => {
    expect(
      extractToken({
        purchased_code: "Token : 26362054405982757802",
        token: "Token : 26362054405982757802",
        units: "79.9 kWh",
      }),
    ).toEqual({ token: "26362054405982757802", units: "79.9 kWh" });
  });

  it("reads EKEDC's documented shape, whose units can be null", () => {
    expect(
      extractToken({
        purchased_code: "Token : 11786621902768210244",
        mainToken: "11786621902768210244",
        mainTokenUnits: null,
      }),
    ).toEqual({ token: "11786621902768210244" });

    expect(
      extractToken({ mainToken: "11786621902768210244", mainTokenUnits: 42.5 }),
    ).toEqual({ token: "11786621902768210244", units: "42.5 kWh" });
  });

  it("still reads units written inside purchased_code", () => {
    expect(extractToken({ purchased_code: "Token : 1234-5678 Units : 12.3 kWh" })).toEqual({
      token: "1234-5678",
      units: "12.3 kWh",
    });
  });

  it("never takes units from the meter number, whatever fields carry it", () => {
    // Deliberately different values. A response echoes the meter back in
    // several places; none of them may be read as units.
    const meter = "1111111111111";
    const withUnits = extractToken({
      purchased_code: "Token : 26362054405982757802",
      units: "79.9 kWh",
      meterNumber: meter,
      MeterNumber: meter,
      Meter_Number: meter,
      billersCode: meter,
      customerNumber: meter,
      content: { transactions: { unique_element: meter, product_name: "Ikeja Electric Payment - IKEDC" } },
    });
    expect(withUnits).toEqual({ token: "26362054405982757802", units: "79.9 kWh" });
    expect(withUnits.units).not.toContain(meter);
    expect(withUnits.token).not.toBe(meter);

    // With NO units in the response, the answer is "no units" — never the
    // meter number standing in for them.
    const withoutUnits = extractToken({
      purchased_code: `Token : 26362054405982757802 Meter : ${meter}`,
      meterNumber: meter,
      billersCode: meter,
      content: { transactions: { unique_element: meter } },
    });
    expect(withoutUnits).toEqual({ token: "26362054405982757802" });
    expect(withoutUnits).not.toHaveProperty("units");
  });

  it("does not read a non-positive or non-numeric mainTokenUnits as units", () => {
    for (const bad of [0, -5, "abc", "", null, undefined]) {
      expect(extractToken({ mainToken: "123", mainTokenUnits: bad }), String(bad)).toEqual({ token: "123" });
    }
  });

  it("returns nothing for airtime, data and cable", () => {
    expect(extractToken({ code: "000", content: { transactions: { status: "delivered" } } })).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────
// Transport — against a stand-in fetch
// ─────────────────────────────────────────────────────────────

const ENV: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

function setEnv(values: Record<string, string | undefined>) {
  for (const key of Object.keys(ENV)) delete ENV[key];
  Object.assign(ENV, values);
}

const CONFIGURED = {
  VTPASS_BASE_URL: "https://sandbox.vtpass.com/api/",
  VTPASS_API_KEY: "api-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_SECRET_KEY: "sk-fixture", // secret-scan: allow — fake fixture, not a credential
  VTPASS_PUBLIC_KEY: "pk-fixture", // secret-scan: allow — fake fixture, not a credential
};

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** Answers every call with `respond`, and records what was sent. */
function stubFetch(respond: (sent: Sent) => Response | Promise<Response>): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const record: Sent = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    sent.push(record);
    return respond(record);
  }) as typeof fetch;
  return sent;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PAY_ARGS = {
  serviceType: "airtime",
  serviceId: "mtn",
  reference: "MP-BIL-MFX2K9QZ-1A2B3C4D",
  billersCode: "08011111111",
  phone: "08011111111",
  baseAmount: 200,
  issuedAt: "2026-09-25T10:15:00Z",
};

beforeEach(() => {
  setEnv(CONFIGURED);
  (globalThis as any).Deno = { env: { get: (key: string) => ENV[key] } };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).Deno;
});

describe("configuration", () => {
  it("is configured only with a base URL, an api key and a secret key", () => {
    expect(isConfigured()).toBe(true);
    setEnv({ ...CONFIGURED, VTPASS_BASE_URL: undefined });
    expect(isConfigured()).toBe(false);
    setEnv({ ...CONFIGURED, VTPASS_SECRET_KEY: undefined });
    expect(isConfigured()).toBe(false);
  });

  it("has no default URL, so an unset one cannot quietly pick an environment", async () => {
    setEnv({ ...CONFIGURED, VTPASS_BASE_URL: undefined });
    const sent = stubFetch(() => json({}));
    await expect(pay(PAY_ARGS)).rejects.toThrow(FulfilmentError);
    expect(sent).toHaveLength(0);
  });
});

describe("pay()", () => {
  it("POSTs to /pay with api-key + secret-key", async () => {
    const sent = stubFetch(() =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } }),
    );
    await pay(PAY_ARGS);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://sandbox.vtpass.com/api/pay");
    expect(sent[0].method).toBe("POST");
    expect(sent[0].headers["api-key"]).toBe("api-fixture");
    expect(sent[0].headers["secret-key"]).toBe("sk-fixture");
    expect(sent[0].headers).not.toHaveProperty("public-key");
    expect(sent[0].body).toEqual(payPayload(PAY_ARGS));
  });

  it("000 + initiated: hands back the raw pair, which reads as pending — never delivered", async () => {
    // The adapter must not decide on its own; it reports exactly what VTPass
    // said, and the pair it reports must map to pending. Reading 000 alone as
    // success is the classic way a customer is told they have airtime they
    // have not got.
    stubFetch(() =>
      json({ code: "000", content: { transactions: { status: "initiated", transactionId: "171" } } }),
    );
    const result = await pay(PAY_ARGS);
    expect(result).toEqual({ operatorReference: "171", providerCode: "000", providerStatus: "initiated" });
    expect(statusForVtpassResponse(result.providerCode, result.providerStatus)).toBe("fulfilment_pending");
  });

  it("000 + delivered reads as delivered", async () => {
    stubFetch(() =>
      json({ code: "000", content: { transactions: { status: "delivered", transactionId: "171" } } }),
    );
    const result = await pay(PAY_ARGS);
    expect(statusForVtpassResponse(result.providerCode, result.providerStatus)).toBe("delivered");
  });

  it("hands back code and status raw, for vtu-state to judge together", async () => {
    stubFetch(() =>
      json({ code: "000", content: { transactions: { status: "pending", transactionId: "171" } } }),
    );
    const result = await pay(PAY_ARGS);
    // 000 with pending is NOT delivered. The adapter does not decide that.
    expect(result).toMatchObject({ providerCode: "000", providerStatus: "pending", operatorReference: "171" });
  });

  it("treats 014 (request_id already used) as indeterminate, never as failed", async () => {
    stubFetch(() => json({ code: "014", response_description: "REQUEST ID ALREADY EXIST" }));
    const err = await pay(PAY_ARGS).catch((e) => e);
    expect(err).toBeInstanceOf(FulfilmentError);
    expect(err.indeterminate).toBe(true);
    expect(err.providerCode).toBe("014");
  });

  it("treats a timeout as indeterminate — VTPass may have delivered", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const err = await pay(PAY_ARGS).catch((e) => e);
    expect(err).toBeInstanceOf(FulfilmentError);
    expect(err.indeterminate).toBe(true);
  });

  it("treats an HTML error page as indeterminate", async () => {
    stubFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const err = await pay(PAY_ARGS).catch((e) => e);
    expect(err.indeterminate).toBe(true);
  });

  it("returns a definite decline as a code, not an exception", async () => {
    stubFetch(() => json({ code: "016", content: { transactions: { status: "failed" } } }));
    await expect(pay(PAY_ARGS)).resolves.toMatchObject({ providerCode: "016", providerStatus: "failed" });
  });

  it("falls back to our own request_id when VTPass returns no transaction id", async () => {
    stubFetch(() => json({ code: "099" }));
    const result = await pay(PAY_ARGS);
    expect(result.operatorReference).toBe(payPayload(PAY_ARGS).request_id);
    expect(result.providerStatus).toBeUndefined();
  });

  it("treats an unreachable gateway as indeterminate too", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await pay(PAY_ARGS).catch((e) => e);
    expect(err.indeterminate).toBe(true);
    expect(err.message).toBe("Could not reach the telecom gateway");
  });
});

describe("requery()", () => {
  it("asks about the SAME request_id the purchase used", async () => {
    const sent = stubFetch(() => json({ code: "000", content: { transactions: { status: "delivered" } } }));
    await requery(PAY_ARGS.reference, PAY_ARGS.issuedAt);

    expect(sent[0].url).toBe("https://sandbox.vtpass.com/api/requery");
    expect(sent[0].method).toBe("POST");
    expect(sent[0].body).toEqual({ request_id: payPayload(PAY_ARGS).request_id });
  });

  it("reads the outcome and an electricity token", async () => {
    stubFetch(() =>
      json({
        code: "000",
        content: { transactions: { status: "delivered", transactionId: "1741610224" } },
        purchased_code: "Token : 26362054405982757802",
        units: "79.9 kWh",
      }),
    );
    await expect(requery(PAY_ARGS.reference, PAY_ARGS.issuedAt)).resolves.toEqual({
      providerCode: "000",
      providerStatus: "delivered",
      operatorReference: "1741610224",
      token: "26362054405982757802",
      units: "79.9 kWh",
    });
  });

  it("does NOT mark a failed lookup indeterminate — a lookup moves no money", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const err = await requery(PAY_ARGS.reference, PAY_ARGS.issuedAt).catch((e) => e);
    expect(err).toBeInstanceOf(FulfilmentError);
    expect(err.indeterminate).toBe(false);

    stubFetch(() => new Response("<html>502</html>", { status: 502 }));
    const html = await requery(PAY_ARGS.reference, PAY_ARGS.issuedAt).catch((e) => e);
    expect(html.indeterminate).toBe(false);
  });

  it("000 + initiated on requery stays pending", async () => {
    stubFetch(() => json({ code: "000", content: { transactions: { status: "initiated" } } }));
    const result = await requery(PAY_ARGS.reference, PAY_ARGS.issuedAt);
    expect(result).toMatchObject({ providerCode: "000", providerStatus: "initiated" });
    expect(statusForVtpassResponse(result.providerCode, result.providerStatus)).toBe("fulfilment_pending");
  });

  it("passes through a code it does not recognise, for vtu-state to call pending", async () => {
    // 015 is "request id does not exist". The adapter reports it; it does not
    // decide what it means.
    stubFetch(() => json({ code: "015", response_description: "INVALID REQUEST ID" }));
    await expect(requery(PAY_ARGS.reference, PAY_ARGS.issuedAt)).resolves.toEqual({
      providerCode: "015",
      providerStatus: undefined,
      operatorReference: undefined,
    });
  });
});

describe("listVariations()", () => {
  it("GETs the catalogue and prices each bundle as base + surcharge, rounded up", async () => {
    const sent = stubFetch(() =>
      json({
        response_description: "000",
        content: {
          ServiceName: "MTN Data",
          variations: [
            { variation_code: "mtn-10mb-100", name: "N100 100MB - 24 hrs", variation_amount: "100.00", fixedPrice: "Yes" },
            { variation_code: "mtn-50mb-200", name: "N200 200MB - 2 days", variation_amount: "199.50", fixedPrice: "No" },
          ],
        },
      }),
    );

    const variations = await listVariations("mtn-data", 10);

    expect(sent[0].url).toBe("https://sandbox.vtpass.com/api/service-variations?serviceID=mtn-data");
    expect(sent[0].method).toBe("GET");
    expect(sent[0].headers["public-key"]).toBe("pk-fixture");
    expect(variations).toEqual([
      {
        id: "mtn-10mb-100_100_0",
        variation_code: "mtn-10mb-100",
        name: "N100 100MB - 24 hrs",
        validity: "24 hrs",
        baseAmount: 100,
        surcharge: 10,
        price: 110,
        fixedPrice: true,
      },
      {
        id: "mtn-50mb-200_199.5_1",
        variation_code: "mtn-50mb-200",
        name: "N200 200MB - 2 days",
        validity: "2 days",
        baseAmount: 199.5,
        surcharge: 10,
        price: 210,
        fixedPrice: false,
      },
    ]);
  });

  it("reads VTPass's misspelled 'varations' key, which some services use", async () => {
    stubFetch(() =>
      json({ content: { varations: [{ variation_code: "dstv-padi", name: "Padi", variation_amount: "2950" }] } }),
    );
    const [only] = await listVariations("dstv", 0);
    expect(only).toMatchObject({ variation_code: "dstv-padi", baseAmount: 2950, price: 2950, validity: "" });
  });

  it("returns an empty list rather than inventing one", async () => {
    stubFetch(() => json({ content: {} }));
    await expect(listVariations("mtn-data", 0)).resolves.toEqual([]);
  });
});

describe("walletBalance()", () => {
  it("GETs /balance with api-key + public-key, and reads contents.balance", async () => {
    const sent = stubFetch(() => json({ code: 1, contents: { balance: 48250.5 } }));
    await expect(walletBalance()).resolves.toBe(48250.5);
    expect(sent[0].url).toBe("https://sandbox.vtpass.com/api/balance");
    expect(sent[0].method).toBe("GET");
    expect(sent[0].headers["public-key"]).toBe("pk-fixture");
    expect(sent[0].headers).not.toHaveProperty("secret-key");
  });

  it("falls back to the secret key only if no public key is set", async () => {
    setEnv({ ...CONFIGURED, VTPASS_PUBLIC_KEY: undefined });
    const sent = stubFetch(() => json({ contents: { balance: 10 } }));
    await walletBalance();
    expect(sent[0].headers["secret-key"]).toBe("sk-fixture");
  });

  it("answers null — unknown — when VTPass cannot be read, never 0", async () => {
    // 0 would refuse every sale whenever VTPass is briefly slow.
    stubFetch(() => {
      throw new Error("network down");
    });
    await expect(walletBalance()).resolves.toBeNull();

    stubFetch(() => json({ code: "087", response_description: "INVALID CREDENTIALS" }));
    await expect(walletBalance()).resolves.toBeNull();
  });

  it("also reads the singular content.balance shape", async () => {
    stubFetch(() => json({ content: { balance: "1200.75" } }));
    await expect(walletBalance()).resolves.toBe(1200.75);
  });
});

describe("verifyMerchant()", () => {
  it("reads the holder and the biller's own minimum", async () => {
    const sent = stubFetch(() =>
      json({
        code: "000",
        content: {
          Customer_Name: "TestMeter1",
          Address: "Abule-Egba BU ABULE",
          Min_Purchase_Amount: 500,
        },
      }),
    );
    await expect(
      verifyMerchant({ serviceId: "ikeja-electric", billersCode: "1111111111111", type: "prepaid" }),
    ).resolves.toMatchObject({
      customerName: "TestMeter1",
      customerAddress: "Abule-Egba BU ABULE",
      minAmount: 500,
    });
    expect(sent[0].url).toBe("https://sandbox.vtpass.com/api/merchant-verify");
    expect(sent[0].body).toEqual({ billersCode: "1111111111111", serviceID: "ikeja-electric", type: "prepaid" });
  });

  it("treats an error inside a 000 response as a failed verification", async () => {
    // VTPass reports a bad meter as code 000 with content.error, so reading
    // the code alone would call it verified.
    stubFetch(() => json({ code: "000", content: { error: "Meter number is invalid" } }));
    const err = await verifyMerchant({ serviceId: "ikeja-electric", billersCode: "999" }).catch((e) => e);
    expect(err).toBeInstanceOf(FulfilmentError);
    expect(err.message).toBe("Meter number is invalid");
    expect(err.indeterminate).toBe(false);
  });

  it("reads VTPass's documented IKEDC example — whose Min_Purchase_Amount is empty", async () => {
    // Verbatim from the IKEDC page. Min_Purchase_Amount is "" and
    // Minimum_Amount is "" too, so there is no minimum; the meter number in
    // the response must not leak into anything we return.
    stubFetch(() =>
      json({
        code: "000",
        content: {
          Customer_Name: "TESTMETER1",
          Address: "ABULE EGBA BU ABULE",
          Meter_Number: "68100017372",
          Customer_Arrears: "",
          Minimum_Amount: "",
          Min_Purchase_Amount: "",
          Can_Vend: "yes",
          Customer_Account_Type: "PRIME",
          Meter_Type: "PREPAID",
          WrongBillersCode: false,
        },
      }),
    );
    const verified = await verifyMerchant({ serviceId: "ikeja-electric", billersCode: "1111111111111", type: "prepaid" });
    expect(verified).toMatchObject({ customerName: "TESTMETER1", customerAddress: "ABULE EGBA BU ABULE", minAmount: null });
    expect(verified.minAmount).not.toBe(68100017372);
  });

  it("falls through an empty Min_Purchase_Amount to Minimum_Amount", async () => {
    // The `??` this replaced stopped at "" and reported no minimum at all.
    stubFetch(() =>
      json({ code: "000", content: { Customer_Name: "A", Min_Purchase_Amount: "", Minimum_Amount: "1500" } }),
    );
    await expect(verifyMerchant({ serviceId: "eko-electric", billersCode: "1", type: "prepaid" })).resolves.toMatchObject({
      minAmount: 1500,
    });
  });

  it("refuses WrongBillersCode: true even when a name is present", async () => {
    // VTPass's documented signal for a bad number. It must win over any name.
    stubFetch(() =>
      json({ code: "000", content: { Customer_Name: "SOMEONE ELSE", WrongBillersCode: true } }),
    );
    const err = await verifyMerchant({ serviceId: "ikeja-electric", billersCode: "999", type: "prepaid" }).catch((e) => e);
    expect(err).toBeInstanceOf(FulfilmentError);
    expect(err.message).toMatch(/not recognised/);
  });

  it("refuses a meter the disco says it cannot vend to — before anyone pays", async () => {
    stubFetch(() => json({ code: "000", content: { Customer_Name: "A", Can_Vend: "No" } }));
    await expect(
      verifyMerchant({ serviceId: "ikeja-electric", billersCode: "1111111111111", type: "prepaid" }),
    ).rejects.toThrow(/cannot be credited/);
  });

  it("does not block when Can_Vend is absent — absent is unknown, not no", async () => {
    stubFetch(() => json({ code: "000", content: { Customer_Name: "A" } }));
    await expect(verifyMerchant({ serviceId: "dstv", billersCode: "1212121212" })).resolves.toMatchObject({
      customerName: "A",
    });
  });

  it("reads a smartcard's current bouquet, and leaves an absent minimum as null", async () => {
    const sent = stubFetch(() =>
      json({ code: "000", content: { Customer_Name: "Test DSTV", Current_Bouquet: "DStv Compact" } }),
    );
    await expect(verifyMerchant({ serviceId: "dstv", billersCode: "1212121212" })).resolves.toMatchObject({
      customerName: "Test DSTV",
      customerAddress: null,
      minAmount: null,
      currentBouquet: "DStv Compact",
    });
    // No meter type for a smartcard, so none is sent.
    expect(sent[0].body).toEqual({ billersCode: "1212121212", serviceID: "dstv" });
  });

  it("uses a generic message when VTPass's error is not a string", async () => {
    stubFetch(() => json({ code: "000", content: { errors: { billersCode: ["invalid"] } } }));
    await expect(verifyMerchant({ serviceId: "gotv", billersCode: "1" })).rejects.toThrow(
      "That account could not be verified.",
    );
  });

  it("refuses a response with no name", async () => {
    stubFetch(() => json({ code: "000", content: { Customer_Name: "  " } }));
    await expect(verifyMerchant({ serviceId: "dstv", billersCode: "1212121212" })).rejects.toThrow(
      "could not be verified",
    );
  });
});

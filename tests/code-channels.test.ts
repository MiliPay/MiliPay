import { describe, expect, it } from "vitest";
import { channelsFor, enabledChannels, pickChannel, voiceText } from "../supabase/functions/_shared/code-channels";

/**
 * One-time codes: the person picks SMS (the default), a call, email or
 * WhatsApp, among the ways that are switched on and suit what the code is for.
 * Agreed with the founder on 2026-10-20.
 */

const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
const everything = env({ TERMII_VOICE: "on", TERMII_WHATSAPP: "on", RESEND_API_KEY: "k", EMAIL_FROM: "MiliPay <a@b.ng>" });

describe("which ways are on", () => {
  it("SMS always; the rest only once set up", () => {
    expect(enabledChannels(env({}), false)).toEqual(["sms"]);
    expect(enabledChannels(everything, false)).toEqual(["sms", "call", "email", "whatsapp"]);
    expect(enabledChannels(env({ RESEND_API_KEY: "k" }), false)).toEqual(["sms"]);
  });

  it("the testing console offers call and email, never WhatsApp", () => {
    expect(enabledChannels(env({}), true)).toEqual(["sms", "call", "email"]);
  });
});

describe("what each code is for", () => {
  it("sign-in and password reset may use any way", () => {
    expect(channelsFor("sign_in", everything, false)).toEqual(["sms", "call", "email", "whatsapp"]);
    expect(channelsFor("password_reset", everything, false)).toEqual(["sms", "call", "email", "whatsapp"]);
  });

  it("proving a phone or consenting in front of an agent never uses email", () => {
    expect(channelsFor("prove_phone", everything, false)).toEqual(["sms", "call", "whatsapp"]);
    expect(channelsFor("consent", everything, false)).toEqual(["sms", "call", "whatsapp"]);
  });

  it("SMS when nothing is asked; refused when it isn't allowed or isn't on", () => {
    expect(pickChannel(undefined, "sign_in", env({}), false)).toBe("sms");
    expect(pickChannel("CALL", "sign_in", everything, false)).toBe("call");
    expect(pickChannel("email", "prove_phone", everything, false)).toBeNull();
    expect(pickChannel("whatsapp", "sign_in", env({}), false)).toBeNull();
    expect(pickChannel(42, "sign_in", everything, false)).toBeNull();
  });
});

it("a call reads the code digit by digit, twice", () => {
  expect(voiceText("123456")).toBe("Your MiliPay code is 1 2 3 4 5 6. Again, your code is 1 2 3 4 5 6. MiliPay will never ask you for this code.");
});

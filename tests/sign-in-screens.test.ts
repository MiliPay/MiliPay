import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENROL_STEPS,
  LOCK_AFTER_MS,
  allSetCopy,
  doneRows,
  fmtPhone,
  maskedPhone,
  palmCardCopy,
  passwordRules,
  passwordStrength,
  passwordValid,
  phoneDigits,
  pinCopy,
  shouldLock,
  stepOneButton,
  stepOneCopy,
} from "../mobile-app/src/lib/onboardingView";

/**
 * Sign-in and first setup (redesign phase 6): Welcome, log in by code,
 * create password, PIN, fingerprint, "You're all set", and Unlock.
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the design's words and rules", () => {
  it("step 1", () => {
    expect(stepOneCopy(false, null).title).toBe("Log in to MiliPay");
    expect(stepOneCopy(true, "+234 803 123 4567").sub).toBe("We sent a 6-digit code by SMS to +234 803 123 4567.");
    expect(stepOneButton(false, false)).toBe("Send code");
    expect(stepOneButton(false, true)).toBe("Sending code…");
    expect(stepOneButton(true, false)).toBe("Verify");
    expect(stepOneButton(true, true)).toBe("Verifying…");
  });

  it("phone as it is typed, and as Unlock shows it", () => {
    expect(phoneDigits("+0803-123 45678 9")).toBe("08031234567");
    expect(fmtPhone("0803")).toBe("0803");
    expect(fmtPhone("0803123")).toBe("0803 123");
    expect(fmtPhone("08031234567")).toBe("0803 123 4567");
    expect(maskedPhone("08031234567")).toBe("0803 ••• 4567");
    expect(maskedPhone("+2348031234567")).toBe("0803 ••• 4567");
    expect(maskedPhone("")).toBe("");
  });

  it("password strength: 4 segments, and the prototype's thresholds", () => {
    expect(passwordStrength("")).toEqual({ segments: 0, tone: "fail", label: "" });
    expect(passwordStrength("abcdefgh")).toMatchObject({ segments: 2, label: "Weak" }); // 0.3
    expect(passwordStrength("abcdefg1")).toMatchObject({ segments: 3, label: "Okay", tone: "warn" }); // 0.6
    expect(passwordStrength("abcdefgh1234")).toMatchObject({ segments: 4, label: "Strong", tone: "brand" }); // 0.8
    expect(passwordStrength("abcdefgh123!")).toMatchObject({ segments: 4, label: "Strong" }); // 1.0
  });

  it("password rules: 8 characters, a letter and a number, both match", () => {
    expect(passwordRules("abc", "").map((r) => r.ok)).toEqual([false, false, false]);
    expect(passwordRules("abcdefg1", "abcdefg1").map((r) => r.ok)).toEqual([true, true, true]);
    expect(passwordValid("abcdefgh", "abcdefgh")).toBe(false);
    expect(passwordValid("abcdefg1", "abcdefg2")).toBe(false);
    expect(passwordValid("abcdefg1", "abcdefg1")).toBe(true);
  });

  it("PIN", () => {
    expect(pinCopy(false).title).toBe("Set your 4-digit PIN");
    expect(pinCopy(true)).toEqual({ title: "Enter your PIN again", sub: "Just to make sure you remember it." });
  });

  it("not yet enrolled: the 4 steps", () => {
    expect(ENROL_STEPS.map((s) => s.title)).toEqual([
      "Visit a MiliPay agent",
      "Palm vein capture",
      "Get verified",
      "Log in with a code",
    ]);
  });

  it("all set says only what is true", () => {
    expect(doneRows({ hasPalm: true, fingerprint: true }).map((r) => r.label)).toEqual([
      "Palm vein captured",
      "Account verified",
      "Password and PIN set",
      "Fingerprint unlock on",
    ]);
    expect(doneRows({ hasPalm: false, fingerprint: false }).map((r) => r.label)).toEqual(["Account verified", "Password and PIN set"]);
    expect(allSetCopy("Ada", true).title).toBe("You're all set, Ada");
    expect(allSetCopy("Ada", false).sub).toMatch(/Visit a MiliPay agent/);
    expect(palmCardCopy(true)).toMatchObject({ title: "Palm Pay is active", live: true });
    expect(palmCardCopy(false).live).toBe(false);
  });

  it("locks again only after 5 minutes away, and only with fingerprint on", () => {
    expect(shouldLock(0, LOCK_AFTER_MS, true)).toBe(true);
    expect(shouldLock(0, LOCK_AFTER_MS - 1, true)).toBe(false);
    expect(shouldLock(0, LOCK_AFTER_MS, false)).toBe(false);
    expect(shouldLock(null, LOCK_AFTER_MS, true)).toBe(false);
  });
});

describe("wiring", () => {
  const nav = read("mobile-app/src/navigation/AppNavigator.tsx");
  const store = read("mobile-app/src/store/useStore.ts");

  it("signed out, locked, setup, fingerprint offer, then the tabs — in that order", () => {
    const order = ["<AuthNavigator />", "<UnlockScreen />", "<OnboardingNavigator />", '<FingerprintSetupScreen mode="offer" />', "<TabNavigator />"];
    const at = order.map((s) => nav.indexOf(s));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("a saved session with fingerprint on opens locked", () => {
    expect(store).toMatch(/locked: biometricOn/);
  });

  it("signing out forgets this person's fingerprint unlock", () => {
    const logout = store.slice(store.indexOf("logout: async () => {"), store.indexOf("updateProfile: async"));
    expect(logout.length).toBeGreaterThan(100);
    expect(logout).toMatch(/setBiometricUnlockEnabled\(false\)/);
    expect(logout).toMatch(/locked: false/);
  });

  it("Unlock's password is a real sign-in; the code screen goes through the server", () => {
    const unlock = read("mobile-app/src/screens/auth/UnlockScreen.tsx");
    expect(unlock).toMatch(/await login\(phone, password\)/);
    const phone = read("mobile-app/src/screens/auth/PhoneLoginScreen.tsx");
    expect(phone).toMatch(/verifyLoginCode\(requestId, value\)/);
    expect(phone).toMatch(/submitLoginPin\(requestId, next\)/);
    const client = read("mobile-app/src/lib/loginCode.ts");
    expect(client).toMatch(/supabase\.auth\.verifyOtp\(\{ token_hash: tokenHash, type: 'email' \}\)/);
  });

  it("signed out, a password still gets you in when no SMS code can be had", () => {
    const auth = read("mobile-app/src/navigation/AuthNavigator.tsx");
    expect(auth).toMatch(/name="PasswordLogin" component=\{UnlockScreen\}/);
    expect(read("mobile-app/src/screens/auth/PhoneLoginScreen.tsx")).toMatch(/navigation\.navigate\('PasswordLogin'\)/);
    const unlock = read("mobile-app/src/screens/auth/UnlockScreen.tsx");
    // That route never asks for a fingerprint it has no session for.
    expect(unlock).toMatch(/if \(asked\.current \|\| standalone\) return;/);
  });

  it("the password and PIN steps save on the server before moving on", () => {
    const pw = read("mobile-app/src/screens/auth/CreatePasswordScreen.tsx");
    expect(pw.indexOf("await changePassword(pw)")).toBeLessThan(pw.indexOf("navigation.navigate('PinSetup')"));
    const pin = read("mobile-app/src/screens/auth/PinSetupScreen.tsx");
    expect(pin.indexOf("await setPinOnServer(next)")).toBeLessThan(pin.indexOf("navigation.navigate('FingerprintSetup')"));
  });

  it("no agent-issued password is promised anywhere in the app", () => {
    for (const file of [
      "mobile-app/src/screens/auth/UnlockScreen.tsx",
      "mobile-app/src/screens/auth/PhoneLoginScreen.tsx",
      "mobile-app/src/screens/auth/WelcomeScreen.tsx",
    ]) {
      expect(read(file)).not.toMatch(/password was sent/i);
    }
  });
});

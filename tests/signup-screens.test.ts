import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LGAS,
  STATES,
  SU_BACK,
  SU_STEP,
  addressReady,
  barFilled,
  clampDob,
  dobFromIso,
  dobIso,
  dobLabel,
  fmtNin,
  ninDigits,
  ninReady,
  triesLeft,
} from "../mobile-app/src/lib/signupView";
import { changePasswordRules, changePasswordStrength, pinCopy, resetPhoneDisplay, signupDoneRows } from "../mobile-app/src/lib/onboardingView";
import { palmChip, palmHeroLine } from "../mobile-app/src/lib/palmView";
import { tierNeeds, TIER_INFO } from "../mobile-app/src/lib/limitsView";
import { NG_STATES } from "../supabase/functions/_shared/signup";
import { captureSelfie, registerSelfieCapture } from "../mobile-app/src/lib/smileSelfie";

/**
 * The app side of self sign-up (Tier 1), Tier 1 across the app, and Change
 * password (design handoff, October 2026 additions).
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("sign-up steps", () => {
  it("step numbers and Back, as the prototype's SU_STEP / suBack", () => {
    expect(SU_STEP).toMatchObject({ phone: 1, code: 1, nin: 2, selfie: 3, selfieFail: 3, confirm: 3, addr: 4 });
    expect(SU_BACK).toMatchObject({ phone: null, code: "phone", nin: "phone", selfie: "nin", confirm: "selfie", addr: "confirm" });
    expect(barFilled(3)).toEqual([true, true, true, false, false]);
  });

  it("NIN and date of birth", () => {
    expect(ninDigits("1234-567 89012x")).toBe("12345678901");
    expect(fmtNin("12345678901")).toBe("1234 567 8901");
    expect(dobLabel(null)).toBe("Choose a date");
    expect(dobLabel({ d: 14, m: 2, y: 1994 })).toBe("14 Mar 1994");
    expect(dobIso({ d: 4, m: 0, y: 1994 })).toBe("1994-01-04");
    expect(dobFromIso("1994-03-14")).toEqual({ d: 14, m: 2, y: 1994 });
    // 31 February becomes the last day of February.
    expect(clampDob({ d: 31, m: 1, y: 1996 })).toEqual({ d: 29, m: 1, y: 1996 });
    expect(ninReady("12345678901", { d: 1, m: 0, y: 1990 }, false)).toBe(false);
    expect(ninReady("12345678901", { d: 1, m: 0, y: 1990 }, true)).toBe(true);
  });

  it("the app's states are exactly the ones the server accepts", () => {
    expect([...STATES]).toEqual([...NG_STATES]);
    expect(STATES).toHaveLength(37);
  });

  it("the LGA lists are complete for the states that have one", () => {
    expect(LGAS.Lagos).toHaveLength(20);
    expect(LGAS["FCT (Abuja)"]).toHaveLength(6);
    expect(LGAS.Ogun).toHaveLength(20);
    expect(LGAS.Rivers).toHaveLength(23);
    for (const s of Object.keys(LGAS)) expect(STATES).toContain(s);
  });

  it("address and the selfie counter", () => {
    expect(addressReady("Lagos", "Ikeja", "14 Admiralty Way")).toBe(true);
    expect(addressReady("", "Ikeja", "14 Admiralty Way")).toBe(false);
    expect(triesLeft(2)).toBe("2 tries left");
    expect(triesLeft(1)).toBe("1 try left");
  });

  it("step 5 and the done screen say sign-up's own words", () => {
    expect(pinCopy(false, true).sub).toBe("You'll use it to approve payments and unlock the app.");
    expect(signupDoneRows(false)).toEqual(["Phone number verified", "NIN verified with NIMC", "Selfie matched", "Password and PIN set"]);
    expect(signupDoneRows(true)).toContain("Fingerprint unlock on");
  });
});

describe("the selfie", () => {
  it("until Smile ID's SDK is in the app, it says so rather than pretending a check happened", async () => {
    registerSelfieCapture(null);
    const r = await captureSelfie({ token: "t", partnerId: "1", sandbox: true, callbackUrl: "", idInfo: { country: "NG", idType: "NIN_V2", idNumber: "1" } });
    expect(r.kind).toBe("failed");
  });

  it("a name is only shown from what the server returned after the match", () => {
    const screen = read("mobile-app/src/screens/auth/SignupScreen.tsx");
    expect(screen).toMatch(/person\?\.fullName/);
    expect(screen).not.toMatch(/setPerson\(\{/);
  });
});

describe("Tier 1 across the app", () => {
  it("Palm tab: gold Tier 1 chip and the add-your-palm line", () => {
    expect(palmChip({ hasPalm: false, paused: false }, 1)).toEqual({ label: "Tier 1", tone: "gold" });
    expect(palmChip({ hasPalm: false, paused: false }, 2).label).toBe("Not set up");
    expect(palmHeroLine({ hasPalm: false, paused: false })).toMatch(/^You can pay bills and buy airtime and data now/);
  });

  it("Account limits: Tier 1 is Phone, NIN and selfie; Tier 2 is the agent visit", () => {
    expect(TIER_INFO[1].confirmed).toBe("Phone, NIN and selfie verified");
    expect(tierNeeds(2, 1)).toBe("Visit an agent with your NIN for palm capture");
    expect(tierNeeds(2, 2)).toBe(TIER_INFO[2].needs);
  });

  it("the Palm tab hides pause and pays-from until there is a palm", () => {
    const palm = read("mobile-app/src/screens/main/PalmScreen.tsx");
    expect(palm).toMatch(/\{hasPalm \? \(\s*<View style=\{cardStyle\}>/);
  });
});

describe("Change password", () => {
  it("the checklist, with the 'different' rule only when the current one is asked for", () => {
    expect(changePasswordRules("old12345", "new12345", "new12345", false).map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(changePasswordRules("same1234", "same1234", "same1234", false)[2].ok).toBe(false);
    expect(changePasswordRules("", "new12345", "new12345", true).map((r) => r.label)).not.toContain(
      "Different from your current password",
    );
  });

  it("strength and the pre-filled number", () => {
    expect(changePasswordStrength("")).toMatchObject({ segments: 0 });
    expect(changePasswordStrength("abcdefg1")).toMatchObject({ segments: 2, colour: "#FFB454" });
    expect(changePasswordStrength("Abcdefg1!")).toMatchObject({ segments: 4, colour: "#00C896" });
    expect(resetPhoneDisplay("08031234567")).toBe("803 123 4567");
  });

  it("Me › Security opens it, and the server does the checking", () => {
    expect(read("mobile-app/src/screens/main/SettingsScreen.tsx")).toMatch(/navigation\.navigate\('ChangePassword'\)/);
    expect(read("mobile-app/src/navigation/TabNavigator.tsx")).toMatch(/name="ChangePassword" component=\{ChangePasswordScreen\}/);
    const client = read("mobile-app/src/lib/passwordClient.ts");
    expect(client).toMatch(/functions\.invoke\('password'/);
  });
});

describe("wiring", () => {
  it("Welcome: Create an account, I already have an account, and the agent link", () => {
    const welcome = read("mobile-app/src/screens/auth/WelcomeScreen.tsx");
    for (const s of ['label="Create an account"', 'label="I already have an account"', "Have a palm? Enrol at an agent", "Continue signing up", "Start again"]) {
      expect(welcome).toContain(s);
    }
    expect(read("mobile-app/src/navigation/AuthNavigator.tsx")).toMatch(/name="Signup" component=\{SignupScreen\}/);
  });

  it("the resume key lives in SecureStore, never plain storage", () => {
    const client = read("mobile-app/src/lib/signupClient.ts");
    expect(client).toMatch(/SecureStore\.setItemAsync/);
    expect(client).not.toMatch(/AsyncStorage/);
  });

  it("the account is created by the server, then the app signs in with its one-time token", () => {
    const screen = read("mobile-app/src/screens/auth/SignupScreen.tsx");
    expect(screen.indexOf("await submitAddress(saved")).toBeLessThan(screen.indexOf("await signInNewAccount(r.tokenHash)"));
  });

  it("a bank account in someone else's name opens the design's sheet", () => {
    const linking = read("mobile-app/src/components/banks/BankLinking.tsx");
    expect(linking).toMatch(/err\?\.code === 'NAME_MISMATCH'/);
    expect(linking).toContain("This account isn't in your name");
  });
});

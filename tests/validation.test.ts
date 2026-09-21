import { describe, expect, it } from "vitest";
import {
  isValidBvn,
  isValidNigerianPhone,
  isValidNin,
  validateCustomerDraft,
} from "../packages/shared/src/lib/utils/validation";

const completeDraft = {
  fullName: "Adeola Okafor",
  dateOfBirth: "1990-04-12",
  gender: "female",
  nin: "12345678901",
  bvn: "",
  phone: "08012345678",
  email: "adeola@example.com",
  address: "14 Bode Thomas Street, Surulere",
  state: "Lagos",
  palmVeinTemplate: "PVT-real-template",
  faceTemplate: "FACE-real-template",
};

const fieldsIn = (errors: { field: string }[]) => errors.map((e) => e.field);

describe("isValidNigerianPhone", () => {
  it("accepts local and international forms", () => {
    for (const phone of ["08012345678", "07012345678", "09012345678", "+2348012345678"]) {
      expect(isValidNigerianPhone(phone), phone).toBe(true);
    }
  });

  it("rejects wrong lengths, wrong prefixes and non-Nigerian numbers", () => {
    for (const phone of ["0801234567", "080123456789", "06012345678", "+448012345678", ""]) {
      expect(isValidNigerianPhone(phone), phone).toBe(false);
    }
  });
});

describe("isValidNin", () => {
  it("requires exactly 11 digits", () => {
    expect(isValidNin("12345678901")).toBe(true);
    expect(isValidNin("1234567890")).toBe(false);
    expect(isValidNin("123456789012")).toBe(false);
    expect(isValidNin("1234567890a")).toBe(false);
    expect(isValidNin("")).toBe(false);
  });
});

describe("isValidBvn", () => {
  it("is optional but must be well-formed when supplied", () => {
    expect(isValidBvn("")).toBe(true);
    expect(isValidBvn("   ")).toBe(true);
    expect(isValidBvn("12345678901")).toBe(true);
    expect(isValidBvn("1234")).toBe(false);
  });
});

describe("validateCustomerDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateCustomerDraft(completeDraft)).toEqual([]);
  });

  it("requires a palm vein capture", () => {
    const errors = validateCustomerDraft({ ...completeDraft, palmVeinTemplate: "" });
    expect(fieldsIn(errors)).toContain("palmVein");
  });

  it("requires a facial capture", () => {
    const errors = validateCustomerDraft({ ...completeDraft, faceTemplate: "" });
    expect(fieldsIn(errors)).toContain("face");
  });

  it("treats email as optional but validates it when present", () => {
    expect(validateCustomerDraft({ ...completeDraft, email: "" })).toEqual([]);
    expect(fieldsIn(validateCustomerDraft({ ...completeDraft, email: "not-an-email" })))
      .toContain("email");
  });

  it("reports every missing field at once rather than one at a time", () => {
    // The wizard shows errors per step, so it needs the whole set.
    const errors = validateCustomerDraft({
      ...completeDraft,
      fullName: "",
      dateOfBirth: "",
      gender: "",
      nin: "",
      address: "",
      state: "",
    });
    expect(fieldsIn(errors)).toEqual(
      expect.arrayContaining(["fullName", "dateOfBirth", "gender", "nin", "address", "state"])
    );
  });

  it("rejects a draft whose BVN is present but malformed", () => {
    expect(fieldsIn(validateCustomerDraft({ ...completeDraft, bvn: "123" }))).toContain("bvn");
  });
});

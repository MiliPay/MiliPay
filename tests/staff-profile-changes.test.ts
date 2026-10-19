import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  approverText,
  describeChanges,
  passwordError,
  profileDraftChanged,
  profileDraftError,
} from "../packages/shared/src/features/staff/profileChanges";
import { profileChangesOf } from "../packages/shared/src/features/navCounts/useNavCounts";

/**
 * Staff edit their own profile (20261019090000_staff_profile_changes.sql).
 * The email never changes. Passwords change at once. Name, phone and state:
 * a super admin's apply at once; an admin's need a super admin; an agent's
 * or support's need an admin or a super admin; nobody decides their own.
 * The rules were also run against the development database on 2026-10-19.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL = read("supabase/migrations/20261019090000_staff_profile_changes.sql");
const fn = (name: string) => {
  const body = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`));
  return body.slice(0, body.indexOf("$$;"));
};

describe("who approves", () => {
  it("the server's table: admin by a super admin, agent and support by either admin role", () => {
    const f = fn("staff_profile_approver_roles");
    expect(f).toMatch(/WHEN 'admin' THEN ARRAY\['super_admin'\]/);
    expect(f).toMatch(/WHEN 'agent' THEN ARRAY\['admin', 'super_admin'\]/);
    expect(f).toMatch(/WHEN 'support' THEN ARRAY\['admin', 'super_admin'\]/);
  });

  it("the portal says the same in words", () => {
    expect(approverText("super_admin")).toBeNull();
    expect(approverText("admin")).toBe("a super admin");
    expect(approverText("agent")).toBe("an admin or a super admin");
    expect(approverText("support")).toBe("an admin or a super admin");
  });

  it("a super admin's own change applies at once; everyone else's waits", () => {
    const f = fn("request_staff_profile_change");
    expect(f).toMatch(/IF v_s\.role = 'super_admin' THEN\s+PERFORM public\.apply_staff_profile_changes/);
    expect(f).toMatch(/INSERT INTO public\.staff_profile_changes/);
  });

  it("nobody decides their own request, and the approver is checked against the role at decision time", () => {
    const f = fn("decide_staff_profile_change");
    expect(f).toMatch(/v_c\.staff_id = auth\.uid\(\)[\s\S]*cannot decide your own request/);
    expect(f).toMatch(/SELECT \* INTO v_s FROM public\.staff_profiles WHERE id = v_c\.staff_id;\s+IF NOT \(v_role = ANY \(public\.staff_profile_approver_roles\(v_s\.role\)\)\)/);
    expect(f).toMatch(/NOT p_approve AND v_note IS NULL[\s\S]*reason for rejecting/);
    expect(f).toMatch(/FOR UPDATE/);
  });

  it("the queue shows only what the caller may decide, never their own", () => {
    const f = fn("staff_profile_change_queue");
    expect(f).toMatch(/assert_admin/);
    expect(f).toMatch(/c\.staff_id <> auth\.uid\(\)/);
    expect(f).toMatch(/v_role = ANY \(public\.staff_profile_approver_roles\(s\.role\)\)/);
  });
});

describe("what can change", () => {
  it("only name, phone and state are ever written; the email is not", () => {
    const apply = fn("apply_staff_profile_changes");
    expect(apply).toMatch(/full_name =/);
    expect(apply).toMatch(/phone\s+=/);
    expect(apply).toMatch(/state\s+=/);
    expect(apply).not.toMatch(/email/);
    expect(fn("request_staff_profile_change")).not.toMatch(/email/i);
  });

  it("the name on the sign-in account follows an approved name", () => {
    expect(fn("apply_staff_profile_changes")).toMatch(/raw_user_meta_data[\s\S]*full_name/);
  });

  it("every request, withdrawal and decision is audited", () => {
    expect(fn("request_staff_profile_change")).toMatch(/log_audit_event\('Staff', 'updated their own profile'/);
    expect(fn("request_staff_profile_change")).toMatch(/log_audit_event\('Staff', 'asked to change their profile'/);
    expect(fn("withdraw_staff_profile_change")).toMatch(/log_audit_event\('Staff', 'withdrew their profile change'/);
    expect(fn("decide_staff_profile_change")).toMatch(/approved a profile change for' ELSE 'rejected a profile change for'/);
  });

  it("the table and the internal writer are closed to the browser", () => {
    expect(SQL).toMatch(/REVOKE ALL ON public\.staff_profile_changes FROM PUBLIC, anon, authenticated;/);
    expect(SQL).toMatch(/GRANT ALL ON public\.staff_profile_changes TO service_role;/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.apply_staff_profile_changes\(uuid, jsonb\) FROM PUBLIC, anon, authenticated;/);
    expect(SQL).toMatch(/staff_profile_changes_one_open[\s\S]*WHERE status = 'pending'/);
  });
});

describe("the form", () => {
  const me = { name: "Amina Yusuf", phone: "08031234567", state: "Lagos" };

  it("checks the name and phone the way the server does", () => {
    expect(profileDraftError({ fullName: "Amina Yusuf", phone: "0803 123 4567", state: "" })).toBeNull();
    expect(profileDraftError({ fullName: "Amina Yusuf", phone: "+2348031234567", state: "" })).toBeNull();
    expect(profileDraftError({ fullName: "A", phone: "08031234567", state: "" })).toMatch(/full name/);
    expect(profileDraftError({ fullName: "Amina Yusuf", phone: "12345", state: "" })).toMatch(/Nigerian phone/);
  });

  it("only offers to save when something differs", () => {
    expect(profileDraftChanged({ fullName: " Amina  Yusuf ", phone: "0803 123 4567", state: "Lagos" }, me)).toBe(false);
    expect(profileDraftChanged({ fullName: "Amina Bello", phone: "08031234567", state: "Lagos" }, me)).toBe(true);
    expect(profileDraftChanged({ fullName: "Amina Yusuf", phone: "08031234567", state: "" }, me)).toBe(true);
  });

  it("lists a request's changes in a fixed order with a dash for empty", () => {
    expect(describeChanges({ state: "Kano", full_name: "Amina Bello" }, { state: null, full_name: "Amina Yusuf" })).toEqual([
      { label: "Name", from: "Amina Yusuf", to: "Amina Bello" },
      { label: "State", from: "—", to: "Kano" },
    ]);
  });

  it("a new password needs 8 characters, typed the same twice", () => {
    expect(passwordError("short", "short")).toMatch(/8 characters/);
    expect(passwordError("long enough", "long enougj")).toMatch(/don't match/);
    expect(passwordError("long enough", "long enough")).toBeNull();
  });
});

describe("the portals", () => {
  it("every staff portal shows the profile and password cards", () => {
    expect(read("packages/shared/src/pages/staff/StaffDetailsPage.tsx")).toMatch(/p\.self && \([\s\S]*<ProfileDetailsCard[\s\S]*<PasswordCard/);
    const account = read("packages/shared/src/pages/settings/AccountSettingsPage.tsx");
    expect(account).toMatch(/<ProfileDetailsCard \/>/);
    expect(account).toMatch(/<PasswordCard \/>/);
    expect(read("agent-portal/src/app/App.tsx")).toMatch(/pages\/settings\/AccountSettingsPage/);
    expect(read("service-portal/src/app/App.tsx")).toMatch(/pages\/settings\/AccountSettingsPage/);
  });

  it("the email is shown locked, never as an input", () => {
    const cards = read("packages/shared/src/features/staff/MyProfileCards.tsx");
    expect(cards).toMatch(/Email \(your sign-in ID\)/);
    expect(cards).not.toMatch(/fullName[\s\S]{0,40}email:|set\(\{ email/);
  });

  it("My profile opens Settings outside the admin console", () => {
    const shell = read("packages/shared/src/components/layout/AppShell.tsx");
    expect(shell).toMatch(/if \(portal === "admin"\)[\s\S]*staffDetails[\s\S]*navigate\("\/settings"\)/);
  });

  it("the Staff badge counts the approver's queue, blank when it failed", () => {
    expect(profileChangesOf({ data: [{}, {}], error: null })).toBe(2);
    expect(profileChangesOf({ data: null, error: { message: "Administrators only." } })).toBeNull();
    expect(profileChangesOf(null)).toBeNull();
  });
});

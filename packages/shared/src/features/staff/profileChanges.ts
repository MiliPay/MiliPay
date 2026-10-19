import { supabase } from "@milipay/shared/lib/supabase";
import type { Role } from "@milipay/shared/types";

/**
 * Staff editing their own profile (migration 20261019090000).
 *
 * Name, phone and state can change; the email never does (it is the sign-in
 * ID). A super admin's change applies at once. An admin's waits for a super
 * admin; an agent's or support's for an admin or a super admin. The server
 * enforces all of this; these helpers only describe it.
 */

export type ProfileField = "full_name" | "phone" | "state";
export type ProfileValues = Partial<Record<ProfileField, string | null>>;

export interface ProfileChange {
  id: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  changes: ProfileValues;
  previous: ProfileValues;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
}

export interface MyProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  state: string | null;
  role: Role;
  approvers: Role[];
  /** The open request, or one decided in the last 14 days. */
  request: ProfileChange | null;
}

export interface QueuedProfileChange extends ProfileChange {
  staffId: string;
  name: string;
  email: string;
  role: Role;
}

export interface ProfileDraft {
  fullName: string;
  phone: string;
  state: string;
}

const FIELD_LABEL: Record<ProfileField, string> = { full_name: "Name", phone: "Phone", state: "State" };

/** Who has to approve a change for this role, in words; null when it applies at once. */
export function approverText(role: Role | string | undefined): string | null {
  if (role === "super_admin") return null;
  if (role === "admin") return "a super admin";
  return "an admin or a super admin";
}

/** "Name: Amina → Amina Yusuf" lines for a request, in a fixed order. */
export function describeChanges(changes: ProfileValues, previous: ProfileValues): { label: string; from: string; to: string }[] {
  return (["full_name", "phone", "state"] as ProfileField[])
    .filter((f) => f in changes)
    .map((f) => ({ label: FIELD_LABEL[f], from: previous[f] || "—", to: changes[f] || "—" }));
}

/** The same checks the server makes, so the form can say so before sending. */
export function profileDraftError(d: ProfileDraft): string | null {
  const name = d.fullName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return "Enter your full name (2 to 80 characters).";
  if (!/^(\+234|0)[789][01]\d{8}$/.test(d.phone.replace(/[\s-]/g, ""))) return "Enter a valid Nigerian phone number, like 0803 123 4567.";
  return null;
}

/** Whether the draft differs from what is on file. */
export function profileDraftChanged(d: ProfileDraft, p: Pick<MyProfile, "name" | "phone" | "state">): boolean {
  return (
    d.fullName.trim().replace(/\s+/g, " ") !== p.name ||
    d.phone.replace(/[\s-]/g, "") !== (p.phone ?? "") ||
    (d.state || null) !== (p.state || null)
  );
}

function message(error: { message?: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function fetchMyProfile(): Promise<MyProfile> {
  const { data, error } = await supabase.rpc("my_staff_profile");
  if (error) throw new Error(message(error, "Could not load your profile."));
  return data as MyProfile;
}

/** "applied" for a super admin; "pending" for everyone else. */
export async function requestProfileChange(d: ProfileDraft): Promise<"applied" | "pending"> {
  const { data, error } = await supabase.rpc("request_staff_profile_change", {
    p_full_name: d.fullName,
    p_phone: d.phone,
    p_state: d.state || null,
  });
  if (error) throw new Error(message(error, "Your change wasn't saved."));
  return (data as { status: "applied" | "pending" }).status;
}

export async function withdrawProfileChange(): Promise<void> {
  const { error } = await supabase.rpc("withdraw_staff_profile_change");
  if (error) throw new Error(message(error, "Could not withdraw it."));
}

export async function fetchProfileChangeQueue(): Promise<QueuedProfileChange[]> {
  const { data, error } = await supabase.rpc("staff_profile_change_queue");
  if (error) throw new Error(message(error, "Could not load profile changes."));
  return (data as QueuedProfileChange[]) ?? [];
}

export async function decideProfileChange(id: string, approve: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc("decide_staff_profile_change", { p_id: id, p_approve: approve, p_note: note || null });
  if (error) throw new Error(message(error, "That didn't go through."));
}

/** Your own password; applies at once, no approval. */
export async function changeMyPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(message(error, "Your password wasn't changed."));
}

export function passwordError(password: string, confirm: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
